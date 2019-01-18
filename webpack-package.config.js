var path = require("path")
var webpack = require('webpack')

module.exports = {
  devtool: 'source-map',
  entry: {
    "wescheme-js.min": './src/wescheme.js'
  },
  output: {
    path: path.resolve(__dirname, "lib"),
    filename: "[name].js",
    library: "wescheme"
  },
  module: {
    rules: [
      { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
      { test: /\.css$/, loaders: ["style-loader", "css-loader"] }
    ]
  },
  plugins: [

  ]
}