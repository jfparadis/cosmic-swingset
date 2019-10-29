import harden from '@agoric/harden';
import { makeWallet } from './lib-wallet';
import pubsub from './pubsub';

function build(E, D, log) {
  let userFacet;
  let pursesState;
  let inboxState;
  let commandDevice;

  const { publish: pursesPublish, subscribe: purseSubscribe } = pubsub(E);
  const { publish: inboxPublish, subscribe: inboxSubscribe } = pubsub(E);

  async function startup(host, exchange, uploads) {
    const wallet = await makeWallet(E, log, host, exchange, uploads, pursesPublish, inboxPublish);
    userFacet = wallet.userFacet;
  }

  async function createBundle() {
    const wallet = userFacet;

    const chainBundle = {
      wallet,
    };
    return harden(chainBundle);
  }

  function setCommandDevice(d, _ROLES) {
    commandDevice = d;
  }

  function getCommandHandler() {
    return {
      processInbound(obj) {
        const { type } = obj;
        if (type === 'walletGetPurses') {
          if (pursesState) {
            return {
              type: 'walletUpdatePurses',
              state: pursesState,
            };
          }
          return {};
        }

        if (type === 'walletGetInbox') {
          if (inboxState) {
            return {
              type: 'walletUpdateInbox',
              state: inboxState,
            };
          }
          return {};
        }

        if (type === 'walletAddOffer') {
          const { offer } = obj;
          const result = userFacet.addOffer(offer);
          return {
            type: 'walletOfferAdded',
            result,
          };
        }

        if (type === 'walletRejectOffer') {
          const { date } = obj;
          const result = userFacet.rejectOffer(date);
          return {
            type: 'walletOfferRejected',
            result,
          };
        }

        if (type === 'walletConfirmOffer') {
          const { date } = obj;
          const result = userFacet.confirmOffer(date);
          return {
            type: 'walletOfferConfirmed',
            result,
          };
        }

        return false;
      },
    };
  }

  function setPresences() {
    console.log(`subscribing to walletPurseState`);
    // This provokes an immediate update
    purseSubscribe(
      harden({
        notify(m) {
          pursesState = m;
          if (commandDevice) {
            D(commandDevice).sendBroadcast({
              type: 'walletUpdatePurses',
              state: pursesState,
            });
          }
        },
      }),
    );

    console.log(`subscribing to walletInboxState`);
    // This provokes an immediate update
    inboxSubscribe(
      harden({
        notify(m) {
          inboxState = m;
          if (commandDevice) {
            D(commandDevice).sendBroadcast({
              type: 'walletUpdateInbox',
              state: inboxState,
            });
          }
        },
      }),
    );
  }

  return harden({
    startup,
    createBundle,
    setCommandDevice,
    getCommandHandler,
    setPresences,
  });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E, D) => build(E, D, helpers.log),
    helpers.vatID,
  );
}
