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

# Example

You can check out some example code that shows off how this works by running:

    npm start

and browsing to

    http://localhost:8080/webpack-dev-server

# Testing

To run the extensive test suite, do the following:

    npm run start-test

then browse to

    http://localhost:8085/webpack-dev-server

and click around on that page as you wish.
