import fs from 'fs';

import djson from 'deterministic-json';
import {
  buildVatController,
  buildMailboxStateMap,
  buildMailbox,
  getVatTPSourcePath,
  getCommsSourcePath,
} from '@agoric/swingset-vat';
import { buildStorageInMemory } from '@agoric/swingset-vat/src/hostStorage';

async function buildSwingset(withSES, mailboxState, storage, vatsDir, argv) {
  const config = {};
  const mbs = buildMailboxStateMap();
  mbs.populateFromData(mailboxState);
  const mb = buildMailbox(mbs);
  config.devices = [['mailbox', mb.srcPath, mb.endowments]];
  config.vats = new Map();
  for (const fname of fs.readdirSync(vatsDir)) {
    const match = fname.match(/^vat-(.*)\.js$/);
    if (match) {
      config.vats.set(match[1], {
        sourcepath: require.resolve(`${vatsDir}/${fname}`),
      });
    }
  }
  config.vats.set('vattp', { sourcepath: getVatTPSourcePath() });
  config.vats.set('comms', {
    sourcepath: getCommsSourcePath(),
    options: { enablePipelining: true },
  });
  config.bootstrapIndexJS = require.resolve(`${vatsDir}/bootstrap.js`);
  config.hostStorage = storage;

  const controller = await buildVatController(config, withSES, argv);
  await controller.run();

  return { controller, mb, mbs };
}

export async function launch(mailboxStorage, stateFile, vatsDir, argv) {
  const withSES = false;

  console.log(
    `launch: checking for saved mailbox state`,
    mailboxStorage.has('mailbox'),
  );
  const mailboxState = mailboxStorage.has('mailbox')
    ? JSON.parse(mailboxStorage.get('mailbox'))
    : {};
  let initialState;
  try {
    const initialStateJSON = fs.readFileSync(stateFile);
    console.log(
      `launch: found saved swingset state, size= ${initialStateJSON.length}`,
    );
    initialState = JSON.parse(initialStateJSON);
  } catch (e) {
    console.log(`launch: initializing empty swingset state`);
    initialState = {};
  }
  // 'storage' will be modified in-place as the kernel runs
  const storage = buildStorageInMemory(initialState);

  console.log(`buildSwingset`);
  const { controller, mb, mbs } = await buildSwingset(
    withSES,
    mailboxState,
    storage.storage,
    vatsDir,
    argv,
  );

  function saveState() {
    // save kernel state to the stateFile, and the mailbox state to a cosmos
    // kvstore where it can be queried externally
    const kernelState = JSON.stringify(storage.getState());
    fs.writeFileSync(stateFile, kernelState);
    const mailboxStateData = djson.stringify(mbs.exportToData());
    mailboxStorage.set(`mailbox`, mailboxStateData);
    return [kernelState.length, mailboxStateData.length];
  }

  // save the initial state immediately
  saveState();

  // then arrange for inbound messages to be processed, after which we save
  // the new state (if anything changed)
  async function deliverInbound(sender, messages, ack) {
    if (!(messages instanceof Array)) {
      throw new Error(`inbound given non-Array: ${messages}`);
    }
    const oldData = djson.stringify(mbs.exportToData());
    if (mb.deliverInbound(sender, messages, ack)) {
      let start = Date.now();
      await controller.run();
      const runTime = Date.now() - start;
      // now check mbs
      start = Date.now();
      const newState = mbs.exportToData();
      const newData = djson.stringify(newState);
      if (newData !== oldData) {
        console.log(`outbox changed`);
        for (const peer of Object.getOwnPropertyNames(newState)) {
          const data = {
            outbox: newState[peer].outbox,
            ack: newState[peer].inboundAck,
          };
          mailboxStorage.set(`mailbox.${peer}`, djson.stringify(data));
        }
      }
      const mbTime = Date.now() - start;
      start = Date.now();
      const [kernelSize, mailboxSize] = saveState();
      const saveTime = Date.now() - start;
      console.log(
        `wrote SwingSet checkpoint (kernel=${kernelSize}, mailbox=${mailboxSize}), [run=${runTime}ms, mb=${mbTime}ms, save=${saveTime}ms]`,
      );
    }
  }

  return { deliverInbound };
}
