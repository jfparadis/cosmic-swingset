import harden from '@agoric/harden';
import { makeExchange } from './lib-exchange';

function build(E, log) {
  let sharedExchangeUserFacet;

  async function startup(host, zoe, uploads) {
    const exchange = await makeExchange(E, log, host, zoe, uploads);
    sharedExchangeUserFacet = exchange.userFacet;
  }

  async function createBundle() {
    const exchange = sharedExchangeUserFacet;

    const chainBundle = {
      exchange,
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
