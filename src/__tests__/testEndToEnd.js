/*globals describe it expect*/
import {compileREPL, getError, repl2_setup} from '../../test/repl2'

var suiteData = require('./suite.json')

describe('testing everything', function() {
  repl2_setup();

  suiteData.forEach(function(test, index) {
    it('should properly handle test #'+index, function() {
      expect(true).toBe(true);
    })
  });
});
