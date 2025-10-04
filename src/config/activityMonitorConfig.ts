import { WORDPRESS_CONFIG } from './authConfig';

export const ACTIVITY_MONITOR_CONFIG = {
  endpoint: '/wp-json/gn/v1/forgot-password',
  sentinelUsername: '__tcnapp_activity_log__',
  source: 'mobile-app',
  baseUrl: WORDPRESS_CONFIG.baseUrl,
};

export type ActivityMonitorConfig = typeof ACTIVITY_MONITOR_CONFIG;
