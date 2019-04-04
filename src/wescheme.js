var lex = require('./lex')
var parser = require('./parser')
import {desugar, analyze} from './analyzer'
var compiler = require('./compiler')

export var compile = function compile(code, debug=false) {
  var lexemes = lex.lex(code, 'fake-src-filename', debug)
  var AST = parser.parse(lexemes)
  var desugared = desugar(AST)[0]  // includes [AST, pinfo]
  var pinfo = analyze(desugared)
  var local_bytecode = compiler.compile(desugared, pinfo)
  return local_bytecode
}

export default compile