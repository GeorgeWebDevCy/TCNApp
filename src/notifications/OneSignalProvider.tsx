import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import deviceLog from '../utils/deviceLog';
import { LogLevel, OneSignal } from 'react-native-onesignal';
import { DEFAULT_NOTIFICATION_PREFERENCES, NOTIFICATIONS_CONFIG, NotificationPreferences } from '../config/notificationsConfig';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { createAppError } from '../errors';

export type NotificationTarget = 'vendors' | 'membership';

export type NotificationCategory = 'promotion' | 'renewal' | 'general';

export interface NotificationPayload {
  title?: string;
  body: string;
  category: NotificationCategory;
  target?: NotificationTarget;
  additionalData: Record<string, unknown>;
}

type NotificationOrigin = 'foreground' | 'background';

interface OneSignalContextValue {
  preferences: NotificationPreferences;
  updatePreference: (key: keyof NotificationPreferences, value: boolean) => Promise<void>;
  activeNotification: NotificationPayload | null;
  activeNotificationOrigin: NotificationOrigin | null;
  clearActiveNotification: () => void;
  pendingNavigationTarget: NotificationTarget | null;
  consumeNavigationTarget: () => void;
  hasPermission: boolean;
}

const OneSignalContext = React.createContext<OneSignalContextValue | undefined>(undefined);

const isPreferencesObject = (value: unknown): value is NotificationPreferences => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof NotificationPreferences, unknown>>;
  return typeof candidate.marketing === 'boolean' && typeof candidate.reminders === 'boolean';
};

const normalizeTarget = (rawTarget: unknown): NotificationTarget | undefined => {
  if (rawTarget === 'vendors' || rawTarget === 'vendor') {
    return 'vendors';
  }

  if (rawTarget === 'membership' || rawTarget === 'member') {
    return 'membership';
  }

  return undefined;
};

const normalizeCategory = (rawCategory: unknown): NotificationCategory => {
  if (rawCategory === 'promotion' || rawCategory === 'marketing') {
    return 'promotion';
  }

  if (rawCategory === 'renewal' || rawCategory === 'reminder') {
    return 'renewal';
  }

  return 'general';
};

const STORAGE_KEY = NOTIFICATIONS_CONFIG.storageKey;

export const OneSignalProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const {
    state: { isAuthenticated, user, membership },
  } = useAuthContext();
  const { language } = useLocalization();

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [activeNotification, setActiveNotification] = useState<NotificationPayload | null>(null);
  const [activeNotificationOrigin, setActiveNotificationOrigin] = useState<NotificationOrigin | null>(null);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState<NotificationTarget | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const initializedRef = useRef(false);
  const preferencesRef = useRef(preferences);

  preferencesRef.current = preferences;

  const persistPreferences = useCallback(async (updated: NotificationPreferences) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (error) {
      deviceLog.warn('Failed to persist notification preferences', error);
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (isPreferencesObject(parsed)) {
          setPreferences(parsed);
          preferencesRef.current = parsed;
        }
      }
    } catch (error) {
      deviceLog.warn('Unable to read notification preferences from storage', error);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const updatePreference = useCallback<OneSignalContextValue['updatePreference']>(
    async (key, value) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        preferencesRef.current = next;
        void persistPreferences(next);
        return next;
      });
    },
    [persistPreferences],
  );

  const clearActiveNotification = useCallback(() => {
    setActiveNotification(null);
    setActiveNotificationOrigin(null);
  }, []);

  const consumeNavigationTarget = useCallback(() => {
    setPendingNavigationTarget(null);
  }, []);

  const parseNotification = useCallback((raw: unknown): NotificationPayload | null => {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const notification = raw as {
      title?: string;
      body?: string;
      additionalData?: Record<string, unknown>;
    };

    if (!notification.body) {
      return null;
    }

    const additionalData = notification.additionalData ?? {};
    const target = normalizeTarget(additionalData?.target ?? additionalData?.deepLink);
    const category = normalizeCategory(additionalData?.category ?? additionalData?.type);

    return {
      title: notification.title,
      body: notification.body,
      category,
      target,
      additionalData,
    };
  }, []);

  const shouldSuppressNotification = useCallback((payload: NotificationPayload): boolean => {
    const currentPreferences = preferencesRef.current;
    if (payload.category === 'promotion' && !currentPreferences.marketing) {
      return true;
    }
    if (payload.category === 'renewal' && !currentPreferences.reminders) {
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    try {
      OneSignal.Debug.setLogLevel(LogLevel.Info);
      OneSignal.initialize(NOTIFICATIONS_CONFIG.appId);
      OneSignal.Notifications.requestPermission(true);
      deviceLog.info('OneSignal SDK initialized');
    } catch (error) {
      deviceLog.error('Failed to initialize OneSignal', error);
    } finally {
      setIsInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const handlePermissionChange = (granted: boolean) => {
      setHasPermission(granted);
    };

    const handleForeground = (event: { notification: unknown; preventDefault: () => void }) => {
      const payload = parseNotification(event.notification);
      if (!payload) {
        return;
      }

      if (shouldSuppressNotification(payload)) {
        event.preventDefault();
        deviceLog.info('Notification suppressed by user preferences', payload.additionalData);
        return;
      }

      setActiveNotification(payload);
      setActiveNotificationOrigin('foreground');
    };

    const handleClick = (event: { notification: unknown }) => {
      const payload = parseNotification(event.notification);
      if (!payload || shouldSuppressNotification(payload)) {
        return;
      }

      setActiveNotification(payload);
      setActiveNotificationOrigin('background');
      if (payload.target) {
        setPendingNavigationTarget(payload.target);
      }
    };

    OneSignal.Notifications.addEventListener('permissionChange', handlePermissionChange);
    OneSignal.Notifications.addEventListener('foregroundWillDisplay', handleForeground);
    OneSignal.Notifications.addEventListener('click', handleClick);

    return () => {
      OneSignal.Notifications.removeEventListener('permissionChange', handlePermissionChange);
      OneSignal.Notifications.removeEventListener('foregroundWillDisplay', handleForeground);
      OneSignal.Notifications.removeEventListener('click', handleClick);
    };
  }, [isInitialized, parseNotification, shouldSuppressNotification]);

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const membershipTier = membership?.tier ?? user?.membership?.tier ?? 'guest';
    const tagPayload: Record<string, string> = {
      [NOTIFICATIONS_CONFIG.tags.language]: language,
      [NOTIFICATIONS_CONFIG.tags.marketingOptIn]: preferences.marketing ? 'true' : 'false',
      [NOTIFICATIONS_CONFIG.tags.renewalOptIn]: preferences.reminders ? 'true' : 'false',
      [NOTIFICATIONS_CONFIG.tags.membershipTier]: membershipTier,
    };

    try {
      OneSignal.User.setLanguage(language);
      OneSignal.User.addTags(tagPayload);
    } catch (error) {
      deviceLog.warn('Unable to sync OneSignal user tags', error);
    }

    if (isAuthenticated && user) {
      OneSignal.login(String(user.id));
    } else {
      OneSignal.logout();
    }
  }, [
    isAuthenticated,
    isInitialized,
    language,
    membership?.tier,
    preferences.marketing,
    preferences.reminders,
    user,
  ]);

  const contextValue = useMemo<OneSignalContextValue>(
    () => ({
      preferences,
      updatePreference,
      activeNotification,
      activeNotificationOrigin,
      clearActiveNotification,
      pendingNavigationTarget,
      consumeNavigationTarget,
      hasPermission,
    }),
    [
      activeNotification,
      activeNotificationOrigin,
      clearActiveNotification,
      consumeNavigationTarget,
      hasPermission,
      pendingNavigationTarget,
      preferences,
      updatePreference,
    ],
  );

  return <OneSignalContext.Provider value={contextValue}>{children}</OneSignalContext.Provider>;
};

export const useOneSignalNotifications = (): OneSignalContextValue => {
  const context = React.useContext(OneSignalContext);
  if (!context) {
    throw createAppError('PROVIDER_ONESIGNAL_MISSING');
  }
  return context;
};
