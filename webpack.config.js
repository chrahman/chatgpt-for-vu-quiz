const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const path = require("path");
const ExtensionReloader = require("webpack-extension-reloader");
const ManifestVersionSyncPlugin = require("webpack-manifest-version-sync-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
  entry: {
    popup: "./src/popup.js",
    content: "./src/content-script/content.js",
    background: "./src/background/background.js",
  },
  output: {
    filename: "[name].js",
    path: path.resolve(__dirname, "build"),
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
          },
        ],
      },
      {
        test: /\.svg$/,
        use: ["@svgr/webpack"],
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "src/popup.html"),
      filename: "popup.html",
      chunks: ["popup"],
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: "./src/assets", to: "./assets" },
        { from: "./src/manifest.json", to: "./manifest.json" },
        { from: "./src/styles", to: "./styles" },
        { from: "./src/demo.html", to: "./demo.html" },
      ],
    }),
    new ManifestVersionSyncPlugin(),
    new MiniCssExtractPlugin({
      filename: "[name].css",
      chunkFilename: "[id].css",
    }),
  ],
  optimization: {
    minimize: true,
  },
  mode: "production",
  stats: "minimal",
};

if (process.env.NODE_ENV === "development") {
  module.exports.plugins.push(
    new ExtensionReloader({
      manifest: path.resolve(__dirname, "./src/manifest.json"),
    })
  );
}
