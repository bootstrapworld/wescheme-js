# wescheme-js
wescheme javascript compiler

# Installation

This package has not been published to npm yet, so you have to install it from
the github repository:

    npm install --save pcardune/wescheme-js

# Usage

This can be used with requireJS syntax, or ECMAScript 6 imports

    var wescheme = require('wescheme-js')
    // or, if using ecmascript 6:
    // import compile from 'wescheme-js'

    var bytecode = wescheme.compile('(triangle 200 "solid" "turquoise")')
    console.log("I got some bytecode!", bytecode)

