import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import OneSignal, { LogLevel, NotificationClickEvent, NotificationWillDisplayEvent } from 'react-native-onesignal';
import deviceLog from 'react-native-device-log';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  DEFAULT_MEMBERSHIP_TIER,
  NOTIFICATIONS_CONFIG,
  NOTIFICATION_STORAGE_KEYS,
  ONE_SIGNAL_DEFAULT_TAG_VALUES,
  SupportedMembershipTier,
} from '../config/notificationsConfig';

export type NotificationPreferences = {
  marketingMuted: boolean;
};

type NotificationNavigationTarget = 'vendors' | 'membership';
type NotificationNavigationContext = 'promotion' | 'renewal' | 'unknown';

type ActiveSection = 'dashboard' | NotificationNavigationTarget;

type NotificationNavigationIntent = {
  id: string;
  target: NotificationNavigationTarget;
  context: NotificationNavigationContext;
  title?: string;
  message?: string;
  receivedAt: number;
};

type NotificationContextValue = {
  preferences: NotificationPreferences;
  setMarketingMuted: (muted: boolean) => Promise<NotificationPreferences>;
  toggleMarketingMute: () => Promise<NotificationPreferences>;
  navigationIntent: NotificationNavigationIntent | null;
  clearNavigationIntent: () => void;
  activeSection: ActiveSection;
  navigateToSection: (section: NotificationNavigationTarget) => void;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  marketingMuted: false,
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

const resolveMembershipTier = (tier?: string | null): SupportedMembershipTier => {
  if (!tier) {
    return DEFAULT_MEMBERSHIP_TIER;
  }

  const normalized = tier.toLowerCase();
  if (normalized === 'gold' || normalized === 'platinum' || normalized === 'black') {
    return normalized;
  }

  return DEFAULT_MEMBERSHIP_TIER;
};

const extractAdditionalData = (notification: Record<string, unknown> | undefined) => {
  if (!notification) {
    return {} as Record<string, unknown>;
  }

  const rawData =
    (notification.additionalData as Record<string, unknown> | undefined) ??
    (notification.data as Record<string, unknown> | undefined);

  if (rawData && typeof rawData === 'object') {
    return rawData;
  }

  return {} as Record<string, unknown>;
};

const resolveNavigationTarget = (
  data: Record<string, unknown>,
): NotificationNavigationTarget | null => {
  const rawTarget =
    (data[NOTIFICATIONS_CONFIG.navigationTargetKey] ?? data.target ?? data.screen) as string | undefined;

  if (!rawTarget) {
    return null;
  }

  const normalized = rawTarget.toLowerCase();
  if (normalized === 'vendors' || normalized === 'membership') {
    return normalized;
  }

  return null;
};

const resolveNavigationContext = (
  data: Record<string, unknown>,
): NotificationNavigationContext => {
  const rawContext =
    (data[NOTIFICATIONS_CONFIG.notificationContextKey] ?? data.context ?? data.category) as string | undefined;

  if (!rawContext) {
    return 'unknown';
  }

  const normalized = rawContext.toLowerCase();
  if (normalized === 'promotion' || normalized === 'renewal') {
    return normalized;
  }

  return 'unknown';
};

const buildNavigationIntent = (
  notification: Record<string, unknown>,
): NotificationNavigationIntent | null => {
  const additionalData = extractAdditionalData(notification);
  const target = resolveNavigationTarget(additionalData);
  if (!target) {
    return null;
  }

  const context = resolveNavigationContext(additionalData);
  const id =
    (notification.notificationId as string | undefined) ??
    (notification.id as string | undefined) ??
    `local-${Date.now()}`;

  return {
    id,
    target,
    context,
    title: (notification.title as string | undefined) ?? (additionalData.title as string | undefined),
    message:
      (notification.body as string | undefined) ??
      (additionalData.message as string | undefined) ??
      (additionalData.body as string | undefined),
    receivedAt: Date.now(),
  };
};

export const OneSignalProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const {
    state: { isAuthenticated, user },
  } = useAuthContext();
  const { language } = useLocalization();

  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [navigationIntent, setNavigationIntent] = useState<NotificationNavigationIntent | null>(null);
  const [activeSection, setActiveSection] = useState<ActiveSection>('dashboard');
  const preferencesRef = useRef(preferences);
  const initializedRef = useRef(false);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    let isMounted = true;
    const restorePreferences = async () => {
      try {
        const stored = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEYS.preferences);
        if (stored) {
          const parsed = JSON.parse(stored) as NotificationPreferences;
          if (isMounted) {
            setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
          }
        }
      } catch (error) {
        deviceLog.warn('Unable to restore notification preferences', error);
      }
    };

    void restorePreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const persistPreferences = useCallback(async (value: NotificationPreferences) => {
    try {
      await AsyncStorage.setItem(
        NOTIFICATION_STORAGE_KEYS.preferences,
        JSON.stringify(value),
      );
    } catch (error) {
      deviceLog.warn('Unable to persist notification preferences', error);
    }
  }, []);

  const applyPreferences = useCallback(
    async (partial: Partial<NotificationPreferences>): Promise<NotificationPreferences> => {
      const next = { ...preferencesRef.current, ...partial };
      setPreferences(next);
      await persistPreferences(next);
      deviceLog.info('Updated notification preferences', next);
      return next;
    },
    [persistPreferences],
  );

  const setMarketingMuted = useCallback(
    async (muted: boolean) => applyPreferences({ marketingMuted: muted }),
    [applyPreferences],
  );

  const toggleMarketingMute = useCallback(
    async () => applyPreferences({ marketingMuted: !preferencesRef.current.marketingMuted }),
    [applyPreferences],
  );

  const clearNavigationIntent = useCallback(() => {
    setNavigationIntent(null);
  }, []);

  const navigateToSection = useCallback((section: NotificationNavigationTarget) => {
    setActiveSection(section);
    setNavigationIntent((current) => (current?.target === section ? null : current));
  }, []);

  const handleNotificationIntent = useCallback(
    (notification: Record<string, unknown>, source: 'foreground' | 'click') => {
      const intent = buildNavigationIntent(notification);
      if (!intent) {
        return;
      }

      if (intent.context === 'promotion' && preferencesRef.current.marketingMuted) {
        deviceLog.info('Promotion notification muted by user preference', intent);
        return;
      }

      setNavigationIntent(intent);
      deviceLog.info(`Received ${intent.context} notification from ${source}`, intent);

      if (source === 'click') {
        setActiveSection(intent.target);
      }
    },
    [],
  );

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }

    initializedRef.current = true;
    try {
      OneSignal.Debug.setLogLevel(LogLevel.Warn);
    } catch (error) {
      // setLogLevel may not be available on older versions; ignore failures.
    }
    OneSignal.initialize(NOTIFICATIONS_CONFIG.appId);
    OneSignal.Notifications.requestPermission(true);

    const foregroundListener = OneSignal.Notifications.addEventListener(
      'foregroundWillDisplay',
      (event: NotificationWillDisplayEvent) => {
        const notification = event.getNotification?.() ??
          (event as unknown as { notification?: Record<string, unknown> }).notification;
        if (notification) {
          handleNotificationIntent(notification as Record<string, unknown>, 'foreground');
        }
      },
    );

    const clickListener = OneSignal.Notifications.addEventListener(
      'click',
      (event: NotificationClickEvent) => {
        if (event && event.notification) {
          handleNotificationIntent(event.notification as unknown as Record<string, unknown>, 'click');
        }
      },
    );

    return () => {
      foregroundListener?.remove?.();
      clickListener?.remove?.();
    };
  }, [handleNotificationIntent]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    const tagValue = preferences.marketingMuted
      ? ONE_SIGNAL_DEFAULT_TAG_VALUES.marketingOptOut
      : ONE_SIGNAL_DEFAULT_TAG_VALUES.marketingOptIn;

    void OneSignal.User.addTag(NOTIFICATIONS_CONFIG.marketingTagKey, tagValue);

    const { pushSubscription } = OneSignal.User;
    if (pushSubscription?.optOut && pushSubscription?.optIn) {
      if (preferences.marketingMuted) {
        pushSubscription.optOut();
      } else {
        pushSubscription.optIn();
      }
    }
  }, [preferences.marketingMuted]);

  useEffect(() => {
    if (!initializedRef.current) {
      return;
    }

    if (!isAuthenticated || !user) {
      void OneSignal.User.removeTag(NOTIFICATIONS_CONFIG.membershipTierTagKey);
      void OneSignal.User.removeTag(NOTIFICATIONS_CONFIG.languageTagKey);
      setActiveSection('dashboard');
      return;
    }

    const membershipTier = resolveMembershipTier((user as { membershipTier?: string }).membershipTier);
    void OneSignal.User.addTag(NOTIFICATIONS_CONFIG.membershipTierTagKey, membershipTier);
    OneSignal.User.setLanguage(language);
    void OneSignal.User.addTag(NOTIFICATIONS_CONFIG.languageTagKey, language);
  }, [isAuthenticated, language, user]);

  const contextValue = useMemo<NotificationContextValue>(
    () => ({
      preferences,
      setMarketingMuted,
      toggleMarketingMute,
      navigationIntent,
      clearNavigationIntent,
      activeSection,
      navigateToSection,
    }),
    [
      preferences,
      setMarketingMuted,
      toggleMarketingMute,
      navigationIntent,
      clearNavigationIntent,
      activeSection,
      navigateToSection,
    ],
  );

  return <NotificationContext.Provider value={contextValue}>{children}</NotificationContext.Provider>;
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a OneSignalProvider.');
  }
  return context;
};
