jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/services/activityMonitorService', () => ({
  enqueueActivityLog: jest.fn(),
}));

import { __authReducerForTests, __initialAuthStateForTests } from '../src/contexts/AuthContext';
import { AuthState, MemberQrCode } from '../src/types/auth';

describe('authReducer', () => {
  const createState = (): AuthState => ({
    ...__initialAuthStateForTests,
  });

  it('persists QR code on login success', () => {
    const qrCode: MemberQrCode = {
      token: 'token-xyz',
      payload: 'payload-xyz',
    };

    const result = __authReducerForTests(createState(), {
      type: 'LOGIN_SUCCESS',
      payload: {
        user: null,
        method: 'password',
        membership: null,
        passwordAuthenticated: true,
        memberQrCode: qrCode,
      },
    });

    expect(result.memberQrCode).toEqual(qrCode);
  });

  it('retains QR code when locking session', () => {
    const qrCode: MemberQrCode = {
      token: 'token-lock',
    };
    const initial: AuthState = {
      ...createState(),
      memberQrCode: qrCode,
    };

    const result = __authReducerForTests(initial, {
      type: 'SET_LOCKED',
      payload: {
        locked: true,
        user: null,
        membership: null,
        passwordAuthenticated: false,
        memberQrCode: qrCode,
      },
    });

    expect(result.memberQrCode).toEqual(qrCode);
  });
});

