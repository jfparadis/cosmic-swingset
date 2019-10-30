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
          const { contractId, extent0, assayRid0, assayRid1 } = data;
          const exchange = await userFacet.getPrice(
            contractId,
            extent0,
            assayRid0,
            assayRid1,
          );
          return { type: 'autoswapPrice', data: exchange.extent };
        }

        if (type === 'autoswapGetOfferRules') {
          const { contractId, extent0, assayRid0, assayRid1 } = data;
          const offerRules = await userFacet.getOfferRules(
            contractId,
            extent0,
            assayRid0,
            assayRid1,
          );
          return { type: 'autoswapOfferRules', data: offerRules };
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
