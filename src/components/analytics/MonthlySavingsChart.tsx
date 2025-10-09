import React from 'react';
import { VictoryAxis, VictoryBar, VictoryChart, VictoryTheme } from 'victory-native';
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
        padding={{ top: 24, bottom: 48, left: 56, right: 24 }}
        theme={VictoryTheme.material}
        domainPadding={{ x: 24, y: 12 }}
      >
        <VictoryAxis
          tickFormat={data.map(point => point.label)}
          style={{
            axis: { stroke: COLORS.mutedBorder },
            tickLabels: {
              fill: COLORS.textSecondary,
              fontSize: 12,
              angle: data.length > 4 ? -30 : 0,
              padding: data.length > 4 ? 22 : 10,
            },
            grid: { stroke: 'transparent' },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickFormat={value => `${value}`}
          style={{
            axis: { stroke: COLORS.mutedBorder },
            tickLabels: { fill: COLORS.textTertiary, fontSize: 12, padding: 6 },
            grid: { stroke: COLORS.mutedBorder, strokeDasharray: '4 4' },
          }}
        />
        <VictoryBar
          data={data.map(point => ({ x: point.label, y: point.value }))}
          style={{
            data: { fill: COLORS.primary, width: 16, borderRadius: 6 },
          }}
          animate={{ duration: 400 }}
        />
      </VictoryChart>
    </AnalyticsCard>
  );
};
