/*globals describe it expect fail*/
import {compileREPL, getError, repl2_setup} from '../../test/repl2';
import {lex} from '../lex';
import {parse} from '../parser';
import {compile} from '../compiler';
import {toPyretString} from '../toPyretString';
import * as structures from '../structures';
import * as analyzer from '../analyzer';

//TODO: le sigh, converting to pyret requires types to be in the globals.
global.types = require('../runtime/types');

var SUITE_DATA = require('./suite.json');

var extractTopLevelName = function (tl){
  if (!tl) {
    return false;
  }
  if (tl.$ === 'global-bucket'){
    return tl.value;
  }
  if (tl.$ === 'module-variable'){
    return tl.sym.val+tl.modidx.path;
  }
  throw "UNKNOWN TOPLEVEL TYPE: "+tl.toString();
}
var x_toplevels = [];
var y_toplevels = [];

function sameResults(x, y){

  // given an object, remove empty properties and reconstruct as an alphabetized JSON string
  // then parse and return a canonicalized object
  function canonicalizeObject(obj){
    var fields = [], obj2={};
    for (i in obj) { if (obj.hasOwnProperty(i) && obj[i] !== "") fields.push(i) }
    fields.sort();
    for (var i=0;i<fields.length; i++) { obj2[fields[i]] = obj[fields[i]] }
    return obj2;
  }

  function canonicalizeLiteral(lit){
    return lit.toString().replace(/\s*/g,"");
  }

  // if either one is an object, canonicalize it
  if(typeof(x) === "object") x = canonicalizeObject(x);
  if(typeof(y) === "object") y = canonicalizeObject(y);

  // 1) if both are Locations, we only care about startChar and span, so perform a weak comparison
  if ( x.hasOwnProperty('offset') && y.hasOwnProperty('offset') ){
    return ( (x.span == y.span) && (x.offset == y.offset) );
  }
  // 2) if both objects have a prefix field, build our dictionaries *before* moving on
  if(x.hasOwnProperty('prefix') && y.hasOwnProperty('prefix')){
    x_toplevels = x.prefix.toplevels.map(extractTopLevelName);
    y_toplevels = y.prefix.toplevels.map(extractTopLevelName);
  }
  // 3) if they are both objects, compare each property
  if (typeof(x)=="object" && typeof(x)=="object") {
    // does every property in x also exist in y?
    for (var p in x) {
      // log error if a property is not defined
      if ( ! x.hasOwnProperty(p) ){
        console.log('local lacks a '+p);
        return false;
      }
      if ( ! y.hasOwnProperty(p) ){
        console.log('server lacks a '+p);
        return false;
      }
      // if they are 'pos' objects (used in Pyret), don't bother comparing (yet)
      if (p==="pos") continue;
      // ignore the hashcode property
      if(p==="_eqHashCode") continue;
      // toplevel properties are equal if the sets of names are equal
      // WARNING: this may require stronger checking!
      if(p==="toplevels"){
        // if they're not the same length, bail
        if(x_toplevels.length !== y_toplevels.length){
          console.log('different number of toplevels. local has '
                     +x_toplevels.length+', and server has '
                     +y_toplevels.length);
          return false;
        }
        // if they're not the same names, bail
        if(!x_toplevels.every(function(v,i) { return y_toplevels.indexOf(v) > -1})){
          console.log('different toplevel names');
          return false;
        }
        // build sorted lists of all module variables, return true if they are identical
        var x_modVariables = x.toplevels.filter(function(tl){return tl.$==="module-variable"}).map(extractTopLevelName);
        var y_modVariables = y.toplevels.filter(function(tl){return tl.$==="module-variable"}).map(extractTopLevelName);
        x_modVariables.sort();
        y_modVariables.sort();
        if(!sameResults(x_modVariables, y_modVariables)){
          console.log('module variables differed');
          return false;
        }
        continue
      }
      // use pos's as keys into the toplevel dictionaries, and compare their values
      if((p==="pos") && (x["$"]==="toplevel") && (x["$"]==="toplevel")){
        if(x_toplevels[Number(x[p])] === y_toplevels[Number(y[p])]){ continue }
        else {
          console.log('different indices for '+x_toplevels[Number(x[p])]);
          return false;
        }
      }

      // if they both have the property, compare it
      if(sameResults(x[p],y[p])) continue
      else{
        console.log('local and server differ on property: '+p);
        return false;
      }
    }
    // does every property in y also exist in x?
    for (p in y) {
      // log error if a property is not defined
      if ( y.hasOwnProperty(p) && !x.hasOwnProperty(p) ){ return false }
    }
    // 4)if they are literals, they must be identical
  } else {
    if (canonicalizeLiteral(x) !== canonicalizeLiteral(y)){
      console.log('(local, server) literals not the same:\n'+x+'\nis not equal to \n'+y);
      return false;
    }
  }
  return true
}

describe('testing everything', function() {
  repl2_setup();

  //TODO: get the rest of the tests to pass...
  SUITE_DATA = SUITE_DATA.slice(0,74);
  SUITE_DATA.forEach(function(testData, index) {
    it('should properly handle test #'+index+': '+testData.expr, function() {
      //      test(testData.expr, testData.server, testData.desugar, testData.bytecode,
      //           testData.pyretSrc, testData.pyretAST);

      // LEX: If we pass when we shouldn't, set to pink and return false.
      // Catch: If we fail better than the server, set to blue and return true.
      // Catch: If we fail equal to the server, set to green and return true.
      // Catch: If we fail when we shoulnd't, set to pink and return false
      try{
        var sexp = lex(testData.expr, "<definitions>");
      } catch (e) {
        if (e instanceof Error) {
          throw e;
        }
        var recieved = JSON.parse(e);
        if (recieved.betterThanServer) {
          return true
        }
        if (testData.server === "LOCAL IS BETTER"){
          return true
        }
        expect(testData.server).not.toBe("PASS");
        let localJSON = JSON.parse(recieved["structured-error"]);
        let serverJSON = JSON.parse(JSON.parse(testData.server)["structured-error"]);
        expect(sameResults(localJSON, serverJSON)).toBe(true);
        return true;
      }

      // PARSE: If we pass when we shouldn't, set to pink and return false.
      // Catch: If we fail better than the server, set to blue and return true.
      // Catch: If we fail equal to the server, set to green and return true.
      // Catch: If we fail when we shoulnd't, set to pink and return false
      try{
        var AST = parse(sexp);
      } catch (e) {
        if (e instanceof Error) {
          throw e;
        }
        recieved = JSON.parse(e);
        if(recieved.betterThanServer){
          return true;
        }
        if(testData.server === "LOCAL IS BETTER"){
          return true;
        }
        expect(testData.server).toBe("PASS");
        let localJSON = JSON.parse(recieved["structured-error"]);
        let serverJSON = JSON.parse(JSON.parse(testData.server)["structured-error"]);
        expect(sameResults(localJSON, serverJSON)).toBe(true);
        return true;
      }

      //
      //// DESUGAR AND ANALYZE: If we pass when we shouldn't, set to pink and return false.
      //// Catch: If we fail better than the server, set to blue and return true.
      //// Catch: If we fail equal to the server, set to green and return true.
      //// Catch: If we fail when we shoulnd't, set to pink and return false
      try{
        var desugared = analyzer.desugar(AST);
        recieved  = desugared[0];
        var program = desugared[0];
        var pinfo     = desugared[1];
        var pinfo2    = analyzer.analyze(program);
      } catch (e) {
        if (e instanceof Error) {
          throw e;
        }
        recieved = JSON.parse(e);
        if(recieved.betterThanServer){
          return true;
        }
        if(testData.server === "LOCAL IS BETTER"){
          return true;
        }
        expect(testData.server).not.toBe("PASS");
        let localJSON = JSON.parse(recieved["structured-error"]);
        let serverJSON = JSON.parse(JSON.parse(testData.server)["structured-error"]);
        expect(sameResults(localJSON, serverJSON)).toBe(true);
        return true;
      }
      //// if we don't have a desugarRef for this test, call it a questinonable pass move on
      if(testData.desugar === undefined) {
        return true
      }
      testData.server = testData.desugar.replace(/\s*/g,"");     // remove whitespace fom desugar reference
      recieved = recieved.toString().replace(/\s*/g,"");// remove whitespace from test output
      expect(sameResults(recieved, testData.server)).toBe(true);

      try {
        recieved    = JSON.stringify(compile(program, pinfo2))
      } catch (recieved) {
        if (recieved instanceof structures.unimplementedException){
          throw recieved.str + " NOT IMPLEMENTED"
        }
        throw Error("COMPILATION ERROR\n"+getError(recieved).toString())
      }
      // if we don't have a bytecodeRef for this test, call it a questinonable pass move on
      if(testData.bytecode === undefined) {
        return true
      }
      var expected_bc = JSON.parse(testData.bytecode);
      var recieved_bc = JSON.parse(recieved);
      expected_bc.bytecode = (0,eval)('('+expected_bc.bytecode+')');
      try {
        recieved_bc.bytecode = (0,eval)('('+recieved_bc.bytecode+')')
      } catch(e) {
        console.log('MALFORMED BYTECODE:\n'+recieved_bc.bytecode);
        throw e;
      }
      expect(sameResults(recieved_bc, expected_bc)).toBe(true);

      // EVERYTHING PASSED! WHOOPIE!

      // do we move on to testing the Pyret Translation?
      // let's skip it for now
      return true;

      // TRANSLATE TO PYRET SRC
      try{
        recieved = toPyretString(AST, pinfo2).join("\n")
      } catch (translationError) {
        console.log(translationError);
        throw translationError;
      }
      // if we don't have a JSONRef for this test, call it a questinonable pass move on
      if(testData.pyretSrc === undefined) {
        return true;
      }
      // if there's no translation, it's a pass by default
      if(testData.pyretSrc === "NOTRANSLATE") {
        return true;
      }
      testData.server = testData.pyretSrc;
      expect(sameResults(recieved, testData.server)).toBe(true);

      // for now, we're only checking the source translation
      return true;
    })
  });
});
