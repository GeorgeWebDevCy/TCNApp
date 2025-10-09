import React from 'react';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryTheme } from 'victory-native';
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
  return (
    <AnalyticsCard
      title={title}
      tooltip={tooltip}
      isLoading={isLoading}
      isEmpty={!data.length}
      emptyMessage={emptyMessage}
    >
      <VictoryChart
        height={220}
        padding={{ top: 24, bottom: 24, left: 120, right: 24 }}
        horizontal
        domainPadding={{ x: 16, y: 24 }}
        theme={VictoryTheme.material}
      >
        <VictoryAxis
          style={{
            axis: { stroke: COLORS.mutedBorder },
            tickLabels: { fill: COLORS.textTertiary, fontSize: 12, padding: 4 },
            grid: { stroke: COLORS.mutedBorder, strokeDasharray: '4 4' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={data.map(point => point.label)}
          style={{
            axis: { stroke: COLORS.mutedBorder },
            tickLabels: { fill: COLORS.textSecondary, fontSize: 12 },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryBar
          data={data.map(point => ({ x: point.label, y: point.value }))}
          style={{
            data: { fill: COLORS.primaryLight, width: 16, borderRadius: 6 },
          }}
          animate={{ duration: 400 }}
        />
      </VictoryChart>
    </AnalyticsCard>
  );
};
