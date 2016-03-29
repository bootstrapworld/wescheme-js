/*eslint no-console: 0*/
import {
  literal,
  symbolExpr,
  Program,
  ifExpr,
  beginExpr,
  localExpr,
  andExpr,
  orExpr,
  lambdaExpr,
  quotedExpr,
  callExpr,
  defFunc,
  defVar,
  defVars,
  defStruct,
  requireExpr,
  provideStatement,
  emptyEnv,
  localEnv,
  globalEnv,
  unnamedEnv,
  isDefinition,
  isExpression,
  localStackReference,
  globalStackReference,
  unboundStackReference
} from './structures';
var compiler = require('./compiler');
var jsnums = require('./runtime/js-numbers');
var types = require('./runtime/types');

/*
 SOMEDAY...but probably never
 - compiled-indirects
 - fix uniqueGlobalNames hack!
 - deal with more complex module resolution (e.g. - rename-out, etc)
 */

literal.prototype.toBytecode = function() {
  var str = this.val.toBytecode ? this.val.toBytecode() : this.val === true ? "true" : this.val === false ? "false" : this.toString();
  return '{"$":"constant","value":' + str + '}';
};
symbolExpr.prototype.toBytecode = function() {
  return 'types.symbol("' + escapeSym(this.val) + '")';
};
types.Vector.prototype.toBytecode = function() {
  return 'types.vector([' + this.elts.join(',') + '])';
};
Array.prototype.toBytecode = function() {
  return 'types.' + (this.length === 0 ? 'EMPTY' : 'list([' + this.map(convertToBytecode).join(',') + '])');
};
// Bytecode generation for jsnums types
jsnums.Rational.prototype.toBytecode = function() {
  return 'types.rational(' + convertToBytecode(this.n) + ', ' + convertToBytecode(this.d) + ')';
};
jsnums.BigInteger.prototype.toBytecode = function() {
  return 'types.bignum("' + this.toString() + '")';
};
jsnums.FloatPoint.prototype.toBytecode = function() {
  var num = this.toString();
  if (num === "+nan.0") num = "NaN";
  if (num === "+inf.0") num = "Infinity";
  if (num === "-inf.0") num = "-Infinity";
  return 'types["float"](' + num + ')';
};
jsnums.Complex.prototype.toBytecode = function() {
  return 'types.complex(' + convertToBytecode(this.r) + ', ' + convertToBytecode(this.i) + ')';
};
types.Char.prototype.toBytecode = function() {
  return 'types[\'char\'](String.fromCharCode(' + this.val.charCodeAt(0) + '))';
};

var isLocalStackRef = function(r) {
  return r instanceof localStackReference;
};
var isGlobalStackRef = function(r) {
  return r instanceof globalStackReference;
};
var isUnboundStackRef = function(r) {
  return r instanceof unboundStackReference;
};


/**************************************************************************
 *
 *    BYTECODE STRUCTS -
 *    (see https://github.com/bootstrapworld/wescheme-compiler2012/blob/master/js-runtime/src/bytecode-structs.ss)
 *
 **************************************************************************/


// all Programs, by default, print out their values and have no location
// anything that behaves differently must provide their own toBytecode() function
class Bytecode{
  // -> JSON
  toBytecode() {
    console.log(this);
    throw "IMPOSSIBLE - generic bytecode toBytecode method was called";
  }
}

// for mapping JSON conversion over an array
function convertToBytecode(bc) {
  if (types.isString(bc) && bc.chars !== undefined) return '"' + bc.toString() + '"';
  return (bc.toBytecode) ? bc.toBytecode() : bc;
}

// convert a symbol-name into bytecode string
function escapeSym(symName) {
  var str = symName.toString().replace(/\|/g, '')
    , bcStr = "";
  // possible characters that need to be escaped
  var escapes = ["{", "}", "[", "]", ",", "'", "`", " ", "\\", '"'];
  for (var j = 0; j < str.length; j++) {
    bcStr += (escapes.includes(str.charAt(j)) ? '\\' : '') + str.charAt(j);
  }
  // special-case for newline characters
  bcStr = bcStr.replace(/\n/g, "\\n");
  return bcStr;
}

// Global bucket
class globalBucket extends Bytecode {
  constructor(name) {
    super();
    this.name = name; // symbol
  }
  toBytecode() {
    return '{"$":"global-bucket","value":"' + escapeSym(this.name) + '"}';
  }
}

// Module variable
class moduleVariable extends Bytecode {
  constructor(modidx, sym, pos, phase) {
    super();
    this.$ = 'module-variable';
    this.modidx = modidx; // module-path-index
    this.sym = sym; // symbol
    this.pos = pos; // exact integer
    this.phase = phase; // 1/0 - direct access to exported id
  }
  toBytecode() {
    return '{"$":"module-variable","sym":' + this.sym.toBytecode() + ',"modidx":' + this.modidx.toBytecode() + ',"pos":' + this.pos + ',"phase":' + this.phase + '}';
  }
}

// prefix
class prefix extends Bytecode {
  constructor(numLifts, topLevels, stxs) {
    super();
    this.numLifts = numLifts;   // exact, non-negative integer
    this.topLevels = topLevels; // list of (false, symbol, globalBucket or moduleVariable)
    this.stxs = stxs;           // list of stxs
  }
  toBytecode() {
    return '{"$":"prefix","num-lifts":' + this.numLifts + ',"toplevels":[' + this.topLevels.map(function(v) {
      return convertToBytecode(v);
    }).join(',') + '],"stxs":[' + this.stxs.map(convertToBytecode) + ']}';
  }
}

// compilationTop
class compilationTop extends Bytecode {
  constructor(maxLetDepth, prefix, code) {
    super();
    this.maxLetDepth = maxLetDepth; // exact non-negative integer
    this.prefix = prefix;           // prefix
    this.code = code;               // form, indirect, or any
  }
  toBytecode() {
    return '{"$":"compilation-top","max-let-depth":' + this.maxLetDepth + ',"prefix":' + this.prefix.toBytecode()
          + ',"compiled-indirects":[],"code":' + this.code.toBytecode() + '}';
  }
}

// topLevel
class topLevel extends Bytecode {
  constructor(depth, pos, constant, ready, loc) {
    super();
    this.depth = depth; // exact, non-negative integer
    this.pos = pos; // exact, non-negative integer
    this.constant = constant; // boolean
    this.ready = ready; // boolean
    this.loc = loc; // false or Location
  }
  toBytecode() {
    return '{"$":"toplevel","depth":' + this.depth.toString() + ',"pos":' + this.pos.toString() + ',"const?":'
    + this.constant + ',"ready?":' + this.ready + ',"loc":' + (this.loc && this.loc.toVector().toBytecode()) + '}';
  }
}

// seq
class seq extends Bytecode {
  constructor(forms) {
    super();
    this.forms = forms; // list of form, indirect, any
  }
  toBytecode() {
    return '{"$":"seq","forms":[' + this.forms.map(convertToBytecode).join(',') + ']}';
  }
}

// defValues
class defValues extends Bytecode {
  constructor(ids, rhs) {
    super();
    this.ids = ids; // list of toplevel or symbol
    this.rhs = rhs; // expr, indirect, seq, any
  }
  toBytecode() {
    return '{"$":"def-values","ids":[' + this.ids.map(convertToBytecode).join(',') + '],"body":' + this.rhs.toBytecode() + '}';
  }
}

// lam
class lam extends Bytecode {
  constructor(name, operatorAndRandLocs, flags, numParams, paramTypes
              , rest, closureMap, closureTypes, maxLetDepth, body) {
    super();
    this.name = name; // symbol, vector, empty
    this.flags = flags; // (list of ('preserves-marks 'is-method 'single-result))
    this.numParams = numParams; // exact, non-negative integer
    this.paramTypes = paramTypes; // list of ('val 'ref 'flonum)
    this.rest = rest; // boolean
    this.body = body; // expr, seq, indirect
    this.closureMap = closureMap; // vector of exact, non-negative integers
    this.maxLetDepth = maxLetDepth; // exact, non-negative integer
    this.closureTypes = closureTypes; // list of ('val/ref or 'flonum)
    this.operatorAndRandLocs = operatorAndRandLocs; // list of Vectors
    // operator+rand-locs includes a list of vectors corresponding to the location
    // of the operator, operands, etc if we can pick them out.  If we can't get
    // this information, it's false
  }
  toBytecode() {
    return '{"$":"lam","name":' + this.name.toBytecode() + ',"locs":[' + this.operatorAndRandLocs.map(convertToBytecode).join(',') + '],"flags":[' + this.flags.map(convertToBytecode).join(',') + '],"num-params":' + this.numParams + ',"param-types":[' + this.paramTypes.map(convertToBytecode).join(',') + '],"rest?":' + this.rest + ',"closure-map":[' + this.closureMap.map(convertToBytecode).join(',') + '],"closure-types":[' + this.closureTypes.map(convertToBytecode).join(',') + '],"max-let-depth":' + this.maxLetDepth + ',"body":' + this.body.toBytecode() + '}';
  }
}

// letVoid
class letVoid extends Bytecode {
  constructor(count, boxes, body) {
    super();
    this.count = count; // exact, non-negative integer
    this.boxes = boxes; // boolean
    this.body = body;   // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"let-void","count":' + convertToBytecode(this.count) + ',"boxes?":' + convertToBytecode(this.boxes) + ',"body":' + this.body.toBytecode() + '}';
  }
}

// installValue
class installValue extends Bytecode {
  constructor(count, pos, boxes, rhs, body) {
    super();
    this.count = count; // exact, non-negative integer
    this.pos = pos;     // exact, non-negative integer
    this.boxes = boxes; // boolean
    this.rhs = rhs;     // expr, seq, indirect, any
    this.body = body;   // expr, seq, indirect, any -- set existing stack slot(s)
  }
  toBytecode() {
    return '{"$":"install-value","count":' + convertToBytecode(this.count) + ',"pos":' + convertToBytecode(this.pos)
      + ',"boxes?":' + convertToBytecode(this.boxes) + ',"rhs":' + this.rhs.toBytecode() + ',"body":' + this.body.toBytecode() + '}';
  }
}

// localRef: access local via stack
class localRef extends Bytecode {
  constructor(unbox, pos, clear, otherClears, flonum) {
    super();
    this.unbox = unbox || false; // boolean
    this.pos = pos; // exact, non-negative integer
    this.clear = clear; // boolean
    this.flonum = flonum; // boolean
    this.otherClears = otherClears; // boolean
  }
  toBytecode() {
    return '{"$":"localref","unbox?":' + this.unbox + ',"pos":' + this.pos + ',"clear":' + this.clear + ',"other-clears?":'
    + this.otherClears + ',"flonum?":' + this.flonum + '}';
  }
}

// application: function call
class application extends Bytecode {
  constructor(rator, rands) {
    super();
    this.rator = rator; // expr, seq, indirect, any
    this.rands = rands; // list of (expr, seq, indirect, any)
  }
  toBytecode() {
    return '{"$":"application","rator":' + this.rator.toBytecode() + ',"rands":[' + this.rands.map(convertToBytecode).join(',') + ']}';
  }
}

// branch
class branch extends Bytecode {
  constructor(testExpr, thenExpr, elseExpr) {
    super();
    this.testExpr = testExpr; // expr, seq, indirect, any
    this.thenExpr = thenExpr; // expr, seq, indirect, any
    this.elseExpr = elseExpr; // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"branch","test":' + this.testExpr.toBytecode() + ',"then":' + this.thenExpr.toBytecode() + ',"else":' + this.elseExpr.toBytecode() + '}';
  }
}

// withContMark:'with-cont-mark'
class withContMark extends Bytecode {
  constructor(key, val, body) {
    super();
    this.$ = 'with-cont-mark';
    this.key = key; // expr, seq, indirect, any
    this.val = val; // expr, seq, indirect, any
    this.body = body; // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"with-cont-mark","key":' + new literal(new symbolExpr(this.key)).toBytecode() + ',"val":'
      + new literal(this.val).toBytecode() + ',"body":' + this.body.toBytecode() + '}';
  }
}

// req
class req extends Bytecode {
  constructor(reqs, dummy) {
    super();
    this.$ = 'req';
    this.reqs = reqs; // syntax
    this.dummy = dummy; // toplevel
  }
  toBytecode() {
    var reqBytecode = (this.reqs instanceof literal) ? '"' + this.reqs.val + '"' : this.reqs.toBytecode();
    return '{"$":"req","reqs":' + reqBytecode + ',"dummy":' + this.dummy.toBytecode() + '}';
  }
}

// HACK: module-path
class modulePath extends Bytecode {
  constructor(path, base) {
    super();
    this.path = path;
    this.base = base;
  }
  toBytecode() {
    return '{"$":"module-path","path":' + convertToBytecode(this.path) + ',"base":' + convertToBytecode(this.base) + '}';
  }
}

/*

/////////////////////////////////////////////////////////////////////////////////////////////////////
// UNUSED RACKET BYTCODE STRUCTS -- as of 12/11/15, these bytecodes have never been used in WeScheme
// they were ported to ES6 for completeness, but they're essentially dead code at this point



// Wrap syntax object
class wrap extends Bytecode {
  constructor(){ super(); }
}

// Wrapped syntax object
class wrapped extends Bytecode {
  constructor(datum, wraps, certs) {
    super();
    this.datum = datum; // any
    this.wraps = wraps; // list of wrap
    this.certs = certs; // list or false
  }
}

// Stx
class stx extends Bytecode {
  constructor(encoded) {
    super();
    this.encoded = encoded; // wrapped
  }
}

// form
class form extends Bytecode {
  constructor(){ super(); }
}

// expr
class expr extends Bytecode {
  constructor(){ super(); }
}

// Indirect
class indirect extends Bytecode {
  constructor(v) {
    super();
    this.v = v; // ??
  }
  toBytecode() {
    return '{"$":"indirect","v":' + this.v.toBytecode() + '}';
  }
}

// provided
class provided extends Bytecode {
  constructor(name, src, srcName, nomSrc, srcPhase, isProtected, insp) {
    super();
    this.name = name;         // symbol
    this.src = src;           // false or modulePathIndex
    this.srcName = srcName;   // symbol
    this.nomSrc = nomSrc;     // false or modulePathIndex
    this.srcPhase = srcPhase; // 0/1
    this.insp = insp;         // boolean or void
    this.isProtected = isProtected; // boolean
  }
}

// defSyntaxes
class defSyntaxes extends Bytecode {
  constructor(ids, rhs, prefix, maxLetDepth) {
    super();
    this.$ = 'def-values';
    this.ids = ids; // list of toplevel or symbol
    this.rhs = rhs; // expr, indirect, seq, any
    this.prefix = prefix; // prefix
    this.maxLetDepth = maxLetDepth; // exact, non-negative integer
  }
  toBytecode() {
    return '{"$":"def-values","ids":[' + this.ids.toBytecode().join(',') + '],"rhs":' + this.rhs.toBytecode()
    + ',"prefix":' + this.prefix.toBytecode() + ',"max-let-depth":' + this.maxLetDepth.toBytecode() + '}';
  }
}

// defForSyntax
class defForSyntax extends Bytecode {
  constructor(ids, rhs, prefix, maxLetDepth) {
    super();
    this.ids = ids; // list of toplevel or symbol
    this.rhs = rhs; // expr, indirect, seq, any
    this.prefix = prefix; // prefix
    this.maxLetDepth = maxLetDepth; // exact, non-negative integer
  }
}

// mod
class mod extends Bytecode {
  constructor(name, selfModidx, prefix, provides, requires, body
              , syntaxBody, unexported, maxLetDepth, dummy, langInfo
              , internalContext) {
    super();
    this.name = name; // exact, non-negative integer
    this.selfModidx = selfModidx; // exact, non-negative integer
    this.prefix = prefix; // boolean
    this.provides = provides; // boolean
    this.requires = requires; // false or Location
    this.body = body; // exact, non-negative integer
    this.syntaxBody = syntaxBody; // exact, non-negative integer
    this.unexported = unexported; // boolean
    this.maxLetDepth = maxLetDepth; // exact, non-negative integer
    this.dummy = dummy; // false or Location
    this.langInfo = langInfo; // false or (vector modulePath symbol any)
    this.internalContext = internalContext;
  }
  toBytecode() {
    return '{"$":"mod","name":' + this.name.toBytecode() + ',"self-modidx":' + this.selfModidx.toBytecode() + ',"prefix":' + this.prefix.toBytecode() + ',"provides":' + this.provides.toBytecode() + ',"requires":' + (this.requires && this.requires.toVector().toBytecode()) + ',"body":' + this.body.toBytecode() + ',"stx-body":' + this.syntaxBody.toBytecode() + ',"max-let-depth":' + this.maxLetDepth.toBytecode() + '}';
  }
}

// closure: a static closure (nothing to close over)
class closure extends Bytecode {
  constructor(code, genId) {
    super();
    this.code = code;   // lam
    this.genId = genId; // symbol
  }
  toBytecode() {
    return '{"$":"closure","code":' + this.code.toBytecode() + ',"gen-id":' + this.genId.toBytecode() + '}';
  }
}

// caseLam: each clause is a lam (added indirect)
class caseLam extends Bytecode {
  constructor(name, clauses) {
    super();
    this.name = name;       // symbol, vector, empty
    this.clauses = clauses; // list of (lambda or indirect)
  }
  toBytecode() {
    return '{"$":"case-lam","name":' + this.name.toBytecode() + ',"clauses":' + this.clauses.toBytecode() + '}';
  }
}

// letOne
class letOne extends Bytecode {
  constructor(rhs, body, flonum) {
    super();
    this.rhs = rhs;       // expr, seq, indirect, any
    this.body = body;     // expr, seq, indirect, any
    this.flonum = flonum; // boolean
  }
  toBytecode() {
    return '{"$": "let-one","rhs":' + this.rhs.toBytecode() + ',"body":' + this.body.toBytecode() + ',"flonum":' + this.flonum.toBytecode() + '}';
  }
}

// letRec: put `letrec'-bound closures into existing stack slots
class letRec extends Bytecode {
  constructor(procs, body) {
    super();
    this.procs = procs; // list of lambdas
    this.body = body;   // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"let-rec","procs":' + this.procs.toBytecode() + ',"body":' + this.body.toBytecode() + '}';
  }
}

// boxEnv: box existing stack element
class boxEnv extends Bytecode {
  constructor(pos, body) {
    super();
    this.pos = pos;   // exact, non-negative integer
    this.body = body; // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"boxenv","pos":' + this.pos.toBytecode() + ',"body":' + this.body.toBytecode() + '}';
  }
}

// topSyntax : access syntax object via prefix array (which is on stack)
class topSyntax extends Bytecode {
  constructor(depth, pos, midpt) {
    super();
    this.depth = depth; // exact, non-negative integer
    this.pos = pos; // exact, non-negative integer
    this.midpt = midpt; // exact, non-negative integer
  }
}

// beg0: begin0
class beg0 extends Bytecode {
  constructor(seq) {
    super();
    this.seq = seq; // list  of (expr, seq, indirect, any)
  }
  toBytecode() {
    return '{"$":"beg0","seq":' + this.seq.toBytecode() + '}';
  }
}

// splice: top-level 'begin'
class splice extends Bytecode {
  constructor(forms) {
    super();
    this.forms = forms; // list  of (expr, seq, indirect, any)
  }
  toBytecode() {
    return '{"$":"splice","forms":' + this.forms.toBytecode() + '}';
  }
}

// varRef: `#%variable-reference'
class varRef extends Bytecode {
  constructor(topLevel) {
    super();
    this.topLevel = topLevel; // topLevel
  }
  toBytecode() {
    return '{"$":"varref","top-level":' + this.topLevel.toBytecode() + '}';
  }
}

// assign: top-level or module-level set!
class assign extends Bytecode {
  constructor(id, rhs, undefOk) {
    super();
    this.id = id;           // topLevel
    this.rhs = rhs;         // expr, seq, indirect, any
    this.undefOk = undefOk; // boolean
  }
  toBytecode() {
    return '{"$":"assign","id":' + this.id.toBytecode() + ',"rhs":' + this.rhs.toBytecode() + ',"undef-ok":' + this.undefOk.toBytecode() + '}';
  }
}

// applyValues: `(call-with-values (lambda () ,args-expr) ,proc)
class applyValues extends Bytecode {
  constructor(proc, args) {
    super();
    this.proc = proc; // expr, seq, indirect, any
    this.args = args; // expr, seq, indirect, any
  }
  toBytecode() {
    return '{"$":"apply-values","proc":' + this.proc.toBytecode() + ',"args":' + this.args.toBytecode() + '}';
  }
}

// primVal: direct preference to a kernel primitive
class primVal extends Bytecode {
  constructor(id) {
    super();
    this.id = id; // exact, non-negative integer
  }
  toBytecode() {
    return '{"$":"primval","id":' + this.id.toBytecode() + '}';
  }
}

// lexicalRename
class lexicalRename extends Bytecode {
  constructor(bool1, bool2, alist) {
    super();
    this.bool1 = bool1; // boolean
    this.bool2 = bool2; // boolean
    this.alist = alist; // should be list of (cons symbol, symbol)
  }
}

// phaseShift
class phaseShift extends Bytecode {
  constructor(amt, src, dest) {
    super();
    this.amt = amt;   // syntax
    this.src = src;   // false or modulePathIndex
    this.dest = dest; // false or modulePathIndex
  }
}

// wrapMark
class wrapMark extends Bytecode {
  constructor(val) {
    super();
    this.val = val; // exact integer
  }
}

// prune
class prune extends Bytecode {
  constructor(sym) {
    super();
    this.sym = sym; // any
  }
}

// allFromModule
class allFromModule extends Bytecode {
  constructor(path, phase, srcPhase, exceptions, prefix) {
    super();
    this.path = path;             // modulePathIndex
    this.phase = phase;           // false or exact integer
    this.srcPhase = srcPhase;     // any
    this.prefix = prefix;         // false or symbol
    this.exceptions = exceptions; // list of symbols
  }
}

// nominalPath
class nominalPath extends Bytecode() {
  constructor(){ super(); }
}

// simpleNominalPath
class simpleNominalPath extends Bytecode {
  constructor(value) {
    super();
    this.value = value; // modulePathIndex
  }
}

// moduleBinding
class moduleBinding extends Bytecode {
  constructor(){ super(); }
}

// phasedModuleBinding
class phasedModuleBinding extends Bytecode {
  constructor(path, phase, exportName, nominalPath, nominalExportName) {
    super();
    this.path = path;                           // modulePathIndex
    this.phase = phase;                         // exact integer
    this.exportName = nominalPath;              // nominalPath
    this.nominalExportName = nominalExportName; // any
  }
}

// exportedNominalModuleBinding
class exportedNominalModuleBinding extends Bytecode {
  constructor(path, exportName, nominalPath, nominalExportName) {
    super();
    this.path = path;                           // modulePathIndex
    this.exportName = exportName;               // any
    this.nominalPath = nominalPath;             // nominalPath
    this.nominalExportName = nominalExportName; // any
  }
}

// nominalModuleBinding
class nominalModuleBinding extends Bytecode {
  constructor(path, nominalPath) {
    super();
    this.path = path;               // modulePathIndex
    this.nominalPath = nominalPath; // any
  }
}

// exportedModuleBinding
class exportedModuleBinding extends Bytecode {
  constructor(path, exportName) {
    super();
    this.path = path;             // modulePathIndex
    this.exportName = exportName; // any
  }
}
exportedModuleBinding.prototype = heir(Bytecode.prototype);

// simpleModuleBinding
class simpleModuleBinding extends Bytecode {
  constructor(path) {
    super();
    this.path = path; // modulePathIndex
  }
}

// ModuleRename
class ModuleRename extends Bytecode {
  constructor(phase, kind, setId, unmarshals, renames, markRenames, plusKern) {
    super();
    this.phase = phase; // false or exact integer
    this.kind = kind; // "marked" or "normal"
    this.unmarshals = unmarshals; // list of allFromModule
    this.renames = renames; // list of (symbol or moduleBinding)
    this.markRenames = markRenames; // any
    this.plusKern = plusKern; // boolean
  }
}
*/


// freeVariables : [listof symbols] env -> [list of symbols]
Program.prototype.freeVariables = function(acc) { return acc; }
ifExpr.prototype.freeVariables = function(acc, env) {
  return this.alternative.freeVariables(this.consequence.freeVariables(this.predicate.freeVariables(acc, env), env), env);
}
beginExpr.prototype.freeVariables = function(acc, env) {
  return this.exprs.reduceRight(function(acc, expr) {
    return expr.freeVariables(acc, env);
  }, acc);
}
// if it's an unbound variable that we haven't seen before, add it to acc
symbolExpr.prototype.freeVariables = function(acc, env) {
  return (isUnboundStackRef(env.lookup(this.val, 0)) && !acc.includes(this)) ? acc.concat([this]) : acc;
}
localExpr.prototype.freeVariables = function(acc, env) {
  // helper functions
  var pushLocalBoxedFromSym = function(env, sym) {
      return new localEnv(sym.val, true, env);
    }
    , pushLocalFromSym = function(env, sym) {
      return new localEnv(sym.val, false, env);
    };

  // collect all the defined names in the local
  var definedNames = this.defs.reduce(
    function(names, d) {
      return ((d instanceof defVars) ? d.names : [d.name]).concat(names);
    }, []
  );
  // make an environment with those names added to the stack
  var updatedEnv = definedNames.reduce(pushLocalBoxedFromSym, env);
  // use that env to find all free variables in the body
  var freeVarsInBody = this.body.freeVariables(acc, updatedEnv);

  // given free variables and a definition, add the free variables from that definition...
  // while *also* updating the stack to reflect defined names
  var addFreeVarsInDef = function(acc, d) {
    if (d instanceof defFunc) {
      var envWithArgs = d.args.reduce(function(env, arg) {
        return pushLocalFromSym(env, arg);
      }, updatedEnv);
      return d.body.freeVariables(acc, envWithArgs);
    }
    if (d instanceof defStruct) {
      return acc;
    } else {
      return d.expr.freeVariables(acc, updatedEnv);
    }
  }

  // collect free variables from all the definitions and the body, while simultaneously
  // updating the environment to reflect defined names
  return this.defs.reduce(addFreeVarsInDef, freeVarsInBody);
};
andExpr.prototype.freeVariables = function(acc, env) {
  return this.exprs.reduceRight(function(acc, expr) {
    return expr.freeVariables(acc, env);
  }, acc);
};
orExpr.prototype.freeVariables = function(acc, env) {
  return this.exprs.reduceRight(function(acc, expr) {
    return expr.freeVariables(acc, env);
  }, acc);
}
// be careful to make a copy of the array before reversing!
lambdaExpr.prototype.freeVariables = function(acc, env) {
  var pushLocalFromSym = function(env, sym) {
      return new localEnv(sym.val, false, env);
    }
  , envWithArgs = this.args.slice(0).reverse().reduce(pushLocalFromSym, env);
  return this.body.freeVariables(acc, envWithArgs);

};
quotedExpr.prototype.freeVariables = function(acc) { return acc; };
callExpr.prototype.freeVariables = function(acc, env) {
  return this.func.freeVariables(acc, env).concat(this.args).reduceRight(function(acc, expr) {
    return expr.freeVariables(acc, env);
  }, acc);
};

/**************************************************************************
 *
 *    COMPILATION -
 *    (see https://github.com/bootstrapworld/wescheme-compiler2012/blob/master/js-runtime/src/mzscheme-vm.ss)
 *
 **************************************************************************/

// sort-and-unique: (listof X) (X X -> boolean) (X X -> boolean) -> (listof X)
function sortAndUnique(elts, lessThan, equalTo) {
  function unique(elts) {
    return (elts.length <= 1) ? elts : equalTo(elts[0], elts[1]) ? unique(elts.slice(1)) : [elts[0]].concat(unique(elts.slice(1)));
  }
  // convert lessThan fn into a fn that returns -1 for less, 1 for greater, 0 for equal
  var convertedSortFn = function(x, y) {
    return lessThan(x, y) ? -1 : lessThan(y, x);
  }
  return unique(elts.sort(convertedSortFn));
}


// [bytecodes, pinfo, env], Program -> [bytecodes, pinfo, env]
// compile the program, then add the bytecodes and pinfo information to the acc
function compilePrograms(acc, p) {
  var bytecodes = acc[0]
    , pinfo = acc[1]
    , env = acc[2]
    , compiledProgramAndPinfo = p.compile(env, pinfo)
    , compiledProgram = compiledProgramAndPinfo[0]
    , pinfo2 = compiledProgramAndPinfo[1];
  return [
    [compiledProgram].concat(bytecodes), pinfo2, env
  ];
}

// extend the Program class to include compilation
// compile: pinfo -> [bytecode, pinfo]

// literals evaluate to themselves
Program.prototype.compile = function(env, pinfo) {
  return [this, pinfo];
};

defFunc.prototype.compile = function(env, pinfo) {
  var compiledFunNameAndPinfo = this.name.compile(env, pinfo)
    , compiledFunName = compiledFunNameAndPinfo[0]
    , pinfo2 = compiledFunNameAndPinfo[1];
  var lambda = new lambdaExpr(this.args, this.body)
    , compiledLambdaAndPinfo = lambda.compile(env, pinfo2, false, this.name)
    , compiledLambda = compiledLambdaAndPinfo[0]
    , pinfo3 = compiledLambdaAndPinfo[1];
  var bytecode = new defValues([compiledFunName], compiledLambda);
  return [bytecode, pinfo3];
};

defVar.prototype.compile = function(env, pinfo) {
  var compiledIdAndPinfo = this.name.compile(env, pinfo)
    , compiledId = compiledIdAndPinfo[0]
    , pinfo2 = compiledIdAndPinfo[1];
  var compiledExprAndPinfo = this.expr.compile(env, pinfo2)
    , compiledExpr = compiledExprAndPinfo[0]
    , pinfo3 = compiledExprAndPinfo[1];
  var bytecode = new defValues([compiledId], compiledExpr);
  return [bytecode, pinfo3];
};

defVars.prototype.compile = function(env, pinfo) {
  var compiledIdsAndPinfo = this.names.reduceRight(compilePrograms, [
      [], pinfo, env
    ])
    , compiledIds = compiledIdsAndPinfo[0]
    , pinfo2 = compiledIdsAndPinfo[1];
  var compiledBodyAndPinfo = this.expr.compile(env, pinfo2)
    , compiledBody = compiledBodyAndPinfo[0]
    , pinfo3 = compiledBodyAndPinfo[1];
  var bytecode = new defValues(compiledIds, compiledBody);
  return [bytecode, pinfo3];
};

beginExpr.prototype.compile = function(env, pinfo) {
  var compiledExpressionsAndPinfo = this.exprs.reduceRight(compilePrograms, [
      [], pinfo, env
    ])
    , compiledExpressions = compiledExpressionsAndPinfo[0]
    , pinfo1 = compiledExpressionsAndPinfo[1];
  var bytecode = new seq(compiledExpressions);
  return [bytecode, pinfo1];
};

// Compile a lambda expression.  The lambda must close its free variables over the
// environment.
lambdaExpr.prototype.compile = function(env, pinfo, isUnnamedLambda, name) {
  if (isUnnamedLambda === undefined) isUnnamedLambda = true;

  // maskUnusedGlobals : (listof symbol?) (listof symbol?) -> (listof symbol or false)
  function maskUnusedGlobals(listOfNames, namesToKeep) {
    return listOfNames.map(function(n) {
      return namesToKeep.includes(n) ? n : false;
    });
  }

  function pushLocal(env, n) {
    return new localEnv(n, false, env);
  }

  function pushLocalBoxed(env, n) {
    return new localEnv(n, true, env);
  }

  function pushGlobals(names, env) {
    return new globalEnv(names, false, env);
  }

  // getClosureVectorAndEnv : (list of Symbols) (list of Symbols) env -> [(Vector of number), env]
  // take in a list of args, a list of freevars, and an empty env that ONLY includes the arguments
  function getClosureVectorAndEnv(args, freeVariables, originalEnv) {
    // pull out the stack references for all variables that are free in this environment
    var freeVariableRefs = freeVariables.map(function(v) {
        return originalEnv.lookup(v.val, 0);
      })
      , // some utility functions
      ormap = function(f, l) {
        return (l.length === 0) ? false : f(l[0]) ? l[0] : ormap(f, l.slice(1));
      }
      , getDepthFromRef = function(r) {
        return r.depth;
      }
      , // this will either be #f, or the first unboundStackRef
      anyUnboundStackRefs = ormap(isUnboundStackRef, freeVariableRefs);

    // if any of the references are unbound, freak out!
    if (anyUnboundStackRefs) {
      throw "Can't produce closure; I don't know where " + anyUnboundStackRefs.name + " is bound.";
      // otherwise, compute the depths of all local and global free variables
    } else {
      var lexicalFreeRefs = sortAndUnique(freeVariableRefs.filter(isLocalStackRef)
          , function(x, y) {
            return x.depth < y.depth;
          }
          , function(x, y) {
            return x.depth === y.depth;
          })
        , lexicalFreeDepths = lexicalFreeRefs.map(getDepthFromRef)
        , globalRefs = freeVariableRefs.filter(isGlobalStackRef)
        , globalDepths = sortAndUnique(globalRefs.map(getDepthFromRef)
          , function(x, y) {
            return x < y;
          }
          , function(x, y) {
            return x === y;
          });
      // Add Function Arguments (in reverse order) to the environment
      var env1 = args.reverse().map(function(s) {
        return s.val;
      }).reduce(pushLocal, originalEnv);
      // Add the lexical free variables (in reverse order)
      var env2 = lexicalFreeRefs.reverse().reduce(function(env, ref) {
        return ref.isBoxed ? pushLocalBoxed(env, ref.name) : pushLocal(env, ref.name);
      }, env1);

      // Add the global free variables (in reverse order)
      var env3 = globalDepths.reverse().reduce(function(env, depth) {
        var refsAtDepth = globalRefs.filter(function(ref) {
            return ref.depth === depth;
          })
          , usedGlobals = refsAtDepth.map(function(ref) {
            return ref.name
          })
          , newGlobals = maskUnusedGlobals(originalEnv.peek(depth).names, usedGlobals);
        return pushGlobals(newGlobals, env);
      }, env2);

      // return a vector of depths (global, then local), along with the environment
      return [globalDepths.concat(lexicalFreeDepths), env3];
    }
  }
  // push each arg onto an empty Env, the compute the free variables in the function body with that Env
  var envWithArgs = this.args.map(function(s) {
    return s.val;
  }).reduce(pushLocal, new emptyEnv());
  var freeVarsInBody = this.body.freeVariables([], envWithArgs);
  // compute the closure information using a COPY of the args array (protect against in-place reversal)
  var closureVectorAndEnv = getClosureVectorAndEnv(this.args.slice(0), freeVarsInBody, env)
    , closureVector = closureVectorAndEnv[0]
    , extendedEnv = closureVectorAndEnv[1];
  // compile the body using the closure's environent
  var compiledBodyAndPinfo = this.body.compile(extendedEnv, pinfo)
    , compiledBody = compiledBodyAndPinfo[0]
    , pinfo1 = compiledBodyAndPinfo[1];
  // emit the bytecode
  var getLocs = function(id) {
      return id.location.toVector();
    }
    , bytecode = new lam(isUnnamedLambda ? [] : new symbolExpr(name),
                         [isUnnamedLambda ? this.stx : name].concat(this.args).map(getLocs),
                         [], // flags
      this.args.length, // numParams
      this.args.map(function() {
        return new symbolExpr("val");
      }), // paramTypes
      false, // rest
      closureVector, // closureMap
      closureVector.map(function() {
        return new symbolExpr("val/ref");
      }), // closureTypes
      0, // maxLetDepth
      compiledBody); // body
  return [bytecode, pinfo1];
};

localExpr.prototype.compile = function(env, pinfo) {
  // if there are no definitions, just pull the body out and compile it.
  if (this.defs.length === 0) return this.body.compile(env, pinfo);

  // Otherwise...
  // (1) create an environment where all defined names are given local, boxed stackrefs
  var that = this
    , definedNames = this.defs.reduce(getDefinedNames, [])
    , pushLocalBoxedFromSym = function(env, sym) {
      return new localEnv(sym.val, true, env);
    }
    , envWithBoxedNames = definedNames.reverse().reduce(pushLocalBoxedFromSym, env);

  // (2) process the definitions, starting with pinfo and our new environment as the base
  var letVoidBodyAndPinfo = processDefns(this.defs, pinfo, envWithBoxedNames, 0)
    , letVoidBody = letVoidBodyAndPinfo[0]
    , pinfoBody = letVoidBodyAndPinfo[1];

  // (3) return a new letVoid for the stack depth we require, then use the bytecode as the body
  return [new letVoid(definedNames.length, true, letVoidBody), pinfoBody]

  // getDefinedNames : [names], def -> names
  // given a list of names and a defn, add defined name(s) to the list
  function getDefinedNames(names, def) {
    return names.concat((def instanceof defVars) ? def.names : def.name);
  }

  // processDefns : [defs], pinfo, numInstalled -> [bytecode, pinfo]
  // fold-like function that will generate bytecode to install each defn at the
  // correct stack location , then move on to the rest of the definitions
  function processDefns(defs, pinfo, env, numInstalled) {
    if (defs.length === 0) {
      return that.body.compile(envWithBoxedNames, pinfo);
    }

    // compile the first definition in the current environment
    var compiledDefAndPInfo = defs[0].compile(env, pinfo);
    var compiledRhs = compiledDefAndPInfo[0].rhs; // important: all we need is the rhs!!
    var pinfoRhs = compiledDefAndPInfo[1];

    // figure out how much room we'll need on the stack for this defn
    // compile the rest of the definitions, using the new pinfo and stack size
    var numToInstall = (defs[0] instanceof defVars) ? defs[0].names.length : 1;
    var newBodyAndPinfo = processDefns(defs.slice(1), pinfoRhs, env, numInstalled + numToInstall);
    var newBody = newBodyAndPinfo[0]
    pinfoBody = newBodyAndPinfo[1];

    // generate bytecode to install new values for the remaining body
    var bytecode = new installValue(numToInstall, numInstalled, true, compiledRhs, newBody);
    return [bytecode, pinfoBody];
  }
};

callExpr.prototype.compile = function(env, pinfo) {
  // add space to the stack for each argument, then build the bytecode for the application itself
  var makeSpace = function(env) {
      return new unnamedEnv(env);
    }
    , extendedEnv = this.args.reduce(makeSpace, env);
  var compiledOperatorAndPinfo = this.func.compile(extendedEnv, pinfo)
    , compiledOperator = compiledOperatorAndPinfo[0]; // toss out the returned pinfo
  var compiledOperandsAndPinfo = this.args.reduceRight(compilePrograms, [
      [], pinfo, extendedEnv
    ])
    , compiledOperands = compiledOperandsAndPinfo[0]
    , pinfo2 = compiledOperatorAndPinfo[1]
    , app = new application(compiledOperator, compiledOperands);
  // extract the relevant locations for error reporting, then wrap the application in continuation marks
  var extractLoc = function(e) {
      return e.location;
    }
    , locs = [this.func.location].concat(this.args.map(extractLoc))
    , locVectors = locs.concat(this.location).map(function(loc) {
      return loc.toVector();
    })
    , appWithcontMark = new withContMark(new symbolExpr("moby-application-position-key"), locVectors
      , new withContMark(new symbolExpr("moby-stack-record-continuation-mark-key")
        , this.location.toVector(), app));
  return [appWithcontMark, pinfo2];
};

ifExpr.prototype.compile = function(env, pinfo) {
  var compiledPredicateAndPinfo = this.predicate.compile(env, pinfo)
    , compiledPredicate = compiledPredicateAndPinfo[0]; // toss out the returned pinfo
  var compiledConsequenceAndPinfo = this.consequence.compile(env, pinfo)
    , compiledConsequence = compiledConsequenceAndPinfo[0]; // toss out the returned pinfo
  var compiledAlternateAndPinfo = this.alternative.compile(env, pinfo)
    , compiledAlternate = compiledAlternateAndPinfo[0]
    , pinfo3 = compiledAlternateAndPinfo[1];
  var bytecode = new branch(compiledPredicate, compiledConsequence, compiledAlternate);
  return [bytecode, pinfo3];
};

symbolExpr.prototype.compile = function(env, pinfo) {
  var stackReference = env.lookup(this.val, 0);
  var bytecode;
  if (isLocalStackRef(stackReference)) {
    bytecode = new localRef(stackReference.isBoxed, stackReference.depth, false, false, false);
  } else if (isGlobalStackRef(stackReference)) {
    bytecode = new topLevel(stackReference.depth, stackReference.pos, false, false, this.location);
  } else if (isUnboundStackRef(stackReference)) {
    throw "Couldn't find '" + this.val + "' in the environment";
  } else {
    throw "IMPOSSIBLE: env.lookup failed for '" + this.val + "'! A reference should be added to the environment!";
  }
  return [bytecode, pinfo];
};

// a quotedExpr is a literal version of the raw stx object
quotedExpr.prototype.compile = function(env, pinfo) {
  function unwrapLiterals(v) {
    return (v instanceof literal) ? unwrapLiterals(v.val) : (v instanceof Array) ? v.map(unwrapLiterals) : v;
  }
  var result = new literal(unwrapLiterals(this.val));
  return [result, pinfo];
};
requireExpr.prototype.compile = function(env, pinfo) {
  return [new req(this.spec, new topLevel(0, 0, false, false, false)), pinfo];
};
// nothing to compile here!
provideStatement.prototype.compile = function() {};

// compile-compilation-top: program pinfo -> bytecode
function compileCompilationTop(program, pinfo) {
  // makeModulePrefixAndEnv : pinfo -> [prefix, env]
  // collect all the free names being defined and used at toplevel
  // Create a prefix that refers to those values
  // Create an environment that maps to the prefix
  function makeModulePrefixAndEnv(pinfo) {
    var requiredModuleBindings = pinfo.modules.reduce(function(acc, m) {
        return acc.concat(m.bindings);
      }, [])
      , isNotRequiredModuleBinding = function(b) {
        return b.moduleSource && !requiredModuleBindings.includes(b)
      };
    var usedBindingsArray = Array.from(pinfo.usedBindingsHash.values());
    var moduleOrTopLevelDefinedBindings = usedBindingsArray.filter(isNotRequiredModuleBinding);
    var allModuleBindings = requiredModuleBindings.concat(moduleOrTopLevelDefinedBindings);
      // utility functions for making globalBuckets and moduleVariables
    var makeGlobalBucket = function(name) {
        return new globalBucket(name);
      }
      , modulePathIndexJoin = function(path, base) {
        return new modulePath(path, base);
      }
      , // Match Moby: if it's a module that was imported via 'require', we treat it differently for some reason (WTF)
      makeModuleVariablefromBinding = function(b) {
        return new moduleVariable(modulePathIndexJoin(b.moduleSource
            , (b.imported) ? false : modulePathIndexJoin(false, false))
          , new symbolExpr(b.name), -1, 0);
      };
    var globalNames = pinfo.freeVariables.concat(Array.from(pinfo.definedNames.keys()));
    // FIXME: we have to make uniqueGlobalNames because a function name can also be a free variable,
    // due to a bug in analyze-lambda-expression in which the base pinfo is used for the function body.
    var uniqueGlobalNames = sortAndUnique(globalNames,
                                          function(a, b) { return a < b; },
                                          function(a, b) { return a == b; });
    var topLevels = [false].concat(
      uniqueGlobalNames.map(makeGlobalBucket)
      , allModuleBindings.map(makeModuleVariablefromBinding)
    );
    var globals = [false].concat(
      uniqueGlobalNames
      , allModuleBindings.map(function(b) {
        return b.name;
      })
    );
    return [new prefix(0, topLevels, [])
      , new globalEnv(globals, false, new emptyEnv())
    ];
  }
  // The toplevel is going to include all of the defined identifiers in the pinfo
  // The environment will refer to elements in the toplevel.
  var toplevelPrefixAndEnv = makeModulePrefixAndEnv(pinfo)
    , toplevelPrefix = toplevelPrefixAndEnv[0]
    , env = toplevelPrefixAndEnv[1];
  // pull out separate program components for ordered compilation
  var defns = program.filter(isDefinition)
    , requires = program.filter((function(p) {
      return (p instanceof requireExpr);
    }))
    , exprs = program.filter(isExpression);
  var compiledRequiresAndPinfo = requires.reduceRight(compilePrograms, [
      [], pinfo, env
    ])
    , compiledRequires = compiledRequiresAndPinfo[0]
    , pinfoRequires = compiledRequiresAndPinfo[1];
  var compiledDefinitionsAndPinfo = defns.reduceRight(compilePrograms, [
      [], pinfoRequires, env
    ])
    , compiledDefinitions = compiledDefinitionsAndPinfo[0]
    , pinfoDefinitions = compiledDefinitionsAndPinfo[1];
  var compiledExpressionsAndPinfo = exprs.reduceRight(compilePrograms, [
      [], pinfoDefinitions, env
    ])
    , compiledExpressions = compiledExpressionsAndPinfo[0]
    , pinfoExpressions = compiledExpressionsAndPinfo[1];
  // generate the bytecode for the program and return it, along with the program info
  var forms = new seq([].concat(compiledRequires, compiledDefinitions, compiledExpressions))
    , zo_bytecode = new compilationTop(0, toplevelPrefix, forms)
    , response = {
      "bytecode": "/* runtime-version: local-compiler-spring2016 */\n" + zo_bytecode.toBytecode()
      , "permissions": pinfoExpressions.permissions()
      , "provides": Array.from(pinfoExpressions.providedNames.keys())
    };
  return response;
}


/////////////////////
/* Export Bindings */
/////////////////////
export var compile = function(program, pinfo, debug) {
  var start = new Date().getTime();
  try {
    var response = compileCompilationTop(program, pinfo);
  } // do the actual work
  catch (e) {
    console.log("COMPILATION ERROR");
    throw e;
  }
  var end = new Date().getTime();
  if (debug) {
    console.log("Compiled in " + (Math.floor(end - start)) + "ms");
    console.log(JSON.stringify(response));
  }
  return response;
};