import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnalyticsCard, AnalyticsCardProps } from './AnalyticsCard';
import { COLORS } from '../../config/theme';

export interface MonthlySavingsPoint {
  label: string;
  value: number;
}

interface MonthlySavingsChartProps
  extends Pick<AnalyticsCardProps, 'title' | 'tooltip' | 'isLoading' | 'emptyMessage'> {
  data: MonthlySavingsPoint[];
}

export const MonthlySavingsChart: React.FC<MonthlySavingsChartProps> = ({
  title,
  tooltip,
  data,
  isLoading,
  emptyMessage,
}) => {
  const maxValue = useMemo(() => data.reduce((max, point) => Math.max(max, point.value), 0), [data]);

  return (
    <AnalyticsCard
      title={title}
      tooltip={tooltip}
      isLoading={isLoading}
      isEmpty={!data.length}
      emptyMessage={emptyMessage}
    >
      <View style={styles.container}>
        {data.map(point => {
          const ratio = maxValue ? point.value / maxValue : 0;
          const height = ratio === 0 ? 0 : Math.min(100, Math.max(ratio * 100, 12));
          return (
            <View key={point.label} style={styles.barItem}>
              <Text style={styles.valueLabel}>{point.value}</Text>
              <View style={styles.barShell}>
                <View style={[styles.barFill, { height: `${height}%` }]} />
              </View>
              <Text style={styles.monthLabel} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
    </AnalyticsCard>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    alignItems: 'flex-end',
  },
  barItem: {
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  barShell: {
    height: 140,
    width: '100%',
    borderRadius: 12,
    backgroundColor: COLORS.mutedBackground,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    backgroundColor: COLORS.primary,
  },
  valueLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  monthLabel: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
});
