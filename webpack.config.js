var path = require("path")

var envConfig = require('./env-config.js');

var preLoaders = [];
if (envConfig.runCoverage) {
  preLoaders.push({
    test: /\.js/,
    loader: 'isparta',
    include: path.resolve(__dirname, 'src'),
    exclude: /node_modules/
  });
}

module.exports = {
  devtool: 'source-map',
  entry: {
    "example": './example/example.js',
    "test": './test/test.js'
  },
  output: {
    path: path.resolve(__dirname, "build"),
    publicPath: "/build/",
    filename: "[name].js"
  },
  module: {
    loaders: [
      { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
      { test: /\.css$/, loaders: ["style", "css"] },
      { test: /\.json$/, loaders: ["json"] }
    ],
    preLoaders: preLoaders
  }
}