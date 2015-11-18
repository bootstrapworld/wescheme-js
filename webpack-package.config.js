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
    loaders: [
      { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
      { test: /\.css$/, loaders: ["style", "css"] }
    ]
  },
  plugins: [
    new webpack.optimize.DedupePlugin(),
    new webpack.optimize.UglifyJsPlugin({
      compressor: {
        warnings: false
      }
    })
  ]
}