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

export async function makeWallet(
  E,
  log,
  host,
  exchange,
  pursesStateChangeHandler = mockStateChangeHandler,
) {
  // Assays that the wallet knows and trust.
  const allAssays = new Set();

  // Map of purses in the wallet by pet name.
  const nameToPurse = new Map();

  // Client-side representation of the purses;
  const pursesState = new Map();

  function getPursesState() {
    return JSON.stringify([...pursesState.values()]);
  }

  async function updatePursesState(name, purse) {
    const balance = await E(purse).getBalance();
    const {
      label: { description },
      extent,
    } = balance;
    pursesState.set(name, { name, description, extent });
    pursesStateChangeHandler(getPursesState());
  }

  const exchangeAssays = await E(exchange).getAssays();
  exchangeAssays.forEach((assay, index) => addPurse(`Purse ${String.fromCharCode(65 + index)}`, assay));

  // === API

  // assay = home.purse~.getAssay(); home.wallet~.addPurse('my purse', assay);
  function addPurse(name, assay) {
    // TODO sanitize name
    insist(!nameToPurse.has(name))`Purse name already used in wallet.`;

    const purse = E(assay).makeEmptyPurse(name);
    const observablePurse = makeObservablePurse(purse, () =>
      updatePursesState(name, purse),
    );

    nameToPurse.set(name, observablePurse);
    allAssays.has(assay) || allAssays.add(assay);

    updatePursesState(name, purse);
    return purse;
  }

  // home.wallet~.getPurses();
  function getPurses() {
    return harden([...nameToPurse.values()]);
  }

  // home.wallet~.getAssays();
  function getAssays() {
    return harden([...allAssays]);
  }

  async function depositPayment(name, payment) {
    insist(nameToPurse.has(name))`Purse not found in wallet.`;

    const purse = nameToPurse.get(name);
    const assetDesc = await E(purse).depositAll(payment);
    return assetDesc;
  }

  const userFacet = harden({
    addPurse,
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
