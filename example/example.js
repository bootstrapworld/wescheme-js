import CodeMirror from 'CodeMirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'
import prettyJS from 'pretty-js'

import compile from '../src/wescheme'

require('./example.css')
require('./example-page.css')

var cm = CodeMirror.fromTextArea(
  document.getElementById("code"),
  {theme:'3024-day'}
)

var cm2 = CodeMirror.fromTextArea(
  document.getElementById('code2'),
  {theme:'3024-day'}
)
cm.setValue('(triangle 200 "solid" "turquoise")')

cm2.setValue(prettyJS(compile(cm.getValue()).bytecode))

cm.on('change', function() {
  try {
    cm2.setValue(prettyJS(compile(cm.getValue()).bytcode))
  } catch (e) {
    if (e instanceof Error) {
      throw e
    }
    cm2.setValue(e)
  }
})
