import { MembershipTier, VendorTier } from '../types/transactions';

type DiscountMatrix = Record<string, Record<string, number>>;

const normalize = (value?: string | null): string =>
  value ? value.trim().toLowerCase() : '';

export const DEFAULT_DISCOUNT_MATRIX: DiscountMatrix = {
  sapphire: {
    gold: 2.5,
    platinum: 5,
    black: 10,
  },
  diamond: {
    gold: 5,
    platinum: 10,
    black: 20,
  },
};

export const getDiscountPercentageForTiers = (
  membershipTier?: string | null,
  vendorTier?: string | null,
  matrix: DiscountMatrix = DEFAULT_DISCOUNT_MATRIX,
): number => {
  const membershipKey = normalize(membershipTier);
  const vendorKey = normalize(vendorTier);

  if (!membershipKey || !vendorKey) {
    return 0;
  }

  const vendorDiscounts = matrix[vendorKey];
  if (!vendorDiscounts) {
    return 0;
  }

  const discount = vendorDiscounts[membershipKey];
  return typeof discount === 'number' && Number.isFinite(discount)
    ? discount
    : 0;
};

export const calculateDiscountForAmount = (
  grossAmount: number,
  membershipTier?: MembershipTier | string | null,
  vendorTier?: VendorTier | string | null,
  matrix: DiscountMatrix = DEFAULT_DISCOUNT_MATRIX,
): {
  discountPercentage: number;
  discountAmount: number;
  netAmount: number;
  grossAmount: number;
} => {
  const normalizedGross = Number.isFinite(grossAmount) ? grossAmount : 0;
  const discountPercentage = getDiscountPercentageForTiers(
    membershipTier ?? undefined,
    vendorTier ?? undefined,
    matrix,
  );

  const discountAmount = Number(
    ((normalizedGross * discountPercentage) / 100).toFixed(2),
  );
  const netAmount = Number((normalizedGross - discountAmount).toFixed(2));

  return {
    discountPercentage,
    discountAmount,
    netAmount,
    grossAmount: Number(normalizedGross.toFixed(2)),
  };
};
