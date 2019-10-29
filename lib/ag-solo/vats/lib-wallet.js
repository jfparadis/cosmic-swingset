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
  const dateToOfferRec = new Map();

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

  async function updateInboxState(date, offerRec) {
    inboxState.set(date, offerRec.meta);
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

  function addOffer(offerRec) {
    const { meta: { date } } = offerRec;
    dateToOfferRec.set(date, offerRec);
    updateInboxState(date, offerRec);
  }

  function rejectOffer(date) {
    const offerRec = dateToOfferRec.get(date);
    const rejectedOfferRec = { ...offerRec, meta: { ...offerRec.meta, status: 'reject' } };
    dateToOfferRec.set(date, rejectedOfferRec);
    updateInboxState(date, rejectedOfferRec);
  }

  async function confirmOffer(date) {
    // assetDesc => units
    // don't use extent
    // conditions => offerRules
    const offer = dateToOfferRec.get(date);
    const { contractId, name0, name1, desc0, desc1, extent0 } = offer;

    const purse0 = nameToPurse.get(name0);
    const purse1 = nameToPurse.get(name1);

    // use unit/ops purse balance doen't include units
    // return if purse balance is not > amount to withdraw
    // if (!unitOps.includes(purse.getBalance(), unitsToWithdraw) return
    // unitOps = assay.getUnitOps()

    if (purse0.getBalance() < extent0) return; // todo message

    const payment0 = purse0.withdraw(extent0);
    try {
      // get offerRules
      //  

      const payment1 = await E(exchange).makeOffer(contractId, extent0, desc0, desc1, payment0);
      purse1.depositAll(payment1);
    } catch (e) {
      // if balance > empty payment has not been claimed.
      const recoveryPayment = assay.claimAll();
      purse0.depositAll(recoveryPayment);
    }

    const confirmedOffer = { ...offer, status: 'confirm' };
    dateToOfferRec.set(date, confirmedOffer);
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
