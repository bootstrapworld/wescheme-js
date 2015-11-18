var lex = require('./src/lex')
var parser = require('./src/parser')
var analyzer = require('./src/analyzer')
var compiler = require('./src/compiler')

export default function compile(code, debug=false) {
  var lexemes = lex.lex(code, 'foo', debug)
  var AST = parser.parse(lexemes)
  var desugared = analyzer.desugar(AST)[0]  // includes [AST, pinfo]
  var pinfo = analyzer.analyze(desugared)
  var local_bytecode = compiler.compile(desugared, pinfo)
  return local_bytecode.bytecode
}