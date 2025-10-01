module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^@env$': '<rootDir>/__mocks__/env.ts',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
