import CodeMirror from 'CodeMirror'
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/monokai.css'

import compile from '../wescheme'

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

cm.on('change', function() {
  cm2.setValue(compile(cm.getValue()))
})
