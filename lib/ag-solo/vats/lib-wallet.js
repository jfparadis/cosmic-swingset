import harden from '@agoric/harden';
import { insist } from '@agoric/ertp/util/insist';

// Purse names and registrar keys of assays and payments.
const PURSE_SETUP = [
  ['Marketing', 'moola_3467', '1000moola_9951'],
  ['Operating Account', 'simolean_2059', '2000simolean_5714'],
  ['Travel', 'simolean_2059', undefined],
  ['Savings', 'dust_6650', '5000dust_8247'],
];

function mockStateChangeHandler(_newState) {
  // does nothing
}

export async function makeWallet(
  E,
  log,
  host,
  zoe,
  registrar,
  pursesStateChangeHandler = mockStateChangeHandler,
  inboxStateChangeHandler = mockStateChangeHandler,
) {
  // Assays that the wallet knows and trust.
  const allAssays = new Set();

  // Map of purses in the wallet by pet name. Assume immutable.
  const nameToPurse = new Map();

  // Map of assay registrar ID for each purse.
  const purseToAssayID = new Map();

  // Offers that the wallet knows about (the inbox).
  const dateToOfferRec = new Map();

  // Client-side representation of the purses inbox;
  const pursesState = new Map();
  const inboxState = new Map();

  function getPursesState() {
    return JSON.stringify([...pursesState.values()]);
  }

  function getInboxState() {
    return JSON.stringify([...inboxState.values()]);
  }

  async function updatePursesState(name, purse) {
    const balance = await E(purse).getBalance();
    const assayId = purseToAssayID.get(name);
    const {
      label: { description },
      extent,
    } = balance;
    pursesState.set(name, { name, assayId, description, extent });
    pursesStateChangeHandler(getPursesState());
  }

  async function updateInboxState(date, offerRec) {
    // Only sent the metadata to the client.
    inboxState.set(date, offerRec.meta);
    inboxStateChangeHandler(getInboxState());
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

  async function makeOffer(date) {
    let offerOk = false;

    const {
      meta: { name0, name1 },
      offerId,
    } = dateToOfferRec.get(date);

    const purse0 = nameToPurse.get(name0);
    const purse1 = nameToPurse.get(name1);

    // TODO balance check
    // use unit/ops purse balance doen't include units
    // return if purse balance is not > amount to withdraw
    // if (!unitOps.includes(purse.getBalance(), unitsToWithdraw) return
    // unitOps = assay.getUnitOps()
    // if (purse0.getBalance() < extent0) return; // todo message

    const { offerRules, instanceId } = await E(registrar).get(offerId);

    const {
      instance,
      terms: {
        assays: [assay0, assay1],
      },
    } = await E(zoe).getInstance(instanceId);

    try {
      const isNormal = checkOrdering(assay0, assay1, assay0, assay1);

      const assetDesc0 = offerRules.offerDesc[isNormal ? 0 : 1].assetDesc;
      const payment0 = await E(purse0).withdraw(assetDesc0);

      const payments = [
        isNormal ? payment0 : undefined,
        isNormal ? undefined : payment0,
      ];

      const { escrowReceipt, payoff } = await E(zoe).escrow(
        offerRules,
        payments,
      );

      offerOk = await E(instance).makeOffer(escrowReceipt);

      if (offerOk) {
        const [payoff0, payoff1] = await payoff;
        await E(purse0).depositAll(isNormal ? payoff0 : payoff1);
        await E(purse1).depositAll(isNormal ? payoff1 : payoff0);
      }
    } catch (e) {
      // if balance > empty payment has not been claimed.
      const recoveryPayment = assay0.claimAll();
      await E(purse0).depositAll(recoveryPayment);
    }

    updatePursesState(name0, purse0);
    updatePursesState(name1, purse1);

    return offerOk;
  }

  // === INIT

  PURSE_SETUP.forEach(async ([name, assayId, paymentID]) => {
    const assay = await E(registrar).get(assayId);
    const purse = await addPurse(name, assay, assayId);
    if (paymentID) {
      const payment = await E(registrar).get(paymentID);
      await E(purse).depositAll(payment);
      updatePursesState(name, purse);
    }
  });

  // === API

  // assay = home.purse~.getAssay(); home.wallet~.addPurse('my purse', assay);
  async function addPurse(name, assay, assayId = null) {
    // TODO sanitize name
    insist(!nameToPurse.has(name))`Purse name already used in wallet.`;

    const purse = await E(assay).makeEmptyPurse(name);
    updatePursesState(name, purse);

    allAssays.add(assay);
    nameToPurse.set(name, purse);
    if (assayId) purseToAssayID.set(name, assayId); // todo rething?

    return purse;
  }

  // home.wallet~.getPurses();
  function getPurses() {
    return harden([...nameToPurse.values()]);
  }

  // home.wallet~.getAssays();
  function getAssays() {
    return harden([...allAssays.values()]);
  }

  function addOffer(offerRec) {
    const { meta: { date } } = offerRec;
    dateToOfferRec.set(date, offerRec);
    updateInboxState(date, offerRec);
  }

  function rejectOffer(date) {
    const { meta } = dateToOfferRec.get(date);
    // Update status, drop the offerRules
    const rejectedOfferRec = { meta: { ...meta, status: 'reject' } };
    dateToOfferRec.set(date, rejectedOfferRec);
    updateInboxState(date, rejectedOfferRec);
  }

  async function confirmOffer(date) {
    const offerOk = await makeOffer(date);
    if (!offerOk) return;

    const { meta } = dateToOfferRec.get(date);
    // Update status, drop the offerRules
    const confirmOfferRec = { meta: { ...meta, status: 'confirm' } };
    dateToOfferRec.set(date, confirmOfferRec);
    updateInboxState(date, confirmOfferRec);
  }

  const wallet = harden({
    userFacet: {
      addPurse,
      getPurses,
      getAssays,
      addOffer,
      rejectOffer,
      confirmOffer,
    },
    adminFacet: {},
    readFacet: {},
  });

  return wallet;
}
