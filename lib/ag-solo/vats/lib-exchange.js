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

export async function makeExchange(E, log, host, zoe, uploads) {
  // Setup mints and assays, prime the exchange lookup maps.
  const allAssays = new Set();
  const descToAssay = new Map();
  const descToMint = new Map();
  const mapToContractRec = new Map();

  ASSAY_DESCS.forEach(async desc => {
    const mint = makeMint(desc);
    const assay = mint.getAssay();

    allAssays.add(assay);
    descToAssay.set(desc, assay);
    descToMint.set(desc, mint);
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

  // instanceRecord.
  // installationHandle => installationId
  // instanceHandle => instanceId
  async function createExchange(contractId, desc0, desc1) {
    const installationId = await E(uploads).get(contractId);
    const assays = [descToAssay.get(desc0), descToAssay.get(desc1)];
    const instanceInfo = await E(zoe).makeInstance(installationId, { assays });
    await addLiquidities(instanceInfo, desc0, desc1, ASSAY_EXTENT);
    return instanceInfo;
  }

  function loadContractRec(matrix, path) {
    while (matrix && path.length > 0) {
      matrix = matrix.get(path.shift());
    }
    return matrix;
  }

  function saveContractRec(matrix, path, value) {
    while (path.length > 1) {
      const segment = path.shift();
      const nextMatrix = matrix.get(segment);
      if (nextMatrix) {
        matrix = nextMatrix;
      } else {
        const newMatrix = new Map();
        matrix.set(segment, newMatrix);
        matrix = newMatrix;
      }
    }
    matrix.set(path.shift(), value);
  }

  async function getContractRec(contractId, desc0, desc1) {
    // 1. Simple lookup.
    const exchange = loadContractRec(mapToContractRec, [
      contractId,
      desc0,
      desc1,
    ]);
    if (exchange) return exchange;

    // 2. Create new exchange.
    const instanceInfo = await createExchange(contractId, desc0, desc1);

    // 3. Store for two-way resolution.
    const forwardContractRec = { instanceInfo, inverted: false };
    const reverseContractRec = { instanceInfo, inverted: true };

    saveContractRec(
      mapToContractRec,
      [contractId, desc0, desc1],
      forwardContractRec,
    );
    saveContractRec(
      mapToContractRec,
      [contractId, desc1, desc0],
      reverseContractRec,
    );

    return forwardContractRec;
  }

  // === API

  // home.exchange~.getAssays();
  function getAssays() {
    return harden([...allAssays]);
  }

  async function tapFaucet(purse, amount) {
    const assay = await E(purse).getAssay();
    const { description } = await assay.getLabel();

    const faucetMint = descToMint.get(description);
    const faucetPurse = faucetMint.mint(amount);
    const faucetPayment = faucetPurse.withdrawAll();
    const faucetAssetDesc = assay.makeAssetDesc(amount);

    E(purse).depositExactly(faucetAssetDesc, faucetPayment);
  }

  // home.exchange~.getPrice('zoe-autoswap', 1000, 'moola', 'simolean');
  async function getPrice(contractId, extent, desc0, desc1) {
    const {
      instanceInfo: {
        instance,
        terms: {
          assays: [assay0, assay1],
        },
      },
      inverted,
    } = await getContractRec(contractId, desc0, desc1);
    // The contract can have assays in interted order (ie. assay1 is desc0).
    const assetDescs = [
      inverted ? undefined : assay0.makeAssetDesc(extent),
      inverted ? assay1.makeAssetDesc(extent) : undefined,
      undefined,
    ];
    return E(instance).getPrice(assetDescs);
  }

  async function getOfferRules(contractId, extent, desc0, desc1) {
    const {
      instanceInfo: {
        terms: {
          assays: [assay0, assay1, assay2],
        },
      },
      inverted,
    } = await getContractRec(contractId, desc0, desc1);

    // The contract can have assays in interted order (ie. assay1 is desc0).
    const assetDescs0 = await E(assay0).makeAssetDesc(inverted ? 0 : extent);
    const assetDescs1 = await E(assay1).makeAssetDesc(inverted ? extent : 0);
    const assetDescs2 = await E(assay2).makeAssetDesc(0);

    const offerRules = harden({
      offerDesc: [
        {
          rule: inverted ? 'wantAtLeast' : 'offerExactly',
          assetDesc: assetDescs0,
        },
        {
          rule: inverted ? 'offerExactly' : 'wantAtLeast',
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

    return offerRules;
  }

  async function makeOffer(contractId, extent, desc0, desc1, payment0) {
    debugger;
    const {
      instanceInfo: {
        instance,
        terms: {
          assays: [assay0, assay1, assay2],
        },
      },
      inverted,
    } = await getContract(contractId, desc0, desc1);

    // The contract can have assays in interted order (ie. assay1 is desc0).
    const assetDescs0 = await E(assay0).makeAssetDesc(inverted ? 0 : extent);
    const assetDescs1 = await E(assay1).makeAssetDesc(inverted ? extent : 0);
    const assetDescs2 = await E(assay2).makeAssetDesc(0);

    const conditions = harden({
      offerDesc: [
        {
          rule: inverted ? 'wantAtLeast' : 'offerExactly',
          assetDesc: assetDescs0,
        },
        {
          rule: inverted ? 'offerExactly' : 'wantAtLeast',
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

    const payments = [
      inverted ? undefined : payment0,
      inverted ? payment0 : undefined,
      undefined,
    ];

    const { escrowReceipt, payoff } = await E(zoe).escrow(conditions, payments);
    await E(instance).makeOffer(escrowReceipt);
    return payoff;
  }

  const userFacet = harden({
    getAssays,
    tapFaucet,
    getPrice,
    getOfferRules,
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
