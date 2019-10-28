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

  function getCommandHandler() {
    return {
      async processInbound(obj) {
        const { type } = obj;
        if (type === 'getAutoswapPrice') {
          const { extent, desc0, desc1 } = obj;
          const exchange = await sharedExchangeUserFacet.getPrice(extent, desc0, desc1);
          return { type: 'autoswapPrice', extent: exchange.extent };
        }
        return false;
      },
    };
  }

  function getExchange() {
    return sharedExchangeUserFacet;
  }

  return harden({ startup, createBundle, getCommandHandler, getExchange });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
