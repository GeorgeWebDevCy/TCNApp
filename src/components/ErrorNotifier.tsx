import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import deviceLog, {
  type DeviceLogEntry,
  type DeviceLogListener,
} from '../utils/deviceLog';
import { useLocalization } from '../contexts/LocalizationContext';

const DUPLICATE_WINDOW_MS = 8000;
const MAX_MESSAGE_LENGTH = 240;

const normalizeMessage = (
  entry: DeviceLogEntry,
  fallbackMessage: string,
): string => {
  const trimmed = entry.message.trim();
  if (trimmed.length === 0) {
    return fallbackMessage;
  }

  const firstLine = trimmed.split('\n')[0]?.trim() ?? '';
  const candidate = firstLine.length > 0 ? firstLine : trimmed;

  if (candidate.length <= MAX_MESSAGE_LENGTH) {
    return candidate;
  }

  return `${candidate.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
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
      const message = normalizeMessage(entry, fallbackMessage);
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
