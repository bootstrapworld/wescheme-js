import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import prettyJS from 'pretty-js'

import { compile } from '../src/wescheme'

import Evaluator from '../src/runtime/mzscheme-vm/evaluator'
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
    cm2.setValue(prettyJS(compile("TEST PROGRAM", cm.getValue(), true).bytecode.toString()))
  } catch (e) {
    if (e instanceof Error) {
      throw e
    }
    cm2.setValue(e)
  }
})


cm2.on('change', function() {
  try { init(); } 
  catch (e) { throw e; }
});

cm.setValue('(triangle 200 "solid" "turquoise")')

///////////////////////////////////////////////////////////////////////////////
// imported from WeScheme war-src/js/run.js

function init(publicId) { 

  var Runner = function(outputDOMContainer) {
    var that = this;
    this.outputDOMContainer = outputDOMContainer;
    this.evaluator = new Evaluator({ 
       write: function(thing) { that.addToInteractions(thing); },
    });
    this.evaluator.setImageProxy("/imageProxy");
    this.evaluator.setRootLibraryPath("/js/mzscheme-vm/collects");
    
    this.runCompiledCode = function(compiledCode, permStringArray) {
      var that = this;
      var onSuccessRun = function() { };
      var onFailRun = function(exn) { that.renderErrorAsDomNode(exn); };
      this.evaluator.executeCompiledProgram((0,eval)('(' + compiledCode + ')'),
                                            onSuccessRun,
                                            onFailRun);
    };

    this.runSourceCode = function(title, sourceCode, permStringArray) {
      var that = this;
      var onSuccessRun = function() { console.log('success')};
      var onFailRun = function(exn) { that.renderErrorAsDomNode(exn); };
      this.evaluator.executeProgram(title, sourceCode, onSuccessRun, onFailRun);
    };

    this.addToInteractions = function(interactionVal) {

      // Returns if x is a dom node.
      function isDomNode(x) {
          return (x.nodeType != undefined);
      }
      // Returns if x is a node that should be printed
      // Printable Nodes are CANVAS elements, OR non-empty SPANs
      function isPrintableNode(x){
        return x.nodeName === "CANVAS" || x.childNodes.length > 0;
      }

      if(!isPrintableNode(interactionVal)){ return;}      // make sure there are no other topLevelEvaluationNodes in the outputDOMContainer
      while(this.outputDOMContainer.firstChild){
        this.outputDOMContainer.removeChild(this.outputDOMContainer.firstChild);
      }
      if (isDomNode(interactionVal)) {
        interactionVal.style.display="inline-block";
        interactionVal.classList.add("replOutput");      // simulate the editor REPL, so CSS spacing will kick in
        this.outputDOMContainer.append(interactionVal);
      } else {
        var newArea = document.createElement("div");
        newArea.style.width='100%';
        newArea.text(interactionVal);
        newArea.style.display="inline-block";
        this.outputDOMContainer.append(newArea);
      }
      this.outputDOMContainer.scrollTop = this.outputDOMContainer.scrollHeight;
    };

    // renderErrorAsDomNode: exception -> element
    // Given an exception, produces error dom node to be displayed.
    this.renderErrorAsDomNode = function(err) {
      var msg = this.evaluator.getMessageFromExn(err);

      var dom = document.createElement('div');
      dom['class'] = 'moby-error';

      var msgDom = document.createElement('div');
      msgDom['class'] = 'moby-error:message';
      msgDom.appendChild(document.createTextNode(msg));
      dom.appendChild(msgDom);

      var stacktrace = this.evaluator.getTraceFromExn(err);
      for (var i = 0; i < stacktrace.length; i++) {
        dom.appendChild(document.createTextNode("at: line " + stacktrace[i].line +
                                                ", column " + stacktrace[i].column));
      }
      return dom;
    };
  };

  var runner = new Runner(document.getElementById('interactions'));
  var afterLoad = function(aProgram) {
    
    var title = "Test Program",       // aProgram.getTitle(),
        sourceCode = cm.getValue(),   // aProgram.getSourceCode(),
        programCode = null,           // Set it to null, so that the client-side compiler is invoked.
        permissions = null,           // aProgram.getPermissions(),
        notes       = null;           // aProgram.getNotes();
    
    var j = document.getElementById('interactions'),
        b = document.getElementsByTagName("body")[0];

    var toggleFullscreen = function() {
      // obtain the element being added
      var elem;
      if (j.querySelectorAll("canvas").length == 1) { elem = j.querySelectorAll("canvas")[0]; }
      else { elem = j[0]; }

      // get fullscreen access
      if(!document.fullscreenElement) elem.requestFullscreen( Element.ALLOW_KEYBOARD_INPUT );
      else document.exitFullscreen();
    };
    var input = document.createElement("input");
    input.type = "button";
    input.value = "Run Fullscreen";
    input.style = "margin-top: 20px; display: block; margin-left: auto; margin-right: auto";
    input.onclick = toggleFullscreen;
    b.appendChild(input);

    var appendFinishedMsg = function() {
        var inter = document.getElementById('interactions');
        var finished = document.createElement('span');
        finished.id = "finished";
        finished.innerHTML = "The program has finished running, but only included definitions (which do not produce any output).";
        if(inter.children.length == 0) {
            inter.appendChild(finished);
        }
    };

    if (programCode) {
      runner.runCompiledCode(programCode, permissions);
    } else  {
      runner.runSourceCode("TEST PROGRAM", sourceCode, permissions);
    }
    appendFinishedMsg();
  };
  afterLoad();
}