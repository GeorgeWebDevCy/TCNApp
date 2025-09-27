import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { HomeScreen, getMaxDiscount } from '../src/screens/HomeScreen';
import { MembershipInfo } from '../src/types/auth';

const membership: MembershipInfo = {
  tier: 'Gold',
  expiresAt: '2030-01-10T00:00:00.000Z',
  benefits: [
    { id: 'travel', title: 'Travel deals', description: '10% off flights', discountPercentage: 10 },
    { id: 'dining', title: 'Dining rewards', description: '15% off restaurants', discountPercentage: 15 },
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

jest.mock('../src/contexts/LocalizationContext', () => {
  const { translations } = jest.requireActual('../src/localization/translations');

  const resolve = (key: string): unknown => {
    return key.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[segment];
      }
      return undefined;
    }, translations.en);
  };

  const format = (template: string, replacements?: Record<string, string | number>) => {
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
      t: (key: string, options?: { replace?: Record<string, string | number> }) => {
        const value = resolve(key);
        if (typeof value === 'string') {
          return format(value, options?.replace);
        }
        return key;
      },
    }),
  };
});

describe('HomeScreen', () => {
  it('renders the membership overview', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | undefined;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<HomeScreen />);
    });

    expect(renderer?.toJSON()).toMatchSnapshot();
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
