import React, { useState, useEffect, useCallback } from 'react';

import './App.css';

/* global WebSocket fetch document window */
const RECONNECT_BACKOFF_SECONDS = 3;

async function call(req) {
  console.log(`CALL ${req}`);
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

function Connector({ wsURL, messageHandler, updateConnected }) {
  useEffect(function run() {
    const ws = new WebSocket(wsURL);
    ws.addEventListener('open', _ev => {
      updateConnected(true);
      console.log(`ws.open!`);
      call({ type: 'getCanvasState' })
      .then(msg => {
        messageHandler(msg);
      })
      .then(_ => call({ type: 'rebroadcastHistory' }))
      .catch(_ => ws.close());
    });
    ws.addEventListener('close', _ev => {
      updateConnected(false);
      console.log(`Reconnecting in ${RECONNECT_BACKOFF_SECONDS} seconds`);
      setTimeout(run, RECONNECT_BACKOFF_SECONDS * 1000);
    });
    // history updates (promises being resolved) and canvas updates
    // (pixels being colored) are delivered by websocket
    // broadcasts
    ws.addEventListener('message', ev => {
      try {
        console.log('ws.message:', ev.data);
        const obj = JSON.parse(ev.data);
        messageHandler(obj);
      } catch (e) {
        console.log(`error handling message`, e);
      }
    });

    return function cleanup() {
      return ws.close();
    };
  }, [wsURL, messageHandler, updateConnected]);
  return null;
}

function Gallery({ board }) {
  return (<div id="galleryBoard" className="gallery"></div>);
}

function Repl({ history, connected, sendCommand }) {
  const bgColor = connected ? 'inherit' : 'red';
  const [command, setCommand] = useState('');

  const onChange = (event) => { 
    setCommand(event.target.value);
  };
  const onSubmit = (event) => { 
    sendCommand(command);
    setCommand("");
  };

  const historyElements = [];
  history.forEach(({number, command, result}) => {
    historyElements.push(
      <div key={`c${number}`} className="command-line"><div>command[{number}]</div><div>{command}</div></div>,
      <div key={`h${number}`} className="history-line"><div>history[{number}]</div><div>{result}</div></div>);
  });

  return (
    <React.Fragment>
      <div className="help">Use <code>home</code> to see useful objects, and <code>history[N]</code> to refer to result
  history</div>
      <div id="history" className="history">{historyElements}</div>
      <div className="history">
        <div id="command-entry" className="command-line">
          <div>command[{history.length}]</div>
          <div><input id="input" tabIndex="0" type="text" style={{backgroundColor: bgColor}} 
                value={command} onChange={onChange} /></div>
          <div><input id="go" tabIndex="1" type="submit" value="eval" onClick={onSubmit} /></div>
        </div>
      </div>
    </React.Fragment>
  );
}
function App() {
  const loc = window.location;
  const protocol = loc.protocol.replace(/^http/, 'ws');
  const host = loc.host.replace(/localhost:3000/, 'localhost:8000');
  const socketEndpoint = `${protocol}//${host}/`;

  const [isOnline, setIsOnline] = useState(null);
  const [history, setHistory] = useState([]);
  const [board, setBoard] = useState(null);

  const sendCommand = (command) => {
    console.log('submitEval', command);
    const number = history.length;
    setHistory([...history, {number, command, result: 'sending for eval'}]);
    call({ type: 'doEval', number, body: command }).catch(ex => console.log(ex));
  }

  const messageHandler = useCallback((obj) => {
      // we receive commands to update result boxes
      if (obj.type === 'updateHistory') {
        // these args come from calls to vat-http.js updateHistorySlot()
        setHistory(history => {
          const newEntry = {number: obj.histnum, command: obj.command, result: obj.display};
          const index = history.findIndex(({number}) => number === newEntry.number);
          return index < 0
              ? [...history, newEntry] 
              : [...history.slice(0, index), newEntry, ...history.slice(index+1)];
        });
      } else if (obj.type === 'updateCanvas') {
        setBoard(JSON.parse(obj.state));
      } else {
        console.log(`unknown WS type in:`, obj);
      }
    }, []);
  return (
    <div>
      <Connector wsURL={socketEndpoint} messageHandler={messageHandler} updateConnected={setIsOnline} />
      <div className="container">
        <div className="left">
          <Gallery board={board} />
        </div>
        <div className="right">
          <Repl history={history} connected={isOnline} sendCommand={sendCommand}/>
        </div>
      </div>

      <hr />
      <address>
        Source: <a target="_blank" id="package_repo">
          <span id="package_name">cosmic-swingset</span></a> v
        <span id="package_version"></span>+<span id="package_git"></span>
      </address>
    </div>
  );
}

export default App;
