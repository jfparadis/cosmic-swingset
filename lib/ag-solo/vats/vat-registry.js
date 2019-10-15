import harden from '@agoric/harden';

// This vat contains the registry for the demo.

function makeRegistry() {
  const map = new Map();
  const rmap = new Map();
  let i = 0;
  async function get(idP) {
    const id = await idP;
    return map.get(id);
  }
  async function set(nameP, objP) {
    const [name, obj] = await Promise.all([nameP, objP]);
    i += 1;
    const id = `${name}#${i.toString(16)}`;
    map.set(id, obj);
    if (!rmap.has(obj)) {
      rmap.set(obj, id);
    }
    return id;
  }
  async function reverseGet(objP) {
    const obj = await objP;
    return rmap.get(obj);
  }
  return {
    get,
    reverseGet,
    set,
  };
}

function build(E, log) {
  const sharedRegistry = makeRegistry();

  function getSharedRegistry() {
    return sharedRegistry;
  }

  return harden({ getSharedRegistry });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
