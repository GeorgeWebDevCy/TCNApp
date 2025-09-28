export interface NotificationPreferences {
  marketing: boolean;
  reminders: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  marketing: true,
  reminders: true,
};

export const NOTIFICATIONS_CONFIG = {
  appId: '00000000-0000-0000-0000-000000000000',
  storageKey: '@tcnapp/notification-preferences',
  tags: {
    membershipTier: 'membership_tier',
    language: 'preferred_language',
    marketingOptIn: 'marketing_opt_in',
    renewalOptIn: 'renewal_opt_in',
  },
} as const;
