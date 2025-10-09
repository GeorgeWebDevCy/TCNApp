import React, { useCallback, useEffect, useMemo } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BenefitList } from '../components/BenefitList';
import { MembershipCard } from '../components/MembershipCard';
import { BrandLogo } from '../components/BrandLogo';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useTransactionContext } from '../contexts/TransactionContext';
import { useOneSignalNotifications } from '../notifications/OneSignalProvider';
import { MembershipBenefit } from '../types/auth';
import { COLORS } from '../config/theme';
import {
  getUserDisplayName,
  getUserFullName,
  getUserInitials,
} from '../utils/user';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

export const getMaxDiscount = (
  benefits: MembershipBenefit[],
): number | null => {
  if (!Array.isArray(benefits) || benefits.length === 0) {
    return null;
  }

  const values = benefits
    .map(benefit => benefit.discountPercentage)
    .filter(
      (value): value is number =>
        typeof value === 'number' && Number.isFinite(value),
    );

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values.map(value => Math.round(value * 100) / 100));
};

type QuickAction = {
  key: 'vendors' | 'upgrade' | 'analytics' | 'admin';
  label: string;
  message: string;
};

type HomeScreenProps = {
  onManageProfile?: () => void;
  onUpgradeMembership?: () => void;
  onViewAnalytics?: () => void;
  onOpenAdminConsole?: () => void;
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onManageProfile,
  onUpgradeMembership,
  onViewAnalytics,
  onOpenAdminConsole,
}) => {
  const { state, logout } = useAuthContext();
  const user = state.user;
  const membership = state.membership ?? state.user?.membership ?? null;
  const { t, language } = useLocalization();
  const { transactions } = useTransactionContext();
  const {
    preferences,
    updatePreference,
    activeNotification,
    activeNotificationOrigin,
    clearActiveNotification,
    pendingNavigationTarget,
    consumeNavigationTarget,
  } = useOneSignalNotifications();
  const fullName = useMemo(() => getUserFullName(user), [user]);
  const displayName = useMemo(() => getUserDisplayName(user), [user]);
  const greeting = useMemo(() => {
    const name = fullName ?? displayName;
    return t('home.title', {
      replace: { name: name ? `, ${name}` : '' },
    });
  }, [displayName, fullName, t]);

  const roleLabel = useMemo(() => {
    const normalized = (user?.accountType ?? '').toLowerCase();
    const fallback = t('home.roleBadge.default', {
      replace: { type: user?.accountType ?? t('home.roleBadge.member') },
    });
    if (!normalized) {
      return fallback;
    }

    const key = `home.roleBadge.${normalized}`;
    const label = t(key, {
      defaultValue: fallback,
      replace: { type: user?.accountType ?? fallback },
    });
    return label || fallback;
  }, [t, user?.accountType]);

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
      return t('home.membership.renewsOn', {
        replace: { date: membership.expiresAt },
      });
    }

    const formatted = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
    }).format(parsedDate);
    const isExpired = parsedDate.getTime() < Date.now();
    const key = isExpired
      ? 'home.membership.expiredOn'
      : 'home.membership.renewsOn';
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

    return t('home.membership.discountSummary', {
      replace: { percent: maxDiscount },
    });
  }, [membership, t]);

  const normalizedAccountType = (user?.accountType ?? '').toLowerCase();
  const isAdminAccount =
    normalizedAccountType === 'admin' || normalizedAccountType === 'staff';

  const quickActions: QuickAction[] = useMemo(() => {
    const actions: QuickAction[] = [
      {
        key: 'vendors',
        label: t('home.quickActions.viewVendors'),
        message: t('home.quickActions.viewVendorsMessage'),
      },
      {
        key: 'analytics',
        label: t('home.quickActions.viewAnalytics'),
        message: t('home.quickActions.viewAnalyticsMessage'),
      },
      {
        key: 'upgrade',
        label: t('home.quickActions.upgradeOptions'),
        message: t('home.quickActions.upgradeOptionsMessage'),
      },
    ];

    if (isAdminAccount && onOpenAdminConsole) {
      actions.unshift({
        key: 'admin',
        label: t('home.quickActions.openAdminConsole'),
        message: t('home.quickActions.openAdminConsoleMessage'),
      });
    }

    return actions;
  }, [isAdminAccount, onOpenAdminConsole, t]);

  const layout = useResponsiveLayout();
  const responsiveStyles = useMemo(() => {
    const stackProfile = layout.width < 640;
    const stackNotificationActions = layout.width < 420;
    const stackQuickActions = layout.width < 520;
    const avatarSize = layout.isTablet ? 80 : layout.isSmallPhone ? 56 : 64;

    return {
      container: {
        paddingHorizontal: layout.contentPadding,
        paddingVertical: layout.contentPadding,
        width: '100%',
        alignSelf: 'center' as const,
        maxWidth: layout.maxContentWidth,
      },
      switcherWrapper: stackProfile
        ? { alignSelf: 'stretch', alignItems: 'flex-end' as const }
        : {},
      brandHeader: layout.isTablet ? { alignItems: 'center' as const } : {},
      profileHeader: {
        flexDirection: stackProfile ? ('column' as const) : ('row' as const),
        alignItems: stackProfile ? ('flex-start' as const) : ('center' as const),
        gap: stackProfile ? 12 : 16,
      },
      avatar: {
        width: avatarSize,
        height: avatarSize,
        borderRadius: avatarSize / 2,
      },
      profileDetails: stackProfile ? { alignSelf: 'stretch' as const } : {},
      title: {
        fontSize: layout.isTablet ? 28 : layout.isSmallPhone ? 22 : 24,
      },
      subtitle: layout.isTablet ? { fontSize: 18 } : {},
      notificationBanner: stackNotificationActions ? { gap: 16, padding: 20 } : {},
      notificationBannerActions: stackNotificationActions
        ? {
            flexDirection: 'column' as const,
            alignItems: 'stretch' as const,
            gap: 8,
          }
        : {},
      notificationAction: stackNotificationActions
        ? { alignItems: 'center' as const }
        : {},
      notificationSettings: {
        padding: layout.isSmallPhone ? 16 : layout.isLargeTablet ? 24 : 20,
      },
      manageProfileButton: stackProfile
        ? { alignSelf: 'stretch' as const }
        : {},
      button:
        layout.width < 520
          ? { alignSelf: 'stretch' as const, width: '100%' as const }
          : { alignSelf: 'center' as const },
      sectionTitle: layout.isTablet ? { fontSize: 20 } : {},
      quickActionsContainer: layout.isTablet ? { gap: 16 } : {},
      quickActionsRow: stackQuickActions
        ? { flexDirection: 'column' as const, gap: 12 }
        : {},
      quickActionButton: stackQuickActions
        ? {
            width: '100%' as const,
            alignItems: 'center' as const,
          }
        : {
            minWidth: 140,
          },
      quickActionLabel: stackQuickActions ? { textAlign: 'center' as const } : {},
      transactionsCard: layout.isTablet ? { gap: 16 } : {},
    };
  }, [layout]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.key === 'upgrade') {
        if (onUpgradeMembership) {
          onUpgradeMembership();
          return;
        }
      } else if (action.key === 'admin') {
        if (onOpenAdminConsole) {
          onOpenAdminConsole();
          return;
        }
      } else if (action.key === 'analytics') {
        if (onViewAnalytics) {
          onViewAnalytics();
          return;
        }
      }

      Alert.alert(t('home.quickActions.comingSoonTitle'), action.message);
    },
    [onOpenAdminConsole, onUpgradeMembership, onViewAnalytics, t],
  );

  const recentTransactions = useMemo(
    () => transactions.slice(0, 3),
    [transactions],
  );

  const formatTransactionAmount = useCallback((value?: number | null) => {
    if (!Number.isFinite(value ?? Number.NaN)) {
      return '0.00';
    }
    return Number(value ?? 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const notificationTitle = useMemo(() => {
    if (!activeNotification) {
      return null;
    }

    if (activeNotification.category === 'promotion') {
      return t('home.notifications.promotionTitle');
    }

    if (activeNotification.category === 'renewal') {
      return t('home.notifications.renewalTitle');
    }

    return t('home.notifications.genericTitle');
  }, [activeNotification, t]);

  const handleNotificationNavigate = useCallback(() => {
    if (!activeNotification) {
      return;
    }

    if (activeNotification.target === 'vendors') {
      handleQuickAction({
        key: 'vendors',
        label: t('home.quickActions.viewVendors'),
        message: t('home.notifications.vendorNavigationMessage'),
      });
    } else if (activeNotification.target === 'membership') {
      if (onUpgradeMembership) {
        onUpgradeMembership();
      } else {
        Alert.alert(
          t('home.notifications.membershipNavigationTitle'),
          t('home.notifications.membershipNavigationMessage'),
        );
      }
    }

    clearActiveNotification();
  }, [
    activeNotification,
    clearActiveNotification,
    handleQuickAction,
    onUpgradeMembership,
    t,
  ]);

  const handleNotificationDismiss = useCallback(() => {
    clearActiveNotification();
  }, [clearActiveNotification]);

  useEffect(() => {
    if (!pendingNavigationTarget) {
      return;
    }

    if (pendingNavigationTarget === 'vendors') {
      handleQuickAction({
        key: 'vendors',
        label: t('home.quickActions.viewVendors'),
        message: t('home.notifications.vendorNavigationMessage'),
      });
    } else if (pendingNavigationTarget === 'membership') {
      if (onUpgradeMembership) {
        onUpgradeMembership();
      } else {
        Alert.alert(
          t('home.notifications.membershipNavigationTitle'),
          t('home.notifications.membershipNavigationMessage'),
        );
      }
    }

    consumeNavigationTarget();
    clearActiveNotification();
  }, [
    clearActiveNotification,
    consumeNavigationTarget,
    handleQuickAction,
    pendingNavigationTarget,
    onUpgradeMembership,
    t,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, responsiveStyles.container]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.switcherWrapper, responsiveStyles.switcherWrapper]}>
          <LanguageSwitcher />
        </View>
        <View style={[styles.brandHeader, responsiveStyles.brandHeader]}>
          <BrandLogo orientation={layout.isTablet ? 'horizontal' : 'vertical'} />
        </View>
        <View style={[styles.profileHeader, responsiveStyles.profileHeader]}>
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={[styles.avatar, responsiveStyles.avatar]}
            />
          ) : displayName ? (
            <View style={[styles.avatarFallback, responsiveStyles.avatar]}>
              <Text style={styles.avatarInitials}>{getUserInitials(user)}</Text>
            </View>
          ) : null}
          <View style={[styles.profileDetails, responsiveStyles.profileDetails]}>
            <Text style={[styles.title, responsiveStyles.title]}>{greeting}</Text>
            {user?.email ? (
              <Text style={[styles.subtitle, responsiveStyles.subtitle]}>
                {user.email}
              </Text>
            ) : null}
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
            {membership ? (
              <View style={styles.planSummary}>
                <Text style={styles.planLabel}>
                  {t('home.planSummary', {
                    replace: { plan: membership.tier },
                  })}
                </Text>
                {expiryLabel ? (
                  <Text style={styles.planMeta}>{expiryLabel}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {onManageProfile ? (
          <Pressable
            onPress={onManageProfile}
            style={[styles.manageProfileButton, responsiveStyles.manageProfileButton]}
            accessibilityRole="button"
          >
            <Text style={styles.manageProfileButtonText}>
              {t('home.manageProfile')}
            </Text>
          </Pressable>
        ) : null}

        {activeNotification ? (
          <View
            style={[
              styles.notificationBanner,
              responsiveStyles.notificationBanner,
              activeNotification.category === 'promotion'
                ? styles.notificationBannerPromotion
                : styles.notificationBannerReminder,
            ]}
          >
            <View style={styles.notificationBannerContent}>
              {notificationTitle ? (
                <Text style={styles.notificationBannerTitle}>
                  {notificationTitle}
                </Text>
              ) : null}
              <Text style={styles.notificationBannerBody}>
                {activeNotification.body}
              </Text>
              {activeNotificationOrigin === 'background' ? (
                <Text style={styles.notificationBannerHint}>
                  {t('home.notifications.backgroundHint')}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.notificationBannerActions,
                responsiveStyles.notificationBannerActions,
              ]}
            >
              {activeNotification.target ? (
                <Pressable
                  onPress={handleNotificationNavigate}
                  style={[
                    styles.notificationAction,
                    styles.notificationActionPrimary,
                    responsiveStyles.notificationAction,
                  ]}
                  accessibilityRole="button"
                >
                  <Text style={styles.notificationActionText}>
                    {t('home.notifications.viewDetails')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={handleNotificationDismiss}
                style={[
                  styles.notificationAction,
                  styles.notificationActionSecondary,
                  responsiveStyles.notificationAction,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.notificationActionDismiss}>
                  {t('home.notifications.dismiss')}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

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

        <View style={[styles.notificationSettings, responsiveStyles.notificationSettings]}>
          <Text style={[styles.sectionTitle, responsiveStyles.sectionTitle]}>
            {t('home.notifications.heading')}
          </Text>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>
                {t('home.notifications.marketingTitle')}
              </Text>
              <Text style={styles.preferenceDescription}>
                {t('home.notifications.marketingDescription')}
              </Text>
            </View>
            <Switch
              value={preferences.marketing}
              onValueChange={value => {
                void updatePreference('marketing', value);
              }}
              accessibilityRole="switch"
              accessibilityLabel={t('home.notifications.marketingTitle')}
            />
          </View>
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>
                {t('home.notifications.reminderToggleTitle')}
              </Text>
              <Text style={styles.preferenceDescription}>
                {t('home.notifications.renewalDescription')}
              </Text>
            </View>
            <Switch
              value={preferences.reminders}
              onValueChange={value => {
                void updatePreference('reminders', value);
              }}
              accessibilityRole="switch"
              accessibilityLabel={t('home.notifications.reminderToggleTitle')}
            />
          </View>
          {!preferences.marketing ? (
            <Text style={styles.preferenceNote}>
              {t('home.notifications.marketingMuted')}
            </Text>
          ) : null}
        </View>

        <View
          style={[styles.quickActionsContainer, responsiveStyles.quickActionsContainer]}
        >
          <Text style={[styles.sectionTitle, responsiveStyles.sectionTitle]}>
            {t('home.quickActions.heading')}
          </Text>
          <View style={[styles.quickActionsRow, responsiveStyles.quickActionsRow]}>
            {quickActions.map(action => (
              <Pressable
                key={action.key}
                onPress={() => handleQuickAction(action)}
                style={[styles.quickActionButton, responsiveStyles.quickActionButton]}
                accessibilityRole="button"
              >
                <Text style={[styles.quickActionLabel, responsiveStyles.quickActionLabel]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View
          style={[styles.transactionsCard, responsiveStyles.transactionsCard]}
        >
          <Text style={[styles.sectionTitle, responsiveStyles.sectionTitle]}>
            {t('home.transactions.title')}
          </Text>
          {recentTransactions.length === 0 ? (
            <Text style={styles.transactionsEmpty}>
              {t('home.transactions.empty')}
            </Text>
          ) : (
            recentTransactions.map(transaction => {
              const statusKey = `home.transactions.status.${transaction.status}`;
              const statusLabel = t(statusKey);
              const statusStyle =
                transaction.status === 'failed'
                  ? styles.transactionStatusFailed
                  : transaction.status === 'completed'
                    ? styles.transactionStatusCompleted
                    : styles.transactionStatusPending;
              const vendorLabel = transaction.vendorName
                ? transaction.vendorName
                : t('home.transactions.defaultVendor');

              return (
                <View style={styles.transactionRow} key={transaction.id}>
                  <View style={styles.transactionRowHeader}>
                    <View>
                      <Text style={styles.transactionRowTitle}>{vendorLabel}</Text>
                      <Text style={styles.transactionRowMeta}>
                        {t('home.transactions.savings', {
                          replace: {
                            discount: formatTransactionAmount(
                              transaction.discountAmount ?? 0,
                            ),
                          },
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.transactionStatus, statusStyle]}>
                      {statusLabel}
                    </Text>
                  </View>
                  <Text style={styles.transactionRowSummary}>
                    {t('home.transactions.summary', {
                      replace: {
                        total: formatTransactionAmount(transaction.netAmount ?? 0),
                        original: formatTransactionAmount(
                          transaction.grossAmount ??
                            Number(
                              ((transaction.netAmount ?? 0) +
                                (transaction.discountAmount ?? 0)).toFixed(2),
                            ),
                        ),
                      },
                    })}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Pressable
          onPress={logout}
          style={[styles.button, responsiveStyles.button]}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>{t('home.logout')}</Text>
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
    flexGrow: 1,
    padding: 24,
    gap: 20,
  },
  switcherWrapper: {
    alignSelf: 'flex-end',
  },
  brandHeader: {
    marginTop: 8,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceMuted,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.surfaceMuted,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  profileDetails: {
    flex: 1,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  planSummary: {
    marginTop: 4,
    gap: 2,
  },
  planLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  planMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  notificationBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  notificationBannerPromotion: {
    backgroundColor: COLORS.warningBackground,
    borderColor: COLORS.warningBorder,
  },
  notificationBannerReminder: {
    backgroundColor: COLORS.highlightBackground,
    borderColor: COLORS.highlightBorder,
  },
  notificationBannerContent: {
    gap: 6,
  },
  notificationBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notificationBannerBody: {
    fontSize: 14,
    color: COLORS.textOnMuted,
  },
  notificationBannerHint: {
    fontSize: 12,
    color: COLORS.infoText,
  },
  notificationBannerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  notificationAction: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.primaryMuted,
    backgroundColor: COLORS.surface,
  },
  notificationActionPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryDark,
  },
  notificationActionSecondary: {
    backgroundColor: 'transparent',
  },
  notificationActionText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
  },
  notificationActionDismiss: {
    color: COLORS.infoText,
    fontWeight: '600',
  },
  notificationSettings: {
    gap: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  preferenceText: {
    flex: 1,
    gap: 4,
  },
  preferenceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  preferenceDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  preferenceNote: {
    fontSize: 13,
    color: COLORS.infoText,
  },
  manageProfileButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.highlightBackground,
    borderWidth: 1,
    borderColor: COLORS.highlightBorder,
  },
  manageProfileButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.highlightText,
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    alignSelf: 'center',
  },
  buttonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
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
    backgroundColor: COLORS.surfaceMuted,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickActionLabel: {
    color: COLORS.infoText,
    fontWeight: '600',
  },
  transactionsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  transactionsEmpty: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  transactionRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
    padding: 12,
    gap: 8,
  },
  transactionRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  transactionRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  transactionRowMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  transactionRowSummary: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  transactionStatus: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  transactionStatusPending: {
    backgroundColor: COLORS.warningBackground,
    color: COLORS.warningText,
  },
  transactionStatusCompleted: {
    backgroundColor: COLORS.successBackground,
    color: COLORS.successText,
  },
  transactionStatusFailed: {
    backgroundColor: COLORS.errorBackground,
    color: COLORS.errorText,
  },
});
