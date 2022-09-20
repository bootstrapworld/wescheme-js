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