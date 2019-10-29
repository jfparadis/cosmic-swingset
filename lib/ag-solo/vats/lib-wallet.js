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
  uploads,
  pursesStateChangeHandler = mockStateChangeHandler,
  inboxStateChangeHandler = mockStateChangeHandler,
) {
  // Assays that the wallet knows and trust.
  const allAssays = new Set();

  // Offers that the wallet knows about.
  const dateToOffer = new Map();

  // Map of purses in the wallet by pet name.
  const nameToPurse = new Map();

  // Client-side representation of the purses;
  const pursesState = new Map();

  // Client-side representation of the inbox;
  const inboxState = new Map();

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

  function getInboxState() {
    return JSON.stringify([...inboxState.values()]);
  }

  async function updateInboxState(date, offer) {
    inboxState.set(date, offer);
    inboxStateChangeHandler(getInboxState());
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
        return E(purse)
          .depositExactly(...args)
          .then(onFulfilled);
      },
      depositAll(...args) {
        return E(purse)
          .depositAll(...args)
          .then(onFulfilled);
      },
      withdraw(...args) {
        return E(purse)
          .withdraw(...args)
          .then(onFulfilled);
      },
      withdrawAll(...args) {
        return E(purse)
          .withdrawAll(...args)
          .then(onFulfilled);
      },
    };

    return observablePurse;
  }

  const exchangeAssays = await E(exchange).getAssays();
  exchangeAssays.map(async assay => {
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

  function addOffer(offer) {
    const { date } = offer;
    dateToOffer.set(date, offer);
    updateInboxState(date, offer);
  }

  function rejectOffer(date) {
    const offer = dateToOffer.get(date);
    const rejectedOffer = { ...offer, status: 'reject' };
    dateToOffer.set(date, rejectedOffer);
    updateInboxState(date, rejectedOffer);
  }

  async function confirmOffer(date) {
    const offer = dateToOffer.get(date);
    const { contractId, name0, name1, desc0, desc1, extent0 } = offer;

    const purse0 = nameToPurse.get(name0);
    const purse1 = nameToPurse.get(name1);

    if (purse0.getBalance() < extent0) return; // todo message
    const payment0 = purse0.withdraw(extent0);
    const payment1 = await E(exchange).makeOffer(contractId, extent0, desc0, desc1, payment0);

    purse1.depositAll(payment1);

    const confirmedOffer = { ...offer, status: 'confirm' };
    dateToOffer.set(date, confirmedOffer);
    updateInboxState(date, confirmedOffer);
  }

  const userFacet = harden({
    addPurse,
    getPurses,
    getAssays,
    addOffer,
    rejectOffer,
    confirmOffer,
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
