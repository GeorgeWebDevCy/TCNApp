import {
  calculateDiscountForAmount,
  getDiscountPercentageForTiers,
} from '../src/utils/discount';

const membershipTiers = ['Blue', 'Gold', 'Platinum', 'Black'] as const;
const vendorTiers = ['Sapphire', 'Diamond'] as const;

const expectedMatrix: Record<string, Record<string, number>> = {
  sapphire: {
    blue: 0,
    gold: 2.5,
    platinum: 5,
    black: 10,
  },
  diamond: {
    blue: 0,
    gold: 5,
    platinum: 10,
    black: 20,
  },
};

describe('getDiscountPercentageForTiers', () => {
  vendorTiers.forEach(vendor => {
    membershipTiers.forEach(membership => {
      const expected = expectedMatrix[vendor.toLowerCase()][
        membership.toLowerCase()
      ];

      it(`returns ${expected}% for ${membership} member at ${vendor} vendor`, () => {
        expect(getDiscountPercentageForTiers(membership, vendor)).toBe(expected);
      });
    });
  });

  it('normalizes unexpected casing and whitespace', () => {
    expect(getDiscountPercentageForTiers('  gold  ', ' Sapphire ')).toBe(2.5);
  });

  it('returns 0 for unsupported tiers', () => {
    expect(getDiscountPercentageForTiers('Blue', 'Emerald')).toBe(0);
    expect(getDiscountPercentageForTiers('Bronze', 'Diamond')).toBe(0);
  });
});

describe('calculateDiscountForAmount', () => {
  it('returns zero discount when gross amount is not finite', () => {
    expect(
      calculateDiscountForAmount(Number.NaN, 'Gold', 'Sapphire'),
    ).toMatchObject({
      discountPercentage: 2.5,
      discountAmount: 0,
      netAmount: 0,
      grossAmount: 0,
    });
  });

  it('calculates discount and net total', () => {
    expect(calculateDiscountForAmount(1000, 'Platinum', 'Diamond')).toEqual({
      discountPercentage: 10,
      discountAmount: 100,
      netAmount: 900,
      grossAmount: 1000,
    });
  });
});
