var path = require('path');

module.exports = {
    entry: {
        parser: './src/index',
    },
    mode: 'development',
    target: 'node',
    output: {
        path: path.resolve(__dirname, 'lib'),
        filename: '[name].js',
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    module: {
        rules: [
            {
                // Include ts, tsx, js, and jsx files.
                test: /\.(ts|js)x?$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
            },
        ],
    },
};
