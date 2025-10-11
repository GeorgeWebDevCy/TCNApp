import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../contexts/AuthContext';
import { COLORS } from '../config/theme';
import { MEMBERSHIP_CONFIG } from '../config/membershipConfig';
import { STRIPE_CONFIG } from '../config/stripeConfig';
import {
  createMembershipPaymentSession,
  fetchMembershipPlans,
} from '../services/membershipService';
import type { MembershipPlan } from '../types/auth';
import deviceLog from '../utils/deviceLog';
import { AUTH_STORAGE_KEYS } from '../config/authConfig';

type SessionSummary = {
  requiresPayment: boolean;
  paymentIntentIdSuffix: string | null;
  paymentIntentSecretPresent: boolean;
  paymentIntentSecretLength: number | null;
  paymentIntentSecretSuffix: string | null;
  customerIdSuffix: string | null;
  customerKeyPresent: boolean;
  customerKeyLength: number | null;
  customerKeySuffix: string | null;
  serverPublishableKeySuffix: string | null;
  publishableKeyMatchesClient: boolean | null;
};

const formatPrice = (plan: MembershipPlan): string => {
  const value = (plan.price ?? 0) / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: plan.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${plan.currency} ${value}`;
  }
};

const suffix = (value?: string | null, n = 8): string | null => {
  if (!value) return null;
  return value.length > n ? value.slice(-n) : value;
};

const summarizeSecret = (value?: string | null) => ({
  present: typeof value === 'string' && value.length > 0,
  length: typeof value === 'string' ? value.length : null,
  tail: suffix(value ?? null),
});

export const MembershipDebugScreen: React.FC<{ onBack?: () => void }> = ({
  onBack,
}) => {
  const { getSessionToken, refreshSession, state } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(
    null,
  );
  const [authStatus, setAuthStatus] = useState<{
    isAuthenticated: boolean;
    hasToken: boolean;
    tokenLength: number | null;
    tokenSuffix: string | null;
    hasCookie: boolean;
    cookieLength: number | null;
    cookieSuffix: string | null;
  } | null>(null);

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const envInfo = useMemo(
    () => ({
      baseUrl: MEMBERSHIP_CONFIG.baseUrl,
      endpoints: MEMBERSHIP_CONFIG.endpoints,
      publishableKeySuffix: suffix(STRIPE_CONFIG.publishableKey),
      merchantDisplayName: STRIPE_CONFIG.merchantDisplayName,
      urlScheme: STRIPE_CONFIG.urlScheme,
      membershipTier: state.user?.membership?.tier ?? null,
    }),
    [state.user?.membership?.tier],
  );

  const handleFetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSessionSummary(null);
    try {
      const token = await getSessionToken();

      if (!token) {
        const message =
          'No authentication token is available. Refresh the session after logging in to load plans.';
        setError(message);
        setPlans([]);
        setSelectedPlanId(null);
        deviceLog.warn('debug.membership.plans.missingToken');
        return;
      }

      const result = await fetchMembershipPlans(token);
      setPlans(result);
      setSelectedPlanId(result[0]?.id ?? null);
      deviceLog.info('debug.membership.plans.loaded', {
        count: result.length,
        ids: result.map(p => p.id),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      deviceLog.error('debug.membership.plans.error', { message });
    } finally {
      setLoading(false);
    }
  }, [getSessionToken]);

  const handlePreflightAuth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshSession();
      const token = await getSessionToken();
      const cookie = await AsyncStorage.getItem(
        AUTH_STORAGE_KEYS.wordpressCookies,
      );

      const status = {
        isAuthenticated: state.isAuthenticated,
        hasToken: Boolean(token),
        tokenLength: typeof token === 'string' ? token.length : null,
        tokenSuffix: typeof token === 'string' ? suffix(token) : null,
        hasCookie: Boolean(cookie && cookie.trim().length > 0),
        cookieLength: typeof cookie === 'string' ? cookie.length : null,
        cookieSuffix: typeof cookie === 'string' ? suffix(cookie) : null,
      };
      setAuthStatus(status);
      deviceLog.info('debug.membership.preflight', status as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      deviceLog.error('debug.membership.preflight.error', { message });
    } finally {
      setLoading(false);
    }
  }, [getSessionToken, refreshSession, state.isAuthenticated]);

  const handleCreateSession = useCallback(async () => {
    if (!selectedPlan) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();

      if (!token) {
        const message =
          'Cannot create a payment session without an authentication token. Refresh the session after logging in.';
        setError(message);
        deviceLog.warn('debug.membership.session.missingToken');
        return;
      }

      const session = await createMembershipPaymentSession(
        selectedPlan.id,
        token,
      );

      const piSecret =
        'paymentIntentClientSecret' in session
          ? session.paymentIntentClientSecret
          : null;
      const customerKey =
        'customerEphemeralKeySecret' in session
          ? session.customerEphemeralKeySecret
          : null;
      const serverPublishableKey = 'publishableKey' in session ? session.publishableKey ?? null : null;
      const summary: SessionSummary = {
        requiresPayment: session.requiresPayment,
        paymentIntentIdSuffix: suffix(session.paymentIntentId ?? null),
        paymentIntentSecretPresent: summarizeSecret(piSecret).present,
        paymentIntentSecretLength: summarizeSecret(piSecret).length,
        paymentIntentSecretSuffix: summarizeSecret(piSecret).tail,
        customerIdSuffix: suffix('customerId' in session ? session.customerId ?? null : null),
        customerKeyPresent: summarizeSecret(customerKey).present,
        customerKeyLength: summarizeSecret(customerKey).length,
        customerKeySuffix: summarizeSecret(customerKey).tail,
        serverPublishableKeySuffix: suffix(serverPublishableKey),
        publishableKeyMatchesClient:
          serverPublishableKey && STRIPE_CONFIG.publishableKey
            ? serverPublishableKey.trim() === STRIPE_CONFIG.publishableKey.trim()
            : null,
      };

      setSessionSummary(summary);
      deviceLog.info('debug.membership.session.created', summary as any);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setSessionSummary(null);
      deviceLog.error('debug.membership.session.error', { message });
    } finally {
      setLoading(false);
    }
  }, [getSessionToken, selectedPlan]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Membership Debug</Text>
        <Text style={styles.subtitle}>
          Safe diagnostics: does not present PaymentSheet or confirm upgrades.
        </Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <Text style={styles.kv}><Text style={styles.k}>Base URL:</Text> {envInfo.baseUrl}</Text>
          <Text style={styles.kv}><Text style={styles.k}>Plans endpoint:</Text> {envInfo.endpoints.plans}</Text>
          <Text style={styles.kv}><Text style={styles.k}>Session endpoint:</Text> {envInfo.endpoints.createPaymentSession}</Text>
          <Text style={styles.kv}><Text style={styles.k}>Confirm endpoint:</Text> {envInfo.endpoints.confirm}</Text>
          <Text style={styles.kv}><Text style={styles.k}>App publishable key:</Text> …{envInfo.publishableKeySuffix ?? 'none'}</Text>
          <Text style={styles.kv}><Text style={styles.k}>Merchant:</Text> {envInfo.merchantDisplayName}</Text>
          <Text style={styles.kv}><Text style={styles.k}>URL Scheme:</Text> {envInfo.urlScheme}</Text>
          <Text style={styles.kv}><Text style={styles.k}>User tier:</Text> {envInfo.membershipTier ?? 'n/a'}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Auth Status</Text>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => void handlePreflightAuth()}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.infoText} />
            ) : (
              <Text style={styles.secondaryText}>Refresh Session</Text>
            )}
          </Pressable>

          {authStatus ? (
            <View style={styles.sessionBlock}>
              <Text style={styles.kv}><Text style={styles.k}>Authenticated:</Text> {String(authStatus.isAuthenticated)}</Text>
              <Text style={styles.kv}><Text style={styles.k}>Token:</Text> {authStatus.hasToken ? `yes (${authStatus.tokenLength}) …${authStatus.tokenSuffix}` : 'no'}</Text>
              <Text style={styles.kv}><Text style={styles.k}>Cookie:</Text> {authStatus.hasCookie ? `yes (${authStatus.cookieLength}) …${authStatus.cookieSuffix}` : 'no'}</Text>
            </View>
          ) : (
            <Text style={styles.dim}>No preflight run yet</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Plans</Text>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={() => void handleFetchPlans()}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.infoText} />
            ) : (
              <Text style={styles.secondaryText}>Refresh Plans</Text>
            )}
          </Pressable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {plans.length > 0 ? (
            <View style={styles.planList}>
              {plans.map(plan => (
                <Pressable
                  key={plan.id}
                  style={[
                    styles.planRow,
                    selectedPlanId === plan.id && styles.planRowSelected,
                  ]}
                  onPress={() => setSelectedPlanId(plan.id)}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{plan.name}</Text>
                    <Text style={styles.planMeta}>
                      {plan.id} • {formatPrice(plan)}{plan.interval ? ` / ${plan.interval}` : ''}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.planSelect}>
                      {selectedPlanId === plan.id ? 'Selected' : 'Select'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.dim}>No plans loaded</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment Session</Text>
          <Pressable
            style={[styles.button, !selectedPlan && styles.buttonDisabled]}
            disabled={!selectedPlan || loading}
            onPress={() => void handleCreateSession()}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.buttonText}>
                {selectedPlan ? `Create Session for ${selectedPlan.name}` : 'Select a plan'}
              </Text>
            )}
          </Pressable>

          {sessionSummary ? (
            <View style={styles.sessionBlock}>
              <Text style={styles.kv}><Text style={styles.k}>Requires payment:</Text> {String(sessionSummary.requiresPayment)}</Text>
              <Text style={styles.kv}><Text style={styles.k}>PI id:</Text> …{sessionSummary.paymentIntentIdSuffix ?? 'null'}</Text>
              <Text style={styles.kv}><Text style={styles.k}>PI secret:</Text> {sessionSummary.paymentIntentSecretPresent ? `yes (${sessionSummary.paymentIntentSecretLength})` : 'no'} {sessionSummary.paymentIntentSecretSuffix ? `…${sessionSummary.paymentIntentSecretSuffix}` : ''}</Text>
              <Text style={styles.kv}><Text style={styles.k}>Customer:</Text> …{sessionSummary.customerIdSuffix ?? 'null'}</Text>
              <Text style={styles.kv}><Text style={styles.k}>Customer key:</Text> {sessionSummary.customerKeyPresent ? `yes (${sessionSummary.customerKeyLength})` : 'no'} {sessionSummary.customerKeySuffix ? `…${sessionSummary.customerKeySuffix}` : ''}</Text>
              <Text style={styles.kv}><Text style={styles.k}>Server publishable key:</Text> …{sessionSummary.serverPublishableKeySuffix ?? 'none'}</Text>
              <Text style={[styles.kv, sessionSummary.publishableKeyMatchesClient === false ? styles.warn : undefined]}>
                <Text style={styles.k}>Client/server key match:</Text> {
                  sessionSummary.publishableKeyMatchesClient === null
                    ? 'unknown'
                    : sessionSummary.publishableKeyMatchesClient
                    ? 'match'
                    : 'MISMATCH'
                }
              </Text>
            </View>
          ) : (
            <Text style={styles.dim}>No session created</Text>
          )}
        </View>

        <View style={styles.footerActions}>
          <Pressable
            style={[styles.button, styles.secondary]}
            onPress={onBack}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.surface },
  container: { padding: 20, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  subtitle: { color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontWeight: '700', color: COLORS.textPrimary },
  kv: { color: COLORS.textSecondary },
  k: { color: COLORS.textPrimary, fontWeight: '600' },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: COLORS.textOnPrimary, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  secondary: { backgroundColor: COLORS.infoBackground },
  secondaryText: { color: COLORS.infoText, fontWeight: '600' },
  error: { color: COLORS.errorText },
  warn: { color: COLORS.warningText },
  dim: { color: COLORS.infoText },
  planList: { gap: 8 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
  },
  planRowSelected: { backgroundColor: COLORS.infoBackground, borderColor: COLORS.primary },
  planName: { color: COLORS.textPrimary, fontWeight: '600' },
  planMeta: { color: COLORS.textSecondary },
  planSelect: { color: COLORS.infoText },
  sessionBlock: { gap: 6 },
  footerActions: { alignItems: 'center' },
});
