const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Resolution aliases - simplified for SDK 52
config.resolver.alias = {
  ...config.resolver.alias,
  'react': path.resolve(__dirname, 'node_modules/react'),
  'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
};

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Swap react-native-maps for a web-compatible stub on web platform.
// react-native-maps has no web implementation and crashes immediately without this.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-maps.web.tsx'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
