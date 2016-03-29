/*eslint no-console: 0 no-unused-vars: 0*/

import {compileREPL, getError, repl2_setup, readFromRepl} from './repl2'
import {parse} from '../src/parser'
import {lex} from '../src/lex'
import * as analyzer from '../src/analyzer'
import * as structures from '../src/structures'
import types from '../src/runtime/types'
import {compile} from '../src/compiler'
// TODO: currently the bytecode evaluation relies on types being in the global namespace
// le sigh...
window.types = types

var rows    = []
var tests   = []
var passed  = 0
var testsRun= 0

// dictionaries of toplevel names for x and y bytecodes
var x_toplevels = [], y_toplevels = []
var extractTopLevelName = function (tl){
  if(!tl) return false
  if(tl.$ === 'global-bucket') return tl.value
  if(tl.$ === 'module-variable') return tl.sym.val+tl.modidx.path
  else throw "UNKNOWN TOPLEVEL TYPE: "+tl.toString()
}


// sameResults : local server -> boolean
// Weak comparison on locations, indirect comparison for toplevel references
// Recursive comparison for objects
// Strong comparison for literals
// if there's a difference, log a diff to the form and return false
// credit to: http://stackoverflow.com/questions/1068834/object-comparison-in-javascript
function sameResults(x, y){

  // given an object, remove empty properties and reconstruct as an alphabetized JSON string
  // then parse and return a canonicalized object
  function canonicalizeObject(obj){
    var fields = [], obj2={}
    for (i in obj) { if (obj.hasOwnProperty(i) && obj[i] !== "") fields.push(i) }
    fields.sort()
    for (var i=0;i<fields.length; i++) { obj2[fields[i]] = obj[fields[i]] }
    return obj2
  }

  function canonicalizeLiteral(lit){
    return lit.toString().replace(/\s*/g,"")
  }

  // if either one is an object, canonicalize it
  if(typeof(x) === "object") x = canonicalizeObject(x)
  if(typeof(y) === "object") y = canonicalizeObject(y)

  // 1) if both are Locations, we only care about startChar and span, so perform a weak comparison
  if ( x.hasOwnProperty('offset') && y.hasOwnProperty('offset') ){
    return ( (x.span == y.span) && (x.offset == y.offset) )
  }
  // 2) if both objects have a prefix field, build our dictionaries *before* moving on
  if(x.hasOwnProperty('prefix') && y.hasOwnProperty('prefix')){
    x_toplevels = x.prefix.toplevels.map(extractTopLevelName)
    y_toplevels = y.prefix.toplevels.map(extractTopLevelName)
  }
  // 3) if they are both objects, compare each property
  if(typeof(x)=="object" && typeof(x)=="object"){
    // does every property in x also exist in y?
    for (var p in x) {
      // log error if a property is not defined
      if ( ! x.hasOwnProperty(p) ){
        console.log('local lacks a '+p)
        return false
      }
      if ( ! y.hasOwnProperty(p) ){
        console.log('server lacks a '+p)
        return false
      }
      // if they are 'pos' objects (used in Pyret), don't bother comparing (yet)
      if (p==="pos") continue
      // ignore the hashcode property
      if(p==="_eqHashCode") continue
      // toplevel properties are equal if the sets of names are equal
      // WARNING: this may require stronger checking!
      if(p==="toplevels"){
        // if they're not the same length, bail
        if(x_toplevels.length !== y_toplevels.length){
          console.log('different number of toplevels. local has '
            +x_toplevels.length+', and server has '
            +y_toplevels.length)
          return false
        }
        // if they're not the same names, bail
        if(!x_toplevels.every(function(v,i) { return y_toplevels.indexOf(v) > -1})){
          console.log('different toplevel names')
          return false
        }
        // build sorted lists of all module variables, return true if they are identical
        var x_modVariables = x.toplevels.filter(function(tl){return tl.$==="module-variable"}).map(extractTopLevelName)
        var y_modVariables = y.toplevels.filter(function(tl){return tl.$==="module-variable"}).map(extractTopLevelName)
        x_modVariables.sort()
        y_modVariables.sort()
        if(!sameResults(x_modVariables, y_modVariables)){
          console.log('module variables differed')
          return false
        }
        continue
      }
      // use pos's as keys into the toplevel dictionaries, and compare their values
      if((p==="pos") && (x["$"]==="toplevel") && (x["$"]==="toplevel")){
        if(x_toplevels[Number(x[p])] === y_toplevels[Number(y[p])]){ continue }
        else {
          console.log('different indices for '+x_toplevels[Number(x[p])])
          return false
        }
      }

      // if they both have the property, compare it
      if(sameResults(x[p],y[p])) continue
      else{
        console.log('local and server differ on property: '+p)
        return false
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
      console.log('(local, server) literals not the same:\n'+x+'\nis not equal to \n'+y)
      return false
    }
  }
  return true
}

// set the parent row to pink, and add a link that will load
// a diff of the expected and recieved output
function setTestFailureLink(test, expected, recieved){
  if(typeof recieved !== "string") recieved = JSON.stringify(recieved)
  if(typeof expected !== "string") expected = JSON.stringify(expected)
  recieved = recieved.replace(/\s/g,'')
  expected = expected.replace(/\s/g,'')
  test.style.background = 'pink'
  test.style.cursor     = 'pointer'
  test.onclick = function(){compareText(expected,recieved)}
  return false
}

function compareText(expected, recieved){
  document.getElementById('text1').value = expected
  document.getElementById('text2').value = recieved
  document.getElementById('compareText').submit()
}

function loadTests(){
  var testButton = document.getElementById('runTests')
  var script  = document.createElement('script')
  var head = document.getElementsByTagName('head')[0]
  testButton.value = "Loading tests..."
  head.appendChild(script)
  script.type = "text/javascript"
  script.src = "https://spreadsheets.google.com/feeds/list/0AjzMl1BJlJDkdDI2c0VUSHNZMnR6ZVR5S2hXZEdtd1E/1/public/basic?alt=json-in-script&callback=loadSuite"
}

function loadSuite(json){
  var which   = document.getElementById('whichTests')
  console.log(json)
  for(var i=0; i<json.feed.entry.length; i++){
    rows.push(json.feed.entry[i].content.$t)
    var chunks = rows[i].split(/expr\:|, local\: |, server\: |, firstdifference\: |, reason\: |, desugar\: |, bytecode\: |, pyret\: |, pyretast\: /)
    var expr = chunks[1].replace(/^\s+/,"")
    var local = chunks[2]
    var server = chunks[3]
    var difference = chunks[4]
    var reason = chunks[5]
    var desugar = chunks[6]
    var bytecode = chunks[7]
    var pyretSrc = chunks[8]
    var pyretAST = chunks[9]
    var opt = document.createElement('option')
    expr = expr.replace(/^\'\'/,"'")
    tests.push({expr: expr, local: local, server: server, reason: reason, desugar: desugar
      , bytecode: bytecode, pyretSrc: pyretSrc, pyretAST: pyretAST})
    opt.value=opt.innerHTML = Number(i)+1
    which.appendChild(opt)
  }
  console.log(document.getElementById('runTests'))
  document.getElementById('runTests').disabled=false
  document.getElementById('runTests').value="Run test:"
  document.getElementById('runTests').onclick=function(){runTests(true)}
  document.getElementById('memoryTest').disabled=false
  console.log('Test Suite data retrieved from Google Drive: '+tests.length+' tests loaded')
  which.style.display = 'inline-block'
}

function runTests(verbose){
  function test(expr, expected, desugarRef, bytecodeRef, pyretSrcRef, pyretJSONRef){
    // show the result
    var row   = document.createElement('tr')
    var num   = document.createElement('td')
    var test  = document.createElement('td')
    var lexEl   = document.createElement('td')
    var parseEl = document.createElement('td')
    var desugar=document.createElement('td')
    var bytecode=document.createElement('td')
    var pyretSrc = document.createElement('td')
    var pyretAST = document.createElement('td')
    num.innerHTML  = (i+1)+')' // make test nums 1-aligned, instead of 0-aligned
    test.innerHTML = expr      // show which expr we're testing
    row.appendChild(num)
    row.appendChild(test)
    row.appendChild(lexEl)
    row.appendChild(parseEl)
    row.appendChild(desugar)
    row.appendChild(bytecode)
    table.appendChild(row)
    row.style.background = 'lightgreen'

    // LEX: If we pass when we shouldn't, set to pink and return false.
    // Catch: If we fail better than the server, set to blue and return true.
    // Catch: If we fail equal to the server, set to green and return true.
    // Catch: If we fail when we shoulnd't, set to pink and return false
    lexEl.innerHTML = 'lex'
    try{
      var sexp = lex(expr,"<definitions>")
    } catch (e) {
      if (e instanceof Error) {
        throw e
      }
      recieved = JSON.parse(e)
      if(recieved.betterThanServer){
        lexEl.style.background = 'lightblue'
        return true
      }
      if(expected === "LOCAL IS BETTER"){
        lexEl.style.background = 'lightblue'
        return true
      }
      if(expected === "PASS"){ return setTestFailureLink(row, expected, recieved)}
      else{
        let localJSON = JSON.parse(recieved["structured-error"])
        let serverJSON = JSON.parse(JSON.parse(expected)["structured-error"])
        if(sameResults(localJSON, serverJSON)){
          lexEl.style.background = 'lightgreen'
          return true
        }
        else{ return setTestFailureLink(row, expected, recieved)}
      }
    }
    lexEl.style.background = 'lightgreen'

    // PARSE: If we pass when we shouldn't, set to pink and return false.
    // Catch: If we fail better than the server, set to blue and return true.
    // Catch: If we fail equal to the server, set to green and return true.
    // Catch: If we fail when we shoulnd't, set to pink and return false
    parseEl.innerHTML = 'parse'
    try{
      var AST = parse(sexp)
    } catch (e) {
      if (e instanceof Error) {
        throw e
      }
      recieved = JSON.parse(e)
      if(recieved.betterThanServer){
        parseEl.style.background = 'lightblue'
        return true
      }
      if(expected === "LOCAL IS BETTER"){
        parseEl.style.background = 'lightblue'
        return true
      }
      if(expected === "PASS"){ return setTestFailureLink(row, expected, recieved)}
      else{
        let localJSON = JSON.parse(recieved["structured-error"])
        let serverJSON = JSON.parse(JSON.parse(expected)["structured-error"])
        if(sameResults(localJSON, serverJSON)){
          lexEl.style.background = 'lightgreen'
          return true
        }
        else{ return setTestFailureLink(row, expected, recieved)}
      }
    }
    parseEl.style.background = 'lightgreen'

    // DESUGAR AND ANALYZE: If we pass when we shouldn't, set to pink and return false.
    // Catch: If we fail better than the server, set to blue and return true.
    // Catch: If we fail equal to the server, set to green and return true.
    // Catch: If we fail when we shoulnd't, set to pink and return false
    desugar.innerHTML = 'desugar'
    try{
      var desugared = analyzer.desugar(AST)
      var recieved  = desugared[0]
      var program = desugared[0]
      var pinfo     = desugared[1]
      var pinfo2    = analyzer.analyze(program)
    } catch (e) {
      if (e instanceof Error) {
        throw e
      }
      recieved = JSON.parse(e)
      if(recieved.betterThanServer){
        desugar.style.background = 'lightblue'
        return true
      }
      if(expected === "LOCAL IS BETTER"){
        desugar.style.background = 'lightblue'
        return true
      }
      if(expected === "PASS"){ return setTestFailureLink(row, expected, recieved)}
      let localJSON = JSON.parse(recieved["structured-error"])
      let serverJSON = JSON.parse(JSON.parse(expected)["structured-error"])
      if(sameResults(localJSON, serverJSON)){
        lexEl.style.background = 'lightgreen'
        return true
      }
      else{ return setTestFailureLink(row, expected, recieved)}
    }
    // if we don't have a desugarRef for this test, call it a questinonable pass move on
    if(desugarRef === undefined) {
      desugar.style.background = 'rgb(194, 288, 194)'
      return true
    }
    expected = desugarRef.replace(/\s*/g,"")     // remove whitespace fom desugar reference
    recieved = recieved.toString().replace(/\s*/g,"")// remove whitespace from test output
    if(sameResults(recieved, expected)) { desugar.style.background = 'lightgreen' }
    else { return setTestFailureLink(row, expected, recieved)}


    bytecode.innerHTML = 'bytecode'
    try {
      recieved    = JSON.stringify(compile(program, pinfo2))
    } catch (recieved) {
      throw Error("COMPILATION ERROR\n"+getError(recieved).toString())
    }
    // if we don't have a bytecodeRef for this test, call it a questinonable pass move on
    if(bytecodeRef === undefined) {
      desugar.style.background = 'rgb(194, 288, 194)'
      return true
    }
    var expected_bc = JSON.parse(bytecodeRef)
    var recieved_bc = JSON.parse(recieved)
    expected_bc.bytecode = (0,eval)('('+expected_bc.bytecode+')')
    try { recieved_bc.bytecode = (0,eval)('('+recieved_bc.bytecode+')') }
    catch(e){
      console.log('MALFORMED BYTECODE:\n'+recieved_bc.bytecode)
      return setTestFailureLink(row, expected_bc.bytecode, recieved_bc.bytecode)
    }
    if(sameResults(recieved_bc, expected_bc)) {
      desugar.style.background = 'lightgreen'
    } else {
      return setTestFailureLink(row, bytecodeRef, recieved)
    }

    // EVERYTHING PASSED! WHOOPIE!
    bytecode.style.background = 'lightgreen'
    return true

    // TRANSLATE TO PYRET AST
// TODO: possibly dead code?
//    row.appendChild(pyretAST)
//    pyretAST.innerHTML = 'pyret'
//    try{
//      recieved = plt.compiler.toPyretAST(AST, pinfo2)
//    } catch (translationError) {
//      console.log(translationError)
//      pyretAST.style.background = 'red'
//      return setTestFailureLink(row, pyretJSONRef, recieved)
//    }
//    // if we don't have a JSONRef for this test, call it a questinonable pass move on
//    if(pyretJSONRef === undefined) {
//      pyretAST.style.background = 'rgb(194, 288, 194)'
//      return true
//    }
//    console.log('about to parse jsonref: "'+pyretJSONRef+'"')
//    var expected = JSON.parse(pyretJSONRef)
//    // compare objects (compare fn ignores location information)
//    console.log('parsed jsonref')
//    if(sameResults(recieved, expected)) { pyretAST.style.background = 'lightgreen' }
//    else { return setTestFailureLink(row, pyretJSONRef, JSON.stringify(recieved))}
//
//    return true

  }

  if(verbose) console.log('running tests')
  var table = document.getElementById('testResults')
  var start = 0
  var end = tests.length
  var whichValue = document.getElementById('whichTests').value
  if(whichValue !== "all"){
    start=Number(whichValue)-1
    end=start+1
  }
  for(var i=start; i<end; i++){
    // run the test
    if(verbose) console.log('///// TEST '+ (i+1) +' ////////////////')
    if(verbose) console.log('testing :'+tests[i].expr)
    var result = test(tests[i].expr, tests[i].server, tests[i].desugar, tests[i].bytecode,
      tests[i].pyretSrc, tests[i].pyretAST)
    if(result) passed++
    testsRun++
    document.getElementById('status').innerHTML = passed+'/'+(testsRun)+' passed. <b>Click on failures to see a Diff of the output</b>.'
  }
}

function runMemoryTest(){
  var runs = prompt("How many runs of the test suite would you like to do?"
    +"This could take a while depending on how many runs are entered,"
    +"and your computer may become unresponsive."
    , 20)
  for(var i=0; i<runs; i++) runTests(false)
  console.log('Memory test complete')
}

document.body.onload = repl2_setup()
document.getElementById('runTests').onclick = loadTests
document.getElementById('memoryTest').onclick = runMemoryTest
document.getElementById('makeTeachpack').onclick = compileREPL.bind(true)
window.loadSuite = loadSuite // used by jsonp callbacks