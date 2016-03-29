import {
  comment,
  literal,
  symbolExpr,
  Program,
  couple,
  ifExpr,
  beginExpr,
  letExpr,
  letStarExpr,
  letrecExpr,
  localExpr,
  andExpr,
  orExpr,
  condExpr,
  caseExpr,
  lambdaExpr,
  quotedExpr,
  unquotedExpr,
  quasiquotedExpr,
  unquoteSplice,
  callExpr,
  whenUnlessExpr,
  defFunc,
  defVar,
  defVars,
  defStruct,
  requireExpr,
  provideStatement,
  unsupportedExpr,
  throwError,
  structBinding,
  constantBinding,
  functionBinding,
  moduleBinding,
  defaultModuleResolver,
  env,
  emptyEnv,
  keywords
} from './structures';

require('./modules');
var structures = require('./structures');
var types = require('./runtime/types');

/*
 TODO
 - stop using synchronous XmlHttpRequests -> probably only after the compiler is folded into the evaluator
*/

// checkDuplicateIdentifiers : [listof SymbolExprs], Program -> Void
// sort the array, and throw errors for non-symbols, keywords or duplicates
function checkDuplicateIdentifiers(lst, stx, unusedLoc) {
  var visitedIds = {}; // initialize a dictionary of ids we've seen
  lst.forEach( id => {
    if (!(id instanceof symbolExpr)) {
      throwError("expected identifier " + id.val, id.location);
    } else if (visitedIds[id.val]) { // if we've seen this variable before, throw an error
      throwError(new types.Message([new types.ColoredPart(stx.toString(), stx.location),
        ": found ",
        new types.ColoredPart("a variable", id.location),
        " that is already used ",
        new types.ColoredPart("here", visitedIds[id.val].location)
      ]), id.location);
    } else {
      visitedIds[id.val] = id; // otherwise, record the identifier as being visited
    }

  });
}

// tag-application-operator/module: Stx module-name -> Stx
// Adjust the lexical context of the func so it refers to the environment of a particular module.
function tagApplicationOperator_Module(application, moduleName) {
  // get the module's env
  var module = defaultModuleResolver(moduleName);
  var env = new emptyEnv().extendEnv_moduleBinding(module);
  // assign it as the context of the function, and each of the arguments
  [application.func].concat(application.args).forEach(expr => expr.context = env );
  return application;
}

// forceBooleanContext: stx, loc, bool -> stx
// Force a boolean runtime test on the given expression.
function forceBooleanContext(stx, loc, boolExpr) {
  stx = new literal(new types.string(stx.toString())); // turn the stx object into a string literal
  var verifyCall = new symbolExpr("verify-boolean-branch-value");
  var stxQuote = new quotedExpr(stx);
  var locQuote = new quotedExpr(new literal(loc.toVector()));
  var boolLocQuote = new quotedExpr(new literal(boolExpr.location.toVector()));
  var runtimeCall = new callExpr(verifyCall, [stxQuote, locQuote, boolExpr, boolLocQuote]);
  runtimeCall.location = verifyCall.location = boolExpr.location;
  stxQuote.location = locQuote.location = boolLocQuote.location = boolExpr.location;
  tagApplicationOperator_Module(runtimeCall, 'moby/runtime/kernel/misc');
  return runtimeCall;
}

//////////////////////////////////////////////////////////////////////////////
// DESUGARING ////////////////////////////////////////////////////////////////

// desugarProgram : Listof Programs null/pinfo -> [Listof Programs, pinfo]
// desugar each program, appending those that desugar to multiple programs
function desugarProgram(programs, pinfo, isTopLevelExpr) {
  var acc = [
    [], (pinfo || new structures.pinfo())
  ];
  var res = programs.filter(function(p){ return !(p instanceof comment); }).reduce((function(acc, p) {
    var desugaredAndPinfo = _desugar(acc[1], p);
    // if it's an expression, insert a print-values call so it shows up in the repl
    if (structures.isExpression(p) && isTopLevelExpr) {
      var printValues = new symbolExpr("print-values");
      var printCall = new callExpr(printValues, [desugaredAndPinfo[0]]);
      // set the location of the print-values call to that of the expression
      printValues.location = printCall.location = desugaredAndPinfo[0].location;
      desugaredAndPinfo[0] = printCall;
      tagApplicationOperator_Module(printCall, 'moby/runtime/kernel/misc');
    }
    if (desugaredAndPinfo[0].length) {
      acc[0] = acc[0].concat(desugaredAndPinfo[0]);
    } else {
      acc[0].push(desugaredAndPinfo[0]);
    }
    return [acc[0], desugaredAndPinfo[1]];
  }), acc);
  res[0].location = programs.location;
  return res;
}

function _desugar(pinfo, p, depth) {
  function desugar_defFunc(pinfo, p) {
    // check for duplicate arguments
    checkDuplicateIdentifiers([p.name].concat(p.args), p.stx[0], p.location);
    // check for non-symbol arguments
    p.args.forEach(arg => {
      if (!(arg instanceof symbolExpr)) {
        throwError(new types.Message([new types.ColoredPart(p.stx.val, p.stx.location), 
                                      ": expected a variable but found ", 
                                      new types.ColoredPart("something else", arg.location)]), arg.location);
      }
    });
    var bodyAndPinfo = _desugar(pinfo, p.body);
    var newDefFunc = new defFunc(p.name, p.args, bodyAndPinfo[0], p.stx);
    newDefFunc.location = p.location;
    return [newDefFunc, bodyAndPinfo[1]];
  }
  function desugar_defVar(pinfo, p) {
    // convert (define f (lambda (x) x)) into (define (f x) x)
    if (p.expr instanceof lambdaExpr) {
      var newDefFunc = new defFunc(p.name, p.expr.args, p.expr.body, p.stx);
      newDefFunc.location = p.location;
      return _desugar(pinfo, newDefFunc);
    } else {
      var exprAndPinfo = _desugar(pinfo, p.expr);
      var newDefVar = new defVar(p.name, exprAndPinfo[0], p.stx);
      newDefVar.location = p.location;
      return [newDefVar, exprAndPinfo[1]];
    }
  }
  function desugar_defVars(pinfo, p) {
    var exprAndPinfo = _desugar(pinfo, p.expr),
      newDefVars = new defVars(p.names, exprAndPinfo[0], p.stx);
    newDefVars.location = p.location;
    return [newDefVars, exprAndPinfo[1]];
  }
  function desugar_defStruct(pinfo, p) {
    var ids = ['make-' + p.name.val, p.name.val + '?', p.name.val + '-ref', p.name.val + '-set!'];
    var idSymbols = ids.map(id => new symbolExpr(id) );
    var makeStructTypeFunc = new symbolExpr('make-struct-type');
    var makeStructTypeArgs = [
      new quotedExpr(new symbolExpr(p.name.val)),
      new literal(false),
      new literal(p.fields.length),
      new literal(0)
    ];
    var makeStructTypeCall = new callExpr(makeStructTypeFunc, makeStructTypeArgs);
    // set location for all of these nodes
    [makeStructTypeCall, makeStructTypeFunc].concat(idSymbols, makeStructTypeArgs)
      .forEach(part => part.location = p.location);

    // make the define-values stx object, but store the original stx for define-struct
    var defineValuesStx = new defVars([p.name].concat(idSymbols), makeStructTypeCall, p.stx);
    var stxs = [defineValuesStx];
    defineValuesStx.location = p.location;
    // given a field, make a definition that binds struct-field to the result of
    // a make-struct-field accessor call in the runtime
    function makeAccessorDefn(f, i) {
      var makeFieldFunc = new symbolExpr('make-struct-field-accessor');
      var makeFieldArgs = [new symbolExpr(p.name.val + '-ref'), new literal(i), new quotedExpr(new symbolExpr(f.val))];
      var makeFieldCall = new callExpr(makeFieldFunc, makeFieldArgs);
      var accessorSymbol = new symbolExpr(p.name.val + '-' + f.val);
      var defineVar = new defVar(accessorSymbol, makeFieldCall);
      // set location for all of these nodes
      [defineVar, makeFieldFunc, makeFieldCall, accessorSymbol].concat(makeFieldArgs)
        .forEach(p => p.location = f.location);
      stxs.push(defineVar);
    }
    p.fields.forEach(makeAccessorDefn);
    return [stxs, pinfo];
  }
  function desugar_beginExpr(pinfo, p) {
    var exprsAndPinfo = desugarProgram(p.exprs, pinfo);
    var newBeginExpr = new beginExpr(exprsAndPinfo[0], p.stx);
    newBeginExpr.location = p.location;
    return [newBeginExpr, exprsAndPinfo[1]];
  }
  function desugar_lambdaExpr(pinfo, p) {
    // if this was parsed from raw syntax, check for duplicate arguments
    if (p.stx) checkDuplicateIdentifiers(p.args, p.stx, p.location);
    var bodyAndPinfo = _desugar(pinfo, p.body);
    var newLambdaExpr = new lambdaExpr(p.args, bodyAndPinfo[0], p.stx);
    newLambdaExpr.location = p.location;
    return [newLambdaExpr, bodyAndPinfo[1]];
  }
  function desugar_localExpr(pinfo, p) {
    var defnsAndPinfo = desugarProgram(p.defs, pinfo);
    var exprAndPinfo = _desugar(defnsAndPinfo[1], p.body);
    var newLocalExpr = new localExpr(defnsAndPinfo[0], exprAndPinfo[0], p.stx);
    newLocalExpr.location = p.location;
    return [newLocalExpr, exprAndPinfo[1]];
  }
  function desugar_callExpr(pinfo, p) {
    if(!p.func){
      throwError(new types.Message([new types.ColoredPart("( )", p.location), ": expected a function, but nothing's there"]), 
        p.location);
    }
    var exprsAndPinfo = desugarProgram([p.func].concat(p.args), pinfo);
    var newCallExpr = new callExpr(exprsAndPinfo[0][0], exprsAndPinfo[0].slice(1), p.stx);
    newCallExpr.location = p.location;
    return [newCallExpr, exprsAndPinfo[1]];
  }
  function desugar_ifExpr(pinfo, p) {
    var exprsAndPinfo = desugarProgram([p.predicate, p.consequence, p.alternative], pinfo);
    var predicate = forceBooleanContext(p.stx, p.stx.location, exprsAndPinfo[0][0]);
    var consequence = exprsAndPinfo[0][1];
    var alternative = exprsAndPinfo[0][2];
    var newIfExpr = new ifExpr(predicate, consequence, alternative, p.stx);
    newIfExpr.location = p.location;
    return [newIfExpr, exprsAndPinfo[1]];
  }
  function desugar_whenUnlessExpr(pinfo, p) {
    var begin_exp = new beginExpr(p.exprs, p.stx);
    var void_exp = new symbolExpr('void');
    var call_exp = new callExpr(void_exp, [], p.stx);
    var consequence = (p.stx.val === "when") ? begin_exp : call_exp;
    var alternative = (p.stx.val === "when") ? call_exp : begin_exp;
    begin_exp.location = p.exprs.location;
    void_exp.location = call_exp.location = p.location;
    // desugar each expression and construct an ifExpr
    var exprsAndPinfo = desugarProgram([p.predicate, consequence, alternative], pinfo);
    var if_exp = new ifExpr(exprsAndPinfo[0][0], exprsAndPinfo[0][1], exprsAndPinfo[0][2], p.stx);
    if_exp.location = p.location;
    // DON'T desugar the ifExpr -- we don't forceBooleanContext on when/unless!
    return [if_exp, exprsAndPinfo[1]];
  }
  // letrecs become locals
  function desugar_letrecExpr(pinfo, p) {
    function bindingToDefn(b) {
      var def = new defVar(b.first, b.second, b.stx);
      def.location = b.location;
      return def
    }
    var localAndPinfo = _desugar(pinfo, new localExpr(p.bindings.map(bindingToDefn), p.body, p.stx));
    localAndPinfo[0].location = p.location;
    return localAndPinfo;
  }
  // lets become calls
  function desugar_letExpr(pinfo, p) {
    // utility functions for accessing first and second
    function coupleFirst(x)  { return x.first;  }
    function coupleSecond(x) { return x.second; }

    var ids = p.bindings.map(coupleFirst);
    var exprs = p.bindings.map(coupleSecond);
    var lambda = new lambdaExpr(ids, p.body, p.stx);
    var call = new callExpr(lambda, exprs);
    lambda.location = call.location = p.location;
    return _desugar(pinfo, call);
  }
  // let*s become nested lets
  function desugar_letStarExpr(pinfo, p) {
    function bindingToLet(body, binding) {
      var let_exp = new letExpr([binding], body, binding.stx);
      let_exp.location = binding.location;
      return let_exp;
    }
    // if there are no bindings, desugar the body. Otherwise, reduce to nested lets first
    if (p.bindings.length === 0) return _desugar(pinfo, p.body);
    else return _desugar(pinfo, p.bindings.reduceRight(bindingToLet, p.body));
  }
  // conds become nested ifs
  function desugar_condExpr(pinfo, p) {
    // base case is all-false
    var condExhausted = new symbolExpr("throw-cond-exhausted-error");
    var exhaustedLoc = new quotedExpr(new literal(p.location.toVector()));
    var expr = tagApplicationOperator_Module(new callExpr(condExhausted, [exhaustedLoc]), "moby/runtime/kernel/misc");
    var ifStx = new symbolExpr("if");
    ifStx.location = p.stx.location;

    expr.location = condExhausted.location = exhaustedLoc.location = p.location;
    for (var i = p.clauses.length - 1; i > -1; i--) {
      // desugar else to true
      if (p.clauses[i].first instanceof symbolExpr && p.clauses[i].first.val === "else") {
        p.clauses[i].first.val = "true";
      }
      expr = new ifExpr(p.clauses[i].first, p.clauses[i].second, expr, p.stx);
      expr.location = p.location;
    }
    return _desugar(pinfo, expr);
  }
  // case become nested ifs, with ormap as the predicate
  function desugar_caseExpr(pinfo, p) {
    var caseStx = new symbolExpr("if"); // TODO: The server returns "if" here, but I am almost certain it should be "case"
    caseStx.location = p.location;

    var pinfoAndValSym = pinfo.gensym('val');     // create a symbol 'val
    var updatedPinfo1 = pinfoAndValSym[0];        // generate pinfo containing 'val
    var valStx = pinfoAndValSym[1];               // remember the symbolExpr for 'val'
    var pinfoAndXSym = updatedPinfo1.gensym('x'); // create another symbol 'x' using pinfo1
    var updatedPinfo2 = pinfoAndXSym[0];          // generate pinfo containing 'x'
    var xStx = pinfoAndXSym[1];                   // remember the symbolExpr for 'x'
    var voidStx = new symbolExpr('void');         // make the void symbol

    // track all the syntax we've created so far...
    var stxs = [valStx, xStx, voidStx];
    // if there's an 'else', pop off the clause and use the result as the base
    var expr, clauses = p.clauses, lastClause = clauses[p.clauses.length - 1];
    if ((lastClause.first instanceof symbolExpr) && (lastClause.first.val === 'else')) {
      expr = lastClause.second;
      clauses.pop();
    } else {
      expr = new callExpr(voidStx, [], p.stx);
      expr.location = p.location;
    }
    // This is the predicate we'll be applying using ormap: (lambda (x) (equal? x val))
    var equalStx = new symbolExpr('equal?');
    var equalTestStx = new callExpr(equalStx, [xStx, valStx], caseStx);
    var predicateStx = new lambdaExpr([xStx], equalTestStx, caseStx);
    // track the syntax that will need location information reset
    stxs = stxs.concat([equalStx, equalTestStx, predicateStx]);

    // generate (if (ormap <predicate> clause.first) clause.second base)
    function processClause(base, clause) {
      var ormapStx = new symbolExpr('ormap');
      var callStx = new callExpr(ormapStx, [predicateStx, clause.first], p.stx);
      var ifStx = new ifExpr(callStx, clause.second, base, caseStx);
      // track the syntax that will need location information reset
      stxs = stxs.concat([ormapStx, callStx, clause.first, ifStx]);
      return ifStx;
    }

    // build the body of the let by decomposing cases into nested ifs
    var binding = new couple(valStx, p.expr);
    var body = clauses.reduceRight(processClause, expr);
    var letExp = new letExpr([binding], body, caseStx);
    // track the syntax that will need location information reset
    stxs = stxs.concat([binding, letExp]);

    // assign location to every stx element we created
    stxs.forEach(stx => stx.location = p.location );
    return _desugar(updatedPinfo2, letExp);
  }
  // ands become nested ifs
  function desugar_andExpr(pinfo, p) {
    var ifStx = new symbolExpr("if");
    var exprsAndPinfo = desugarProgram(p.exprs, pinfo);
    var exprs = exprsAndPinfo[0];
    pinfo = exprsAndPinfo[1];

    // recursively walk through the exprs
    function desugarAndExprs(exprs) {
      var predicate = forceBooleanContext(p.stx, p.stx.location, exprs[0]);
      // if there only two exprs in the chain, force a boolean ctx on the second expr and make it the consequence
      // otherwise, desugar the rest of the chain before adding it
      var consequence = (exprs.length > 2) ? desugarAndExprs(exprs.slice(1)) : forceBooleanContext(p.stx, p.stx.location, exprs[1]);
      var alternative = new literal(false);
      var ifLink = new ifExpr(predicate, consequence, alternative, ifStx);
      var stxs = [alternative, ifStx, ifLink];

      // assign location information to everything
      stxs.forEach(stx => stx.location = p.location );
      return ifLink;
    }

    var ifChain = desugarAndExprs(exprs);
    ifChain.location = p.location;
    return [ifChain, pinfo];
  }
  // ors become nested lets-with-if-bodies
  function desugar_orExpr(pinfo, p) {
    var orStx = new symbolExpr("or");
    var exprsAndPinfo = desugarProgram(p.exprs, pinfo);
    var exprs = exprsAndPinfo[0];
    pinfo = exprsAndPinfo[1];

    // recursively walk through the exprs
    function desugarOrExprs(exprs, pinfo) {
      var firstExpr = exprs[0];
      var pinfoAndTempSym = pinfo.gensym('tmp');
      var firstExprSym = pinfoAndTempSym[1];
      var ifStx = new symbolExpr("if");
      firstExprSym.notOriginalSource = true;

      // to match Racket's behavior, we override any expression's
      // stx to be "if", with the location of the whole expression
      if (firstExpr.stx && (firstExpr.stx.val !== "if")) {
        ifStx.location = firstExpr.location;
        firstExpr.stx = ifStx;
      }
      pinfo = pinfoAndTempSym[0];
      var tmpBinding = new couple(firstExprSym, forceBooleanContext(p.stx, p.stx.location, firstExpr));
      var secondExpr;

      // if there are only two exprs in the chain, force a boolean ctx on the second expr before adding
      // otherwise, desugar the rest of the chain before adding it
      if (exprs.length == 2) {
        secondExpr = forceBooleanContext(orStx, p.stx.location, exprs[1]);
      } else {
        var secondExprAndPinfo = desugarOrExprs(exprs.slice(1), pinfo);
        secondExpr = secondExprAndPinfo[0];
        pinfo = secondExprAndPinfo[1];
      }

      // create if and let expressions, using these new symbols and bindings
      var if_exp = new ifExpr(firstExprSym, firstExprSym, secondExpr, new symbolExpr("if"));
      var let_exp = new letExpr([tmpBinding], if_exp, orStx);
      var stxs = [orStx, firstExprSym, tmpBinding, if_exp, if_exp.stx, let_exp];
      // assign location information to everything
      stxs.forEach(stx => stx.location = p.location );
      return _desugar(pinfo, let_exp);
    }

    return desugarOrExprs(exprs, pinfo);
  }
  function desugar_quotedExpr(pinfo, p) {
    if (typeof p.location === 'undefined') {
      throwError( new types.Message(["ASSERTION ERROR: Every quotedExpr should have a location"])
                , p.location)
    }
    // Sexp-lists (arrays) become lists
    // literals and symbols stay themselves
    // everything else gets desugared
    function desugarQuotedItem(pinfo, loc){
      return function (x) {
        if (  x instanceof callExpr
           || x instanceof quotedExpr
           || x instanceof unsupportedExpr
           ) {
          return _desugar(pinfo, x);
        } else if (  x instanceof symbolExpr
                  || x instanceof literal
                  || x instanceof Array
                  ) {
          var res = new quotedExpr(x);
          res.location = loc;
          return [res, pinfo];
        } else {
          throwError(new types.Message(["ASSERTION ERROR: Found an unexpected item in a quotedExpr"])
                    , loc);
        }
      }
    }
    return desugarQuotedItem(pinfo, p.location)(p.val);
  }
  function desugar_unquotedExpr(pinfo, p, depth) {
    if (typeof depth === 'undefined') {
      throwError( new types.Message(["misuse of a ', not under a quasiquoting backquote"])
                , p.location);
    } else if (depth === 1) {
      return _desugar(pinfo, p.val);
    } else if (depth > 1) {
      var rhs = (p.val instanceof Array)
          ? desugarQuasiQuotedList(p.val, pinfo, depth-1)[0]
          : _desugar(pinfo, p.val, depth-1)[0]
      var uSym = new quotedExpr(new symbolExpr('unquote')),
        listSym = new symbolExpr('list'),
        listArgs = [uSym, rhs],
        listCall = new callExpr(listSym, listArgs);
      uSym.location = p.location;
      uSym.parent = listArgs;
      listSym.location = p.location;
      listSym.parent = listCall;
      listCall.location = p.location;
      return [listCall, pinfo];
    } else {
      throwError( new types.Message(["ASSERTION FAILURE: depth should have been undefined, or a natural number"])
                , p.location);
    }
  }
  function desugar_unquoteSplice(pinfo, p, depth) {
    if (typeof depth === 'undefined') {
      throwError( new types.Message(["misuse of a ,@, not under a quasiquoting backquote"])
                , p.location);
    } else if (depth === 1) {
      return _desugar(p.val, pinfo);
    } else if (depth > 1) {
      var rhs = (p.val instanceof Array)
          ? desugarQuasiQuotedList(p.val, pinfo, depth-1)[0]
          : _desugar(pinfo, p.val, depth-1)[0]
      var usSym = new quotedExpr(new symbolExpr('unquote-splicing')),
        listSym = new symbolExpr('list'),
        listArgs = [usSym, rhs],
        listCall = new callExpr(listSym, listArgs);
      usSym.location = p.location;
      usSym.parent = listArgs;
      listSym.location = p.location;
      listSym.parent = listCall;
      listCall.location = p.location;
      return [listCall, pinfo];
    } else {
      throwError( new types.Message(["ASSERTION FAILURE: depth should have been undefined, or a natural number"])
                , p.location);
    }
  }
  function desugarQuasiQuotedList(qqlist, pinfo, depth) {

    // helper function for a single QQ-list element
    function desugarQuasiQuotedListElement(element, pinfo, depth, loc) {
      if (depth === 0 && element instanceof unquoteSplice) {
        return _desugar(pinfo, element, depth);
      } else {
        var argument = (element instanceof Array) ?
           desugarQuasiQuotedList(element, depth, depth)[0] :
           _desugar(pinfo, element, depth)[0],
          listSym = new symbolExpr('list'),
          listCall = new callExpr(listSym, [argument]);
        listSym.parent = listCall;
        listCall.location = listSym.location = loc;
        return [listCall, pinfo];
      }
    }

    var loc = (typeof qqlist.location != 'undefined') ? qqlist.location :
               ((qqlist instanceof Array) && (typeof qqlist[0].location != 'undefined')) ? qqlist[0].location :
               (throwError( types.Message(["ASSERTION FAILURE: couldn't find a usable location"])
                           , new Location(0,0,0,0))),
      appendArgs = qqlist.map(function(x){ return desugarQuasiQuotedListElement(x, pinfo, depth, loc)[0]; }),
      appendSym = new symbolExpr('append');
    appendSym.location = loc
    var appendCall = new callExpr(appendSym, appendArgs);
    appendCall.location = loc;
    return [appendCall, pinfo];
  }
  // go through each item in search of unquote or unquoteSplice
  function desugar_quasiquotedExpr(pinfo, p, depth){
    depth = (typeof depth === 'undefined') ? 0 : depth;
    if (depth >= 0) {
      var result;
      if(p.val instanceof Array){
        result = desugarQuasiQuotedList(p.val, pinfo, depth+1)[0];
      } else {
        result = _desugar(pinfo, p.val, depth+1)[0];
      }
    } else {
      throwError( new types.Message(["ASSERTION FAILURE: depth should have been undefined, or a natural number"])
                , p.location);
    }
    if (depth == 0) {
      return [result, pinfo];
    } else {
      var qqSym = new quotedExpr(new symbolExpr('quasiquote')),
        listArgs = [qqSym, result],
        listSym = new symbolExpr('list'),
        listCall = new callExpr(listSym, listArgs);
      qqSym.parent = listArgs;
      qqSym.location = p.location;
      result.parent = listArgs;
      listSym.parent = listCall;
      listSym.location = p.location;
      listCall.location = p.location;
      return [listCall, pinfo]
    }
  }
  function desugar_symbolExpr(pinfo, p) {
    // if we're not in a clause, we'd better not see an "else"...
    if (!p.isClause && (p.val === "else")) {
      var loc = (p.parent && p.parent[0] === p) ? p.parent.location : p.location;
      throwError(new types.Message([new types.ColoredPart(p.val, loc), ": not allowed ", new types.ColoredPart("here", loc), ", because this is not a question in a clause"]),
        loc);
    }
    // if this is a define without a parent, or if it's not the first child of the parent
    if ((p.parent && p.parent[0] !== p) && (p.val === "define")) {
      var msg = new types.Message([new types.ColoredPart(p.val, p.location), ": not allowed inside an expression"]);
      throwError(msg, p.location);
    }
    // if this is a keyword without a parent, or if it's not the first child of the parent
    if (!p.parent && keywords.includes(p.val) && (p.val !== "else")) {
      throwError(new types.Message([new types.ColoredPart(p.val, p.location), ": expected an open parenthesis before ", p.val, ", but found none"]),
        p.location);
    }
    // the dot operator is not supported by WeScheme
    if (p.val === ".") {
      let msg = new types.Message([p.location.source, ":",
        p.location.startRow.toString(), ":",
        p.location.startCol.toString(), ": read: '.' is not supported as a symbol in WeScheme"
      ]);
      throwError(msg, p.location, "Error-GenericReadError");
    }
    return [p, pinfo];
  }
  function desugar_unsupportedExpr(pinfo, p) {
    p.location.span = p.errorSpan;
    throwError(p.errorMsg, p.location, "Error-GenericReadError");
  }
       if(p instanceof defFunc)   { return desugar_defFunc(pinfo, p); }
  else if(p instanceof defVar)    { return desugar_defVar(pinfo, p); }
  else if(p instanceof defVars)   { return desugar_defVars(pinfo, p); }
  else if(p instanceof defStruct) { return desugar_defStruct(pinfo, p); }
  else if(p instanceof beginExpr) { return desugar_beginExpr(pinfo, p); }
  else if(p instanceof lambdaExpr){ return desugar_lambdaExpr(pinfo, p); }
  else if(p instanceof localExpr) { return desugar_localExpr(pinfo, p); }
  else if(p instanceof callExpr)  { return desugar_callExpr(pinfo, p); }
  else if(p instanceof ifExpr)    { return desugar_ifExpr(pinfo, p); }
  else if(p instanceof letrecExpr){ return desugar_letrecExpr(pinfo, p); }
  else if(p instanceof letExpr)   { return desugar_letExpr(pinfo, p); }
  else if(p instanceof letStarExpr){return desugar_letStarExpr(pinfo, p); }
  else if(p instanceof condExpr)  { return desugar_condExpr(pinfo, p); }
  else if(p instanceof caseExpr)  { return desugar_caseExpr(pinfo, p); }
  else if(p instanceof andExpr)   { return desugar_andExpr(pinfo, p); }
  else if(p instanceof orExpr)    { return desugar_orExpr(pinfo, p); }
  else if(p instanceof quotedExpr){ return desugar_quotedExpr(pinfo, p); }
  else if(p instanceof symbolExpr){ return desugar_symbolExpr(pinfo, p); }
  else if(p instanceof whenUnlessExpr)  { return desugar_whenUnlessExpr(pinfo, p); }
  else if(p instanceof unquotedExpr)    { return desugar_unquotedExpr(pinfo, p, depth); }
  else if(p instanceof unquoteSplice)   { return desugar_unquoteSplice(pinfo, p, depth); }
  else if(p instanceof quasiquotedExpr) { return desugar_quasiquotedExpr(pinfo, p, depth); }
  else if(p instanceof unsupportedExpr) { return desugar_unsupportedExpr(pinfo, p); }
  else { return [p, pinfo]; }

}
//////////////////////////////////////////////////////////////////////////////
// COLLECT DEFINITIONS ///////////////////////////////////////////////////////
// bf: symbol path number boolean string -> binding:function
// Helper function.
function bf(name, modulePath, arity, vararity, loc) {
  return new functionBinding(name, modulePath, arity, vararity, [], false, loc);
}

function collectDefinitions(pinfo, p) {
  function collectDefinitions_defFunc(pinfo, p) {
    p.args.forEach(arg => {
      if (keywords.includes(arg.val)) {
        throwError(new types.Message([new types.ColoredPart(arg.val, arg.location),
          ": this is a reserved keyword and cannot be used" +
          " as a variable or function name"
        ]), arg.location);

      }
    });

    var binding = bf(p.name.val, false, p.args.length, false, p.name.location);
    return pinfo.accumulateDefinedBinding(binding, p.name.location);
  }
  function collectDefinitions_defVar(pinfo, p) {
    var binding = (p.expr instanceof lambdaExpr) ?
      bf(p.name.val, false, p.expr.args.length, false, p.name.location) : new constantBinding(p.name.val, false, [], p.name.location);
    return pinfo.accumulateDefinedBinding(binding, p.name.location);
  }
  function collectDefinitions_defVars(pinfo, p) {
    var fieldToAccessor = function(f) {
      return p.stx[1].val + "-" + f.val;
    };
    var fieldToMutator = function(f) {
      return "set-" + p.stx[1].val + "-" + f.val + "!";
    };
    // if it's define-struct, create a struct binding
    if (p.stx[0].val === "define-struct") {
      var id = p.stx[1].val;
      var fields = p.stx[2];
      var constructorId = "make-" + id;
      var predicateId = id + "?";
      var selectorIds = fields.map(fieldToAccessor);
      var mutatorIds = fields.map(fieldToMutator);
      var structNameLoc = p.stx[1].location; // location of <name> in (define-struct <name> (..))
      // build bindings out of these ids
      var structureBinding = new structBinding(id, false, fields, constructorId, predicateId,
        selectorIds, mutatorIds, null, p.stx[1].location);
      var constructorBinding = bf(constructorId, false, fields.length, false, structNameLoc);
      var predicateBinding = bf(predicateId, false, 1, false, structNameLoc);
      var mutatorBinding = bf(id + "-set!", false, 1, false, structNameLoc);
      var refBinding = bf(id + "-ref", false, 1, false, structNameLoc);
      // COMMENTED OUT ON PURPOSE:
      // these symbols are provided by separate definitions that result from desugaring, in keeping with the original compiler's behavior
      //        selectorBindings   = selectorIds.map(function(id){return bf(id, false, 1, false, that.location)}),
      // AND WOULD YOU BELIEVE IT:
      //  these symbols aren't exposed by the compiler either (maybe since set! isn't supported?)
      //        mutatorBindings    = mutatorIds.map(function(id){return bf(id, false, 2, false, that.location)}),
      // assemble all the bindings together
      var bindings = [structureBinding, refBinding, constructorBinding, predicateBinding, mutatorBinding];
      return pinfo.accumulateDefinedBindings(bindings, p.location);
    } else {
      return p.names.reduce(function(pinfo, id) {
        var binding = new constantBinding(id.val, false, [], id.location);
        return pinfo.accumulateDefinedBinding(binding, id.location);
      }, pinfo);
    }
  }
  // When we hit a require, we have to extend our environment to include the list of module
  // bindings provided by that module.
  // FIXME: we currently override moduleName, which SHOULD just give us the proper name
  function collectDefinitions_requireExpr(pinfo, p) {
    // if it's a literal, pull out the actual value. if it's a symbol use it as-is
    var moduleName = (p.spec instanceof literal) ? p.spec.val.toString() : p.spec.toString();
    var resolvedModuleName = pinfo.modulePathResolver(moduleName, pinfo.currentModulePath);
    var newPinfo;

    // is this a shared WeScheme program?
    function getWeSchemeModule(name) {
      var m = name.match(/^wescheme\/(\w+)$/);
      return m ? m[1] : false;
    }

    function throwModuleError(unusedModuleName) {
      var bestGuess = structures.moduleGuess(p.spec.toString());
      var msg = new types.Message(["Found require of the module ", 
                                  new types.ColoredPart(p.spec.toString(), p.spec.location), 
                                  ", but this module is unknown.", 
                                  ((bestGuess.name === p.spec.toString()) ? "" : " Did you mean '" + bestGuess.name + "'?")]);
      throwError(msg, p.spec.location, "Error-UnknownModule");
    }

    // if it's an invalid moduleName, throw an error
    if (!(resolvedModuleName || getWeSchemeModule(moduleName))) {
      throwModuleError(moduleName);
    }

    // processModule : JS -> pinfo
    // assumes the module has been assigned to window.COLLECTIONS.
    // pull out the bindings, and then add them to pinfo
    function processModule(moduleName) {
      var provides = window.COLLECTIONS[moduleName].provides;
      var strToBinding = function(p) {
        var b = new constantBinding(p, new symbolExpr(moduleName), false);
        b.imported = true; // WTF: Moby treats imported bindings differently, so we need to identify them
        return b;
      };
      var provideBindings = provides.map(strToBinding);
      var modulebinding = new moduleBinding(moduleName, "dummy", provideBindings);
      newPinfo = pinfo.accumulateModule(modulebinding).accumulateModuleBindings(provideBindings);
    }

    // open a *synchronous* GET request -- FIXME to use callbacks?
    var url = window.location.protocol + "//" + window.location.host + (getWeSchemeModule(moduleName) ? 
      "/loadProject?publicId=" + (getWeSchemeModule(moduleName)) : "/js/mzscheme-vm/collects/" + moduleName + ".js");

    // if the module is already loaded, we can just process without loading
    if (window.COLLECTIONS && window.COLLECTIONS[moduleName]) {
      processModule(moduleName);
    } else {
      if (window.jQuery) {
        window.jQuery.ajax({
          url: url,
          success: function(result) {
            try {
              // if it's not a native module, manually assign it to window.COLLECTIONS
              if (getWeSchemeModule(moduleName)) {
                var program = (0, eval)('(' + result + ')');
                // Create the COLLECTIONS array, if it doesn't exist
                if (window.COLLECTIONS === undefined) {
                  window.COLLECTIONS = [];
                }
                // extract the sourcecode
                var lexemes = require('./lex').lex(program.source.src, moduleName);
                var AST = require('./parser').parse(lexemes);
                var desugared = desugar(AST)[0]; // includes [AST, pinfo]
                var pinfo = analyze(desugared);
                var objectCode = require('./compiler').compile(desugared, pinfo);
                window.COLLECTIONS[moduleName] = {
                  'name': moduleName,
                  'bytecode': (0, eval)('(' + objectCode.bytecode + ')'),
                  'provides': objectCode.provides
                };
                // otherwise, simply evaluate the raw JS
              } else {
                eval(result);
              }
              if(result) { processModule(moduleName); }
              else { throwModuleError(moduleName); }
            } catch(e) {
              if(e.type === "moby-failure") throw e; // throw moby errors
                    var msg = new types.Message(["A network error occured when trying to load "
                                   , new types.ColoredPart(that.spec.toString(), that.spec.location)
                                   , ". Please check your connection and try again."]);
                    throwError(msg, that.spec.location, "Error-NetworkError");
            }
          },
          error: function(unusedError) {
            throwModuleError(moduleName);
          },
          async: false
        });
      } else {
        console.log('jQuery not available, can\'t load data from ' + url)
        throwModuleError(moduleName)
      }
    }
    return newPinfo;
  }

       if(p instanceof defFunc)   { return collectDefinitions_defFunc(pinfo, p); }
  else if(p instanceof defVar)    { return collectDefinitions_defVar(pinfo, p); }
  else if(p instanceof defVars)   { return collectDefinitions_defVars(pinfo, p); }
  else if(p instanceof requireExpr){return collectDefinitions_requireExpr(pinfo, p); }
  else {return pinfo; }
}
// BINDING STRUCTS ///////////////////////////////////////////////////////
export function provideBindingId(symbl) {
  this.symbl = symbl;
}
export function provideBindingStructId(symbl) {
  this.symbl = symbl;
}

//////////////////////////////////////////////////////////////////////////////
// COLLECT PROVIDES //////////////////////////////////////////////////////////

// extend the Program class to collect provides
// Program.collectProvides: pinfo -> pinfo
function collectProvides(pinfo, p) {
  function addProvidedName(id) {
    pinfo.providedNames.put(id, new provideBindingId(id));
  }

  // collectProvidesFromClause : pinfo clause -> pinfo
  function collectProvidesFromClause(pinfo, clause) {
    // if it's a symbol, make sure it's defined (otherwise error)
    if (clause instanceof symbolExpr) {
      if (pinfo.definedNames.has(clause.val)) {
        addProvidedName(clause.val);
        return pinfo;
      } else {
        var msg = new types.Message([
          "The name '", new types.ColoredPart(clause.toString(), clause.location), "', is not defined in the program, and cannot be provided."
        ]);
        throwError(msg, clause.location);
      }
      // if it's an array, make sure the struct is defined (otherwise error)
      // NOTE: ONLY (struct-out id) IS SUPPORTED AT THIS TIME
    } else if (clause instanceof Array) {
      if (pinfo.definedNames.has(clause[1].val) && (pinfo.definedNames.get(clause[1].val) instanceof structBinding)) {
        // add the entire structBinding to the provided binding, so we
        // can access fieldnames, predicates, and permissions later
        var b = pinfo.definedNames.get(clause[1].val);
        var fns = [b.name, b.constructor, b.predicate].concat(b.accessors, b.mutators);
        fns.forEach(addProvidedName);
        return pinfo;
      } else {
        throwError(
          new types.Message([
            "The struct '", new types.ColoredPart(clause[1].toString(), clause[1].location), "', is not defined in the program, and cannot be provided"
          ]), clause.location);
      }
      // anything with a different format throws an error
    } else {
      throw "Impossible: all invalid provide clauses should have been filtered out!";
    }
  }

  if(p instanceof provideStatement) {
    return p.clauses.reduce(collectProvidesFromClause, pinfo);
  } else {
    return pinfo;
  }
};
//////////////////////////////////////////////////////////////////////////////
// ANALYZE USES //////////////////////////////////////////////////////////////

function analyzeUses(p, pinfo, _env){
  // analyzeClosureUses : expr pinfo -> pinfo
  // given the body of a lambda, an environment and a pinfo, analyze the body
  function analyzeClosureUses(funcExpr, pinfo) {
    // 1) make a copy of all the bindings
    var oldEnv = pinfo.env;
    var newBindings = new Map();
    for(var [k,v] of oldEnv.bindings){ newBindings.set(k, v); }
    // 2) make a copy of the environment, using the newly-copied bindings, and
    //    add the args to this environment
    var newEnv = new env(newBindings);
    newEnv = funcExpr.args.reduce(function(_env, arg) {
      return _env.extend(new constantBinding(arg.val, false, [], arg.location));
    }, newEnv);
    // 3) install the post-arg env into pinfo, analyze the body, and
    //    install the original environment
    pinfo.env = newEnv;
    pinfo = analyzeUses(funcExpr.body, pinfo, newEnv);
    pinfo.env = oldEnv;
    return pinfo;
  }

  function analyzeUses_defVar(p, pinfo, _env) {
    // extend the environment with the value or function, then analyze the expression
    pinfo.env.extend((p.expr instanceof lambdaExpr) ?
      bf(p.name.val, false, p.expr.args.length, false, p.location) 
      : new constantBinding(p.name.val, false, [], p.name.location));
    return analyzeUses(p.expr, pinfo, pinfo.env);
  }
  function analyzeUses_defVars(p, pinfo, env) {
    p.names.forEach(id => pinfo.env.extend(new constantBinding(id.val, false, [], id.location)) );
    return analyzeUses(p.expr, pinfo, pinfo.env);
  }
  function analyzeUses_defFunc(p, pinfo, _env) {
    // extend the env to include the function binding, then analyze the body as if it's a lambda
    pinfo.env = pinfo.env.extend(bf(p.name.val, false, p.args.length, false, p.name.location));
    return analyzeClosureUses(p, pinfo, _env);  
  }

  function analyzeUses_lambdaExpr(p, pinfo, _env) {
    return analyzeClosureUses(p, pinfo, _env);
  }
  function analyzeUses_beginExpr(p, pinfo, _env) {
    return p.exprs.reduce(function(p, expr) {
      return analyzeUses(expr, p, _env);
    }, pinfo);
  }
  function analyzeUses_localExpr(p, pinfo, _env) {
    var pinfoAfterDefs = p.defs.reduce(function(pinfo, d) {
      return analyzeUses(d, pinfo, _env);
    }, pinfo);
    return analyzeUses(p.body, pinfoAfterDefs, pinfoAfterDefs.env);
  }
  function analyzeUses_callExpr(p, pinfo, _env) {
    return [p.func].concat(p.args).reduce(function(_p, arg) {
      return (arg instanceof Array) ?
        // if arg is a subexpression, reduce THAT
        arg.reduce((function(pinfo, _p) {
          return analyzeUses(_p, pinfo, pinfo.env);
        }), pinfo)
        // otherwise analyze and return
        : analyzeUses(arg, _p, _env);
    }, pinfo);
  }
  function analyzeUses_ifExpr(p, pinfo, _env) {
    var exps = [p.predicate, p.consequence, p.alternative];
    return exps.reduce(function(_p, exp) {
      return analyzeUses(exp, _p, _env);
    }, pinfo);
  }
  function analyzeUses_symbolExpr(p, pinfo, _env) {
    // if this is a keyword without a parent, or if it's not the first child of the parent
    if (keywords.includes(p.val) &&
      (!p.parent || p.parent[0] !== p) ||
      p.parent instanceof couple) {
      throwError(
        new types.Message([
          new types.ColoredPart(p.val, p.location),
          ": expected an open parenthesis before ",
          p.val,
          ", but found none"
        ]),
        p.location
      );
    }
    var binding = _env.lookup_context(p.val);
    if (binding) {
      p.bindingLoc = binding.loc; //  keep track of where this symbol was bound
      return pinfo.accumulateBindingUse(binding, pinfo);
    } else {
      return pinfo.accumulateFreeVariableUse(p.val, pinfo);
    }
  }

         if(p instanceof defVar)    { return analyzeUses_defVar(p, pinfo, _env); }
    else if(p instanceof defVars)   { return analyzeUses_defVars(p, pinfo, _env); }
    else if(p instanceof defFunc)   { return analyzeUses_defFunc(p, pinfo, _env); }
    else if(p instanceof lambdaExpr){ return analyzeUses_lambdaExpr(p, pinfo, _env); }
    else if(p instanceof beginExpr) { return analyzeUses_beginExpr(p, pinfo, _env); }
    else if(p instanceof localExpr) { return analyzeUses_localExpr(p, pinfo, _env); }
    else if(p instanceof callExpr)  { return analyzeUses_callExpr(p, pinfo, _env); }
    else if(p instanceof ifExpr)    { return analyzeUses_ifExpr(p, pinfo, _env); }
    else if(p instanceof symbolExpr){ return analyzeUses_symbolExpr(p, pinfo, _env); }
    else { return pinfo; }
};


/////////////////////////////////////////////////////////////
function _analyze(programs) {
  return programAnalyzeWithPinfo(programs, structures.getBasePinfo("base"));
}

// programAnalyzerWithPinfo : [listof Programs], pinfo -> pinfo
// build up pinfo by looking at definitions, provides and uses
function programAnalyzeWithPinfo(programs, pinfo) {
  // analyzeUses: [listof Programs] pinfo -> pinfo
  // Collects the uses of bindings that this program uses.
  function _analyzeUses(programs, pinfo) {
    return programs.reduce((function(pinfo, p) {
      return analyzeUses(p, pinfo, pinfo.env);
    }), pinfo);
  }
  // Collect the definitions either imported or defined by this program.
  var pinfo1 = programs.reduce(collectDefinitions, pinfo);
  // Walk through the program and collect all the provide statements.
  var pinfo2 = programs.reduce(collectProvides, pinfo1);
  return _analyzeUses(programs, pinfo2);
}

/////////////////////
/* Export Bindings */
/////////////////////
export var desugar = function(p, pinfo, debug) {
  var start = new Date().getTime();
  try {
    var ASTandPinfo = desugarProgram(p, pinfo, true); // do the actual work
    var program = ASTandPinfo[0];
    pinfo = ASTandPinfo[1];
  } catch (e) {
    console.log("DESUGARING ERROR");
    throw e;
  }
  var end = new Date().getTime();
  if (debug) {
    console.log("Desugared in " + (Math.floor(end - start)) + "ms");
    console.log(program);
    console.log(program.toString());
  }
  return ASTandPinfo;
};
export var analyze = function(program, debug) {
  var start = new Date().getTime();
  try {
    var pinfo = _analyze(program);
  } // do the actual work
  catch (e) {
    console.log("ANALYSIS ERROR");
    throw e;
  }
  var end = new Date().getTime();
  if (debug) {
    console.log("Analyzed in " + (Math.floor(end - start)) + "ms");
    //      console.log(pinfo.toString());
  }
  return pinfo;
};
