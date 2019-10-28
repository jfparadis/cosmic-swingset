import harden from '@agoric/harden';
import { insist } from '@agoric/ertp/util/insist';

function mockStateChangeHandler(_newState) {
  // does nothing
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

  function makeObservablePurse(purse, onFulfilled) {
    const observablePurse = {
      getName() {
        return E(purse).getName();
      },
      getAssay() {
        return E(purse).getAssay();
      },
      getBalance() {
        return E(purse).getBalance();
      },
      depositExactly(...args) {
        return E(purse).depositExactly(...args).then(onFulfilled);
      },
      depositAll(...args) {
        return E(purse).depositAll(...args).then(onFulfilled);
      },
      withdraw(...args) {
        return E(purse).withdraw(...args).then(onFulfilled);
      },
      withdrawAll(...args) {
        return E(purse).withdrawAll(...args).then(onFulfilled);
      },
    };

    return observablePurse;
  }

  const exchangeAssays = await E(exchange).getAssays();
  exchangeAssays.map(async (assay, index) => {
    const { description } = await E(assay).getLabel();
    const purse = addPurse(`Purse ${description}`, assay);
    E(exchange).tapFaucet(purse, 1000);
  });

  // === API

  // assay = home.purse~.getAssay(); home.wallet~.addPurse('my purse', assay);
  async function addPurse(name, assay) {
    // TODO sanitize name
    insist(!nameToPurse.has(name))`Purse name already used in wallet.`;

    const purse = E(assay).makeEmptyPurse(name);
    const observablePurse = makeObservablePurse(purse, () =>
      updatePursesState(name, purse),
    );

    nameToPurse.set(name, observablePurse);
    allAssays.has(assay) || allAssays.add(assay);

    updatePursesState(name, purse);

    return observablePurse;
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
