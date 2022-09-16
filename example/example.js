import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import prettyJS from 'pretty-js'

import { compile } from '../src/wescheme'

import { Runner } from '../src/runtime/mzscheme-vm/evaluator'
import loadProject from '../src/runtime/loadProject'

require('./example.css')
require('./example-page.css')

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
    if (e instanceof Error) {
      throw e
    }
  }
})

cm2.on('change', function() {
  if(cm2.getValue().includes("Compilation Error")) return;
  try { runBytecode(); } 
  catch (e) { throw e; }
});

cm.setValue('(triangle 200 "solid" "turquoise")')

///////////////////////////////////////////////////////////////////////////////
// imported from WeScheme war-src/js/run.js

function runBytecode(publicId) { 
  var inter = document.getElementById('interactions');
  var runner = new Runner(document.getElementById('interactions'));
  var reportIfNoOutput = function() {
    if(inter.children.length == 0) {
        inter.innerHTML = "The program has finished running, but only included definitions (which do not produce any output).";
    }
  };
  try {
    runner.runSourceCode(null, cm.getValue(), null); // pass null for permissions and title
  } catch(e) {
    inter.innerHTML = "<span class='error'>" + e.toString() + "</span>";
  } finally {
    reportIfNoOutput();
  }
}