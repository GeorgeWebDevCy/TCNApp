import { ACTIVITY_MONITOR_CONFIG } from '../config/activityMonitorConfig';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';
import { restoreSession } from './wordpressAuthService';

export type ActivityMonitorLogLevel =
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'success';

export interface ActivityMonitorLogEntry {
  level: ActivityMonitorLogLevel;
  message: string;
  timestamp: number;
  params?: unknown[];
  username?: string | null;
}

interface PendingLogPayload {
  username: string;
  log_level: ActivityMonitorLogLevel;
  log_message: string;
  log_timestamp: number;
  log_source: string;
  log_params?: unknown[];
}

const queue: ActivityMonitorLogEntry[] = [];
let isProcessing = false;

const resolveUsername = async (override?: string | null): Promise<string> => {
  const fallback = ACTIVITY_MONITOR_CONFIG.sentinelUsername;

  const trimmedOverride = typeof override === 'string' ? override.trim() : '';

  if (trimmedOverride.length > 0) {
    return trimmedOverride;
  }

  try {
    const session = await restoreSession({ silent: true });
    const sessionUser = session?.user;

    if (!sessionUser) {
      return fallback;
    }

    const email =
      typeof sessionUser.email === 'string' ? sessionUser.email.trim() : '';
    if (email.length > 0) {
      return email;
    }

    const name =
      typeof sessionUser.name === 'string' ? sessionUser.name.trim() : '';
    if (name.length > 0) {
      return name;
    }
  } catch (error) {
    // Ignore errors resolving the username and fall back to the sentinel.
  }

  return fallback;
};

const buildPayload = async (
  entry: ActivityMonitorLogEntry,
): Promise<PendingLogPayload> => {
  const payload: PendingLogPayload = {
    username: await resolveUsername(entry.username),
    log_level: entry.level,
    log_message: entry.message,
    log_timestamp: entry.timestamp,
    log_source: ACTIVITY_MONITOR_CONFIG.source,
  };

  if (Array.isArray(entry.params) && entry.params.length > 0) {
    payload.log_params = sanitizeParams(entry.params);
  }

  return payload;
};

const sanitizeParams = (
  params: unknown[],
  seen = new WeakSet<object>(),
): unknown[] => {
  return params.map(param => sanitizeValue(param, seen));
};

const sanitizeValue = (value: unknown, seen: WeakSet<object>): unknown => {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);
    const entries: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      entries[key] = sanitizeValue(entryValue, seen);
    }
    seen.delete(value as object);
    return entries;
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  return String(value);
};

const processQueue = async (): Promise<void> => {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) {
      continue;
    }

    try {
      const payload = await buildPayload(entry);
      const requestInit = await buildWordPressRequestInit({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const response = await fetch(
        `${ACTIVITY_MONITOR_CONFIG.baseUrl}${ACTIVITY_MONITOR_CONFIG.endpoint}`,
        requestInit,
      );
      await syncWordPressCookiesFromResponse(response);

      await safeConsumeResponse(response);
    } catch (error) {
      // Ignore transport errors so logging never interrupts app flows.
    }
  }

  isProcessing = false;
};

const safeConsumeResponse = async (response: unknown): Promise<void> => {
  if (
    !response ||
    typeof (response as { json?: unknown }).json !== 'function'
  ) {
    return;
  }

  try {
    await (response as { json: () => Promise<unknown> }).json();
  } catch (error) {
    // Ignore parse errors. Some endpoints may not return JSON.
  }
};

export const enqueueActivityLog = (entry: ActivityMonitorLogEntry): void => {
  queue.push(entry);
  void processQueue();
};
