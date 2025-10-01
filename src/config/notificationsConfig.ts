import { ONESIGNAL_APP_ID } from '@env';

type MaybeString = string | undefined | null;

const getProcessEnvAppId = (): MaybeString => {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }

  const env = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, MaybeString> };
  }).process?.env;

  return env?.ONESIGNAL_APP_ID;
};

const coalesceAppId = (...values: MaybeString[]): string | undefined =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0) ?? undefined;

export interface NotificationPreferences {
  marketing: boolean;
  reminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  marketing: true,
  reminders: true,
};

const resolveAppId = (): string => {
  const candidate = coalesceAppId(ONESIGNAL_APP_ID, getProcessEnvAppId());

  if (!candidate) {
    throw new Error('ONESIGNAL_APP_ID is not configured.');
  }

  return candidate.trim();
};

export const NOTIFICATIONS_CONFIG = {
  appId: resolveAppId(),
  storageKey: '@tcnapp/notification-preferences',
  tags: {
    membershipTier: 'membership_tier',
    language: 'preferred_language',
    marketingOptIn: 'marketing_opt_in',
    renewalOptIn: 'renewal_opt_in',
  },
} as const;
