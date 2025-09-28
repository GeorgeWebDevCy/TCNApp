import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { OneSignalProvider, useOneSignalNotifications } from '../src/notifications/OneSignalProvider';
import { NOTIFICATIONS_CONFIG } from '../src/config/notificationsConfig';

jest.mock('react-native-onesignal');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-device-log', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    state: {
      isAuthenticated: true,
      isLocked: false,
      isLoading: false,
      user: {
        id: 42,
        email: 'member@example.com',
        name: 'Test Member',
        membership: {
          tier: 'gold',
          expiresAt: null,
          benefits: [],
        },
      },
      membership: {
        tier: 'gold',
        expiresAt: null,
        benefits: [],
      },
      authMethod: 'password',
      error: null,
      hasPasswordAuthenticated: true,
    },
  }),
}));

jest.mock('../src/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    language: 'en',
    setLanguage: jest.fn(),
    translateError: jest.fn(),
    t: (key: string) => key,
  }),
}));

type NotificationContextValue = ReturnType<typeof useOneSignalNotifications>;

let contextRef: NotificationContextValue | null = null;

const Harness: React.FC = () => {
  contextRef = useOneSignalNotifications();
  return null;
};

describe('OneSignalProvider', () => {
  const module = require('react-native-onesignal');
  const { OneSignal, __listeners } = module;
  const AsyncStorage = require('@react-native-async-storage/async-storage');

  beforeEach(() => {
    jest.clearAllMocks();
    contextRef = null;
    if (typeof AsyncStorage.clear === 'function') {
      AsyncStorage.clear();
    }
    Object.values(__listeners).forEach((set: Set<unknown>) => set.clear());
  });

  it('initializes the SDK and registers listeners on mount', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(
        <OneSignalProvider>
          <Harness />
        </OneSignalProvider>,
      );
      await Promise.resolve();
    });

    expect(OneSignal.initialize).toHaveBeenCalledWith(NOTIFICATIONS_CONFIG.appId);
    expect(OneSignal.Notifications.addEventListener).toHaveBeenCalledWith(
      'permissionChange',
      expect.any(Function),
    );
    expect(__listeners.foregroundWillDisplay.size).toBeGreaterThan(0);
    expect(contextRef?.preferences).toBeDefined();
  });

  it('suppresses marketing notifications when marketing pushes are muted', async () => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(
        <OneSignalProvider>
          <Harness />
        </OneSignalProvider>,
      );
      await Promise.resolve();
    });

    const foregroundHandler = Array.from(__listeners.foregroundWillDisplay)[0] as (
      event: { notification: unknown; preventDefault: () => void },
    ) => void;

    expect(foregroundHandler).toBeDefined();
    await ReactTestRenderer.act(async () => {
      await contextRef?.updatePreference('marketing', false);
    });

    const preventDefault = jest.fn();
    await ReactTestRenderer.act(async () => {
      foregroundHandler({
        notification: {
          title: 'Promo',
          body: 'Flash sale!',
          additionalData: { type: 'promotion', target: 'vendors' },
        },
        preventDefault,
      });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(contextRef?.activeNotification).toBeNull();

    await ReactTestRenderer.act(async () => {
      await contextRef?.updatePreference('marketing', true);
    });

    await ReactTestRenderer.act(async () => {
      foregroundHandler({
        notification: {
          title: 'Promo',
          body: 'Flash sale!',
          additionalData: { type: 'promotion', target: 'vendors' },
        },
        preventDefault: jest.fn(),
      });
    });

    expect(contextRef?.activeNotification?.body).toBe('Flash sale!');
    expect(contextRef?.activeNotificationOrigin).toBe('foreground');
  });
});
