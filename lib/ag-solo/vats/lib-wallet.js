import harden from '@agoric/harden';
import { insist } from '@agoric/ertp/util/insist';

function mockStateChangeHandler(_newState) {
  // does nothing
}

function makeObservablePurse(purse, onFulfilled) {
  const { depositExactly, depositAll, withdraw, withdrawAll } = purse;

  const observablePurse = {
    ...purse,
    depositExactly(...args) {
      depositExactly(...args).then(onFulfilled);
    },
    depositAll(...args) {
      depositAll(...args).then(onFulfilled);
    },
    withdraw(...args) {
      withdraw(...args).then(onFulfilled);
    },
    withdrawAll(...args) {
      withdrawAll(...args).then(onFulfilled);
    },
  };

  return observablePurse;
}

function objectFrom(map) {
  const obj = {};
  for (const [key, value] of map) {
    obj[key] = value;
  }
  return obj;
}

export function makeWallet(
  E,
  log,
  host,
  pursesStateChangeHandler = mockStateChangeHandler,
) {
  // Assays that the wallet knows and trust.
  const allAssays = new Set();

  // Map of purses in the wallet by pet name.
  const nameToPurse = new Map();

  // Client-side representation of the purses;
  const pursesState = new Map();

  function getPursesState() {
    return JSON.stringify([...pursesState]);
  }

  async function updatePursesState(purseName, purse) {
    const balance = await E(purse).getBalance();
    const {
      label: { description },
      extent,
    } = balance;
    pursesState.set(purseName, { description, extent });
    pursesStateChangeHandler(getPursesState());
  }

  // assay = home.purse~.getAssay(); home.wallet~.makeEmptyPurse('my purse', assay);
  function makeEmptyPurse(purseName, assay) {
    // TODO sanitize name
    insist(!nameToPurse.has(purseName))`Purse name already used in wallet.`;

    const purse = E(assay).makeEmptyPurse(purseName);
    const observablePurse = makeObservablePurse(purse, () =>
      updatePursesState(purseName, purse),
    );

    nameToPurse.set(purseName, observablePurse);
    allAssays.has(assay) || allAssays.add(assay);

    updatePursesState(purseName, purse);
    return purse;
  }

  // home.wallet~.getPurses();
  function getPurses() {
    return harden(objectFrom(nameToPurse));
  }

  // home.wallet~.getAssays();
  function getAssays() {
    return harden([...allAssays]);
  }

  async function depositPayment(purseName, payment) {
    insist(nameToPurse.has(purseName))`Purse not found in wallet.`;

    const purse = nameToPurse.get(purseName);
    const assetDesc = await E(purse).depositAll(payment);
    return assetDesc;
  }

  const userFacet = harden({
    makeEmptyPurse,
    getPurses,
    getAssays,
    depositPayment,
  });

  const adminFacet = harden({});

  const readFacet = harden({
    getPursesState,
  });

  const wallet = harden({
    userFacet,
    adminFacet,
    readFacet,
  });

  return wallet;
}
