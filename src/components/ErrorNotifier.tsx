import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import deviceLog, {
  type DeviceLogEntry,
  type DeviceLogListener,
} from '../utils/deviceLog';
import { useLocalization } from '../contexts/LocalizationContext';
import { isAppError } from '../errors';

const DUPLICATE_WINDOW_MS = 8000;
const MAX_MESSAGE_LENGTH = 240;

const preferredObjectKeys = ['message', 'errorMessage', 'error', 'description', 'detail', 'details'];

const truncateMessage = (raw: string, fallback: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  if (trimmed.length <= MAX_MESSAGE_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
};

const isHumanReadableLabel = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /[A-Z]/.test(trimmed[0]) || trimmed.includes(' ');
};

const getString = (value: unknown): string | null => {
  return typeof value === 'string' ? value.trim() : null;
};

const extractStructuredMessage = (
  entry: DeviceLogEntry,
): { text: string; source?: string } | null => {
  const params = Array.isArray(entry.params) ? entry.params : [];

  for (const param of params) {
    if (isAppError(param)) {
      const display = param.toDisplayString().trim();
      if (display.length > 0) {
        return { text: display, source: 'appError' };
      }
      const fallback = param.displayMessage?.trim();
      if (fallback?.length) {
        const withCode = param.code
          ? `${param.code}: ${fallback}`
          : fallback;
        return { text: withCode, source: 'appError' };
      }
    }
  }

  for (const param of params) {
    if (param && typeof param === 'object') {
      const record = param as Record<string, unknown>;
      const code = getString(record.code);
      for (const key of preferredObjectKeys) {
        const value = getString(record[key]);
        if (value) {
          if (code) {
            return { text: `${code}: ${value}`, source: key };
          }
          return { text: value, source: key };
        }
      }
      const error = record.error;
      if (error instanceof Error) {
        const value = getString(error.message);
        if (value) {
          const errorCode = getString(
            (error as unknown as { code?: string }).code,
          );
          if (errorCode) {
            return { text: `${errorCode}: ${value}`, source: 'nestedError' };
          }
          return { text: value, source: 'nestedError' };
        }
      }
    }
  }

  for (const param of params) {
    if (param instanceof Error) {
      const message = getString(param.message);
      if (message) {
        const code = getString((param as unknown as { code?: string }).code);
        if (code) {
          return { text: `${code}: ${message}`, source: 'error' };
        }
        return { text: message, source: 'error' };
      }
    }
  }

  for (const param of params) {
    if (typeof param === 'string') {
      const trimmed = param.trim();
      if (trimmed.includes(':')) {
        return { text: trimmed, source: 'string' };
      }
    }
  }

  const firstLine = entry.message.split('\n')[0]?.trim() ?? '';
  if (firstLine.length > 0) {
    return { text: firstLine };
  }

  return null;
};

export const ErrorNotifier: React.FC = () => {
  const { t } = useLocalization();
  const lastAlertRef = useRef<{ message: string; timestamp: number } | null>(
    null,
  );

  useEffect(() => {
    const listener: DeviceLogListener = entry => {
      if (entry.level !== 'error') {
        return;
      }

      const fallbackMessage = t('errors.generic');
      const params = Array.isArray(entry.params) ? entry.params : [];
      const labelCandidate = params.find(
        (param): param is string =>
          typeof param === 'string' && isHumanReadableLabel(param),
      );

      const structured = extractStructuredMessage(entry);
      let composedMessage: string | null = null;
      if (structured) {
        const label = labelCandidate ?? null;
        if (label && !structured.text.startsWith(label)) {
          composedMessage = `${label.trim()}\n${structured.text}`;
        } else {
          composedMessage = structured.text;
        }
      } else if (labelCandidate) {
        composedMessage = labelCandidate.trim();
      }

      const message = truncateMessage(
        composedMessage ?? entry.message,
        fallbackMessage,
      );

      if (message.length === 0) {
        return;
      }

      const now = Date.now();
      const last = lastAlertRef.current;
      if (
        last &&
        message === last.message &&
        now - last.timestamp < DUPLICATE_WINDOW_MS
      ) {
        return;
      }

      lastAlertRef.current = { message, timestamp: now };
      Alert.alert(t('common.errorTitle'), message);
    };

    const unsubscribe = deviceLog.onEntry(listener);
    return unsubscribe;
  }, [t]);

  return null;
};

export default ErrorNotifier;
