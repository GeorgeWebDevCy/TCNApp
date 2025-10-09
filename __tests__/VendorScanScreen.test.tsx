jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/services/activityMonitorService', () => ({
  enqueueActivityLog: jest.fn(),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('../src/services/wordpressAuthService');

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { VendorScanScreen } from '../src/screens/VendorScanScreen';
import { useAuthContext } from '../src/contexts/AuthContext';
import { validateMemberQrCode } from '../src/services/wordpressAuthService';

jest.mock('../src/contexts/LocalizationContext', () => ({
  useLocalization: () => ({
    t: (key: string, options?: { replace?: Record<string, string> }) => {
      if (options?.replace) {
        const value = Object.values(options.replace)[0];
        if (value) {
          return String(value);
        }
      }
      return key;
    },
  }),
}));

describe('VendorScanScreen', () => {
  beforeEach(() => {
    (useAuthContext as jest.Mock).mockReturnValue({
      state: { user: { name: 'Vendor Tester' } },
      logout: jest.fn(),
      getSessionToken: jest.fn().mockResolvedValue('session-token'),
    });
    (validateMemberQrCode as jest.Mock).mockResolvedValue({
      token: 'abc',
      valid: true,
      membershipTier: 'Gold',
      allowedDiscount: 15,
    });
  });

  it('validates manual QR token', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<VendorScanScreen />);
    });

    const input = tree.root.findByProps({ testID: 'vendor-manual-input' });
    act(() => {
      input.props.onChangeText('abc');
    });

    await act(async () => {
      const button = tree.root.findByProps({ testID: 'vendor-manual-submit' });
      button.props.onPress();
    });

    expect(validateMemberQrCode).toHaveBeenCalledWith('abc', 'session-token');
  });
});

