import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalization } from '../contexts/LocalizationContext';
import { useMemberTransactions } from '../hooks/useTransactionsAnalytics';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { MonthlySavingsChart } from '../components/analytics/MonthlySavingsChart';
import { TopVendorsChart } from '../components/analytics/TopVendorsChart';
import { TransactionStatusChart } from '../components/analytics/TransactionStatusChart';
import { COLORS } from '../config/theme';
import { TransactionStatus } from '../types/transactions';

interface MemberDashboardScreenProps {
  onBack?: () => void;
}

const formatCurrency = (value: number, locale: string) => {
  return value.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const MemberDashboardScreen: React.FC<MemberDashboardScreenProps> = ({
  onBack,
}) => {
  const { t, language } = useLocalization();
  const locale = language === 'th' ? 'th-TH' : 'en-US';
  const layout = useResponsiveLayout();
  const {
    monthlySavings,
    topVendors,
    statusBreakdown,
    totalSavings,
    completedCount,
    isLoading,
    isEmpty,
    error,
    lastUpdated,
    refresh,
  } = useMemberTransactions();

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
      }),
    [locale],
  );

  const monthlyData = useMemo(
    () =>
      monthlySavings.map(bucket => ({
        label: monthFormatter.format(bucket.date),
        value: Number(bucket.totalSavings.toFixed(2)),
      })),
    [monthFormatter, monthlySavings],
  );

  const vendorData = useMemo(
    () =>
      topVendors.slice(0, 5).map(item => ({
        label:
          item.vendorName === 'unknown'
            ? t('analytics.shared.unknownVendor')
            : item.vendorName,
        value: Number(item.totalSavings.toFixed(2)),
      })),
    [t, topVendors],
  );

  const statusData = useMemo(() => {
    const order: TransactionStatus[] = ['completed', 'pending', 'failed'];
    return order.map(status => {
      const match = statusBreakdown.find(item => item.status === status);
      return {
        label: t(`analytics.status.${status}`),
        value: match?.count ?? 0,
      };
    });
  }, [statusBreakdown, t]);

  const totalLabel = useMemo(
    () =>
      t('analytics.shared.transactionsCount', {
        replace: { count: completedCount },
      }),
    [completedCount, t],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.header, { flexDirection: layout.isTablet ? 'row' : 'column' }]}>
          <View style={styles.headerTextGroup}>
            <Text style={styles.title}>{t('analytics.member.title')}</Text>
            <Text style={styles.subtitle}>{t('analytics.member.subtitle')}</Text>
          </View>
          <View style={styles.headerActions}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                onPress={onBack}
                style={styles.backButton}
              >
                <Text style={styles.backButtonText}>{t('analytics.shared.back')}</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => void refresh()}
              style={styles.refreshButton}
            >
              <Text style={styles.refreshButtonText}>{t('analytics.shared.refresh')}</Text>
            </Pressable>
          </View>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.shared.totalSavings')}</Text>
            <Text style={styles.summaryValue}>
              {formatCurrency(totalSavings, locale)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t('analytics.shared.completedTransactions')}</Text>
            <Text style={styles.summaryValue}>{completedCount}</Text>
          </View>
        </View>
        {lastUpdated ? (
          <Text style={styles.updatedText}>
            {t('analytics.shared.lastUpdated', {
              replace: {
                timestamp: lastUpdated.toLocaleString(locale),
              },
            })}
          </Text>
        ) : null}
        <View style={styles.cardGrid}>
          <MonthlySavingsChart
            title={t('analytics.charts.monthlySavings.title')}
            tooltip={t('analytics.charts.monthlySavings.tooltip')}
            data={monthlyData}
            isLoading={isLoading}
            emptyMessage={t('analytics.charts.monthlySavings.empty')}
          />
          <TopVendorsChart
            title={t('analytics.charts.topVendors.title')}
            tooltip={t('analytics.charts.topVendors.tooltip')}
            data={vendorData}
            isLoading={isLoading}
            emptyMessage={t('analytics.charts.topVendors.empty')}
          />
          <TransactionStatusChart
            title={t('analytics.charts.transactionStatus.title')}
            tooltip={t('analytics.charts.transactionStatus.tooltip')}
            data={statusData}
            isLoading={isLoading}
            emptyMessage={t('analytics.charts.transactionStatus.empty')}
            totalLabel={totalLabel}
          />
        </View>
        {isEmpty ? (
          <Text style={styles.emptyHint}>{t('analytics.member.empty')}</Text>
        ) : null}
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
    gap: 24,
  },
  header: {
    justifyContent: 'space-between',
    gap: 16,
  },
  headerTextGroup: {
    flexShrink: 1,
    gap: 8,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
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
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.mutedBorder,
  },
  backButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  refreshButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
  },
  refreshButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: COLORS.errorText,
    backgroundColor: COLORS.errorBackground,
    padding: 12,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 8,
    minWidth: 160,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  updatedText: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  cardGrid: {
    gap: 24,
  },
  emptyHint: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
});
