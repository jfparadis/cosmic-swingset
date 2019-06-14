import harden from '@agoric/harden';

function makeChannel(debugName) {
  const pathToSubs = new Map();

  function publish(value, path = '') {
    path = String(path);
    const subs = pathToSubs.get(path);
    if (!subs) {
      return;
    }
    for (const sub of subs) {
      try {
        sub(value, path);
      } catch (e) {
        console.log(`bus cannot publish ${debugName}:${path} to ${sub}:`, e);
      }
    }
  }

  function subscribe(sub, subPath = '') {
    subPath = String(subPath);
    if (typeof sub !== 'function') {
      throw Error(
        `Cannot subscribe ${debugName}:${subPath} callback ${sub}: not a function`,
      );
    }

    let subs = pathToSubs.get(subPath);
    if (!subs) {
      subs = new Set();
      pathToSubs.set(subPath, subs);
    }

    // Return an unsubscriber.
    return harden(() => {
      const subs2 = pathToSubs.get(subPath);
      if (!subs2) {
        return;
      }

      subs2.delete(sub);
      if (subs2.size === 0) {
        // We are no longer active.
        pathToSubs.delete(subPath);
      }
    });
  }

  function getSubscribedPaths() {
    return pathToSubs.keys();
  }

  const channel = harden({
    publish,
    subscribe,
    getSubscribedPaths,
    debugName,
  });
  return channel;
}

export default harden(makeChannel);
