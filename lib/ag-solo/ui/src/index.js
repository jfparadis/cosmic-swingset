import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

/* global window */
const loc = window.location;
const protocol = loc.protocol.replace(/^http/, 'ws');
const host = loc.host.replace(/localhost:3000/, 'localhost:8000');
const socketEndpoint = `${protocol}//${host}/`;

ReactDOM.render(<App wsURL={socketEndpoint} />, document.getElementById('root'));

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
