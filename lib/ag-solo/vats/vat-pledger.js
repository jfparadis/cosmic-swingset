import harden from '@agoric/harden';
import { E } from '@agoric/eventual-send';

/*
me = home.pledger.adminFacet~.getAccount('me');
px = home.gallery~.tapFaucet();
me~.depositAll(px);
home.pledger.userFacet~.getBalances();
home.registry~.set('pixelAssay', home.gallery~.getAssays()~.pixelAssay)
home.pledger.userFacet~.getBalances();
pxp = me~.getPurse('pixelAssay#1')
*/

// This vat contains the private Pledger instance.
// FIXME: Overly simplistic for an initial design.

function build(E, _log) {
  const accounts = Object.create(null);

  function getPledger() {
    // TODO: Use third-party handoff instead of registeredAssays.
    let registeredAssays = new WeakMap();
    let registry = { reverseGet(assay) { return undefined; }};

    function makeAccount() {
      // An account consists of unique per-assay purses.
      const assayPurses = new Map();
      return harden({
        getBalance() {
          return Promise.all([...assayPurses.values()].map(purse => E(purse).getBalance()));
        },
        async getPurse(assayP) {
          let assay = await assayP;
          if (String(assay) === assay) {
            // Get the object for this assay ID.
            assay = await E(registry).get(assay);
          }
          return assayPurses.get(assay);
        },
        async depositAll(payment) {
          const assay = await E(payment).getAssay();
          if (!assayPurses.has(assay)) {
            assayPurses.set(assay, await E(assay).makeEmptyPurse());
          }
          const purse = assayPurses.get(assay);
          return E(purse).depositAll(payment);
        },
        async withdrawExactly(assetDesc, name) {
          const labelC = E.C(assetDesc).M.getLabel();
          const assay = await labelC.G.assay.P;
          return E(assayPurses.get(assay)).withdrawExactly(assetDesc, name);
        },
      });
    }
    
    const userFacet = {
      async getBalances() {
        const balances = await Promise.all(Object.entries(accounts).sort().map(
          async ([name, account]) => {
            const rawBalance = await E(account).getBalance();
            const cookedBalance = await Promise.all(rawBalance.map(async ad => {
              if (!registeredAssays.has(ad.label.assay)) {
                const aid = await E(registry).reverseGet(ad.label.assay);
                if (aid) {
                  registeredAssays.set(ad.label.assay, aid);
                }
              }
              return { ...ad, assayID: registeredAssays.get(ad.label.assay) || 'unregistered', };
            }));
            return [name, cookedBalance];
          }));
        return harden(balances);
      },
    };

    const adminFacet = {
      ...userFacet,
      setRegistry(newRegistry) {
        registeredAssays = new WeakMap();
        registry = newRegistry;
      },
      getAccount(accountName) {
        accountName = String(accountName);
        if (!(accountName in accounts)) {
          accounts[accountName] = harden(makeAccount());
        }
        return accounts[accountName];
      },
    };

    return harden({
      userFacet,
      adminFacet,
    });
  }

  return harden({ getPledger });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
