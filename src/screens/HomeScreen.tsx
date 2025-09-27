import React, { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BenefitList } from '../components/BenefitList';
import { MembershipCard } from '../components/MembershipCard';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { MembershipBenefit } from '../types/auth';

export const getMaxDiscount = (benefits: MembershipBenefit[]): number | null => {
  if (!Array.isArray(benefits) || benefits.length === 0) {
    return null;
  }

  const values = benefits
    .map((benefit) => benefit.discountPercentage)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values.map((value) => Math.round(value * 100) / 100));
};

export const HomeScreen: React.FC = () => {
  const { state, logout } = useAuthContext();
  const user = state.user;
  const membership = state.membership ?? state.user?.membership ?? null;
  const { t, language } = useLocalization();
  const greeting = useMemo(
    () => t('home.title', { replace: { name: user?.name ? `, ${user.name}` : '' } }),
    [t, user?.name],
  );

  const expiryLabel = useMemo(() => {
    if (!membership) {
      return t('home.membership.noExpiry');
    }

    if (!membership.expiresAt) {
      return t('home.membership.noExpiry');
    }

    const parsedDate = new Date(membership.expiresAt);
    const locale = language === 'th' ? 'th-TH' : 'en-US';
    if (Number.isNaN(parsedDate.getTime())) {
      return t('home.membership.renewsOn', { replace: { date: membership.expiresAt } });
    }

    const formatted = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsedDate);
    const isExpired = parsedDate.getTime() < Date.now();
    const key = isExpired ? 'home.membership.expiredOn' : 'home.membership.renewsOn';
    return t(key, { replace: { date: formatted } });
  }, [language, membership, t]);

  const discountSummary = useMemo(() => {
    if (!membership) {
      return t('home.membership.discountSummaryDefault');
    }

    const maxDiscount = getMaxDiscount(membership.benefits);
    if (maxDiscount === null) {
      return t('home.membership.discountSummaryDefault');
    }

    return t('home.membership.discountSummary', { replace: { percent: maxDiscount } });
  }, [membership, t]);

  const quickActions = useMemo(
    () => [
      {
        key: 'vendors',
        label: t('home.quickActions.viewVendors'),
        message: t('home.quickActions.viewVendorsMessage'),
      },
      {
        key: 'upgrade',
        label: t('home.quickActions.upgradeOptions'),
        message: t('home.quickActions.upgradeOptionsMessage'),
      },
    ],
    [t],
  );

  const handleQuickAction = useCallback(
    (message: string) => {
      Alert.alert(t('home.quickActions.comingSoonTitle'), message);
    },
    [t],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.switcherWrapper}>
          <LanguageSwitcher />
        </View>
        <Text style={styles.title}>{greeting}</Text>
        {user?.email ? <Text style={styles.subtitle}>{user.email}</Text> : null}

        <MembershipCard
          membership={membership}
          heading={t('home.membership.heading')}
          tierLabel={t('home.membership.tierLabel')}
          renewalLabel={expiryLabel}
          discountSummary={discountSummary}
          emptyState={t('home.membership.empty')}
        />

        <BenefitList
          title={t('home.benefits.heading')}
          emptyLabel={t('home.benefits.empty')}
          benefits={membership?.benefits ?? []}
        />

        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>{t('home.quickActions.heading')}</Text>
          <View style={styles.quickActionsRow}>
            {quickActions.map((action) => (
              <Pressable
                key={action.key}
                onPress={() => handleQuickAction(action.message)}
                style={styles.quickActionButton}
                accessibilityRole="button"
              >
                <Text style={styles.quickActionLabel}>{action.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable onPress={logout} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('home.logout')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 20,
  },
  switcherWrapper: {
    alignSelf: 'flex-end',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignSelf: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 12,
  },
  quickActionsContainer: {
    gap: 12,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  quickActionButton: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5F5',
  },
  quickActionLabel: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
});
