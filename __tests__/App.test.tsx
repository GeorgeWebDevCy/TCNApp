/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-onesignal');

jest.mock('../src/notifications/OneSignalProvider', () => ({
  OneSignalProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock(
  '../src/utils/deviceLog',
  () => ({
    __esModule: true,
    default: {
      init: jest.fn(() => Promise.resolve()),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
      clear: jest.fn(),
      getEntries: jest.fn(() => []),
      subscribe: jest.fn((callback: (entries: unknown[]) => void) => {
        callback([]);
        return jest.fn();
      }),
      onEntry: jest.fn(() => jest.fn()),
    },
    LogView: jest.fn(() => null),
  }),
  { virtual: true },
);

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
