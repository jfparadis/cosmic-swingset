import { readdirSync } from 'fs';

import djson from 'deterministic-json';
import {
  loadBasedir,
  buildVatController,
  buildMailboxStateMap,
  buildMailbox,
  getVatTPSourcePath,
} from '@agoric/swingset-vat';
import buildUserStore from '@agoric/swingset-vat/src/devices/ustore';
import buildExternalForFile from '@agoric/swingset-vat/src/stateOnDisk';
import { makeStorageInMemory } from '@agoric/swingset-vat/src/stateInMemory';

async function buildSwingset(withSES, mailboxState, userState, externalStorage, vatsDir, argv) {
  const config = {};
  const mbs = buildMailboxStateMap();
  mbs.populateFromData(mailboxState);
  const mb = buildMailbox(mbs);
  const us = buildUserStore();
  us.setStore('public', makeStorageInMemory(userState));
  config.devices = [
    ['mailbox', mb.srcPath, mb.endowments],
    ['ustore', us.srcPath, us.endowments],
  ];
  config.vatSources = new Map();
  for (const fname of readdirSync(vatsDir)) {
    const match = fname.match(/^vat-(.*)\.js$/);
    if (match) {
      config.vatSources.set(match[1], require.resolve(`${vatsDir}/${fname}`));
    }
  }
  config.vatSources.set('vattp', getVatTPSourcePath());
  config.bootstrapIndexJS = require.resolve(`${vatsDir}/bootstrap.js`);
  config.externalStorage = externalStorage;

  const controller = await buildVatController(config, withSES, argv);
  await controller.run();

  return { controller, mb, mbs };
}

export async function launch(publicStorage, stateFile, vatsDir, argv) {
  const withSES = false;
  let deliverInbound;

  console.log(`launch: checking for saved public state: mailbox`, publicStorage.has('mailbox'), '; user', publicStorage.has('user'));
  const mailboxState = publicStorage.has('mailbox') ? JSON.parse(publicStorage.get('mailbox')) : {};
  const userState = publicStorage.has('user') ? JSON.parse(publicStorage.get('user')) : {};

  const { externalStorage, save } = buildExternalForFile(stateFile);

  console.log(`buildSwingset`);
  const { controller, inbound, mb, mbs } =
        await buildSwingset(withSES, mailboxState, userState,
                            externalStorage, vatsDir, argv);
  function saveState() {
    // save kernel state to the stateFile, and the mailbox/user state to a cosmos
    // kvstore where it can be queried externally
    save();
    const mailboxStateData = djson.stringify(mbs.exportToData());
    publicStorage.set(`mailbox`, mailboxStateData);
    const userStateData = djson.stringify(userState);
    publicStorage.set(`user`, userStateData);
    console.log(`checkpointed public state: mailbox ${mailboxStateData.length} bytes; user ${userStateData.length} bytes`);
  }

  // save the initial state immediately
  saveState();

  // arrange

  // then arrange for inbound messages to be processed, after which we save
  // the new state (if anything changed)
  deliverInbound = async function doDeliver(sender, messages, ack) {
    if (!(messages instanceof Array)) {
      throw new Error(`inbound given non-Array: ${messages}`);
    }
    const oldData = djson.stringify(mbs.exportToData());
    if (mb.deliverInbound(sender, messages, ack)) {
      await controller.run();
      // now check mbs
      const newState = mbs.exportToData();
      const newData = djson.stringify(newState);
      if (newData !== oldData) {
        console.log(`outbox changed`);
        for (const peer of Object.getOwnPropertyNames(newState)) {
          const data = {
            outbox: newState[peer].outbox,
            ack: newState[peer].inboundAck,
          };
          const r = publicStorage.set(`mailbox.${peer}`, djson.stringify(data));
          //console.log(`set ${peer} said`, r);
        }
      }
      saveState();
    }
  };

  return { deliverInbound };
}
