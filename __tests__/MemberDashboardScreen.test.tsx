import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { MemberDashboardScreen } from '../src/screens/MemberDashboardScreen';
import { translations } from '../src/localization/translations';

const resolveTranslation = (key: string): unknown => {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, translations.en);
};

jest.mock('../src/hooks/useTransactionsAnalytics', () => ({
  useMemberTransactions: jest.fn(),
}));

jest.mock('../src/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    width: 375,
    height: 812,
    shortestSide: 375,
    isLandscape: false,
    isSmallPhone: false,
    isTablet: false,
    isLargeTablet: false,
    contentPadding: 24,
    maxContentWidth: undefined,
  }),
}));

jest.mock('../src/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    language: 'en',
    setLanguage: jest.fn(),
    translateError: (value: string | null) => value,
    t: (key: string, options?: { replace?: Record<string, string | number> }) => {
      const value = resolveTranslation(key);
      if (typeof value === 'string') {
        if (!options?.replace) {
          return value;
        }
        return value.replace(/{{\s*([^\s{}]+)\s*}}/g, (match, token) => {
          const replacement = options.replace?.[token];
          return replacement !== undefined ? String(replacement) : match;
        });
      }
      return key;
    },
  }),
}));

const { useMemberTransactions } = jest.requireMock(
  '../src/hooks/useTransactionsAnalytics',
);
const useMemberTransactionsMock = useMemberTransactions as jest.Mock;

describe('MemberDashboardScreen', () => {
  beforeEach(() => {
    useMemberTransactionsMock.mockReturnValue({
      transactions: [],
      monthlySavings: [
        {
          monthKey: '2024-01',
          date: new Date('2024-01-01T00:00:00.000Z'),
          totalSavings: 120,
          transactionCount: 2,
        },
        {
          monthKey: '2024-02',
          date: new Date('2024-02-01T00:00:00.000Z'),
          totalSavings: 90,
          transactionCount: 1,
        },
      ],
      topVendors: [
        { vendorName: 'Vendor Plaza', totalSavings: 150, transactionCount: 3 },
        { vendorName: 'unknown', totalSavings: 60, transactionCount: 2 },
      ],
      statusBreakdown: [
        { status: 'pending', count: 1 },
        { status: 'completed', count: 3 },
        { status: 'failed', count: 0 },
      ],
      totalSavings: 210,
      completedCount: 3,
      isLoading: false,
      isEmpty: false,
      error: null,
      lastUpdated: new Date('2024-03-10T12:00:00.000Z'),
      refresh: jest.fn(),
    });
  });

  it('renders the analytics dashboard snapshot', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<MemberDashboardScreen />);
    });

    expect(renderer?.toJSON()).toMatchSnapshot();
  });
});
