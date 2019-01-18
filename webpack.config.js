var path = require("path")

var envConfig = require('./env-config.js');

var rules = [];
if (envConfig.runCoverage) {
  rules.push({
    test: /\.js/,
    loader: 'isparta',
    include: path.resolve(__dirname, 'src'),
    exclude: /node_modules/,
    enforce: "pre",
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
    rules: rules.concat([
      { test: /\.js$/, exclude: /node_modules/, loader: "babel-loader"},
      { test: /\.css$/, loaders: ["style-loader", "css-loader"] },
      { test: /\.json$/, loaders: ["json-loader"] }
    ])
  }
}