import evaluate from '@agoric/evaluate';
import harden from '@agoric/harden';

function build(E, D) {
  let commandDevice;
  const commands = {};
  const history = {};
  const display = {};
  const homeObjects = {};
  let highestHistory = -1;;

  function updateHistorySlot(histnum) {
    //console.log(`updateHistorySlot`, histnum);
    D(commandDevice).sendBroadcast({ type: 'updateHistory', histnum,
                                     command: commands[histnum],
                                     display: display[histnum],
                                   });
  };

  const handler = {
    getHighestHistory() {
      return { highestHistory };
    },

    rebroadcastHistory() {
      //console.log(`rebroadcastHistory`, highestHistory);
      for (let histnum = 0; histnum <= highestHistory; histnum++) {
        updateHistorySlot(histnum);
      }
    },

    doEval(obj) {
      const { number: histnum, body } = obj;
      //console.log(`doEval`, histnum, body);
      if (histnum <= highestHistory) {
        throw new Error(`histnum ${histnum} is not larger than highestHistory ${highestHistory}`);
      }
      highestHistory = histnum;

      commands[histnum] = body;

      display[histnum] = `working on eval(${body})`;
      updateHistorySlot(histnum);

      const endowments = { console, E, history, home: homeObjects };
      let r;
      try {
        r = evaluate(body, endowments);
        history[histnum] = r;
        display[histnum] = JSON.stringify(r);
      } catch (e) {
        console.log(`error in eval`, e);
        history[histnum] = e;
        display[histnum] = `exception: ${e}`;
      }
      if (Promise.resolve(r) === r) {
        display[histnum] = 'unresolved Promise';
        r.then(res => {
                 history[histnum] = res;
                 display[histnum] = `${res}`;
               },
               rej => {
                 history[histnum] = rej;
                 display[histnum] = `rejected Promise: ${rej}`;
               })
          .then(_ => updateHistorySlot(histnum));
      }
      updateHistorySlot(histnum);
      return {};
    },
  };

  return {
    setCommandDevice(d) {
      commandDevice = d;
    },

    async registerFetch(fetch) {
      const chainBundle = await E(fetch).getChainBundle();
      Object.assign(homeObjects, chainBundle);
      //E(chainBundle.chain).getBalance().then(r => console.log(`balance is ${r}`));
    },

    setChainPresence(p) {
      homeObjects.chain = p;
    },

    // devices.command invokes our inbound() because we passed to
    // registerInboundHandler()
    inbound(count, obj) {
      //console.log(`vat-http.inbound (from browser) ${count}`, obj);
      const p = Promise.resolve(handler[obj.type](obj));
      function maskUndefined(r) {
        // TODO: this can go away once SwingSet:src/devices/command.js
        // deliverResponse can tolerate undefined
        if (r === undefined) {
          return 'undefined';
        } else {
          return r;
        }
      }
      p.then(res => D(commandDevice).sendResponse(count, false, harden(maskUndefined(res))),
             rej => D(commandDevice).sendResponse(count, true, harden(maskUndefined(rej))));
    },
  };
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    (E,D) => harden(build(E,D)),
    helpers.vatID,
  );
}
