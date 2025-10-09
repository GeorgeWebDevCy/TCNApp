import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { HomeScreen, getMaxDiscount } from '../src/screens/HomeScreen';
import { MembershipInfo } from '../src/types/auth';

const membership: MembershipInfo = {
  tier: 'Gold',
  expiresAt: '2030-01-10T00:00:00.000Z',
  benefits: [
    {
      id: 'travel',
      title: 'Travel deals',
      description: '10% off flights',
      discountPercentage: 10,
    },
    {
      id: 'dining',
      title: 'Dining rewards',
      description: '15% off restaurants',
      discountPercentage: 15,
    },
  ],
};

jest.mock('../src/contexts/AuthContext', () => ({
  useAuthContext: () => ({
    state: {
      isAuthenticated: true,
      isLocked: false,
      isLoading: false,
      user: {
        id: 1,
        email: 'jane@example.com',
        name: 'Jane Doe',
        firstName: 'Jane',
        lastName: 'Doe',
        membership,
      },
      membership,
      authMethod: 'password',
      error: null,
      hasPasswordAuthenticated: true,
    },
    logout: jest.fn(),
  }),
}));

jest.mock('../src/contexts/TransactionContext', () => ({
  useTransactionContext: () => ({
    transactions: [
      {
        id: 'tx-1',
        memberToken: 'member-token',
        memberName: 'Jane Doe',
        vendorName: 'Vendor Plaza',
        status: 'completed',
        discountPercentage: 10,
        discountAmount: 120,
        netAmount: 1080,
        grossAmount: 1200,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ],
    addTransaction: jest.fn(),
    replaceTransaction: jest.fn(),
    patchTransaction: jest.fn(),
  }),
}));

jest.mock('../src/contexts/LocalizationContext', () => {
  const { translations } = jest.requireActual(
    '../src/localization/translations',
  );

  const resolve = (key: string): unknown => {
    return key.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, translations.en);
  };

  const format = (
    template: string,
    replacements?: Record<string, string | number>,
  ) => {
    if (!replacements) {
      return template;
    }

    return template.replace(/{{\s*([^\s{}]+)\s*}}/g, (match, token) => {
      const value = replacements[token];
      return value !== undefined && value !== null ? String(value) : match;
    });
  };

  return {
    useLocalization: () => ({
      language: 'en',
      setLanguage: jest.fn().mockResolvedValue(undefined),
      translateError: (value: string | null) => value,
      t: (
        key: string,
        options?: { replace?: Record<string, string | number> },
      ) => {
        const value = resolve(key);
        if (typeof value === 'string') {
          return format(value, options?.replace);
        }
        return key;
      },
    }),
  };
});

jest.mock('../src/notifications/OneSignalProvider', () => ({
  useOneSignalNotifications: () => ({
    preferences: { marketing: true, reminders: true },
    updatePreference: jest.fn(),
    activeNotification: null,
    activeNotificationOrigin: null,
    clearActiveNotification: jest.fn(),
    pendingNavigationTarget: null,
    consumeNavigationTarget: jest.fn(),
  }),
}));

describe('HomeScreen', () => {
  it('renders the membership overview', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    const onManageProfile = jest.fn();
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen onManageProfile={onManageProfile} />,
      );
    });

    const textNodes = renderer
      ?.root.findAllByType(Text)
      .map(node => node.props.children)
      .flat();

    expect(textNodes).toContain('Welcome, Jane Doe!');
    expect(textNodes).toContain('Recent savings');
    expect(textNodes).toContain('Vendor Plaza');
  });
});

describe('getMaxDiscount', () => {
  it('returns the maximum discount from the benefit list', () => {
    expect(getMaxDiscount(membership.benefits)).toBe(15);
  });

  it('returns null when no numeric discounts are present', () => {
    expect(
      getMaxDiscount([
        { id: 'a', title: 'Perk', description: 'Bonus points' },
        { id: 'b', title: 'Another', discountPercentage: Number.NaN },
      ]),
    ).toBeNull();
  });
});
