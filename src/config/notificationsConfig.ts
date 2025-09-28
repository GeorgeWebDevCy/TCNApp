export const NOTIFICATIONS_CONFIG = {
  appId: '00000000-0000-0000-0000-000000000000',
  marketingTagKey: 'marketing_opt_in',
  membershipTierTagKey: 'membership_tier',
  languageTagKey: 'preferred_language',
  navigationTargetKey: 'target',
  notificationContextKey: 'context',
};

export const NOTIFICATION_STORAGE_KEYS = {
  preferences: '@tcnapp/notification-preferences',
};

export type SupportedMembershipTier = 'gold' | 'platinum' | 'black';

export const DEFAULT_MEMBERSHIP_TIER: SupportedMembershipTier = 'gold';

export const ONE_SIGNAL_DEFAULT_TAG_VALUES = {
  marketingOptIn: 'true',
  marketingOptOut: 'false',
};
