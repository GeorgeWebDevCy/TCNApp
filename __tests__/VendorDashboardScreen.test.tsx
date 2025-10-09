import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { VendorDashboardScreen } from '../src/screens/VendorDashboardScreen';
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
  useVendorTransactions: jest.fn(),
}));

jest.mock('../src/hooks/useResponsiveLayout', () => ({
  useResponsiveLayout: () => ({
    width: 768,
    height: 1024,
    shortestSide: 768,
    isLandscape: false,
    isSmallPhone: false,
    isTablet: true,
    isLargeTablet: false,
    contentPadding: 32,
    maxContentWidth: 720,
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

const { useVendorTransactions } = jest.requireMock(
  '../src/hooks/useTransactionsAnalytics',
);
const useVendorTransactionsMock = useVendorTransactions as jest.Mock;

describe('VendorDashboardScreen', () => {
  beforeEach(() => {
    useVendorTransactionsMock.mockReturnValue({
      transactions: [],
      monthlySavings: [
        {
          monthKey: '2024-01',
          date: new Date('2024-01-01T00:00:00.000Z'),
          totalSavings: 200,
          transactionCount: 4,
        },
      ],
      topVendors: [
        { vendorName: 'Main Branch', totalSavings: 200, transactionCount: 4 },
      ],
      statusBreakdown: [
        { status: 'pending', count: 2 },
        { status: 'completed', count: 4 },
        { status: 'failed', count: 1 },
      ],
      totalSavings: 200,
      completedCount: 4,
      isLoading: false,
      isEmpty: false,
      error: null,
      lastUpdated: new Date('2024-03-11T08:30:00.000Z'),
      refresh: jest.fn(),
    });
  });

  it('renders key vendor analytics sections', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<VendorDashboardScreen />);
    });

    const instance = renderer!.root;
    const collectText = (value: unknown): string => {
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value);
      }
      if (Array.isArray(value)) {
        return value.map(collectText).join('');
      }
      return '';
    };
    const hasText = (expected: string) =>
      instance.findAll(
        node => node.type === 'Text' && collectText(node.props.children) === expected,
      ).length > 0;

    expect(hasText('Transaction analytics')).toBe(true);
    expect(hasText('Monthly savings')).toBe(true);
    expect(hasText('Top vendors')).toBe(true);
    expect(hasText('Transaction status')).toBe(true);
  });
});
