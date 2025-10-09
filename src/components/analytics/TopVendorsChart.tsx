import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnalyticsCard, AnalyticsCardProps } from './AnalyticsCard';
import { COLORS } from '../../config/theme';

export interface VendorPerformancePoint {
  label: string;
  value: number;
}

interface TopVendorsChartProps
  extends Pick<AnalyticsCardProps, 'title' | 'tooltip' | 'isLoading' | 'emptyMessage'> {
  data: VendorPerformancePoint[];
}

export const TopVendorsChart: React.FC<TopVendorsChartProps> = ({
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
          const width = ratio === 0 ? 0 : Math.min(100, Math.max(ratio * 100, 8));
          return (
            <View key={point.label} style={styles.row}>
              <Text style={styles.vendorLabel} numberOfLines={1}>
                {point.label}
              </Text>
              <View style={styles.barRow}>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${width}%` }]} />
                </View>
                <Text style={styles.valueLabel}>{point.value}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </AnalyticsCard>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  row: {
    gap: 8,
  },
  vendorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  track: {
    flex: 1,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.mutedBackground,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: COLORS.primaryLight,
    borderRadius: 8,
  },
  valueLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
});
