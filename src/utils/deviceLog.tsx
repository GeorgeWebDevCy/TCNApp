import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ViewProps, Share, Pressable } from 'react-native';
import { COLORS } from '../config/theme';
import type { ActivityMonitorLogLevel } from '../services/activityMonitorService';
import { enqueueActivityLog } from '../services/activityMonitorService';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface DeviceLogOptions {
  logToConsole?: boolean;
  logRNErrors?: boolean;
  logToActivityMonitor?: boolean;
  activityMonitorMinimumLevel?: ActivityMonitorLogLevel;
  maxNumberToRender?: number;
  maxNumberToPersist?: number;
}

type LogLevel = ActivityMonitorLogLevel;

interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: number;
}

type ConsoleMethod = 'log' | 'info' | 'debug' | 'warn' | 'error';

type Subscriber = (entries: LogEntry[]) => void;
export type DeviceLogEntry = LogEntry;
export type DeviceLogListener = (entry: DeviceLogEntry) => void;

const LOG_STORAGE_KEY = '@device-log';
const defaultOptions: Required<
  Pick<
    DeviceLogOptions,
    'logToConsole' | 'logRNErrors' | 'logToActivityMonitor'
  >
> &
  Omit<
    DeviceLogOptions,
    'logToConsole' | 'logRNErrors' | 'logToActivityMonitor'
  > = {
  logToConsole: true,
  logRNErrors: true,
  logToActivityMonitor: true,
  activityMonitorMinimumLevel: 'debug',
  maxNumberToRender: 200,
  maxNumberToPersist: 500,
};

const subscribers = new Set<Subscriber>();
const entrySubscribers = new Set<DeviceLogListener>();
let entries: LogEntry[] = [];
let activeOptions: DeviceLogOptions = { ...defaultOptions };
let storageAdapter: StorageAdapter | null = null;
let consolePatched = false;
const originalConsole: Partial<
  Record<ConsoleMethod, (...args: unknown[]) => void>
> = {};
const timers = new Map<string, number>();

const logLevelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3,
};

const shouldSendToActivityMonitor = (level: LogLevel): boolean => {
  if (activeOptions.logToActivityMonitor === false) {
    return false;
  }

  const threshold = activeOptions.activityMonitorMinimumLevel ?? 'debug';
  return logLevelPriority[level] >= logLevelPriority[threshold];
};

const consoleToLogLevel: Record<ConsoleMethod, LogLevel> = {
  log: 'info',
  info: 'info',
  debug: 'debug',
  warn: 'warn',
  error: 'error',
};

const ensurePromise = async <T,>(value: Promise<T> | T): Promise<T> => value;

const getRenderableEntries = (): LogEntry[] => {
  const limit = activeOptions.maxNumberToRender;
  if (typeof limit === 'number' && limit > 0) {
    return entries.slice(-limit);
  }
  return [...entries];
};

const formatTimestamp = (timestamp: number, format?: string) => {
  const date = new Date(timestamp);
  if (format === 'HH:mm:ss') {
    const pad = (value: number) => value.toString().padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
      date.getSeconds(),
    )}`;
  }
  return date.toLocaleTimeString();
};

const getAllEntriesSnapshot = (): LogEntry[] => [...entries];

const formatEntriesAsText = (data: LogEntry[], timeStampFormat?: string) => {
  const lines: string[] = [];
  lines.push('Device Logs');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  data.forEach(entry => {
    const ts = formatTimestamp(entry.timestamp, timeStampFormat);
    lines.push(`[${ts}] ${entry.level.toUpperCase()} ${entry.message}`);
  });
  lines.push('');
  return lines.join('\n');
};

const notifySubscribers = () => {
  const snapshot = getRenderableEntries();
  subscribers.forEach(callback => {
    callback(snapshot);
  });
};

const persistEntries = async () => {
  if (!storageAdapter) {
    return;
  }

  const persistLimit = activeOptions.maxNumberToPersist;
  const data =
    typeof persistLimit === 'number' && persistLimit > 0
      ? entries.slice(-persistLimit)
      : entries;

  try {
    await ensurePromise(
      storageAdapter.setItem(LOG_STORAGE_KEY, JSON.stringify(data)),
    );
  } catch (error) {
    const logger = originalConsole.warn ?? console.warn;
    logger('DeviceLog failed to persist entries', error);
  }
};

const handleNewEntry = (
  level: LogLevel,
  params: unknown[],
  skipConsoleOutput = false,
) => {
  const formattedMessage = params
    .map(item => {
      if (typeof item === 'string') {
        return item;
      }
      if (item instanceof Error) {
        const stack = item.stack ? `\n${item.stack}` : '';
        return `${item.name}: ${item.message}${stack}`;
      }
      try {
        return JSON.stringify(item, null, 2);
      } catch (error) {
        return String(item);
      }
    })
    .join(' ');

  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level,
    message: formattedMessage,
    timestamp: Date.now(),
  };

  entries = [...entries, entry];
  notifySubscribers();
  entrySubscribers.forEach(callback => {
    try {
      callback(entry);
    } catch (error) {
      const logger = originalConsole.warn ?? console.warn;
      logger('DeviceLog entry subscriber threw an error', error);
    }
  });
  void persistEntries();

  if (shouldSendToActivityMonitor(level)) {
    enqueueActivityLog({
      level,
      message: formattedMessage,
      timestamp: entry.timestamp,
      params,
    });
  }

  if (!skipConsoleOutput && activeOptions.logToConsole !== false) {
    const consoleMethod: ConsoleMethod = level === 'success' ? 'info' : level;
    const logger = originalConsole[consoleMethod] ?? console[consoleMethod];
    logger?.(...params);
  }
};

const installConsoleCapture = () => {
  if (consolePatched) {
    return;
  }

  (Object.keys(consoleToLogLevel) as ConsoleMethod[]).forEach(method => {
    const original = console[method]?.bind(console);
    originalConsole[method] = original ?? (() => undefined);

    console[method] = (...args: unknown[]) => {
      original?.(...args);
      handleNewEntry(consoleToLogLevel[method], args, true);
    };
  });

  consolePatched = true;
};

const clearConsoleCapture = () => {
  if (!consolePatched) {
    return;
  }

  (Object.keys(consoleToLogLevel) as ConsoleMethod[]).forEach(method => {
    const original = originalConsole[method];
    if (original) {
      console[method] = original as Console[ConsoleMethod];
    }
  });

  consolePatched = false;
};

const deviceLog = {
  async init(adapter?: StorageAdapter | null, options?: DeviceLogOptions) {
    activeOptions = { ...defaultOptions, ...options };
    storageAdapter = adapter ?? null;

    if (storageAdapter?.getItem) {
      try {
        const storedValue = await ensurePromise(
          storageAdapter.getItem(LOG_STORAGE_KEY),
        );
        if (storedValue) {
          const parsed: LogEntry[] = JSON.parse(storedValue);
          if (Array.isArray(parsed)) {
            entries = parsed;
          }
        }
      } catch (error) {
        const logger = originalConsole.warn ?? console.warn;
        logger('DeviceLog failed to restore persisted entries', error);
      }
    }

    if (activeOptions.logRNErrors) {
      installConsoleCapture();
    } else {
      clearConsoleCapture();
    }

    notifySubscribers();
  },

  log(...params: unknown[]) {
    handleNewEntry('info', params);
  },

  info(...params: unknown[]) {
    handleNewEntry('info', params);
  },

  debug(...params: unknown[]) {
    handleNewEntry('debug', params);
  },

  warn(...params: unknown[]) {
    handleNewEntry('warn', params);
  },

  error(...params: unknown[]) {
    handleNewEntry('error', params);
  },

  success(...params: unknown[]) {
    handleNewEntry('success', params);
  },

  clear() {
    entries = [];
    notifySubscribers();
    void (async () => {
      try {
        if (storageAdapter) {
          await ensurePromise(storageAdapter.removeItem(LOG_STORAGE_KEY));
        }
      } catch (error) {
        const logger = originalConsole.warn ?? console.warn;
        logger('DeviceLog failed to clear persisted entries', error);
      }
    })();
  },

  getEntries(): DeviceLogEntry[] {
    return getRenderableEntries();
  },

  subscribe(callback: Subscriber): () => void {
    subscribers.add(callback);
    callback(getRenderableEntries());
    return () => {
      subscribers.delete(callback);
    };
  },

  onEntry(callback: DeviceLogListener): () => void {
    entrySubscribers.add(callback);
    return () => {
      entrySubscribers.delete(callback);
    };
  },

  startTimer(name: string) {
    timers.set(name, Date.now());
  },

  stopTimer(name: string) {
    const start = timers.get(name);
    if (typeof start === 'number') {
      const duration = Date.now() - start;
      handleNewEntry('info', [`Timer "${name}" finished in ${duration}ms`]);
      timers.delete(name);
    }
  },

  logTime(name: string) {
    this.stopTimer(name);
  },

  getLogText(timeStampFormat: string = 'HH:mm:ss'): string {
    try {
      const all = getAllEntriesSnapshot();
      return formatEntriesAsText(all, timeStampFormat);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Device Logs (export failed to format): ${msg}`;
    }
  },

  async shareLogs(timeStampFormat: string = 'HH:mm:ss'): Promise<void> {
    const text = this.getLogText(timeStampFormat);
    try {
      await Share.share({
        message: text,
        title: 'Device Logs',
      });
    } catch (error) {
      const logger = originalConsole.warn ?? console.warn;
      logger('DeviceLog failed to share logs', error);
    }
  },
};

interface LogViewProps extends ViewProps {
  inverted?: boolean;
  multiExpanded?: boolean;
  timeStampFormat?: string;
  showDownloadButton?: boolean;
}

export const LogView: React.FC<LogViewProps> = ({
  style,
  inverted,
  timeStampFormat = 'HH:mm:ss',
  showDownloadButton = true,
}) => {
  const [logs, setLogs] = useState<LogEntry[]>(() => getRenderableEntries());

  useEffect(() => {
    const unsubscribe = deviceLog.subscribe(nextEntries => {
      setLogs(nextEntries);
    });
    return unsubscribe;
  }, []);

  const data = useMemo(() => {
    if (inverted) {
      return [...logs].reverse();
    }
    return logs;
  }, [logs, inverted]);

  return (
    <ScrollView
      style={[styles.container, style]}
      contentContainerStyle={styles.content}
    >
      {showDownloadButton ? (
        <View style={styles.toolbar}>
          <Pressable
            onPress={() => deviceLog.shareLogs(timeStampFormat)}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Share device logs"
          >
            <Text style={styles.btnLabel}>Share</Text>
          </Pressable>
        </View>
      ) : null}
      {data.length === 0 ? (
        <Text style={styles.emptyText}>No logs recorded yet.</Text>
      ) : (
        data.map(entry => (
          <View key={entry.id} style={[styles.item, levelStyles[entry.level]]}>
            <Text style={styles.meta}>
              {formatTimestamp(entry.timestamp, timeStampFormat)} ·{' '}
              {entry.level.toUpperCase()}
            </Text>
            <Text style={styles.message}>{entry.message}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 8,
    paddingBottom: 24,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
    paddingBottom: 4,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.overlay,
    borderRadius: 8,
  },
  btnPressed: {
    opacity: 0.8,
  },
  btnLabel: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.overlaySubtle,
  },
  meta: {
    fontSize: 12,
    color: COLORS.overlayText,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: COLORS.surface,
  },
  emptyText: {
    color: COLORS.overlayTextMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  info: {
    backgroundColor: COLORS.infoSurface,
  },
  debug: {
    backgroundColor: COLORS.accentSurface,
  },
  warn: {
    backgroundColor: COLORS.warningSurface,
  },
  error: {
    backgroundColor: COLORS.errorSurface,
  },
  success: {
    backgroundColor: COLORS.successSurface,
  },
});

const levelStyles: Record<LogLevel, object> = {
  debug: styles.debug,
  info: styles.info,
  warn: styles.warn,
  error: styles.error,
  success: styles.success,
};

export default deviceLog;
