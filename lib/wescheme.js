'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var lex = require('./lex');
var parser = require('./parser');
var analyzer = require('./analyzer');
var compiler = require('./compiler');

var compile = exports.compile = function compile(code) {
  var debug = arguments.length <= 1 || arguments[1] === undefined ? false : arguments[1];

  var lexemes = lex.lex(code, 'foo', debug);
  var AST = parser.parse(lexemes);
  var desugared = analyzer.desugar(AST)[0]; // includes [AST, pinfo]
  var pinfo = analyzer.analyze(desugared);
  var local_bytecode = compiler.compile(desugared, pinfo);
  return local_bytecode;
};

exports.default = compile;