/*eslint no-console: 0*/

import { sexpToString, lex } from '../src/lex'
import { parse } from '../src/parser'
import { desugar, analyze } from '../src/analyzer'
import { compile } from '../src/compiler'
export var repl_input
export var repl_input_li
export var output_list
export var __history_front
export var __history_back

export function formatOutput(x) {
  var res = []

  for (var i = 0; i < x.length; i++) {
    res[i] = sexpToString(x[i])
  }
  return res
}

export function repl2_setup() {
  repl_input = document.getElementById("repl-input")
  repl_input_li = document.getElementById("repl-input-li")
  output_list = document.getElementById("output-list")
  __history_front = []
  __history_back = []
}

// returns the element in the history at the current index.
// Dir is the direction. 1 for up, -1 for down
// current is the currently viewed element
export function popElementFromHistory(dir, current) {
  if (dir === 1 && __history_front.length > 0) {
    __history_back.push(current)
    return __history_front.pop()
  } else if (dir === -1 && __history_back.length > 0) {
    __history_front.push(current)
    return __history_back.pop()
  }
  return current
}


export function getError(e) {
  try {
    var err = JSON.parse(e),
      structuredErr = JSON.parse(err['structured-error'])
    return structuredErr.message
  } catch (JSONerror) {
    console.log('!!!!!!!!!!!! FATAL ERROR !!!!!!!!!!!!!!!')
    throw (e)
  }
}

export function download(filename, text) {
  var pom = document.createElement('a')
  pom.setAttribute('href', 'data:text/javascript;charset=utf-8,' + encodeURIComponent(text))
  pom.setAttribute('download', filename)

  pom.style.display = 'none'
  document.body.appendChild(pom)

  pom.click()

  document.body.removeChild(pom)
}

window.readFromRepl = function(event) {
  var key = event.keyCode
  if (key === 13) { // "\n"
    compileREPL()
  }
}

export function compileREPL(makeTeachpack) {
  var programName = makeTeachpack ? prompt("What is the name of the teachpack?") : undefined
  var aSource = repl_input.value
    // run the local compiler
  var debug = true
  var sexp = lex(aSource, programName, debug)
  var AST = parse(sexp, debug)
  var ASTandPinfo = desugar(AST, undefined, debug)
  var program = ASTandPinfo[0]
  var pinfo = analyze(program, debug)
  var response = compile(program, pinfo, debug)
  if (makeTeachpack) {
    var teachpack = "window.COLLECTIONS = window.COLLECTIONS || {};\n" + "window.COLLECTIONS[\"" + programName + "\"]={\"name\":\"" + programName + "\"" + ",\"bytecode\":"
    teachpack += unescape(response.bytecode)
    teachpack += ",\"provides\":"
    teachpack += JSON.stringify(response.provides)
    teachpack += "};"
    download(programName, teachpack)
  } else {
    response.bytecode = (0, eval)('(' + response.bytecode + ')')
    console.log(response)
  }

  repl_input.value = ""; // clear the input
  var temp = document.createElement("li"); // make an li element
  temp.textContent = aSource; // stick the program's text in there
}