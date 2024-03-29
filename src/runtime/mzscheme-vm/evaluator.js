import { compileAndRun } from '../../wescheme'
var types = require('../types').default 
import interpret from '../interpret'
import helpers from '../helpers'

// Defines an Evaluator class, with the following constructor:
//
//
// Evaluator(options)
//     options: { write: dom -> void }

//
// Constructs a new evaluator.
// 
//
// and the main method:
//
//
// Evaluator.prototype.executeProgram: [name string] [program string] [onDone (-> void)] -> void
//
//
// Executes the program with the given name.  When the program is done evaluating,
// calls onDone.
//
//
// Evaluator.prototype.requestBreak: -> void
//
// Triggers scheme evaluation to raise an exn:break.
//
//
// Evaluator.prototype.executeCompiledProgram: bytecode (-> void) (exn -> void) -> void 
//
// Execute a compiled program, given the bytecode already.
//
//
//
// Evaluator.prototype.getMessageFromExn
//
// Evaluator.prototype.getStackTraceFromExn
//
// 

import loadProject from '../loadProject'
import state from '../state'

function makeDynamicModuleLoader(rootLibraryPath) {

    var handleBuiltInCollection = function(aName, onSuccess, onFail) {
        loadScript(rootLibraryPath + "/" + aName + "-min.js?__gensym="+encodeURIComponent('' + Math.random()),
                   onSuccess,
                   onFail);
    };

    var handleWeschemeModule = function(aName, onSuccess, onFail) {
        var m = aName.match(/wescheme\/(\w+)/);
        var publicId = m[1];
        loadProject(
            null, 
            publicId, 
            function(aProgram) {
                try {
                    window.COLLECTIONS[aName] = { 
                        'name': aName,  
                        'bytecode' : (0,eval)('(' + aProgram.getObjectCode() + ')'),
                        'provides' : aProgram.getProvides() 
                    };
                } catch(e) {
                    onFail();
                    return;
                }
                onSuccess();
            },
            onFail);
    };

    var isWeschemeModule = function(aName) {
        var m = aName.match(/^wescheme\/(\w+)$/);
        if (m) { return true; }
        return false;
    };

    return function(aName, onSuccess, onFail) {
        window.COLLECTIONS = window.COLLECTIONS || {};
        // FIXME: is this a WeScheme URL?
        if (isWeschemeModule(aName)) {
            handleWeschemeModule(aName, onSuccess, onFail);
        } else {
            handleBuiltInCollection(aName, onSuccess, onFail);
        }
    };
};

var Evaluator = (function() {

    var Evaluator = function(options) {
    	var that = this;

    	if (options.write) {
    	    this.write = options.write;
    	} else {
    	    this.write = function(dom) { /* no op */ };
    	}

    	if (options.transformDom) {
    	    this.transformDom = options.transformDom;
    	} else {
    	    this.transformDom = function(dom) {
        		if (helpers.isLocationDom(dom)) {
        		    dom = rewriteLocationDom(dom);
        		}
        		return dom;
    	    }
    	}

    	this.aState = new state.State();

    	this.aState.setPrintHook(function(thing) {
    	    var dom = types.toDomNode(thing);
    	    dom = that.transformDom(dom);
    	    that.write(dom);
    	    helpers.maybeCallAfterAttach(dom);
    	});
    		

    	this.aState.setDisplayHook(function(aStr) {
    	    var dom = document.createElement("span");
                dom.style.whiteSpace = "pre-wrap";
                dom.style.fontFamily = "monospace";
                var chunks = aStr.split("\n").filter(function(str){ return str!==""; });
                if (chunks.length > 0) {
                    dom.appendChild(document.createTextNode(chunks[0]));
                }
                var newlineDiv;
                var i;
                for (i = 1; i < chunks.length; i++) {
                    newline = document.createElement("br");
                    newline.style.clear = 'left';
                    newline.className = 'value-seperator';
                    dom.appendChild(newline);
                    dom.appendChild(document.createTextNode(chunks[i]));
                }
    	    dom = that.transformDom(dom);
    	    that.write(dom);	
    	    helpers.maybeCallAfterAttach(dom);
    	});
    	
    	this.aState.setToplevelNodeHook(function() {
    	    // KLUDGE: special hook to support jsworld.
    	    return that.makeToplevelNode();
        });


        this.aState.hooks.dynamicModuleLoader = function(aName, onSuccess, onFail) {
            that.dynamicModuleLoader(aName, onSuccess, onFail);
        };

        this.dynamicModuleLoader = function(aName, onSuccess, onFail) {
            loadScript(that.rootLibraryPath + "/" + aName + ".js?__gensym="+encodeURIComponent('' + Math.random()),
                           onSuccess,
                           onFail);
            };

        this.rootLibraryPath = "/collects";
    } ;

    Evaluator.prototype.setImageProxy = function(proxy) {
	this.aState.setImageProxyHook(proxy);
    };

    Evaluator.prototype.setRootLibraryPath = function(path) {
        this.rootLibraryPath = path;
        this.dynamicModuleLoader = makeDynamicModuleLoader(this.rootLibraryPath);
    };

    // Toplevel nodes are constructed for world programs.
    Evaluator.prototype.makeToplevelNode = function() {
    	var innerDom = document.createElement("div");
    	var dom = document.createElement("div");
    	dom.appendChild(innerDom);
    	this.write(dom);	
    	helpers.maybeCallAfterAttach(dom);
    	return innerDom;
    };


    Evaluator.prototype.requestBreak = function() {
	   this.aState.requestBreak();
    };

    var rewriteLocationDom = function(dom) {
    	var newDom = document.createElement("span");
    	var children = dom.children;
    	var line, column, id;
    	for (var i = 0; i < children.length; i++) {
    	    if (children[i]['className'] === 'location-id') {
    		id = children[i].textContent;
    	    }
    	    if (children[i]['className'] === 'location-offset') {
    		// ignore for now
    	    }
    	    if (children[i]['className'] === 'location-line') {
    		line = children[i].textContent;
    	    }
    	    if (children[i]['className'] === 'location-column') {
    		column = children[i].textContent;
    	    }
    	    if (children[i]['className'] === 'location-span') {
    		// ignore for now
    	    }
    	}
            newDom.appendChild(document.createElement("br"));
    	newDom.appendChild(document.createTextNode('at line: ' + line + ', column: ' + column + ', in ' + id));
    	return newDom;
    };

    // executeProgram: string string (-> void) (exn -> void) -> void
    Evaluator.prototype.executeProgram = function(programName, code, onDone, onDoneError) {
        var that = this;
        compileAndRun(
            programName,
            code, 
            function(responseText) {
                const result = JSON.parse(responseText);
                that.executeCompiledProgram(eval('(' + result.bytecode + ')'), onDone, onDoneError);
            },
            function(responseErrorText) {
                that._onCompilationFailure(JSON.parse(responseErrorText || '""'), onDoneError);
                throw responseErrorText;
            })
    };

    Evaluator.prototype.executeCompiledProgram = function(compiledBytecode, onDone, onDoneError) {
    	this.aState.clearForEval();
    	try { interpret.load(compiledBytecode, this.aState); } 
        catch(e) { onDoneFail(e); throw e; }
    	interpret.run(this.aState, onDone, onDoneError);
    };

    var hasOwnProperty = {}.hasOwnProperty;
    var encodeUrlParameters = function(hash) {
    	var chunks = [];
    	for (var key in hash) {
    	    if (hasOwnProperty.call(hash, key)) {
    		    chunks.push(encodeURIComponent(key) +"="+ encodeURIComponent(hash[key]));
    	    }
    	}
    	return chunks.join('&');
    };

    Evaluator.prototype.getTraceFromExn = function(exn) {
    	if (types.isSchemeError(exn)) {
    	    var errorValue = exn.val;
    	    if (types.isExn(errorValue)) {
        		if (types.exnContMarks(errorValue)) {
        		    return getTraceFromContinuationMarks(
        			types.exnContMarks(errorValue));
        		}
    	    } else {
    		    return [];
    	    }
    	} else if (types.isInternalError(exn)) {
    	    return getTraceFromContinuationMarks(exn.contMarks);
    	}	
    	return [];
    };

    var getTraceFromContinuationMarks = function(contMarkSet) {
    	return state.getStackTraceFromContinuationMarks(contMarkSet);
    };

    var isEqualHash = function(hash1, hash2) {
    	for (var key in hash1) {
    	    if (hasOwnProperty.call(hash1, key)) {
    		if (hasOwnProperty.call(hash2, key)) {
    		    if (hash1[key] !== hash2[key]) {
    			return false;
    		    }
    		} else {
    		    return false;
    		}
    	    }
    	}
    	for (var key in hash2) {
    	    if (hasOwnProperty.call(hash2, key)) {
    		if (hasOwnProperty.call(hash1, key)) {
    		    if (hash1[key] !== hash2[key]) {
    			return false;
    		    }
    		} else {
    		    return false;
    		}
    	    }
    	}
    	return true;
    };

    Evaluator.prototype.getMessageFromExn = function(exn) {
    	if (typeof(exn) === 'undefined') {
    	    // We should never get here
    	    return 'internal undefined error';
    	} else if (types.isSchemeError(exn)) {
    	    var errorValue = exn.val;
    	    if (types.isExn(errorValue)) {
    		return types.exnMessage(errorValue);
    	    } else {
    		return errorValue + '';
    	    }
    	} else if (types.isInternalError(exn)) {
    	    return exn.val + '';
    	} else if (exn.nodeType) {
    	    return exn;
    	} else {
    	    return exn.message;
    	}
    };


    // The type of errorValue is either
    //
    // A string, or
    //
    // A structure of the form { type: "exn:fail:read",
    //                           message: string,
    //                           srclocs: [srcloc]}
    //
    // where each srcloc is of the form
    // { type: "srcloc",
    //   source: string
    //   line: number,
    //   column: number,
    //   position: number,
    //   span: number
    // }

    Evaluator.prototype._onCompilationFailure = function(errorValue, onDoneError) {
    	if (typeof(errorValue) === 'string') {
    	    onDoneError(new Error(errorValue));
    	} else if (typeof(errorValue) === 'object') {
    	    onDoneError(this._convertErrorValue(errorValue));
    	} else {
    	    onDoneError(new Error(errorValue));
    	}
        };


        Evaluator.prototype._convertErrorValue = function(errorValue) {
    	if (errorValue.type && errorValue.type === 'exn:fail:read') {
    	    return new Error(errorValue.message);
    	} else if (errorValue.type && errorValue.type === 'moby-failure') {
                return new ErrorWithDomMessage(this._convertDomSexpr(errorValue['dom-message']),
                                               errorValue['structured-error']);
    	}
    	return new Error(errorValue + '');
    };


    //FIXME: duplicated code from war-src/js/openEditor/interaction.js,
    //has already caused a problem 


    //proper order is id offset line column span
    //badLocs is in   col id line offset span
    var locObjToVector = function(badLocs) {
        return types.vector([badLocs.id,
                             parseInt(badLocs.offset),
                             parseInt(badLocs.line),
                             parseInt(badLocs.column),
                             parseInt(badLocs.span)]);
    };

    //return array of fixed locs
    var fixLocList = function(badLocList) {
        var toReturn = [];

        var i;
        for (i =0; i < badLocList.length; i++) {
            toReturn.push(locObjToVector(badLocList[i]));
        }
        return toReturn;
    };

    //return array of fixed locs
    var fixLocList = function(badLocList) {
       var toReturn = [];

       var i;
       for (i =0; i < badLocList.length; i++) {
           toReturn.push(locObjToVector(badLocList[i]));
       }
       return toReturn;
    };

    //structuredError -> Message
    var structuredErrorToMessage = function(se) {
        var msg = [];
        var i;
        for(i = 0; i < se.length; i++){
            if(typeof(se[i]) === 'string') {
                msg.push(se[i]);
            }
            else if(se[i].type === "ColoredPart"){
                msg.push(new types.ColoredPart(se[i].text, locObjToVector(se[i].loc)));
            }

            else if(se[i].type === "GradientPart"){
                var j;
                var parts = [];
                for(j = 0; j < se[i].parts.length; j++){
                    var coloredPart = se[i].parts[j];
                    parts.push(new types.ColoredPart(coloredPart.text, locObjToVector(coloredPart.loc)));
                }
                msg.push(new types.GradientPart(parts));
            }

            else if(se[i].type === "MultiPart"){
                msg.push(new types.MultiPart(se[i].text, fixLocList(se[i].locs), se[i].solid));
            }
            else msg.push(se[i]+'');

        }
        return new types.Message(msg);
    };

    var ErrorWithDomMessage = function(domMessage, structuredError) {
    	this.message = domMessage.textContent || domMessage.innerText || domMessage;
    	this.domMessage = domMessage;
    	if (structuredError) {
            this.structuredError = JSON.parse(structuredError);
            this.message = structuredErrorToMessage(this.structuredError.message).toString();
        } else {
            this.structuredError = undefined;
        }
    };

    // convertDomSexpr: dom-sexpr -> dom-sexpr
    // Converts the s-expression (array) representation of a dom element.
    Evaluator.prototype._convertDomSexpr = function(domSexpr) {
    	if (typeof(domSexpr) === 'number' ||
    	    typeof(domSexpr) === 'string') {
    	    var aSpan = document.createElement('span');
    	    aSpan.appendChild(document.createTextNode(domSexpr + ''));
    	    return aSpan;
    	} else if (typeof (domSexpr) === 'object') {
    	    var anElt = document.createElement(domSexpr[0]);
    	    var attrs = domSexpr[1];
    	    for (var i = 0 ; i < attrs.length; i++) {
    		if (attrs[i][0] === 'style') {
    		    anElt.style.cssText = attrs[i][1];
    		} else if (attrs[i][0] === 'class') {
    		    anElt.className = attrs[i][1];
    		} else {
    		    anElt[attrs[i][0]] = attrs[i][1]; 
    		}
    	    }	    
    	    var children = domSexpr.splice(2);
    	    for (var i = 0; i < children.length; i++) {
    		anElt.appendChild(this._convertDomSexpr(children[i]));
    	    }
    	    // Note: we're calling transformDom here as a hook to allow
    	    // the editor to rewrite any location doms as anchors to 
    	    // interact with the editor.
    	    return this.transformDom(anElt);
    	} else {
    	    return domSexpr;
    	}
    };

    //////////////////////////////////////////////////////////////////////
    /* Lesser General Public License for more details.
     *
     * You should have received a copy of the GNU Lesser General Public
     * License along with this library; if not, write to the Free Software
     * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA
     *
     * Contact information:
     *   Dao Gottwald  <dao at design-noir.de>
     *
     * @version  1.6
     * @url      http://design-noir.de/webdev/JS/loadScript/
     */

    var loadScript = function(url, callback, onError) {
        var f = arguments.callee;
        if (!("queue" in f))
            f.queue = {};
        var queue = f.queue;
        if (url in queue) { // script is already in the document
            if (callback) {
                if (queue[url]) // still loading
                    queue[url].push(callback);
                else // loaded
                    callback();
            }
            return;
        }
        queue[url] = callback ? [callback] : [];
        var script = document.createElement("script");
        script.type = "text/javascript";
        script.onload = script.onreadystatechange = function() {
            if (script.readyState && script.readyState != "loaded" && script.readyState != "complete")
                return;
            script.onreadystatechange = script.onload = null;
            document.getElementsByTagName("head")[0].removeChild(script);
            var work = queue[url];
            delete(queue[url]);
            while (work.length)
                work.shift()();
        };
        script.onerror = function() {
            script.onreadystatechange = script.onload = null;
            document.getElementsByTagName("head")[0].removeChild(script);
            onError();
        };
        script.src = url;
        document.getElementsByTagName("head")[0].appendChild(script);
    };

    return Evaluator;
})();


export var Runner = function(outputDOMContainer) {
    var that = this;
    this.outputDOMContainer = outputDOMContainer;
    this.evaluator = new Evaluator({ 
       write: function(thing) { that.addToInteractions(thing); },
    });
    this.evaluator.setImageProxy("/imageProxy");
    this.evaluator.setRootLibraryPath("/js/mzscheme-vm/collects");
    
    this.runCompiledCode = function(compiledCode) {
      while(this.outputDOMContainer.firstChild) {
        this.outputDOMContainer.removeChild(this.outputDOMContainer.firstChild);
      }
      var that = this;
      const bytecodeObj = eval('(' + compiledCode + ')');

      var onSuccessRun = function() { /* no-op */ };
      var onFailRun = function(exn) { throw exn; };
      this.evaluator.executeCompiledProgram(bytecodeObj, onSuccessRun, onFailRun);
    };

    this.runSourceCode = function(title, sourceCode) {
      while(this.outputDOMContainer.firstChild) {
        this.outputDOMContainer.removeChild(this.outputDOMContainer.firstChild);
      }
      var that = this;

      var onSuccessRun = function() { /* no-op */ };
      var onFailRun = function(exn) { throw that.renderErrorAsDomNode(exn); };
      this.evaluator.executeProgram(title, sourceCode, onSuccessRun, onFailRun);
    };

    this.addToInteractions = function(interactionVal) {

      // Returns if x is a dom node.
      function isDomNode(x) {
          return (x.nodeType != undefined);
      }
      // Returns if x is a node that should be printed
      // Printable Nodes are CANVAS elements, OR non-empty SPANs
      function isPrintableNode(x){
        return x.nodeName === "CANVAS" || x.childNodes.length > 0;
      }

      if(!isPrintableNode(interactionVal)){ return;}      // make sure there are no other topLevelEvaluationNodes in the outputDOMContainer
      if (isDomNode(interactionVal)) {
        interactionVal.style.display="inline-block";
        interactionVal.classList.add("replOutput");      // simulate the editor REPL, so CSS spacing will kick in
        this.outputDOMContainer.append(interactionVal);
      } else {
        var newArea = document.createElement("div");
        newArea.style.width='100%';
        newArea.text(interactionVal);
        newArea.style.display="inline-block";
        this.outputDOMContainer.append(newArea);
      }
      this.outputDOMContainer.scrollTop = this.outputDOMContainer.scrollHeight;
    };

    // renderErrorAsDomNode: exception -> element
    // Given an exception, produces error dom node to be displayed.
    this.renderErrorAsDomNode = function(err) {
        console.log(err)
        var msg;
        var i;
        var dom = document.createElement('div');
        if (types.isSchemeError(err) && types.isExnBreak(err.val)) {
            dom['className'] = 'moby-break-error';
            msg = "The program has stopped.";
        } else {
            dom['className'] = 'moby-error';
            if(err.structuredError && err.structuredError.message) {
                msg = structuredErrorToMessage(err.structuredError.message);
            }
            else {
                msg = that.evaluator.getMessageFromExn(err);
            }
        }
        var msgDom = document.createElement('div');
        msgDom['className'] = 'moby-error:message';
        if(types.isMessage(msg)) {
            if (that.withColoredErrorMessages) {
                //if it is a Message, do special formatting
                formatColoredMessage(that, msgDom, msg);
            } else {
                formatUncoloredMessage(that, msgDom, msg, getPrimaryErrorLocation(that, err));
            }
        } else {
            if(err.domMessage){
              dom.appendChild(err.domMessage);
            } else {
              msgDom.appendChild(document.createTextNode(msg));
            }
        } 
        dom.appendChild(msgDom);

        if(err.structuredError && err.structuredError.message) {
            var link = that.createLocationHyperlink(err.structuredError.location);
            dom.appendChild(link);
        }
        var stacktrace = that.evaluator.getTraceFromExn(err);
        var stacktraceDiv = document.createElement("div");
        stacktraceDiv['className'] = 'error-stack-trace';
        for (i = 0; i < stacktrace.length; i++) {
            var anchor = that.createLocationHyperlink(stacktrace[i]);
            stacktraceDiv.appendChild(anchor);
        }
        
        // don't give a stack trace if the user halts the program
        if(!(types.isSchemeError(err) && types.isExnBreak(err.val))){
          dom.appendChild(stacktraceDiv);
        }
        return dom;
    };


  };

export default Evaluator;
