import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnalyticsCard, AnalyticsCardProps } from './AnalyticsCard';
import { COLORS } from '../../config/theme';

export interface StatusBreakdownPoint {
  label: string;
  value: number;
}

interface TransactionStatusChartProps
  extends Pick<AnalyticsCardProps, 'title' | 'tooltip' | 'isLoading' | 'emptyMessage'> {
  data: StatusBreakdownPoint[];
  totalLabel: string;
}

const STATUS_COLORS = [COLORS.primary, COLORS.warning, COLORS.error];

export const TransactionStatusChart: React.FC<TransactionStatusChartProps> = ({
  title,
  tooltip,
  data,
  isLoading,
  emptyMessage,
  totalLabel,
}) => {
  const total = data.reduce((sum, point) => sum + point.value, 0);
  const hasValues = total > 0;

  return (
    <AnalyticsCard
      title={title}
      tooltip={tooltip}
      isLoading={isLoading}
      isEmpty={!hasValues}
      emptyMessage={emptyMessage}
    >
      <View style={styles.container}>
        <View style={styles.summary}>
          <Text style={styles.totalValue}>{totalLabel}</Text>
          <View style={styles.stackedBar}>
            {data.map((point, index) => {
              const ratio = total ? point.value / total : 0;
              return (
                <View
                  key={point.label}
                  style={[
                    styles.segment,
                    {
                      flexGrow: ratio,
                      minWidth: ratio > 0 ? 12 : 0,
                      backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length],
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
        <View style={styles.legend}>
          {data.map((point, index) => (
            <View key={point.label} style={styles.legendItem}>
              <View
                style={[styles.swatch, { backgroundColor: STATUS_COLORS[index % STATUS_COLORS.length] }]}
              />
              <Text style={styles.legendLabel}>
                {point.label} · {point.value}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </AnalyticsCard>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  summary: {
    width: 180,
    gap: 16,
    alignItems: 'center',
  },
  stackedBar: {
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.mutedBackground,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  segment: {
    minWidth: 0,
    flexBasis: 0,
    flexGrow: 0,
  },
  legend: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
