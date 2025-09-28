/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('react-native-onesignal');
jest.mock('react-native-device-log', () => {
  const mockLogger = {
    init: jest.fn(() => Promise.resolve()),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const LogView = () => null;
  return {
    __esModule: true,
    default: mockLogger,
    LogView,
  };
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
