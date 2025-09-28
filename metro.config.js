const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const extraNodeModules = {};
const oneSignalModulePath = path.resolve(
  __dirname,
  'node_modules/react-native-onesignal',
);

if (fs.existsSync(oneSignalModulePath)) {
  extraNodeModules['react-native-onesignal'] = oneSignalModulePath;
}

const config = {
  resolver: {
    extraNodeModules,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
