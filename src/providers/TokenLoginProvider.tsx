import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../config/theme';
import deviceLog from '../utils/deviceLog';
import { createAppError } from '../errors';

interface TokenLoginContextValue {
  hydrateTokenLogin: (url?: string | null) => Promise<void>;
}

interface HydrationTask {
  id: number;
  url: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

const TokenLoginContext = createContext<TokenLoginContextValue | undefined>(
  undefined,
);

const useHydrationQueue = () => {
  const queueRef = useRef<HydrationTask[]>([]);
  const [activeTask, setActiveTask] = useState<HydrationTask | null>(null);

  const processNext = useCallback(() => {
    if (activeTask) {
      return;
    }

    const nextTask = queueRef.current.shift() ?? null;
    if (nextTask) {
      setActiveTask(nextTask);
    }
  }, [activeTask]);

  const enqueue = useCallback((task: HydrationTask) => {
    queueRef.current.push(task);
  }, []);

  const clearActiveTask = useCallback(() => {
    setActiveTask(null);
  }, []);

  useEffect(() => {
    if (!activeTask && queueRef.current.length > 0) {
      const nextTask = queueRef.current.shift() ?? null;
      if (nextTask) {
        setActiveTask(nextTask);
      }
    }
  }, [activeTask]);

  const getPendingCount = useCallback(() => {
    return queueRef.current.length;
  }, []);

  return {
    activeTask,
    enqueue,
    processNext,
    clearActiveTask,
    getPendingCount,
  };
};

export const TokenLoginProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const { activeTask, enqueue, processNext, clearActiveTask, getPendingCount } =
    useHydrationQueue();
  const hasCompletedRef = useRef(false);

  const hydrateTokenLogin = useCallback(
    (url?: string | null) => {
      if (!url) {
        deviceLog.debug('tokenLogin.skip', {
          reason: 'missing_url',
        });
        return Promise.resolve();
      }

      return new Promise<void>((resolve, reject) => {
        const task: HydrationTask = {
          id: Date.now(),
          url,
          resolve,
          reject,
        };

        deviceLog.debug('tokenLogin.queue.enqueue', {
          url,
          pending: getPendingCount() + (activeTask ? 1 : 0),
        });

        enqueue(task);
        processNext();
      });
    },
    [activeTask, enqueue, getPendingCount, processNext],
  );

  const handleComplete = useCallback(
    (success: boolean, error?: Error) => {
      if (!activeTask) {
        return;
      }

      if (hasCompletedRef.current) {
        return;
      }

      hasCompletedRef.current = true;

      if (success) {
        deviceLog.debug('tokenLogin.queue.completed', {
          url: activeTask.url,
        });
        activeTask.resolve();
      } else {
        deviceLog.warn('tokenLogin.queue.failed', {
          url: activeTask.url,
          error: error?.message,
        });
        activeTask.reject(error ?? new Error('Token login hydration failed.'));
      }

      clearActiveTask();
    },
    [activeTask, clearActiveTask],
  );

  const contextValue = useMemo<TokenLoginContextValue>(
    () => ({ hydrateTokenLogin }),
    [hydrateTokenLogin],
  );

  useEffect(() => {
    hasCompletedRef.current = false;
  }, [activeTask]);

  return (
    <TokenLoginContext.Provider value={contextValue}>
      {children}
      <Modal
        visible={Boolean(activeTask)}
        transparent
        animationType="fade"
        onRequestClose={() =>
          handleComplete(
            false,
            new Error('Token login hydration cancelled by user.'),
          )
        }
      >
        <View style={styles.overlay}>
          <View style={styles.card}>
            <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
            <Text style={styles.message}>Finishing secure sign-in…</Text>
          </View>
          {activeTask ? (
            <WebView
              source={{ uri: activeTask.url }}
              onLoadEnd={() => handleComplete(true)}
              onHttpError={event =>
                handleComplete(
                  false,
                  new Error(
                    `HTTP ${event.nativeEvent.statusCode}: ${event.nativeEvent.description}`,
                  ),
                )
              }
              onError={event =>
                handleComplete(
                  false,
                  new Error(event.nativeEvent.description ?? 'WebView error'),
                )
              }
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              startInLoadingState
              style={styles.hiddenWebView}
            />
          ) : null}
        </View>
      </Modal>
    </TokenLoginContext.Provider>
  );
};

export const useTokenLogin = (): TokenLoginContextValue => {
  const context = useContext(TokenLoginContext);
  if (!context) {
    throw createAppError('PROVIDER_TOKEN_LOGIN_MISSING');
  }
  return context;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#00000033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 12,
  },
  message: {
    color: COLORS.textPrimary,
    fontSize: 14,
    textAlign: 'center',
  },
  hiddenWebView: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    bottom: 0,
    right: 0,
  },
});
