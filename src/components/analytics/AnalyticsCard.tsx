import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { COLORS } from '../../config/theme';

export interface AnalyticsCardProps {
  title: string;
  subtitle?: string;
  tooltip?: string;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  footer?: React.ReactNode;
  style?: ViewStyle;
  children?: React.ReactNode;
}

export const AnalyticsCard: React.FC<AnalyticsCardProps> = ({
  title,
  subtitle,
  tooltip,
  isLoading = false,
  isEmpty = false,
  emptyMessage,
  footer,
  style,
  children,
}) => {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {tooltip ? <Text style={styles.tooltip}>{tooltip}</Text> : null}
      </View>
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} />
        ) : isEmpty ? (
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        ) : (
          children
        )}
      </View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleGroup: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  tooltip: {
    flexShrink: 1,
    fontSize: 12,
    color: COLORS.textTertiary,
    textAlign: 'right',
  },
  content: {
    minHeight: 180,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.mutedBorder,
    paddingTop: 12,
  },
});
