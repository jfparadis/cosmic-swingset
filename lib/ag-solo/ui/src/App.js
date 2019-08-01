import React from 'react';
import './App.css';

function App() {
  return (
    <div>
      <div class="container">
      <div class="left">
        <div id="galleryBoard" class="gallery"></div>
      </div>
      <div class="right">
        <div class="help">Use <code>home</code> to see useful objects, and <code>history[N]</code> to refer to result
          history</div>
        <div id="history" class="history"></div>
        <div class="history">
          <div id="command-entry" class="command-line">
            <div>command[<span id="historyNumber">0</span>]</div>
            <div><input id="input" tabindex="0" type="text" /></div>
            <div><input id="go" tabindex="1" type="submit" value="eval" /></div>
          </div>
        </div>
      </div>
    </div>

    <hr />
    <address>
      Source: <a target="_blank" id="package_repo"><span id="package_name">cosmic-swingset</span></a>
      v<span id="package_version"></span>+<span id="package_git"></span>
    </address>
    </div>
  );
}

export default App;
