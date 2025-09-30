import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MembershipBenefit } from '../types/auth';
import { COLORS } from '../config/theme';

interface BenefitListProps {
  title: string;
  emptyLabel: string;
  benefits: MembershipBenefit[];
}

export const BenefitList: React.FC<BenefitListProps> = ({
  title,
  emptyLabel,
  benefits,
}) => {
  const formatDiscount = (value: number) => {
    if (!Number.isFinite(value)) {
      return String(value);
    }

    const rounded = Number.parseFloat(value.toFixed(2));
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {benefits.length === 0 ? (
        <Text style={styles.empty}>{emptyLabel}</Text>
      ) : (
        benefits.map(benefit => (
          <View key={benefit.id} style={styles.item}>
            <View style={styles.bullet} />
            <View style={styles.itemContent}>
              <Text style={styles.itemTitle}>{benefit.title}</Text>
              {benefit.description ? (
                <Text style={styles.itemDescription}>
                  {benefit.description}
                </Text>
              ) : null}
              {typeof benefit.discountPercentage === 'number' ? (
                <Text style={styles.itemDiscount}>{`-${formatDiscount(
                  benefit.discountPercentage,
                )}%`}</Text>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    backgroundColor: COLORS.background,
    padding: 20,
    borderRadius: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  empty: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
  itemContent: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textOnMuted,
  },
  itemDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  itemDiscount: {
    fontSize: 14,
    color: COLORS.success,
    fontWeight: '600',
  },
});
