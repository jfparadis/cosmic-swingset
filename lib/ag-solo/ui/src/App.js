import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import useStayScrolled from 'react-stay-scrolled';

import './App.css';

/* global WebSocket fetch */
const RECONNECT_BACKOFF_SECONDS = 3;

async function call(req) {
  // console.log(req);
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

function useWebSocket(wsURL, onMessage, onOpen) {
  const [isOnline, setIsOnline] = useState(null);

  useEffect(
    function run() {
      const ws = new WebSocket(wsURL);
      ws.addEventListener('open', _ev => {
        setIsOnline(true);
        console.log(`ws.open!`);
        onOpen(onMessage).catch(_ => ws.close());
      });
      ws.addEventListener('close', _ev => {
        setIsOnline(false);
        console.log(`Reconnecting in ${RECONNECT_BACKOFF_SECONDS} seconds`);
        setTimeout(run, RECONNECT_BACKOFF_SECONDS * 1000);
      });
      ws.addEventListener('message', ev => {
        try {
          // console.log('ws.message:', ev.data);
          const obj = JSON.parse(ev.data);
          onMessage(obj);
        } catch (e) {
          console.log(`error handling message`, e);
        }
      });

      return function cleanup() {
        return ws.close();
      };
    },
    [wsURL, onMessage, onOpen],
  );
  return { isOnline };
}

function Gallery({ board }) {
  let i = 0;
  return (
    <div id="galleryBoard" className="gallery">
      {board.flatMap(row =>
        row.map(color => <div key={i++} style={{ backgroundColor: color }} />),
      )}
    </div>
  );
}

function Repl({ history, connected, sendCommand }) {
  const bgColor = connected ? 'white' : 'red';
  const [commandEntry, setCommandEntry] = useState('');
  const [prevEntry, setPrevEntry] = useState('');
  const [entryI, setEnryI] = useState(null);

  const historyRef = useRef(null);
  const { stayScrolled } = useStayScrolled(historyRef);
  useLayoutEffect(() => {
    stayScrolled();
  }, [history, stayScrolled]);

  function onSubmit(event) {
    event.preventDefault();
    sendCommand(commandEntry);
    setEnryI(null);
    setCommandEntry('');
  }

  // remember what the user changed the comment to
  function onChange(e) {
    const newCommand = e.target.value;
    setCommandEntry(newCommand);
    setPrevEntry(newCommand);
    // console.log(`MEMO ${newCommand}`);
  }

  function moveHistory(delta) {
    // history from 30 by 1 for 31
    // console.log(`history from ${entryI} by ${delta} for ${history.length}`);
    // null means we are working on a new entry rather than from a copied history entry
    const newI = (entryI === null ? history.length : entryI) + delta;
    if (newI < 0 || newI > history.length) {
      // Do nothing.
      return;
    }
    if (newI === history.length) {
      // console.log(`history to null for ${newI}`);
      setEnryI(null);
      setCommandEntry(prevEntry);
    } else {
      // console.log(`history to ${newI}`);
      setEnryI(newI);
      setCommandEntry(history[newI].command);
    }
  }

  function onKeyup(e) {
    // console.log(`key ${e.key}`);
    switch (e.key) {
      case 'ArrowUp':
        moveHistory(-1);
        break;

      case 'ArrowDown':
        moveHistory(+1);
        break;
      case 'p':
        if (e.ctrlKey) {
          moveHistory(-1);
        }
        break;

      case 'n':
        if (e.ctrlKey) {
          moveHistory(+1);
        }
        break;

      // Do the standard behaviour.
      default:
        // skip the preventDefaults below
        return;
    }
    // for used events.
    e.preventDefault();
  }

  const historyElements = [];
  history.forEach(({ number, command, result }) => {
    historyElements.push(
      <div key={`c${number}`} className="command-line">
        <div>command[{number}]</div>
        <div>{command}</div>
      </div>,
      <div key={`h${number}`} className="history-line">
        <div>history[{number}]</div>
        <div>{result}</div>
      </div>,
    );
  });

  return (
    <React.Fragment>
      <div className="help">
        Use <code>home</code> to see useful objects, and <code>history[N]</code>{' '}
        to refer to result history
      </div>
      <div id="history" ref={historyRef} className="history">
        {historyElements}
      </div>
      <div className="history">
        <form id="command-entry" className="command-line" onSubmit={onSubmit}>
          <div>command[{history.length}]</div>
          <div>
            <input
              id="input"
              tabIndex="0"
              type="text"
              style={{ backgroundColor: bgColor }}
              value={commandEntry}
              onChange={onChange}
              onKeyUp={onKeyup}
              name="command entry"
            />
          </div>
          <div>
            <input id="go" tabIndex="1" type="submit" value="eval" name="eval" />
          </div>
        </form>
      </div>
    </React.Fragment>
  );
}

// history updates (promises being resolved) and canvas updates
// (pixels being colored) are delivered by websocket
// broadcasts
function App({ wsURL }) {
  const [history, setHistory] = useState([]);
  const [board, setBoard] = useState([]);

  const sendCommand = command => {
    console.log('submitEval', command);
    const number = history.length;
    setHistory([...history, { number, command, result: 'sending for eval' }]);
    call({ type: 'doEval', number, body: command }).catch(ex => console.log(ex));
  };

  const onMessage = useCallback(obj => {
    // we receive commands to update result boxes
    if (obj.type === 'updateHistory') {
      // these args come from calls to vat-http.js updateHistorySlot()
      setHistory(history => {
        const newEntry = {
          number: obj.histnum,
          command: obj.command,
          result: obj.display,
        };
        const i = history.findIndex(({ number }) => number === newEntry.number);
        return i < 0
          ? [...history, newEntry]
          : [...history.slice(0, i), newEntry, ...history.slice(i + 1)];
      });
    } else if (obj.type === 'updateCanvas') {
      // console.log(obj);
      setBoard(JSON.parse(obj.state));
    } else {
      console.log(`unknown WS type in:`, obj);
    }
  }, []);

  const onOpen = useCallback(() =>
    call({ type: 'getCanvasState' })
      .then(obj => setBoard(JSON.parse(obj.state)))
      .then(_ => call({ type: 'rebroadcastHistory' })),
    []);

  const { isOnline } = useWebSocket(wsURL, onMessage, onOpen);

  return (
    <div>
      <div className="container">
        <div className="left">
          <Gallery board={board} />
        </div>
        <div className="right">
          <Repl
            history={history}
            connected={isOnline}
            sendCommand={sendCommand}
          />
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
