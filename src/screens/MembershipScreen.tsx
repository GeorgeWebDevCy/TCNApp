import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { STRIPE_CONFIG } from '../config/stripeConfig';
import {
  confirmMembershipUpgrade,
  createMembershipPaymentSession,
  fetchMembershipPlans,
  DEFAULT_MEMBERSHIP_PLANS,
} from '../services/membershipService';
import { MembershipPlan } from '../types/auth';
import { COLORS } from '../config/theme';

type MembershipScreenProps = {
  onBack?: () => void;
};

const formatPlanPrice = (
  plan: MembershipPlan,
  locale: string,
  intervalLabel?: string,
) => {
  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: plan.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });

    const price = formatter.format(plan.price / 100);
    if (!plan.interval) {
      return price;
    }

    return `${price} / ${intervalLabel ?? plan.interval}`;
  } catch (error) {
    return `${plan.currency} ${plan.price / 100}`;
  }
};

const PlanCard: React.FC<{
  plan: MembershipPlan;
  selected: boolean;
  onSelect: (planId: string) => void;
  locale: string;
  descriptionLabel: string;
  featureLabel: string;
  intervalLabel?: string;
}> = ({
  plan,
  selected,
  onSelect,
  locale,
  descriptionLabel,
  featureLabel,
  intervalLabel,
}) => {
  return (
    <Pressable
      onPress={() => onSelect(plan.id)}
      style={[styles.planCard, selected ? styles.planCardSelected : null]}
      accessibilityRole="button"
      accessibilityLabel={`${plan.name} ${selected ? 'selected' : ''}`.trim()}
    >
      <View style={styles.planCardHeader}>
        <Text style={styles.planName}>{plan.name}</Text>
        <Text style={styles.planPrice}>
          {formatPlanPrice(plan, locale, intervalLabel)}
        </Text>
      </View>
      {plan.description ? (
        <Text style={styles.planDescription}>
          {descriptionLabel}: {plan.description}
        </Text>
      ) : null}
      {Array.isArray(plan.features) && plan.features.length > 0 ? (
        <View style={styles.planFeatureList}>
          <Text style={styles.planFeatureHeading}>{featureLabel}</Text>
          {plan.features.map(feature => (
            <Text key={feature} style={styles.planFeatureItem}>
              • {feature}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
};

export const MembershipScreen: React.FC<MembershipScreenProps> = ({
  onBack,
}) => {
  const { t, language } = useLocalization();
  const { getSessionToken, refreshSession } = useAuthContext();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const intervalLabels = useMemo(
    () => ({
      day: t('membership.screen.intervals.day'),
      week: t('membership.screen.intervals.week'),
      month: t('membership.screen.intervals.month'),
      year: t('membership.screen.intervals.year'),
    }),
    [t],
  );

  const selectedPlan = useMemo(
    () => plans.find(plan => plan.id === selectedPlanId) ?? null,
    [plans, selectedPlanId],
  );

  const applyPlans = useCallback((availablePlans: MembershipPlan[]) => {
    const normalizedPlans =
      availablePlans.length > 0 ? availablePlans : DEFAULT_MEMBERSHIP_PLANS;

    setPlans(normalizedPlans);
    setSelectedPlanId(
      normalizedPlans.find(plan => plan.highlight)?.id ??
        normalizedPlans[0]?.id ??
        null,
    );
  }, []);

  const renderPlan = useCallback(
    ({ item }: { item: MembershipPlan }) => (
      <PlanCard
        plan={item}
        selected={item.id === selectedPlanId}
        onSelect={setSelectedPlanId}
        locale={locale}
        descriptionLabel={t('membership.screen.planDescription')}
        featureLabel={t('membership.screen.planFeatures')}
        intervalLabel={
          item.interval
            ? intervalLabels[item.interval] ?? item.interval
            : undefined
        }
      />
    ),
    [intervalLabels, locale, selectedPlanId, t],
  );

  const renderSeparator = useCallback(
    () => <View style={styles.listSeparator} />,
    [],
  );

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getSessionToken();
      const fetchedPlans = await fetchMembershipPlans(token ?? undefined);
      applyPlans(fetchedPlans);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : t('membership.screen.loadError');
      setError(message);
      applyPlans([]);
    } finally {
      setLoading(false);
    }
  }, [applyPlans, getSessionToken, t]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleCheckout = useCallback(async () => {
    if (!selectedPlan) {
      return;
    }

    try {
      setProcessing(true);
      const token = await getSessionToken();
      const paymentSession = await createMembershipPaymentSession(
        selectedPlan.id,
        token ?? undefined,
      );

      const initResult = await initPaymentSheet({
        paymentIntentClientSecret: paymentSession.paymentIntentClientSecret,
        customerEphemeralKeySecret: paymentSession.customerEphemeralKeySecret,
        customerId: paymentSession.customerId,
        merchantDisplayName: STRIPE_CONFIG.merchantDisplayName,
        allowsDelayedPaymentMethods: false,
      });

      if (initResult.error) {
        throw new Error(initResult.error.message);
      }

      const presentResult = await presentPaymentSheet();
      if (presentResult.error) {
        throw new Error(presentResult.error.message);
      }

      try {
        await confirmMembershipUpgrade(selectedPlan.id, token ?? undefined);
      } catch (confirmError) {
        console.warn('Membership confirmation failed', confirmError);
      }

      await refreshSession();
      Alert.alert(
        t('membership.screen.successTitle'),
        t('membership.screen.successMessage'),
        [
          {
            text: t('membership.screen.successAction'),
            onPress: onBack,
          },
        ],
      );
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error
          ? checkoutError.message
          : t('membership.screen.checkoutError');
      Alert.alert(t('membership.screen.checkoutErrorTitle'), message);
    } finally {
      setProcessing(false);
    }
  }, [
    getSessionToken,
    initPaymentSheet,
    onBack,
    presentPaymentSheet,
    refreshSession,
    selectedPlan,
    t,
  ]);

  const headerActionLabel = useMemo(() => t('membership.screen.back'), [t]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={headerActionLabel}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>{headerActionLabel}</Text>
          </Pressable>
          <Text style={styles.title}>{t('membership.screen.title')}</Text>
          <Text style={styles.subtitle}>{t('membership.screen.subtitle')}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>
              {t('membership.screen.loading')}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorState}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={loadPlans}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {t('membership.screen.retry')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!loading && !error && plans.length === 0 ? (
          <Text style={styles.emptyState}>{t('membership.screen.empty')}</Text>
        ) : null}

        {!loading && plans.length > 0 ? (
          <FlatList
            data={plans}
            keyExtractor={plan => plan.id}
            renderItem={renderPlan}
            ItemSeparatorComponent={renderSeparator}
            scrollEnabled={false}
          />
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            (!selectedPlan || processing) && styles.buttonDisabled,
          ]}
          disabled={!selectedPlan || processing}
          onPress={handleCheckout}
          accessibilityRole="button"
        >
          {processing ? (
            <ActivityIndicator color={COLORS.textOnPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {selectedPlan
                ? t('membership.screen.checkoutCta', {
                    replace: { plan: selectedPlan.name },
                  })
                : t('membership.screen.selectPlan')}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  container: {
    padding: 24,
    paddingBottom: 40,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: COLORS.infoBackground,
  },
  backButtonText: {
    color: COLORS.infoText,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.infoText,
  },
  loadingState: {
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.infoText,
  },
  errorState: {
    backgroundColor: COLORS.errorBackground,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  errorText: {
    color: COLORS.errorText,
  },
  emptyState: {
    fontSize: 16,
    color: COLORS.infoText,
  },
  planCard: {
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    borderRadius: 16,
    padding: 20,
    backgroundColor: COLORS.background,
    gap: 12,
  },
  planCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.infoBackground,
    shadowColor: COLORS.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  planPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.infoText,
  },
  planDescription: {
    color: COLORS.textSecondary,
  },
  planFeatureList: {
    gap: 6,
  },
  planFeatureHeading: {
    fontWeight: '600',
    color: COLORS.infoText,
  },
  planFeatureItem: {
    color: COLORS.textSecondary,
  },
  listSeparator: {
    height: 16,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.infoBackground,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.infoText,
    fontWeight: '600',
  },
});
