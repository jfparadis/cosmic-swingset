import React, { useState, useEffect } from 'react';

import './App.css';

/* global WebSocket fetch document window */
const RECONNECT_BACKOFF_SECONDS = 3;

function Connector({ wsURL, updateHistory, updateGallery, updateConnected }) {
  useEffect(function run() {
    const ws = new WebSocket(wsURL);
    ws.addEventListener('open', _ev => {
      updateConnected(true);
      console.log(`ws.open!`);
    });
    ws.addEventListener('close', _ev => {
      updateConnected(false);
      console.log(`Reconnecting in ${RECONNECT_BACKOFF_SECONDS} seconds`);
      setTimeout(run, RECONNECT_BACKOFF_SECONDS * 1000);
    });

    return function cleanup() {
      return ws.close();
    };
  }, [wsURL]);
  return null;
}

function Gallery({ board }) {
  return (<div id="galleryBoard" className="gallery"></div>);
}
function Repl({ history, connected }) {
  const bgColor = connected ? 'inherit' : 'red';
  return (
    <React.Fragment>
      <div className="help">Use <code>home</code> to see useful objects, and <code>history[N]</code> to refer to result
  history</div>
      <div id="history" className="history"></div>
      <div className="history">
        <div id="command-entry" className="command-line">
          <div>command[<span id="historyNumber">0</span>]</div>
          <div><input id="input" tabIndex="0" type="text" style={{backgroundColor: bgColor}} /></div>
          <div><input id="go" tabIndex="1" type="submit" value="eval" /></div>
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

  return (
    <div>
      <Connector wsURL={socketEndpoint} updateConnected={setIsOnline} />
      <div className="container">
        <div className="left">
          <Gallery />
        </div>
        <div className="right">
          <Repl connected={isOnline}/>
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
