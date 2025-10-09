jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/services/activityMonitorService', () => ({
  enqueueActivityLog: jest.fn(),
}));

import React from 'react';
import renderer from 'react-test-renderer';
import { MemberQrCard } from '../src/components/MemberQrCard';
import { LocalizationProvider } from '../src/contexts/LocalizationContext';
import { MemberQrCode } from '../src/types/auth';

const renderWithLocalization = async (element: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  await renderer.act(async () => {
    tree = renderer.create(<LocalizationProvider>{element}</LocalizationProvider>);
  });
  // @ts-expect-error tree is assigned in act
  return tree as renderer.ReactTestRenderer;
};

describe('MemberQrCard', () => {
  it('renders placeholder when QR code is unavailable', async () => {
    const tree = await renderWithLocalization(
      <MemberQrCard qrCode={null} accountType="member" />,
    );

    const placeholder = tree.root.findByProps({ testID: 'member-qr-empty' });
    expect(placeholder.props.children).toBeDefined();
  });

  it('renders QR component when token is provided', async () => {
    const qrCode: MemberQrCode = {
      token: 'token-123',
      payload: 'payload-123',
    };
    const tree = await renderWithLocalization(
      <MemberQrCard qrCode={qrCode} accountType="member" />,
    );

    const qr = tree.root.findByType('QRCodeSVG');
    expect(qr.props.value).toBe('payload-123');
  });
});

