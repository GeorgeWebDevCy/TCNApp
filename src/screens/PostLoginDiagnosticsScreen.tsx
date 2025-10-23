import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { WORDPRESS_CONFIG } from '../config/authConfig';
import { COLORS } from '../config/theme';
import { buildWordPressRequestInit } from '../services/wordpressCookieService';
import type { PersistedSession } from '../services/wordpressAuthService';
import deviceLog from '../utils/deviceLog';

type DiagnosticKey = 'server' | 'token' | 'lifetime' | 'endpoint';

type DiagnosticStatus = {
  status: 'pending' | 'success' | 'error';
  details: string | null;
};

type DiagnosticState = Record<DiagnosticKey, DiagnosticStatus>;

const DIAGNOSTIC_ORDER: DiagnosticKey[] = [
  'server',
  'token',
  'lifetime',
  'endpoint',
];

const EXPECTED_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_LIFETIME_TOLERANCE_SECONDS = 60 * 60; // Allow one hour drift.

const createInitialStatuses = (): DiagnosticState => ({
  server: { status: 'pending', details: null },
  token: { status: 'pending', details: null },
  lifetime: { status: 'pending', details: null },
  endpoint: { status: 'pending', details: null },
});

const formatDebugValue = (value: unknown): string => {
  if (value == null || value === '') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
};

const formatContextDetails = (
  context: Array<[string, unknown]> | undefined,
): string => {
  if (!context || context.length === 0) {
    return '';
  }

  const lines = context.map(([label, rawValue]) => {
    const formatted = formatDebugValue(rawValue);
    const [firstLine, ...remainingLines] = formatted.split('\n');
    if (remainingLines.length === 0) {
      return `• ${label}: ${firstLine}`;
    }

    const indented = remainingLines.map(line => `  ${line}`).join('\n');
    return `• ${label}: ${firstLine}\n${indented}`;
  });

  return `\n\nDetails:\n${lines.join('\n')}`;
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const padded = `${normalized}${padding}`;

  if (typeof globalThis.atob === 'function') {
    return globalThis.atob(padded);
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let accumulated = 0;

  for (let i = 0; i < padded.length; i += 1) {
    const char = padded.charAt(i);
    const index = chars.indexOf(char);
    if (index < 0) {
      continue;
    }

    buffer = (buffer << 6) | index;
    accumulated += 6;

    if (accumulated >= 8) {
      accumulated -= 8;
      const code = (buffer >> accumulated) & 0xff;
      output += String.fromCharCode(code);
    }
  }

  return output;
};

const decodeJwtPayload = (
  token: string,
): Record<string, unknown> | null => {
  if (!token) {
    return null;
  }

  const segments = token.split('.');
  if (segments.length < 2) {
    return null;
  }

  try {
    const decoded = decodeBase64Url(segments[1]);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch (error) {
    deviceLog.warn('postLoginDiagnostics.jwt.decodeFailed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

const maskToken = (token: string): string => {
  const trimmed = token.trim();
  if (trimmed.length <= 8) {
    return '••••';
  }

  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
};

const parseIsoToEpochSeconds = (
  value: string | null | undefined,
): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
};

const parseExpiresInSeconds = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.floor(numeric);
    }
  }

  return null;
};

const parseEpochSeconds = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }
  }

  return null;
};

type SessionWithExpiryMetadata = PersistedSession & {
  expires_in?: unknown;
  expiresIn?: unknown;
  token_expires_in?: unknown;
  tokenExpiresIn?: unknown;
};

const formatRelativeDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds)) {
    return '';
  }

  const absSeconds = Math.abs(seconds);
  const days = Math.floor(absSeconds / 86400);
  const hours = Math.floor((absSeconds % 86400) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 && parts.length < 2) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 && parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  const formatted = parts.join(' ');

  if (seconds >= 0) {
    return formatted ? `in ${formatted}` : 'in 0m';
  }

  return formatted ? `${formatted} ago` : '0m ago';
};

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs = 10000,
): Promise<Response> => {
  if (typeof AbortController === 'undefined' || init.signal) {
    return fetch(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

interface PostLoginDiagnosticsScreenProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export const PostLoginDiagnosticsScreen: React.FC<PostLoginDiagnosticsScreenProps> = ({
  onComplete,
  onSkip,
}) => {
  const { getSessionToken, getPersistedSession, state } = useAuthContext();
  const { t } = useLocalization();
  const {
    authMethod,
    hasPasswordAuthenticated,
    isAuthenticated,
    isLocked,
    user,
  } = state;
  const [statuses, setStatuses] = useState<DiagnosticState>(() => createInitialStatuses());
  const [isRunning, setIsRunning] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);
  const [allPassed, setAllPassed] = useState(false);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  const updateStatus = useCallback(
    (key: DiagnosticKey, updates: Partial<DiagnosticStatus>) => {
      setStatuses(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          ...updates,
        },
      }));
    },
    [],
  );

  const blockRemaining = useCallback(
    (failedKey: DiagnosticKey) => {
      const blockedMessage = t('auth.postLoginDiagnostics.blocked');
      const startIndex = DIAGNOSTIC_ORDER.indexOf(failedKey);
      const remaining = DIAGNOSTIC_ORDER.slice(startIndex + 1);
      remaining.forEach(key => {
        updateStatus(key, { status: 'error', details: blockedMessage });
      });
    },
    [t, updateStatus],
  );

  const handleFailure = useCallback(
    (key: DiagnosticKey, message: string, context?: Array<[string, unknown]>) => {
      const contextDetails = formatContextDetails(context);
      const combinedMessage = `${message}${contextDetails}`;
      deviceLog.warn('postLoginDiagnostics.check.failed', {
        key,
        message,
        context,
      });
      updateStatus(key, { status: 'error', details: combinedMessage });
      blockRemaining(key);
      setOverallError(
        t('auth.postLoginDiagnostics.errorSubtitle', {
          replace: { message: combinedMessage },
        }),
      );
      setAllPassed(false);
      setIsRunning(false);
    },
    [blockRemaining, t, updateStatus],
  );

  const runChecks = useCallback(async () => {
    setStatuses(createInitialStatuses());
    setOverallError(null);
    setAllPassed(false);
    setIsRunning(true);

    const baseUrl = WORDPRESS_CONFIG.baseUrl;
    deviceLog.info('postLoginDiagnostics.runChecks.start', {
      baseUrl,
      userId: user?.id ?? null,
    });

    const discoveryUrl = `${baseUrl}/wp-json`;

    try {
      const response = await fetchWithTimeout(discoveryUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const responseHeaders = Array.from(response.headers.entries());
        handleFailure(
          'server',
          t('auth.postLoginDiagnostics.server.failure', {
            replace: { message: `HTTP ${response.status}` },
          }),
          [
            ['Request URL', discoveryUrl],
            ['Response status', response.status],
            ['Status text', response.statusText],
            ['Headers', responseHeaders],
          ],
        );
        return;
      }

      updateStatus(
        'server',
        {
          status: 'success',
          details: t('auth.postLoginDiagnostics.server.success', {
            replace: { status: response.status },
          }),
        },
      );
      deviceLog.info('postLoginDiagnostics.server.success', {
        status: response.status,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        handleFailure(
          'server',
          t('auth.postLoginDiagnostics.server.timeout'),
          [
            ['Request URL', discoveryUrl],
            ['Timeout (ms)', 10000],
          ],
        );
      } else {
        const message = error instanceof Error ? error.message : String(error);
        const context: Array<[string, unknown]> = [
          ['Request URL', discoveryUrl],
          ['Error name', error instanceof Error ? error.name : typeof error],
          ['Error message', message],
        ];
        if (error instanceof Error) {
          if ('cause' in error && error.cause) {
            context.push(['Error cause', error.cause]);
          }
          if (error.stack) {
            context.push(['Error stack', error.stack]);
          }
        }
        handleFailure(
          'server',
          t('auth.postLoginDiagnostics.server.failure', {
            replace: { message },
          }),
          context,
        );
      }
      return;
    }

    let token: string | null = null;
    let session: PersistedSession | null = null;
    try {
      deviceLog.info('postLoginDiagnostics.token.request', {
        userId: user?.id ?? null,
      });
      token = await getSessionToken();
      if (!token) {
        deviceLog.warn('postLoginDiagnostics.token.noneReceived');
        handleFailure(
          'token',
          t('auth.postLoginDiagnostics.token.missing'),
          [
            ['User ID', user?.id ?? null],
            ['User email', user?.email ?? null],
            ['Is authenticated', isAuthenticated],
            ['Is locked', isLocked],
            ['Auth method', authMethod ?? 'unknown'],
            ['Has password authenticated', hasPasswordAuthenticated],
          ],
        );
        return;
      }

      updateStatus(
        'token',
        {
          status: 'success',
          details: t('auth.postLoginDiagnostics.token.success', {
            replace: { preview: maskToken(token) },
          }),
        },
      );
      deviceLog.info('postLoginDiagnostics.token.success', {
        userId: user?.id ?? null,
      });
    } catch (error) {
      const context: Array<[string, unknown]> = [
        ['User ID', user?.id ?? null],
        ['User email', user?.email ?? null],
        ['Is authenticated', isAuthenticated],
        ['Is locked', isLocked],
        ['Auth method', authMethod ?? 'unknown'],
        ['Has password authenticated', hasPasswordAuthenticated],
        ['Error name', error instanceof Error ? error.name : typeof error],
      ];
      if (error instanceof Error) {
        if ('cause' in error && error.cause) {
          context.push(['Error cause', error.cause]);
        }
        if (error.stack) {
          context.push(['Error stack', error.stack]);
        }
      }
      handleFailure(
        'token',
        error instanceof Error ? error.message : String(error),
        context,
      );
      return;
    }

    try {
      session = await getPersistedSession();
    } catch (error) {
      deviceLog.warn('postLoginDiagnostics.session.fetchFailed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    const lifetimeContext: Array<[string, unknown]> = [
      ['Token preview', maskToken(token ?? '')],
      ['Token length', token?.length ?? 0],
      ['User ID', user?.id ?? null],
    ];

    if (session) {
      lifetimeContext.push([
        'Session tokenExpiresAt (raw)',
        session.tokenExpiresAt ?? null,
      ]);
    }

    let expiresAtSeconds: number | null = null;
    let expirySource: 'sessionExpiresAt' | 'sessionExpiresIn' | 'jwt' | null = null;
    let lifetimeSeconds: number | null = null;
    let issuedAt: number | null = null;

    if (session?.tokenExpiresAt) {
      const parsedExpiry = parseIsoToEpochSeconds(session.tokenExpiresAt);
      if (parsedExpiry != null) {
        expiresAtSeconds = parsedExpiry;
        expirySource = 'sessionExpiresAt';
      } else {
        lifetimeContext.push([
          'Session tokenExpiresAt parse result',
          'invalid',
        ]);
      }
    }

    const sessionWithMetadata = session as SessionWithExpiryMetadata | null;
    if (sessionWithMetadata) {
      const expiresInCandidates: Array<[string, unknown]> = [
        ['session.expires_in', sessionWithMetadata.expires_in],
        ['session.expiresIn', sessionWithMetadata.expiresIn],
        ['session.token_expires_in', sessionWithMetadata.token_expires_in],
        ['session.tokenExpiresIn', sessionWithMetadata.tokenExpiresIn],
      ];

      for (const [label, rawValue] of expiresInCandidates) {
        if (rawValue == null) {
          continue;
        }

        lifetimeContext.push([label, rawValue]);
        const parsed = parseExpiresInSeconds(rawValue);
        if (parsed != null) {
          lifetimeSeconds = parsed;
          if (expiresAtSeconds == null) {
            expiresAtSeconds = nowSeconds + parsed;
            expirySource = 'sessionExpiresIn';
          }
          break;
        }
      }
    }

    let payload: Record<string, unknown> | null = null;
    let payloadUsedForExpiry = false;

    if (!expiresAtSeconds) {
      payload = token ? decodeJwtPayload(token) : null;
      payloadUsedForExpiry = true;
    } else if (lifetimeSeconds == null) {
      payload = token ? decodeJwtPayload(token) : null;
    }

    if (!expiresAtSeconds && !payload) {
      handleFailure(
        'lifetime',
        t('auth.postLoginDiagnostics.lifetime.noExpiry'),
        [
          ...lifetimeContext,
          ['Session available', Boolean(session)],
        ],
      );
      return;
    }

    if (payload) {
      const expRaw = (payload.exp ?? payload.expiry) as unknown;
      const expValue = parseEpochSeconds(expRaw);

      const iatRaw = (payload.iat ?? payload.issued_at) as unknown;
      const issuedAtValue = parseEpochSeconds(iatRaw);

      if (expValue == null) {
        if (payloadUsedForExpiry) {
          handleFailure(
            'lifetime',
            t('auth.postLoginDiagnostics.lifetime.decodeError'),
            [
              ...lifetimeContext,
              ['exp raw value', expRaw ?? null],
              ['iat raw value', iatRaw ?? null],
            ],
          );
          return;
        }
      } else if (!expiresAtSeconds || payloadUsedForExpiry) {
        expiresAtSeconds = expValue;
        if (!expirySource) {
          expirySource = 'jwt';
        }
      }

      if (issuedAtValue != null) {
        issuedAt = issuedAtValue;
        if (!lifetimeSeconds && expValue != null) {
          lifetimeSeconds = expValue - issuedAtValue;
        }
      } else if (payloadUsedForExpiry) {
        deviceLog.warn('postLoginDiagnostics.lifetime.missingIat');
      }
    }

    if (!expiresAtSeconds) {
      handleFailure(
        'lifetime',
        t('auth.postLoginDiagnostics.lifetime.noExpiry'),
        lifetimeContext,
      );
      return;
    }

    const secondsUntilExpiry = expiresAtSeconds - nowSeconds;

    if (secondsUntilExpiry <= 0) {
      handleFailure(
        'lifetime',
        t('auth.postLoginDiagnostics.lifetime.expired', {
          replace: {
            relative: formatRelativeDuration(secondsUntilExpiry),
          },
        }),
        [
          ...lifetimeContext,
          ['Expiry source', expirySource ?? 'unknown'],
          ['Expires (epoch seconds)', expiresAtSeconds],
          ['Current time (epoch seconds)', nowSeconds],
          ['Seconds until expiry', secondsUntilExpiry],
        ],
      );
      return;
    }

    const comparisonLifetime = lifetimeSeconds ?? secondsUntilExpiry;
    const difference = Math.abs(
      comparisonLifetime - EXPECTED_TOKEN_LIFETIME_SECONDS,
    );

    if (lifetimeSeconds != null && difference > TOKEN_LIFETIME_TOLERANCE_SECONDS) {
      handleFailure(
        'lifetime',
        t('auth.postLoginDiagnostics.lifetime.mismatch', {
          replace: {
            expectedDays: (EXPECTED_TOKEN_LIFETIME_SECONDS / 86400).toFixed(0),
            actualDays: (comparisonLifetime / 86400).toFixed(2),
          },
        }),
        [
          ...lifetimeContext,
          ['Expiry source', expirySource ?? 'unknown'],
          ['Expected lifetime (seconds)', EXPECTED_TOKEN_LIFETIME_SECONDS],
          ['Actual lifetime (seconds)', comparisonLifetime],
          ['Issued at (epoch seconds)', issuedAt ?? 'unknown'],
          ['Expires (epoch seconds)', expiresAtSeconds],
        ],
      );
      return;
    }

    const expiresDate = new Date(expiresAtSeconds * 1000);
    let lifetimeMessage = t('auth.postLoginDiagnostics.lifetime.success', {
      replace: {
        relative: formatRelativeDuration(secondsUntilExpiry),
        date: expiresDate.toLocaleString(),
      },
    });

    const sourceMessageKey =
      expirySource === 'sessionExpiresIn'
        ? 'auth.postLoginDiagnostics.lifetime.metadataSource.expiresIn'
        : expirySource === 'sessionExpiresAt'
        ? 'auth.postLoginDiagnostics.lifetime.metadataSource.expiresAt'
        : expirySource === 'jwt'
        ? 'auth.postLoginDiagnostics.lifetime.metadataSource.jwt'
        : null;

    if (sourceMessageKey) {
      lifetimeMessage = `${lifetimeMessage} ${t(sourceMessageKey)}`.trim();
    }

    if (expirySource === 'jwt' && lifetimeSeconds == null) {
      lifetimeMessage = `${lifetimeMessage} ${t(
        'auth.postLoginDiagnostics.lifetime.missingIat',
      )}`.trim();
    }

    updateStatus('lifetime', {
      status: 'success',
      details: lifetimeMessage,
    });

    const profileUrl = `${baseUrl}${WORDPRESS_CONFIG.endpoints.profile}`;

    try {
      const requestInit = await buildWordPressRequestInit({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const response = await fetchWithTimeout(profileUrl, requestInit);
      if (!response.ok) {
        const responseHeaders = Array.from(response.headers.entries());
        handleFailure(
          'endpoint',
          t('auth.postLoginDiagnostics.endpoint.unauthorized', {
            replace: { status: response.status },
          }),
          [
            ['Request URL', profileUrl],
            ['Response status', response.status],
            ['Status text', response.statusText],
            ['Headers', responseHeaders],
          ],
        );
        return;
      }

      updateStatus(
        'endpoint',
        {
          status: 'success',
          details: t('auth.postLoginDiagnostics.endpoint.success', {
            replace: { status: response.status },
          }),
        },
      );
      deviceLog.info('postLoginDiagnostics.endpoint.success', {
        status: response.status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const context: Array<[string, unknown]> = [
        ['Request URL', profileUrl],
        ['Error name', error instanceof Error ? error.name : typeof error],
        ['Error message', message],
      ];
      if (error instanceof Error) {
        if ('cause' in error && error.cause) {
          context.push(['Error cause', error.cause]);
        }
        if (error.stack) {
          context.push(['Error stack', error.stack]);
        }
      }
      handleFailure(
        'endpoint',
        t('auth.postLoginDiagnostics.endpoint.failure', {
          replace: { message },
        }),
        context,
      );
      return;
    }

    setIsRunning(false);
    setAllPassed(true);
    deviceLog.success('postLoginDiagnostics.complete');
  }, [
    authMethod,
    getPersistedSession,
    getSessionToken,
    handleFailure,
    hasPasswordAuthenticated,
    isAuthenticated,
    isLocked,
    t,
    updateStatus,
    user?.email,
    user?.id,
  ]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  useEffect(() => {
    if (!allPassed) {
      return;
    }

    completionTimeoutRef.current = setTimeout(() => {
      onComplete();
    }, 900);

    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, [allPassed, onComplete]);

  const diagnosticItems = useMemo(
    () => [
      {
        key: 'server' as const,
        title: t('auth.postLoginDiagnostics.server.title'),
        description: t('auth.postLoginDiagnostics.server.description'),
      },
      {
        key: 'token' as const,
        title: t('auth.postLoginDiagnostics.token.title'),
        description: t('auth.postLoginDiagnostics.token.description'),
      },
      {
        key: 'lifetime' as const,
        title: t('auth.postLoginDiagnostics.lifetime.title'),
        description: t('auth.postLoginDiagnostics.lifetime.description'),
      },
      {
        key: 'endpoint' as const,
        title: t('auth.postLoginDiagnostics.endpoint.title'),
        description: t('auth.postLoginDiagnostics.endpoint.description'),
      },
    ],
    [t],
  );

  const renderStatusIcon = useCallback(
    (status: DiagnosticStatus['status']) => {
      if (status === 'success') {
        return <Text style={styles.statusEmoji}>✅</Text>;
      }
      if (status === 'error') {
        return <Text style={styles.statusEmoji}>❌</Text>;
      }
      return <ActivityIndicator size="small" color={COLORS.primary} />;
    },
    [],
  );

  const handleManualContinue = useCallback(() => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }
    onComplete();
  }, [onComplete]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('auth.postLoginDiagnostics.title')}</Text>
          <Text style={styles.subtitle}>
            {t('auth.postLoginDiagnostics.subtitle')}
          </Text>
          <View style={styles.divider} />
          <View style={styles.statusHeader}>
            <ActivityIndicator
              animating={isRunning}
              size="small"
              color={COLORS.primary}
            />
            <Text style={styles.statusHeaderText}>
              {isRunning
                ? t('auth.postLoginDiagnostics.running')
                : allPassed
                ? t('auth.postLoginDiagnostics.successTitle')
                : t('auth.postLoginDiagnostics.retry')}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          {diagnosticItems.map(item => {
            const status = statuses[item.key];
            return (
              <View key={item.key} style={styles.diagnosticRow}>
                <View style={styles.diagnosticRowHeader}>
                  {renderStatusIcon(status.status)}
                  <View style={styles.diagnosticTextContainer}>
                    <Text style={styles.diagnosticTitle}>{item.title}</Text>
                    <Text style={styles.diagnosticDescription}>
                      {item.description}
                    </Text>
                  </View>
                </View>
                {status.details ? (
                  <Text
                    style={[
                      styles.diagnosticDetails,
                      status.status === 'error' && styles.diagnosticDetailsError,
                      status.status === 'success' && styles.diagnosticDetailsSuccess,
                    ]}
                  >
                    {status.details}
                  </Text>
                ) : null}
                <View style={styles.rowDivider} />
              </View>
            );
          })}
        </View>

        {overallError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {t('auth.postLoginDiagnostics.errorTitle')}
            </Text>
            <Text style={styles.errorMessage}>{overallError}</Text>
          </View>
        ) : null}

        {allPassed ? (
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>
              {t('auth.postLoginDiagnostics.successTitle')}
            </Text>
            <Text style={styles.successMessage}>
              {t('auth.postLoginDiagnostics.successDescription')}
            </Text>
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          {allPassed ? (
            <>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleManualContinue}
              >
                <Text style={styles.primaryButtonText}>
                  {t('auth.postLoginDiagnostics.continue')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, isRunning && styles.buttonDisabled]}
                disabled={isRunning}
                onPress={runChecks}
              >
                <Text style={styles.secondaryButtonText}>
                  {isRunning
                    ? t('auth.postLoginDiagnostics.running')
                    : t('auth.postLoginDiagnostics.runAgain')}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryButton, isRunning && styles.buttonDisabled]}
                disabled={isRunning}
                onPress={runChecks}
              >
                <Text style={styles.primaryButtonText}>
                  {isRunning
                    ? t('auth.postLoginDiagnostics.running')
                    : t('auth.postLoginDiagnostics.retry')}
                </Text>
              </TouchableOpacity>
              {onSkip ? (
                <TouchableOpacity
                  style={[styles.secondaryButton, isRunning && styles.buttonDisabled]}
                  disabled={isRunning}
                  onPress={onSkip}
                >
                  <Text style={styles.secondaryButtonText}>
                    {t('auth.postLoginDiagnostics.skip')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 24,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.mutedBorder,
    marginVertical: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusHeaderText: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  diagnosticRow: {
    paddingVertical: 12,
  },
  diagnosticRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  diagnosticTextContainer: {
    flex: 1,
  },
  diagnosticTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  diagnosticDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  diagnosticDetails: {
    marginTop: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  diagnosticDetailsError: {
    color: COLORS.errorText,
  },
  diagnosticDetailsSuccess: {
    color: COLORS.successText,
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.mutedBorder,
    marginTop: 12,
  },
  statusEmoji: {
    fontSize: 24,
  },
  errorCard: {
    marginTop: 20,
    backgroundColor: COLORS.errorSurface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.errorText,
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 14,
    color: COLORS.errorText,
    lineHeight: 20,
  },
  successCard: {
    marginTop: 20,
    backgroundColor: COLORS.successSurface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  successTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.successText,
    marginBottom: 6,
  },
  successMessage: {
    fontSize: 14,
    color: COLORS.successText,
    lineHeight: 20,
  },
  buttonRow: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

