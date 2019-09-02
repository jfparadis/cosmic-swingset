import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from 'react';
import useStayScrolled from 'react-stay-scrolled';

import './App.css';

/*
// Let's pretend this <Counter> component is expensive to re-render so ...
// ... we wrap with React.memo, but we're still seeing performance issues :/
// So we add useWhyDidYouUpdate and check our console to see what's going on.
const Counter = React.memo(props => {
  useWhyDidYouUpdate('Counter', props);
  return <div style={props.style}>{props.count}</div>;
});

// Debugging hook
function useWhyDidYouUpdate(name, props) {
  // Get a mutable ref object where we can store props ...
  // ... for comparison next time this hook runs.
  const previousProps = useRef();

  useEffect(() => {
    if (previousProps.current) {
      // Get all keys from previous and current props
      const allKeys = Object.keys({ ...previousProps.current, ...props });
      // Use this object to keep track of changed props
      const changesObj = {};
      // Iterate through keys
      allKeys.forEach(key => {
        // If previous is different from current
        if (previousProps.current[key] !== props[key]) {
          // Add to changesObj
          changesObj[key] = {
            from: previousProps.current[key],
            to: props[key]
          };
        }
      });

      // If changesObj not empty then output to console
      if (Object.keys(changesObj).length) {
        console.log('[why-did-you-update]', name, changesObj);
      }
    }

    // Finally update previousProps with current props for next hook call
    previousProps.current = props;
  });
}
*/

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

const Pixel = React.memo(function Pixel({ color, generation }) {
  // useWhyDidYouUpdate('Pixel', { color, generation });
  return (
    <div
      className={`updated${generation % 2}`}
      style={{ backgroundColor: color }}
    />
  );
});

function Gallery({ board }) {
  let pxs = [];
  // We need to render increasing x followed by increasing y.
  const maxHeight = board.reduce((prior, column) => Math.max(prior, column.length), 0);
  for (let y = 0; y < maxHeight; y += 1) {
    for (let x = 0; x < board.length; x += 1) {
      const [color, generation] = board[x][y];
      pxs.push(<Pixel
        key={`${x},${y}`}
        color={color}
        generation={generation}
      />);
    }
  }
  return (
    <div id="galleryBoard" className="gallery">{pxs}</div>
  );
}

const Repl = React.memo(function Repl({ history, connected, sendCommand }) {
  const bgColor = connected ? 'white' : 'red';
  const [commandEntry, setCommandEntry] = useState('');
  const [prevEntry, setPrevEntry] = useState('');
  const [entryI, setEntryI] = useState(null);

  const historyRef = useRef(null);
  const { stayScrolled } = useStayScrolled(historyRef);
  useLayoutEffect(() => {
    stayScrolled();
  }, [history, stayScrolled]);

  const onSubmit = useCallback(function onSubmit(event) {
    event.preventDefault();
    sendCommand(commandEntry);
    setEntryI(null);
    setCommandEntry('');
  }, [sendCommand, commandEntry]);

  // remember what the user changed the comment to
  const onChange = useCallback(function onChange(e) {
    const newCommand = e.target.value;
    setCommandEntry(newCommand);
    setPrevEntry(newCommand);
    // console.log(`MEMO ${newCommand}`);
  }, []);

  const moveHistory = useCallback(function moveHistory(delta) {
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
      setEntryI(null);
      setCommandEntry(prevEntry);
    } else {
      // console.log(`history to ${newI}`);
      setEntryI(newI);
      setCommandEntry(history[newI].command);
    }
  }, [history, entryI, prevEntry]);

  const onKeyup = useCallback(function onKeyup(e) {
    // console.log(`key ${e.key}`);
    switch (e.key) {
      case 'ArrowUp':
        moveHistory(-1);
        break;

      case 'ArrowDown':
        moveHistory(+1);
        break;

      case 'p':
        if (!e.ctrlKey) {
          return;
        }
        moveHistory(-1);
        break;

      case 'n':
        if (!e.ctrlKey) {
          return;
        }
        moveHistory(+1);
        break;

      // Do the standard behaviour.
      default:
        // skip the preventDefaults below
        return;
    }
    // for used events.
    e.preventDefault();
  }, [moveHistory]);

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
});

function calculateBoard(colors, oldBoard = []) {
  const newBoard = [];
  for (let x = 0; x < colors.length; x += 1) {
    newBoard.push([]);
    for (let y = 0; y < colors[x].length; y += 1) {
      const [oldColor, oldGen] =
        (oldBoard && oldBoard[x] && oldBoard[x][y]) || [];
      const newColor = colors[x][y];
      const gen = oldGen || 0;
      const newGen = oldColor === newColor ? gen : gen + 1;
      newBoard[x].push([newColor, newGen]);
    }
  }
  return newBoard;
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
      setBoard(oldBoard => calculateBoard(JSON.parse(obj.state), oldBoard));
    } else {
      console.log(`unknown WS type in:`, obj);
    }
  }, []);

  const onOpen = useCallback(() =>
    call({ type: 'getCanvasState' })
      .then(obj => setBoard(oldBoard => calculateBoard(JSON.parse(obj.state), oldBoard)))
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
