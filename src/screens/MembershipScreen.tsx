import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useStripe } from '@stripe/stripe-react-native';
import type { InitPaymentSheetParams } from '@stripe/stripe-react-native';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { STRIPE_CONFIG } from '../config/stripeConfig';
import {
  confirmMembershipUpgrade,
  createMembershipPaymentSession,
  fetchMembershipPlans,
  DEFAULT_MEMBERSHIP_PLANS,
  getMembershipPlanRequestId,
} from '../services/membershipService';
import { MembershipPlan } from '../types/auth';
import { COLORS } from '../config/theme';
import { BrandLogo } from '../components/BrandLogo';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import deviceLog from '../utils/deviceLog';

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

type PlanCardLayoutStyles = {
  card?: StyleProp<ViewStyle>;
  header?: StyleProp<ViewStyle>;
  name?: StyleProp<TextStyle>;
  price?: StyleProp<TextStyle>;
};

const PlanCard: React.FC<{
  plan: MembershipPlan;
  selected: boolean;
  onSelect: (planId: string) => void;
  locale: string;
  descriptionLabel: string;
  featureLabel: string;
  intervalLabel?: string;
  layoutStyles?: PlanCardLayoutStyles;
}> = ({
  plan,
  selected,
  onSelect,
  locale,
  descriptionLabel,
  featureLabel,
  intervalLabel,
  layoutStyles,
}) => {
  return (
    <Pressable
      onPress={() => onSelect(plan.id)}
      style={[
        styles.planCard,
        layoutStyles?.card,
        selected ? styles.planCardSelected : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${plan.name} ${selected ? 'selected' : ''}`.trim()}
    >
      <View style={[styles.planCardHeader, layoutStyles?.header]}>
        <Text style={[styles.planName, layoutStyles?.name]}>{plan.name}</Text>
        <Text style={[styles.planPrice, layoutStyles?.price]}>
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
  const { getSessionToken, refreshSession, state } = useAuthContext();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const layout = useResponsiveLayout();
  const numColumns = layout.isLargeTablet ? 3 : layout.isTablet ? 2 : 1;
  const responsiveStyles = useMemo(() => ({
    container: {
      paddingHorizontal: layout.contentPadding,
      paddingTop: layout.contentPadding,
      paddingBottom: Math.max(layout.contentPadding, 40),
      width: '100%',
      alignSelf: 'center' as const,
      maxWidth: layout.maxContentWidth,
    },
    brandWrapper: layout.isTablet ? { alignItems: 'center' as const } : {},
    header: layout.isTablet
      ? { alignItems: 'center' as const, gap: 12 }
      : {},
    title: layout.isTablet ? { fontSize: 28, textAlign: 'center' as const } : {},
    subtitle: layout.isTablet
      ? { textAlign: 'center' as const, fontSize: 16 }
      : {},
    backButton: layout.isTablet ? { alignSelf: 'center' as const } : {},
    loadingState: layout.width < 520 ? { alignItems: 'center' as const } : {},
    errorState: layout.width < 520 ? { alignItems: 'stretch' as const } : {},
    primaryButton:
      layout.width < 520
        ? { width: '100%' as const, alignSelf: 'stretch' as const }
        : layout.isTablet
        ? { alignSelf: 'center' as const, minWidth: 320 }
        : { alignSelf: 'stretch' as const },
    secondaryButton: layout.width < 520 ? { width: '100%' as const } : {},
  }), [layout]);
  const planCardLayoutStyles = useMemo(
    () => ({
      card: numColumns > 1 ? { flex: 1, minWidth: 0 } : undefined,
      header:
        layout.width < 520
          ? {
              flexDirection: 'column' as const,
              alignItems: 'flex-start' as const,
              gap: 8,
            }
          : { alignItems: 'center' as const },
      name: layout.width < 520 ? { fontSize: 16 } : {},
      price: layout.width < 520 ? { fontSize: 18 } : {},
    }),
    [layout.width, numColumns],
  );
  const planColumnStyle = useMemo<StyleProp<ViewStyle>>(
    () => (numColumns > 1 ? { gap: 16 } : undefined),
    [numColumns],
  );
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      deviceLog.info(`membership.${event}`, {
        selectedPlanId,
        ...payload,
      });
    },
    [selectedPlanId],
  );

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

  useEffect(() => {
    logEvent('screen.entered', {
      membershipTier: state.user?.membership?.tier ?? null,
    });
    return () => {
      logEvent('screen.exited');
    };
  }, [logEvent, state.user?.membership?.tier]);

  const applyPlans = useCallback((availablePlans: MembershipPlan[]) => {
    const normalizedPlans =
      availablePlans.length > 0 ? availablePlans : DEFAULT_MEMBERSHIP_PLANS;

    setPlans(normalizedPlans);
    setSelectedPlanId(
      normalizedPlans.find(plan => plan.highlight)?.id ??
        normalizedPlans[0]?.id ??
        null,
    );
    logEvent('plans.applied', { count: normalizedPlans.length });
  }, [logEvent]);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      setSelectedPlanId(planId);
      logEvent('plan.selected', { planId });
    },
    [logEvent],
  );

  const renderPlan = useCallback(
    ({ item }: { item: MembershipPlan }) => (
      <PlanCard
        plan={item}
        selected={item.id === selectedPlanId}
        onSelect={handleSelectPlan}
        locale={locale}
        descriptionLabel={t('membership.screen.planDescription')}
        featureLabel={t('membership.screen.planFeatures')}
        intervalLabel={
          item.interval
            ? intervalLabels[item.interval] ?? item.interval
            : undefined
        }
        layoutStyles={planCardLayoutStyles}
      />
    ),
    [
      handleSelectPlan,
      intervalLabels,
      locale,
      planCardLayoutStyles,
      selectedPlanId,
      t,
    ],
  );

  const renderSeparator = useCallback(
    () => <View style={styles.listSeparator} />,
    [],
  );

  const loadPlans = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      logEvent('plans.load.start');
      const token = await getSessionToken();
      const fetchedPlans = await fetchMembershipPlans(token ?? undefined);
      applyPlans(fetchedPlans);
      logEvent('plans.load.success', { count: fetchedPlans.length });
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : t('membership.screen.loadError');
      setError(message);
      applyPlans([]);
      logEvent('plans.load.error', { message });
    } finally {
      setLoading(false);
    }
  }, [applyPlans, getSessionToken, logEvent, t]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const handleCheckout = useCallback(async () => {
    if (!selectedPlan) {
      logEvent('checkout.missingPlan');
      return;
    }

    try {
      setProcessing(true);
      const requestPlanId = getMembershipPlanRequestId(selectedPlan);
      logEvent('checkout.start', {
        planId: selectedPlan.id,
        requestPlanId,
      });
      deviceLog.debug('membership.checkout.start', {
        planId: selectedPlan.id,
        requestPlanId,
        price: selectedPlan.price,
        currency: selectedPlan.currency,
      });
      const token = await getSessionToken();
      deviceLog.debug('membership.checkout.sessionToken', {
        planId: selectedPlan.id,
        requestPlanId,
        hasToken: Boolean(token),
      });
      const paymentSession = await createMembershipPaymentSession(
        requestPlanId,
        token ?? undefined,
      );

      const summarizeSecret = (value?: string | null) => ({
        present: Boolean(value),
        length: typeof value === 'string' ? value.length : null,
        suffix:
          typeof value === 'string' && value.length > 6
            ? value.slice(-6)
            : typeof value === 'string'
              ? value
              : null,
      });

      const customerIdValue =
        'customerId' in paymentSession ? paymentSession.customerId : null;
      const paymentIntentSecretValue =
        'paymentIntentClientSecret' in paymentSession
          ? paymentSession.paymentIntentClientSecret
          : null;
      const customerEphemeralKeySecretValue =
        'customerEphemeralKeySecret' in paymentSession
          ? paymentSession.customerEphemeralKeySecret
          : null;

      deviceLog.debug('membership.checkout.paymentSession.received', {
        planId: selectedPlan.id,
        requiresPayment: paymentSession.requiresPayment,
        customerIdSuffix:
          customerIdValue && customerIdValue.length > 6
            ? customerIdValue.slice(-6)
            : customerIdValue,
        paymentIntentIdSuffix:
          paymentSession.paymentIntentId &&
          paymentSession.paymentIntentId.length > 6
            ? paymentSession.paymentIntentId.slice(-6)
            : paymentSession.paymentIntentId ?? null,
        paymentIntentSecret: summarizeSecret(paymentIntentSecretValue),
        customerKey: summarizeSecret(customerEphemeralKeySecretValue),
      });

      // Guard against client/server Stripe account mismatches. If the backend
      // returns a publishable key, it must match the one configured in the app
      // or the PaymentSheet will fail to initialise with the provided client
      // secret.
      if (
        'publishableKey' in paymentSession &&
        typeof (paymentSession as any).publishableKey === 'string'
      ) {
        const serverKey = (paymentSession as any)
          .publishableKey as string | null;
        if (
          serverKey &&
          STRIPE_CONFIG.publishableKey &&
          serverKey.trim() !== STRIPE_CONFIG.publishableKey.trim()
        ) {
          deviceLog.warn('membership.checkout.publishableKey.mismatch', {
            planId: selectedPlan.id,
            serverKeySuffix:
              serverKey.length > 8 ? serverKey.slice(-8) : serverKey,
            clientKeySuffix:
              STRIPE_CONFIG.publishableKey.length > 8
                ? STRIPE_CONFIG.publishableKey.slice(-8)
                : STRIPE_CONFIG.publishableKey,
          });
        }
      }

      if (paymentSession.requiresPayment) {
        deviceLog.debug('membership.checkout.paymentSheet.init.start', {
          planId: selectedPlan.id,
          requestPlanId,
        });
        // Build init params carefully to avoid passing null values. The Stripe
        // SDK expects undefined for omitted fields; passing null can cause
        // native type errors and block the upgrade flow.
        const initParams: InitPaymentSheetParams = {
          paymentIntentClientSecret: paymentSession.paymentIntentClientSecret,
          merchantDisplayName: STRIPE_CONFIG.merchantDisplayName,
          allowsDelayedPaymentMethods: false,
        };

        if (
          typeof (paymentSession as any).customerId === 'string' &&
          (paymentSession as any).customerId
        ) {
          initParams.customerId = (paymentSession as any).customerId as string;
        }

        if (
          typeof (paymentSession as any).customerEphemeralKeySecret ===
            'string' &&
          (paymentSession as any).customerEphemeralKeySecret
        ) {
          initParams.customerEphemeralKeySecret = (
            paymentSession as any
          ).customerEphemeralKeySecret as string;
        }

        const initResult = await initPaymentSheet(initParams);

        deviceLog.debug('membership.checkout.paymentSheet.init.complete', {
          planId: selectedPlan.id,
          requestPlanId,
          success: !initResult.error,
          errorMessage: initResult.error?.message ?? null,
        });

        if (initResult.error) {
          throw new Error(initResult.error.message);
        }

        deviceLog.debug('membership.checkout.paymentSheet.present.start', {
          planId: selectedPlan.id,
          requestPlanId,
        });
        const presentResult = await presentPaymentSheet();
        deviceLog.debug('membership.checkout.paymentSheet.present.complete', {
          planId: selectedPlan.id,
          requestPlanId,
          success: !presentResult.error,
          errorMessage: presentResult.error?.message ?? null,
        });
        if (presentResult.error) {
          throw new Error(presentResult.error.message);
        }
      } else {
        deviceLog.debug('membership.checkout.paymentSession.freeUpgrade', {
          planId: selectedPlan.id,
          requestPlanId,
        });
      }

      try {
        deviceLog.debug('membership.checkout.confirmUpgrade.start', {
          planId: selectedPlan.id,
          requestPlanId,
          hasPaymentIntentId: Boolean(paymentSession.paymentIntentId),
        });
        await confirmMembershipUpgrade(
          requestPlanId,
          token ?? undefined,
          paymentSession.paymentIntentId ?? null,
        );
      } catch (confirmError) {
        deviceLog.warn('membership.checkout.confirmUpgrade.error', {
          planId: selectedPlan.id,
          requestPlanId,
          message:
            confirmError instanceof Error
              ? confirmError.message
              : String(confirmError),
        });
        logEvent('checkout.confirmationError', {
          message:
            confirmError instanceof Error
              ? confirmError.message
              : String(confirmError),
        });
      }

      await refreshSession();
      deviceLog.debug('membership.checkout.sessionRefreshed', {
        planId: selectedPlan.id,
        requestPlanId,
      });
      logEvent('checkout.success', {
        planId: selectedPlan.id,
        requestPlanId,
      });
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
      deviceLog.error('membership.checkout.error', {
        planId: selectedPlan?.id ?? null,
        message,
      });
      logEvent('checkout.error', { message });
    } finally {
      setProcessing(false);
      deviceLog.debug('membership.checkout.complete', {
        planId: selectedPlan?.id ?? null,
      });
    }
  }, [
    getSessionToken,
    logEvent,
    initPaymentSheet,
    onBack,
    presentPaymentSheet,
    refreshSession,
    selectedPlan,
    t,
  ]);

  const handleBackPress = useCallback(() => {
    logEvent('navigation.back');
    onBack?.();
  }, [logEvent, onBack]);

  const headerActionLabel = useMemo(() => t('membership.screen.back'), [t]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, responsiveStyles.container]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.brandWrapper, responsiveStyles.brandWrapper]}>
          <BrandLogo orientation="horizontal" />
        </View>
        <View style={[styles.header, responsiveStyles.header]}>
          <Pressable
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel={headerActionLabel}
            style={[styles.backButton, responsiveStyles.backButton]}
          >
            <Text style={styles.backButtonText}>{headerActionLabel}</Text>
          </Pressable>
          <Text style={[styles.title, responsiveStyles.title]}>
            {t('membership.screen.title')}
          </Text>
          <Text style={[styles.subtitle, responsiveStyles.subtitle]}>
            {t('membership.screen.subtitle')}
          </Text>
        </View>

        {loading ? (
          <View style={[styles.loadingState, responsiveStyles.loadingState]}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>
              {t('membership.screen.loading')}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View style={[styles.errorState, responsiveStyles.errorState]}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={[styles.secondaryButton, responsiveStyles.secondaryButton]}
              onPress={() => {
                logEvent('plans.retry');
                void loadPlans();
              }}
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
            numColumns={numColumns}
            columnWrapperStyle={planColumnStyle}
          />
        ) : null}

        <Pressable
          style={[
            styles.primaryButton,
            responsiveStyles.primaryButton,
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
  brandWrapper: {
    alignItems: 'center',
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
