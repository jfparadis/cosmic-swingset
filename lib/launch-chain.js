const djson = require('deterministic-json');
const { loadBasedir, buildVatController,
        buildMailboxStateMap, buildMailbox,
        getVatTPSourcePath } = require('@agoric/swingset-vat');

async function buildSwingset(withSES, mailboxState, externalStorage) {
  const config = {};
  const mbs = buildMailboxStateMap();
  mbs.populateFromData(mailboxState);
  const mb = buildMailbox(mbs);
  config.devices = [['mailbox', mb.srcPath, mb.endowments]];
  config.vatSources = new Map();
  config.vatSources.set('mint', require.resolve('../demo1/vat-mint.js'));
  config.vatSources.set('comms', require.resolve('../demo1/vat-comms.js'));
  config.vatSources.set('vattp', getVatTPSourcePath());
  config.bootstrapIndexJS = require.resolve('../demo1/bootstrap.js');
  config.externalStorage = externalStorage;

  const controller = await buildVatController(config, withSES);
  await controller.run();

  async function inbound(sender, messages, ack) {
    /*
    console.log(`about to c.run()`);
    while (controller.dump().runQueue.length) {
      console.log(`-- step`);
      console.log(controller.dump().runQueue);
      await controller.step();
    }*/
    await controller.run();
  }

  return { controller, mb, mbs };
}

// TODO: ugh, can externalStorage change on every invocation? no, but the
// handler it wraps can, so set that somewhere

export async function launch(storage, externalStorage) {
  const withSES = false;
  let deliverInbound;

  console.log(`launch: checking for saved mailbox state`, storage.has('mailbox'));
  const mailboxState = storage.has('mailbox') ? JSON.parse(storage.get('mailbox')) : {};

  console.log(`buildSwingset`);
  const { controller, inbound, mb, mbs } = await buildSwingset(withSES, mailboxState,
                                                               externalStorage);

  function saveState() {
    // kernel state is saved automatically by the keepers' kvstores
    // we must save mailbox state to a kvstore ourselves
    const mailboxStateData = djson.stringify(mbs.exportToData());
    storage.set(`mailbox`, mailboxStateData);
    console.log(`checkpointed mailbox state: ${mailboxStateData.length} bytes`);
  }

  // save the initial state immediately
  saveState();

  // then arrange for inbound messages to be processed, after which we save
  // the new state (if anything changed)
  deliverInbound = async function(sender, messages, ack) {
    if (!messages instanceof Array) {
      throw new Error(`inbound given non-Array: ${messages}`);
    }
    const oldData = djson.stringify(mbs.exportToData());
    if (mb.deliverInbound(sender, messages, ack)) {
      await controller.run();
      // now check mbs
      const newState = mbs.exportToData();
      const newData = djson.stringify(newState);
      if (newData !== oldData) {
        console.log(`new outbound messages!`);
        for (const peer of Object.getOwnPropertyNames(newState)) {
          const data = { outbox: newState[peer].outbox,
                         ack: newState[peer].inboundAck };
          const r = storage.set(`mailbox.${peer}`, djson.stringify(data));
          console.log(`set ${peer} said`, r);
        }
      }
      saveState();
    }
  };

  return { deliverInbound };
}
