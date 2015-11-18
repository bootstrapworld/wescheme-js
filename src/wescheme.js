var lex = require('./lex')
var parser = require('./parser')
var analyzer = require('./analyzer')
var compiler = require('./compiler')

export var compile = function compile(code, debug=false) {
  var lexemes = lex.lex(code, 'foo', debug)
  var AST = parser.parse(lexemes)
  var desugared = analyzer.desugar(AST)[0]  // includes [AST, pinfo]
  var pinfo = analyzer.analyze(desugared)
  var local_bytecode = compiler.compile(desugared, pinfo)
  return local_bytecode.bytecode
}

export default compile