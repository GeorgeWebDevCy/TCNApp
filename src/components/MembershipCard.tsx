import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MembershipInfo } from '../types/auth';
import { COLORS } from '../config/theme';

interface MembershipCardProps {
  membership: MembershipInfo | null;
  heading: string;
  tierLabel: string;
  renewalLabel: string;
  discountSummary: string;
  emptyState: string;
}

export const MembershipCard: React.FC<MembershipCardProps> = ({
  membership,
  heading,
  tierLabel,
  renewalLabel,
  discountSummary,
  emptyState,
}) => {
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{heading}</Text>
      {membership ? (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>{tierLabel}</Text>
            <Text style={styles.tier}>{membership.tier}</Text>
          </View>
          {renewalLabel ? (
            <Text style={styles.meta}>{renewalLabel}</Text>
          ) : null}
        </>
      ) : (
        <Text style={styles.empty}>{emptyState}</Text>
      )}
      {discountSummary ? (
        <Text style={styles.summary}>{discountSummary}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.infoBackground,
    padding: 20,
    borderRadius: 16,
    gap: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    color: COLORS.infoText,
    fontWeight: '600',
  },
  tier: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  meta: {
    fontSize: 14,
    color: COLORS.infoText,
  },
  empty: {
    fontSize: 16,
    color: COLORS.infoText,
  },
  summary: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
