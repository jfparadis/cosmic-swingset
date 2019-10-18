// TODO: Publish as '@pledger/web-bridge'
function createPledgerBridge(startSession, ourID = 'dapp', origin = 'http://localhost:8000') {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('src', `${origin}/pledger-bridge.html`);
  iframe.setAttribute('hidden', 'hidden');

  document.body.prepend(iframe);

  const sendPledger = obj => {
    iframe.contentWindow.postMessage(obj, "*");
  };

  let dispatch;
  window.addEventListener('message', ev => {
    if (origin !== ev.origin) {
      return;
    }
    const obj = ev.data;
    console.log('Pledger sent', obj);
    switch (obj.type) {
      case 'PLEDGER_DISCONNECTED':
        dispatch = undefined;
        break;
      case 'PLEDGER_CONNECTED': {
        let getBootstrap;
        ({ dispatch, getBootstrap } = makeCapTP(ourID, sendPledger));
        startSession(getBootstrap);
        break;
      }
      default: {
        if (dispatch) {
          dispatch(obj);
        }
      }
    }
  });

  iframe.addEventListener('load', ev => {
    console.log('Pledger loaded');
    sendPledger({ type: 'PLEDGER_CONNECT' });
  });
}
