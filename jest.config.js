module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@env$': '<rootDir>/__mocks__/env.ts',
    '^react-native-webview$': '<rootDir>/__mocks__/react-native-webview.js',
    '^react-native-image-picker$': '<rootDir>/__mocks__/react-native-image-picker.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
