import harden from '@agoric/harden';
import { makeHandoffService } from '@agoric/ertp/more/handoff/handoff';
import { makeGallery } from '@agoric/ertp/more/pixels/gallery';

// This vat contains the server-side resources for the demo. To
// enable local testing, it is loaded both into the chain and solo vat machines.

// This vat gets two messages. The first is delivered at startup time, giving
// the vat a chance to create any shared resources which will be used by all
// participants in the demo. It receives a reference to the Mint vat. It does
// not need to return anything.

// The second message is to provision each new participant. It receives the
// user's nickname, and should create a record of demo objects for them to
// use (named the "chainBundle"). The client will fetch this record when it
// starts up, making it available to the REPL as `home.chainBundle`.

function build(E, D, log) {
  let sharedGalleryUserFacet;
  let sharedGalleryReadFacet;
  let sharedHandoffService;
  let sharedDustIssuer;

  async function startup(pub) {
    // define shared resources
    const publish = str => {
      // console.log(`would write canvas with`, str);
      if (str) {
        return E(pub).publish('canvas', str);
      }
    };

    const canvasSize = 10;
    const gallery = makeGallery(E, log, publish, canvasSize);
    sharedGalleryReadFacet = gallery.readFacet;
    sharedGalleryUserFacet = gallery.userFacet;
    const canvasState = await E(sharedGalleryReadFacet).getState();
    publish(canvasState);
    const issuers = await E(gallery.userFacet).getIssuers();
    sharedDustIssuer = issuers.dustIssuer;
    sharedHandoffService = makeHandoffService();
  }

  async function getChainBundle(_nickname) {
    const gallery = sharedGalleryUserFacet;
    const readGallery = sharedGalleryReadFacet;
    const handoffService = sharedHandoffService;
    const purse = await sharedDustIssuer.makeEmptyPurse();
    const chainBundle = { gallery, readGallery, handoffService, purse };
    return harden(chainBundle);
  }

  return harden({ startup, getChainBundle });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E, D) => build(E, D, helpers.log),
    helpers.vatID,
  );
}
