import harden from '@agoric/harden';
import { makeWallet } from './lib-wallet';
import pubsub from './pubsub';

function build(E, D, log) {
  let sharedWalletUserFacet;
  let walletPursesState;
  let commandDevice;

  const { publish: pursesStateChangeHandler, subscribe } = pubsub(E);
  const walletPursesStatePublisher = { subscribe };

  async function startup(host, exchange) {
    const wallet = await makeWallet(E, log, host, exchange, pursesStateChangeHandler);
    sharedWalletUserFacet = wallet.userFacet;
  }

  async function createBundle() {
    const wallet = sharedWalletUserFacet;

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
        if (type === 'getWalletPursesState') {
          if (walletPursesState) {
            return {
              type: 'updateWalletPurses',
              purses: walletPursesState,
            };
          }
          return {};
        }
        return false;
      },
    };
  }

  function setPresences() {
    const subscriber = harden({
      notify(m) {
        walletPursesState = m;
        if (commandDevice) {
          D(commandDevice).sendBroadcast({
            type: 'updateWalletPurses',
            state: walletPursesState,
          });
        }
      },
    });
    console.log(`subscribing to walletPursetatePublisher`);
    // This provokes an immediate update
    E(walletPursesStatePublisher).subscribe(subscriber);
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
