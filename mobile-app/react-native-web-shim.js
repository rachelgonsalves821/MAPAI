const ReactNativeWeb = require('react-native-web');

// Re-export everything from react-native-web
module.exports = {
  ...ReactNativeWeb,
  // Shim for missing native-only utility
  codegenNativeComponent: (name) => name,
};
