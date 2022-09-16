var lex = require('./lex').lex
var parse = require('./parser').parse
import {desugar, analyze} from './analyzer'
var codegen = require('./compiler').compile

import types from './runtime/types';

function compile(code, debug=false) {
  try {
    var lexemes   = lex(code, 'fake-src-filename', debug)
    var AST       = parse(lexemes)
    var desugared = desugar(AST)[0]  // includes [AST, pinfo]
    var pinfo     = analyze(desugared)
    var local_bytecode = codegen(desugared, pinfo)
    return local_bytecode
  } catch (e) {
      var local_error = getError(e).toString();
      console.log(local_error)
      throw local_error;
  }
}

// check to make sure it's JSON parseable before returning it.
function getError(e){
  try{
    var err =  JSON.parse(e),
    structuredErr = JSON.parse(err['structured-error']);
    return e;
  } catch (JSONerror){
    return "!! FATAL ERROR !!\n"+e.stack;
  }
}

var onCompilationFail = function(onDoneError) {
    // If all servers are failing, we simulate a 
    // compile time error with the following content:
    onDoneError("The local compiler has failed to run properly. "
                 + "You may want to confirm that you are running "
                 + "a modern web browser (IE9+, Safari 6+, FF 20+, "
                 + "Chrome 20+).");
};

function compileAndRun(programName, code, onDone, onDoneError) {
   // strip out nonbreaking whitespace chars from the code
   code = code.replace(/[\uFEFF\u2060\u200B]/,'');

   // get an array of charCodes for all non-ascii chars in a string
   function getHigherThanAsciiChars(str){
      var nonASCII = str.split("").filter(function(c) { return (c.charCodeAt(0) > 127); });
      return nonASCII.map(function(c) { return c.charCodeAt(0);});
   }

  // compile it!
  try {
      var start = new Date().getTime();
      var lexemes     = lex(code, programName);
      var AST         = parse(lexemes);
      var desugared   = desugar(AST)[0];  // includes [AST, pinfo]
      var pinfo       = analyze(desugared);
      var local_bytecode  = codegen(desugared, pinfo);
      onDone(JSON.stringify(local_bytecode));
  } catch (e) {
      var local_error = getError(e).toString();
      console.error(e)
      // if it's a fatal error, log the error and move on
      if(/FATAL ERROR/.test(local_error.toString())){
        //logResults(code, JSON.stringify(local_error), "FATAL ERROR");
        onCompilationFail(onDoneError);
      // otherwise, render the error as usual
      } else{
        onDoneError(local_error);
      }
      throw local_error;
  }
  var end         = new Date().getTime(), localTime   = Math.floor(end-start);
  console.log("Compiled in: " + Math.floor(end-start) +"ms");
};

export { compile, compileAndRun }