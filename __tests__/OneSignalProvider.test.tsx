import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import OneSignal, { NotificationWillDisplayEvent } from 'react-native-onesignal';
import { NOTIFICATIONS_CONFIG, ONE_SIGNAL_DEFAULT_TAG_VALUES } from '../src/config/notificationsConfig';
import { OneSignalProvider, useNotifications } from '../src/notifications/OneSignalProvider';

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

const mockUseAuthContext = jest.fn();
jest.mock('../src/contexts/AuthContext', () => ({
  useAuthContext: () => mockUseAuthContext(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockUseLocalization = jest.fn();
jest.mock('../src/contexts/LocalizationContext', () => ({
  useLocalization: () => mockUseLocalization(),
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('OneSignalProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as any).clear();
    mockUseAuthContext.mockReturnValue({
      state: {
        isAuthenticated: false,
        isLocked: false,
        isLoading: false,
        user: null,
        authMethod: null,
        error: null,
        hasPasswordAuthenticated: false,
      },
    });
    mockUseLocalization.mockReturnValue({
      language: 'en',
      setLanguage: jest.fn(),
      t: (key: string) => key,
      translateError: (value: string) => value,
    });
    const oneSignalMock = OneSignal as unknown as { __emitter?: { reset: () => void } };
    oneSignalMock.__emitter?.reset?.();
  });

  const renderWithProvider = async (children: React.ReactNode) => {
    await ReactTestRenderer.act(async () => {
      ReactTestRenderer.create(<OneSignalProvider>{children}</OneSignalProvider>);
    });
  };

  it('initializes OneSignal and requests notification permission', async () => {
    let contextSnapshot: ReturnType<typeof useNotifications> | null = null;
    const Probe = () => {
      contextSnapshot = useNotifications();
      return null;
    };

    await renderWithProvider(<Probe />);
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(OneSignal.initialize).toHaveBeenCalledWith(NOTIFICATIONS_CONFIG.appId);
    expect(OneSignal.Notifications.requestPermission).toHaveBeenCalledWith(true);
    expect(OneSignal.User.addTag).toHaveBeenCalledWith(
      NOTIFICATIONS_CONFIG.marketingTagKey,
      ONE_SIGNAL_DEFAULT_TAG_VALUES.marketingOptIn,
    );
    expect(contextSnapshot?.preferences.marketingMuted).toBe(false);
  });

  it('updates tags for authenticated members and toggles marketing opt-out', async () => {
    mockUseAuthContext.mockReturnValue({
      state: {
        isAuthenticated: true,
        isLocked: false,
        isLoading: false,
        user: {
          id: 1,
          email: 'member@example.com',
          name: 'Member',
          membershipTier: 'platinum',
        },
        authMethod: null,
        error: null,
        hasPasswordAuthenticated: true,
      },
    });
    mockUseLocalization.mockReturnValue({
      language: 'th',
      setLanguage: jest.fn(),
      t: (key: string) => key,
      translateError: (value: string) => value,
    });

    let context: ReturnType<typeof useNotifications> | null = null;
    const Probe = () => {
      context = useNotifications();
      return null;
    };

    await renderWithProvider(<Probe />);
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(OneSignal.User.addTag).toHaveBeenCalledWith(NOTIFICATIONS_CONFIG.membershipTierTagKey, 'platinum');
    expect(OneSignal.User.addTag).toHaveBeenCalledWith(NOTIFICATIONS_CONFIG.languageTagKey, 'th');

    await ReactTestRenderer.act(async () => {
      await context?.toggleMarketingMute();
    });

    expect(OneSignal.User.addTag).toHaveBeenCalledWith(
      NOTIFICATIONS_CONFIG.marketingTagKey,
      ONE_SIGNAL_DEFAULT_TAG_VALUES.marketingOptOut,
    );
    expect((OneSignal.User.pushSubscription.optOut as jest.Mock)).toHaveBeenCalled();
  });

  it('surfaces navigation intents when notifications arrive', async () => {
    mockUseAuthContext.mockReturnValue({
      state: {
        isAuthenticated: true,
        isLocked: false,
        isLoading: false,
        user: {
          id: 99,
          email: 'test@example.com',
          name: 'Tester',
          membershipTier: 'gold',
        },
        authMethod: null,
        error: null,
        hasPasswordAuthenticated: true,
      },
    });

    let context: ReturnType<typeof useNotifications> | null = null;
    const Probe = () => {
      context = useNotifications();
      return null;
    };

    await renderWithProvider(<Probe />);
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    const oneSignalMock = OneSignal as unknown as {
      __emitter?: { emit: (event: string, payload?: unknown) => void };
    };

    await ReactTestRenderer.act(async () => {
      const notification = {
        title: 'New Promotion',
        body: 'Visit the vendor marketplace.',
        additionalData: {
          target: 'vendors',
          context: 'promotion',
        },
      };
      oneSignalMock.__emitter?.emit?.(
        'foregroundWillDisplay',
        new NotificationWillDisplayEvent(notification as any),
      );
      await Promise.resolve();
    });

    expect(context?.navigationIntent?.target).toBe('vendors');
    expect(context?.navigationIntent?.context).toBe('promotion');

    await ReactTestRenderer.act(async () => {
      oneSignalMock.__emitter?.emit?.('click', {
        notification: {
          title: 'Renewal Reminder',
          body: 'Review your membership benefits.',
          additionalData: {
            target: 'membership',
            context: 'renewal',
          },
        },
      });
      await Promise.resolve();
    });

    expect(context?.activeSection).toBe('membership');
  });
});
