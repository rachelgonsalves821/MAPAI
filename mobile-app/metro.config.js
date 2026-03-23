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

// Custom module resolution:
// 1. expo-modules-core: Node 24 can't strip types from node_modules .ts files, so
//    package.json points main→index.js (null stub) for CLI startup. But Metro needs
//    the real TypeScript source to bundle the app correctly — redirect it here.
// 2. react-native-maps: no web implementation, swap for a stub on web.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'expo-modules-core') {
    return {
      filePath: path.resolve(__dirname, 'node_modules/expo-modules-core/src/index.ts'),
      type: 'sourceFile',
    };
  }
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-maps.web.tsx'),
      type: 'sourceFile',
    };
  }
  if (platform === 'web' && moduleName === 'react-native-svg') {
    return {
      filePath: path.resolve(__dirname, 'mocks/react-native-svg.web.tsx'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
