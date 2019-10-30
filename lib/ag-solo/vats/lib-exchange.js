import harden from '@agoric/harden';
import { makeMint } from '@agoric/ertp/core/mint';

// Assays and faucet payments to create
const ASSAY_SETUP = [
  ['moola', 1000],
  ['simolean', 2000],
  ['dough', 1000],
  ['bucks', 1000],
  ['dust', 5000],
];

const LIQUIDITY = 10000;

class NestedMap {
  constructor() {
    this.map = new Map();
  }

  get(path) {
    let { map } = this;
    while (map && path.length) {
      map = map.get(path.shift());
    }
    return map;
  }

  set(path, value) {
    let { map } = this;
    while (path.length > 1) {
      const segment = path.shift();
      const nextMap = map.get(segment);
      if (nextMap) {
        map = nextMap;
      } else {
        const newMap = new Map();
        map.set(segment, newMap);
        map = newMap;
      }
    }
    map.set(path.shift(), value);
  }
}

export async function makeExchange(E, log, host, zoe, registrar, uploads) {
  // Assays that the exchange knows and trust.
  const allAssays = new Set();

  // Mints to create those assays. Private, never exposed.
  const assayToMint = new Map();

  // Contact isntances.
  const mappedInstanceId = new NestedMap();

  async function addLiquidities(instanceId, extent) {
    const {
      instance,
      terms: {
        assays: [assay0, assay1, assay2],
      },
    } = await E(zoe).getInstance(instanceId);

    // NOTE: using explicit indices for clarity,
    // instead of loops with 2-3 items.

    // 1. Make asset descriptions.
    const assetDescs0 = assay0.makeAssetDesc(extent);
    const assetDescs1 = assay1.makeAssetDesc(extent);
    const assetDescs2 = await E(assay2).makeAssetDesc(0); // belongs to zoe

    // 2. Get the mints.
    const mint0 = assayToMint.get(assay0);
    const mint1 = assayToMint.get(assay1);

    // 3. Create temporary purses as faucets.
    const purses0 = mint0.mint(assetDescs0);
    const purses1 = mint1.mint(assetDescs1);

    // 4. Take payments from temporary purses.
    const payment0 = purses0.withdrawAll();
    const payment1 = purses1.withdrawAll();

    // 5. Create the offer rules and associated payments.
    const offerRules = {
      offerDesc: [
        {
          rule: 'offerExactly',
          assetDesc: assetDescs0,
        },
        {
          rule: 'offerExactly',
          assetDesc: assetDescs1,
        },
        {
          rule: 'wantAtLeast',
          assetDesc: assetDescs2,
        },
      ],
      exit: {
        kind: 'onDemand',
      },
    };

    const payments = [payment0, payment1, undefined];

    // 6. Escrow payments.
    const { escrowReceipt } = await E(zoe).escrow(offerRules, payments);

    // 7. Add liquidities.
    const liquidityOk = await E(instance).addLiquidity(escrowReceipt);

    return liquidityOk;
  }

  async function createInstanceId(contractId, assay0, assay1) {
    const installationId = await E(uploads).get(contractId);
    const terms = { assays: [assay0, assay1] };
    const { instanceId } = await E(zoe).makeInstance(installationId, terms);
    return instanceId;
  }

  async function getInstanceId(contractId, assay0, assay1) {
    // 1. Simple lookup.
    const instanceId = mappedInstanceId.get([contractId, assay0, assay1]);
    if (instanceId) return instanceId;

    // 2. Create new exchange.
    const newInstanceId = await createInstanceId(contractId, assay0, assay1);
    await addLiquidities(newInstanceId, LIQUIDITY);

    // 3. Store 2-way for simpler looup.
    mappedInstanceId.set([contractId, assay0, assay1], newInstanceId);
    mappedInstanceId.set([contractId, assay1, assay0], newInstanceId);
    return newInstanceId;
  }

  function checkOrdering(a0, a1, b0, b1) {
    if (a0 === b0 && a1 === b1) {
      return true;
    }

    if (a0 === b1 && a1 === b0) {
      return false;
    }

    throw new TypeError('Canot resove asset ordering');
  }

  // === INIT

  ASSAY_SETUP.forEach(async ([desc, extent]) => {
    const mint = makeMint(desc);
    const assay = mint.getAssay();

    allAssays.add(assay);

    // These generate predictable ids.
    // Output for debugging & to help with wiring up the wallet.
    const assayId = await E(registrar).register(desc, assay);
    console.log('Registrar id', assayId, 'for assay', desc);

    assayToMint.set(assay, mint);
    const payment = tapFaucet(assay, extent);
    const paymentID = await E(registrar).register(`${extent}${desc}`, payment);
    console.log('Registrar id', paymentID, 'for payment', extent, desc);
  });

  // === API

  // home.exchange~.getAssays();
  function getAssays() {
    return harden([...allAssays.values()]);
  }

  // home.exchange~.tapFaucet(home.purse, 1000);
  async function tapFaucet(assay, extent) {
    const faucetMint = assayToMint.get(assay);
    const faucetPurse = faucetMint.mint(extent);
    const faucetPayment = faucetPurse.withdrawAll();

    return faucetPayment;
  }

  // home.exchange~.getPrice('zoe-autoswap', 1000, 'moola_3467', 'simolean_2059');
  async function getPrice(contractId, extent, assayId0, assayId1) {
    const rAssay0 = await E(registrar).get(assayId0);
    const rAssay1 = await E(registrar).get(assayId1);
    const instanceId = await getInstanceId(contractId, rAssay0, rAssay1);

    const {
      instance,
      terms: {
        assays: [assay0, assay1],
      },
    } = await E(zoe).getInstance(instanceId);

    const isNormal = checkOrdering(assay0, assay1, rAssay0, rAssay1);

    const assetDescs = [
      isNormal ? assay0.makeAssetDesc(extent) : undefined,
      isNormal ? undefined : assay1.makeAssetDesc(extent),
      undefined,
    ];

    return E(instance).getPrice(assetDescs);
  }

  async function getOfferId(contractId, extent, assayId0, assayId1) {
    const rAssay0 = await E(registrar).get(assayId0);
    const rAssay1 = await E(registrar).get(assayId1);
    const instanceId = await getInstanceId(contractId, rAssay0, rAssay1);

    const {
      terms: {
        assays: [assay0, assay1, assay2],
      },
    } = await E(zoe).getInstance(instanceId);

    const isNormal = checkOrdering(assay0, assay1, rAssay0, rAssay1);

    // The contract can have assays in interted order (ie. assay1 is assayId0).
    const assetDescs0 = assay0.makeAssetDesc(isNormal ? extent : 0);
    const assetDescs1 = assay1.makeAssetDesc(isNormal ? 0 : extent);
    const assetDescs2 = await E(assay2).makeAssetDesc(0); // belongs to zoe

    const offerRules = harden({
      offerDesc: [
        {
          rule: isNormal ? 'offerExactly' : 'wantAtLeast',
          assetDesc: assetDescs0,
        },
        {
          rule: isNormal ? 'wantAtLeast' : 'offerExactly',
          assetDesc: assetDescs1,
        },
        {
          rule: 'wantAtLeast',
          assetDesc: assetDescs2,
        },
      ],
      exit: {
        kind: 'onDemand',
      },
    });

    return E(registrar).register('offer', { offerRules, instanceId });
  }

  const autoswap = harden({
    userFacet: {
      getAssays,
      tapFaucet,
      getPrice,
      getOfferId,
    },
    adminFacet: {},
    readFacet: {},
  });

  return autoswap;
}
