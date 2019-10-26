import harden from '@agoric/harden';
import { makeWallet } from './lib-wallet';
import pubsub from './pubsub';

function build(E, log) {
  let sharedWalletUserFacet;

  const { publish: pursesStateChangeHandler, subscribe } = pubsub(E);
  const walletPursesStatePublisher = { subscribe };

  async function startup(host) {
    const wallet = await makeWallet(E, log, host, pursesStateChangeHandler);
    sharedWalletUserFacet = wallet.userFacet;
  }

  async function createBundle() {
    const wallet = sharedWalletUserFacet;

    const chainBundle = {
      wallet,
      walletPursesStatePublisher,
    };
    return harden(chainBundle);
  }

  return harden({ startup, createBundle });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
