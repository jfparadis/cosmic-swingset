import harden from '@agoric/harden';
import { makeExchange } from './lib-exchange';

function build(E, log) {
  let userFacet;

  async function startup(host, zoe, registrar, uploads) {
    const exchange = await makeExchange(E, log, host, zoe, registrar, uploads);
    userFacet = exchange.userFacet;
  }

  async function createBundle() {
    const exchange = userFacet;

    const chainBundle = {
      exchange,
    };
    return harden(chainBundle);
  }

  function getCommandHandler() {
    return {
      async processInbound(obj) {
        const { type, data } = obj;

        if (type === 'autoswapGetPrice') {
          const { contractId, extent0, assayId0, assayId1 } = data;
          const exchange = await userFacet.getPrice(
            contractId,
            extent0,
            assayId0,
            assayId1,
          );
          return { type: 'autoswapPrice', data: exchange.extent };
        }

        if (type === 'autoswapGetOfferId') {
          const { contractId, extent0, assayId0, assayId1 } = data;
          const offerId = await userFacet.getOfferId(
            contractId,
            extent0,
            assayId0,
            assayId1,
          );
          return { type: 'autoswapOfferId', data: offerId };
        }

        return false;
      },
    };
  }

  return harden({ startup, createBundle, getCommandHandler });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
