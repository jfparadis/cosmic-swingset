/* global WebSocket fetch window */

// === BRIDGE

function getParentParam() {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('parent');
}

const parentOrigin = getParentParam() || window.origin;

// === FETCH

// original code
async function call(req) {
  const res = await fetch('/vat', {
    method: 'POST',
    body: JSON.stringify(req),
    headers: { 'Content-Type': 'application/json' },
  });
  const j = await res.json();
  if (j.ok) {
    return j.res;
  }
  throw new Error(`server error: ${JSON.stringify(j.rej)}`);
}

// fetch-bridge connection
window.addEventListener('message', event => {
  const { origin, data } = event;
  if (!(origin === parentOrigin)) return;
  if (!data) return;

  const { name } = data;
  if (!(name === 'call-request')) return;

  const {
    message: { id, req },
  } = data;
  call(req).then(res => {
    const message = { id, res };
    window.parent.postMessage({ name: 'call-response', message }, parentOrigin);
  });
});

// === WEB SOCKET

function getSocketEndpoint() {
  const url = new URL(window.origin);
  url.protocol = 'ws';
  return url;
}
const ws = new WebSocket(getSocketEndpoint());

// websocket-bridge connection
function dispatchEvent(name, message) {
  const data = { name, message };
  window.parent.postMessage(data, parentOrigin);
}

ws.addEventListener('error', ev => {
  dispatchEvent('websocket-error', ev.data);
});

ws.addEventListener('close', _ev => {
  dispatchEvent('websocket-close');
});

ws.addEventListener('message', ev => {
  dispatchEvent('websocket-message', ev.data);
});

ws.addEventListener('open', _ev => {
  dispatchEvent('websocket-open');
});
