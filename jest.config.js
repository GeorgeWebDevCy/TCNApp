module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-native-qrcode-svg|react-native-camera)/)',
  ],
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
};
