import harden from '@agoric/harden';
import { makeMint } from '@agoric/ertp/core/mint';
// import { makeZoe } from '@agoric/ertp/core/zoe/zoe/zoe';

const ASSAY_DESCS = [
  'moola',
  'simolean',
  'cabbage',
  'scratch',
  'dough',
  'bucks',
  'cash',
];

const ASSAY_EXTENT = 10000;

const CONTRACT_NAME = 'zoe-autoswap';

export async function makeExchange(E, log, host, zoe, uploads) {
  // Setup mints and assays, prime the exchange lookup maps.
  const allAssays = new Set();
  const descToAssay = new Map();
  const descToMint = new Map();
  const descsToExchange = new Map();

  ASSAY_DESCS.forEach(async desc => {
    const mint = makeMint(desc);
    const assay = mint.getAssay();

    allAssays.add(assay);
    descToAssay.set(desc, assay);
    descToMint.set(desc, mint);
    descsToExchange.set(desc, new Map());
  });

  async function addLiquidities(instanceInfo, desc0, desc1, extent) {
    const {
      instance,
      terms: {
        assays: [assay0, assay1, assay2],
      },
    } = instanceInfo;

    // NOTE: using explicit indices for clarity instead of loops with 2-3 items.

    // 1. Make asset descriptions.
    const assetDescs0 = await E(assay0).makeAssetDesc(extent);
    const assetDescs1 = await E(assay1).makeAssetDesc(extent);
    const assetDescs2 = await E(assay2).makeAssetDesc(extent);

    // 3. Get the mints.
    const mint0 = descToMint.get(desc0);
    const mint1 = descToMint.get(desc1);

    // 3. Create temporary purses as faucets.
    const purses0 = mint0.mint(assetDescs0);
    const purses1 = mint1.mint(assetDescs1);

    // 4. Take payments from temporary purses.
    const payments = [purses0.withdrawAll(), purses1.withdrawAll(), undefined];

    // 5. Create the offer conditions.
    const conditions = {
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

    // 6. Escrow payment.
    const { escrowReceipt } = await E(zoe).escrow(conditions, payments);

    // 7. Add liquidities.
    const liquidityOk = await E(instance).addLiquidity(escrowReceipt);

    return liquidityOk;
  }

  async function createExchange(desc0, desc1) {
    const assays = [descToAssay.get(desc0), descToAssay.get(desc1)];
    const installationId = await E(uploads).get(CONTRACT_NAME);
    const instanceInfo = await E(zoe).makeInstance(installationId, { assays });
    await addLiquidities(instanceInfo, desc0, desc1, ASSAY_EXTENT);
    return instanceInfo;
  }

  async function getExchange(desc0, desc1) {
    // 1. Simple lookup.
    const exchange = descsToExchange.get(desc0).get(desc1);
    if (exchange) return exchange;

    // 2. Create new exchange.
    const instanceInfo = await createExchange(desc0, desc1);

    // 3. Store for two-way resolution.
    const forwardExchange = { instanceInfo, inverted: false };
    const reverseExchange = { instanceInfo, inverted: true };

    descsToExchange.get(desc0).set(desc1, forwardExchange);
    descsToExchange.get(desc1).set(desc0, reverseExchange);

    return forwardExchange;
  }

  // === API

  // home.exchange~.getAssays();
  function getAssays() {
    return harden([...allAssays]);
  }

  // assays = home.exchange~.getAssays(); home.exchange~.getPrice(1000, assays~.[0], assays~.[1]);
  // home.exchange~.getPrice(1000, 'moola', 'simolean');
  async function getPrice(extent, desc0, desc1) {
    const {
      instanceInfo: {
        instance,
        terms: {
          assays: [assay0],
        },
      },
      inverted,
    } = await getExchange(desc0, desc1);

    const assetDesc0 = assay0.makeAssetDesc(extent);
    const assetDescs = inverted
      ? [undefined, assetDesc0, undefined]
      : [assetDesc0, undefined, undefined];
    const assetDesc1 = await E(instance).getPrice(assetDescs);
    return assetDesc1;
  }

  function makeOffer() {}

  const userFacet = harden({
    getAssays,
    getPrice,
    makeOffer,
  });

  const adminFacet = harden({});

  const readFacet = harden({});

  const autoswap = harden({
    userFacet,
    adminFacet,
    readFacet,
  });

  return autoswap;
}
