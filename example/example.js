import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import prettyJS from 'pretty-js'
import { compile } from '../src/wescheme'
import { Runner } from '../src/runtime/mzscheme-vm/evaluator'
import loadProject from '../src/runtime/loadProject'

require('./example.css')
require('./example-page.css')

const inter = document.getElementById('interactions');
const img = '(triangle 200 "solid" "turquoise")';
const unbound = 'x';
const parseError = '('
const fact = '(define (fact x) (if (< x 2) 1 (* x (fact (- x 1))))) (fact 20)'
const world = `
(define (draw-world w) (put-image (star 20 "solid" "blue") w 30 (rectangle 300 60 "solid" "black")))
(big-bang 0
  (on-tick add1)
  (to-draw draw-world))
`

var cm = CodeMirror.fromTextArea(
  document.getElementById("code"),
  {theme:'3024-day'}
)

var cm2 = CodeMirror.fromTextArea(
  document.getElementById('code2'),
  {theme:'3024-day'}
)
cm.on('change', function() {
  try {
    const bytecode = prettyJS(compile(cm.getValue(), true).bytecode.toString());
    cm2.setValue(bytecode)
  } catch (e) {
    cm2.setValue("Compilation Error (see console for details)")
    while(inter.firstChild) { inter.removeChild(inter.firstChild); }
    if (e instanceof Error) { throw e }
  }
})

cm2.on('change', function() {
  if(cm2.getValue().includes("Compilation Error")) return;
  runBytecode();
});

cm.setValue(world)

///////////////////////////////////////////////////////////////////////////////
// imported from WeScheme war-src/js/run.js

function runBytecode() { 
  var runner = new Runner(document.getElementById('interactions'));
  var reportIfNoOutput = function() {
    if(inter.children.length == 0) {
      inter.innerHTML = "The program has finished running, but only included definitions (which do not produce any output).";
    }
  };
  try {
    runner.runCompiledCode(cm2.getValue());
  } catch(e) {
    inter.innerHTML = "<span class='error'>" + e.val._fields[0].toString() + "</span>"; 
  } finally {
    reportIfNoOutput();
  }
}



///////////////////////////////////////////////////////////////////////////////
// Google Drive experiment

// TODO(developer): Set to client ID and API key from the Developer Console
const CLIENT_ID = '887605636141-c61b646981pdr0j8u5t4i0l9lehdqrb6.apps.googleusercontent.com';
const API_KEY = 'AIzaSyA7Wj4JqauQI8eTJ4nbCc-EkomT3gJ2sn0';

// Discovery doc URL for APIs used by the quickstart
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';

// Authorization scopes required by the API; multiple scopes can be
// included, separated by spaces.
const SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly';

let tokenClient;
let gapiInited = false;
let gisInited = false;

document.getElementById('authorize_button').style.visibility = 'hidden';
document.getElementById('signout_button').style.visibility = 'hidden';

/**
 * Callback after api.js is loaded.
 */
window.gapiLoaded = function() {
  gapi.load('client', initializeGapiClient);
}

/**
 * Callback after the API client is loaded. Loads the
 * discovery doc to initialize the API.
 */
window.initializeGapiClient = async function() {
  await gapi.client.init({
    apiKey: API_KEY,
    discoveryDocs: [DISCOVERY_DOC],
  });
  gapiInited = true;
  maybeEnableButtons();
}

/**
 * Callback after Google Identity Services are loaded.
 */
window.gisLoaded = function() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', // defined later
  });
  gisInited = true;
  maybeEnableButtons();
}

/**
 * Enables user interaction after all libraries are loaded.
 */
function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    document.getElementById('authorize_button').style.visibility = 'visible';
  }
}

/**
 *  Sign in the user upon button click.
 */
window.handleAuthClick = function() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) {
      throw (resp);
    }
    document.getElementById('signout_button').style.visibility = 'visible';
    document.getElementById('authorize_button').innerText = 'Refresh';
    await listFiles();
  };

  if (gapi.client.getToken() === null) {
    // Prompt the user to select a Google Account and ask for consent to share their data
    // when establishing a new session.
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Skip display of account chooser and consent dialog for an existing session.
    tokenClient.requestAccessToken({prompt: ''});
  }
}

/**
 *  Sign out the user upon button click.
 */
window.handleSignoutClick = function() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    document.getElementById('content').innerText = '';
    document.getElementById('authorize_button').innerText = 'Authorize';
    document.getElementById('signout_button').style.visibility = 'hidden';
  }
}