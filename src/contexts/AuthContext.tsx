import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import deviceLog from '../utils/deviceLog';
import {
  authenticateWithBiometrics,
  isBiometricsAvailable,
} from '../services/biometricService';
import { isBiometricLoginEnabled } from '../services/biometricPreferenceService';
import {
  clearPin,
  registerPin as persistPin,
  verifyPin,
} from '../services/pinService';
import {
  clearPasswordAuthenticated,
  clearSession,
  ensureValidSession,
  hasPasswordAuthenticated,
  loginWithPassword as loginWithWordPress,
  markPasswordAuthenticated,
  registerAccount as registerWordPressAccount,
  requestPasswordReset as requestWordpressPasswordReset,
  resetPasswordWithCode as resetWordpressPasswordWithCode,
  refreshPersistedUserProfile,
  updatePassword as updateWordPressPassword,
  setSessionLock,
  persistSessionSnapshot,
  ensureCookieSession,
  uploadProfileAvatar as uploadWordPressProfileAvatar,
  deleteProfileAvatar as deleteWordPressProfileAvatar,
  ensureMemberQrCode,
} from '../services/wordpressAuthService';
import { useTokenLogin } from '../providers/TokenLoginProvider';
import type { PersistedSession } from '../services/wordpressAuthService';
import {
  AuthContextValue,
  AuthState,
  AuthUser,
  LoginOptions,
  MembershipInfo,
  MemberQrCode,
  PinLoginOptions,
  RegisterOptions,
  ResetPasswordOptions,
} from '../types/auth';

interface LoginSuccessPayload {
  user: AuthUser | null;
  method: AuthState['authMethod'];
  passwordAuthenticated: boolean;
  membership: MembershipInfo | null;
  memberQrCode: MemberQrCode | null;
}

type AuthAction =
  | { type: 'BOOTSTRAP_START' }
  | {
      type: 'BOOTSTRAP_COMPLETE';
      payload: {
        user: AuthUser | null;
        locked: boolean;
        passwordAuthenticated: boolean;
        membership: MembershipInfo | null;
        memberQrCode: MemberQrCode | null;
      };
    }
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: LoginSuccessPayload }
  | { type: 'LOGIN_ERROR'; payload: string }
  | {
      type: 'SET_LOCKED';
      payload: {
        locked: boolean;
        user: AuthUser | null;
        passwordAuthenticated: boolean;
        membership: MembershipInfo | null;
        memberQrCode: MemberQrCode | null;
      };
    }
  | { type: 'LOGOUT' }
  | { type: 'RESET_ERROR' };

const initialState: AuthState = {
  isAuthenticated: false,
  isLocked: false,
  isLoading: true,
  user: null,
  membership: null,
  memberQrCode: null,
  authMethod: null,
  error: null,
  hasPasswordAuthenticated: false,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  switch (action.type) {
    case 'BOOTSTRAP_START':
      return {
        ...state,
        isLoading: true,
      };
    case 'BOOTSTRAP_COMPLETE':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: Boolean(action.payload.user) && !action.payload.locked,
        isLocked: action.payload.locked,
        user: action.payload.user,
        membership: action.payload.membership,
        memberQrCode: action.payload.memberQrCode,
        hasPasswordAuthenticated: action.payload.passwordAuthenticated,
      };
    case 'LOGIN_START':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isLoading: false,
        isAuthenticated: true,
        isLocked: false,
        user: action.payload.user,
        membership: action.payload.membership,
        memberQrCode: action.payload.memberQrCode,
        authMethod: action.payload.method,
        error: null,
        hasPasswordAuthenticated: action.payload.passwordAuthenticated,
      };
    case 'LOGIN_ERROR':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    case 'SET_LOCKED':
      return {
        ...state,
        isAuthenticated: !action.payload.locked && Boolean(action.payload.user),
        isLocked: action.payload.locked,
        user: action.payload.user,
        membership: action.payload.membership,
        memberQrCode: action.payload.memberQrCode,
        authMethod: null,
        isLoading: false,
        hasPasswordAuthenticated: action.payload.passwordAuthenticated,
      };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false,
      };
    case 'RESET_ERROR':
      return {
        ...state,
        error: null,
      };
    default:
      return state;
  }
};

export const __initialAuthStateForTests = initialState;
export const __authReducerForTests = authReducer;

export const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined,
);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const sessionRef = useRef<PersistedSession | null>(null);
  const { hydrateTokenLogin } = useTokenLogin();

  const logSessionSnapshot = useCallback(
    (label: string, session: PersistedSession | null | undefined) => {
      const summary = {
        hasToken: Boolean(session?.token),
        hasRefreshToken: Boolean(session?.refreshToken),
        hasUser: Boolean(session?.user),
        locked: session?.locked ?? null,
        hasTokenLoginUrl: Boolean(session?.tokenLoginUrl),
      };

      deviceLog.debug(label, summary);

      if (__DEV__) {
        try {
          console.log('[auth-debug]', label, JSON.stringify(summary));
        } catch (error) {
          console.log('[auth-debug]', label, summary);
        }
      }
    },
    [persistSessionSnapshot],
  );

  const logCookieHydration = useCallback(
    (
      label: string,
      result: { status: number; ok: boolean } | null,
      extras: Record<string, unknown> = {},
    ) => {
      const payload = {
        status: result?.status ?? null,
        ok: result?.ok ?? false,
        ...extras,
      };
      deviceLog.debug(label, payload);
      if (result && !result.ok) {
        deviceLog.warn(`${label}.warn`, payload);
      }
    },
    [],
  );

  const fetchMemberQrCode = useCallback(
    async (session: PersistedSession | null): Promise<MemberQrCode | null> => {
      const snapshot = session ?? sessionRef.current;

      if (!snapshot?.token) {
        return null;
      }

      const user = snapshot.user;
      if (!user) {
        return null;
      }

      const normalizedAccountType = user.accountType
        ? user.accountType.toLowerCase()
        : null;

      if (normalizedAccountType === 'vendor') {
        return null;
      }

      if (user.qrToken) {
        return {
          token: user.qrToken,
          payload: user.qrPayload ?? null,
        };
      }

      try {
        const qrCode = await ensureMemberQrCode({
          token: snapshot.token,
          payload: user.qrPayload ?? null,
        });

        if (qrCode) {
          const updatedUser: AuthUser = {
            ...user,
            qrToken: qrCode.token,
            qrPayload: qrCode.payload ?? user.qrPayload ?? null,
          };
          const updatedSession: PersistedSession = {
            ...snapshot,
            user: updatedUser,
          };
          sessionRef.current = updatedSession;
          await persistSessionSnapshot(updatedSession);
          return {
            ...qrCode,
            payload: qrCode.payload ?? updatedUser.qrPayload ?? null,
          };
        }
      } catch (error) {
        deviceLog.warn('auth.memberQr.fetchFailed', {
          message: error instanceof Error ? error.message : String(error),
          userId: user.id,
        });
      }

      return null;
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    dispatch({ type: 'BOOTSTRAP_START' });

    const session = await ensureValidSession();
    sessionRef.current = session;
    const passwordAuthenticated =
      (await hasPasswordAuthenticated()) &&
      Boolean(session) &&
      !session?.locked;

    const memberQrCode = await fetchMemberQrCode(session);

    dispatch({
      type: 'BOOTSTRAP_COMPLETE',
      payload: {
        user: session?.user ?? null,
        locked: session?.locked ?? false,
        membership: session?.user?.membership ?? null,
        passwordAuthenticated,
        memberQrCode,
      },
    });
  }, [fetchMemberQrCode]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const loginWithPassword = useCallback(async (options: LoginOptions) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const session = await loginWithWordPress(options);
      sessionRef.current = session;
      await setSessionLock(false);
      await markPasswordAuthenticated();

      let cookieResult = await ensureCookieSession(session);
      logCookieHydration('auth.password.cookie.initial', cookieResult, {
        hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
      });
      if (!cookieResult.ok && session.tokenLoginUrl) {
        try {
          await hydrateTokenLogin(session.tokenLoginUrl);
          cookieResult = await ensureCookieSession(session);
          logCookieHydration('auth.password.cookie.retry', cookieResult, {
            hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
          });
        } catch (error) {
          deviceLog.warn('Token login hydration failed', {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const memberQrCode = await fetchMemberQrCode(session);
      const resolvedUser = sessionRef.current?.user ?? session.user;

      const normalizedAccountType = resolvedUser?.accountType
        ? resolvedUser.accountType.toLowerCase()
        : null;

      if (normalizedAccountType === 'vendor') {
        const statusSource =
          resolvedUser?.vendorStatus ?? resolvedUser?.accountStatus ?? null;
        const normalizedStatus =
          typeof statusSource === 'string'
            ? statusSource.toLowerCase()
            : 'active';

        let blockingMessage: string | null = null;
        if (normalizedStatus === 'pending') {
          blockingMessage = 'Your vendor account is pending approval.';
        } else if (normalizedStatus === 'rejected') {
          blockingMessage = 'Your vendor application has been rejected.';
        } else if (normalizedStatus === 'suspended') {
          blockingMessage =
            'Your vendor account has been suspended. Contact support for assistance.';
        }

        if (blockingMessage) {
          deviceLog.warn('Vendor login blocked', {
            status: normalizedStatus,
            userId: resolvedUser?.id ?? null,
          });
          await clearSession();
          await clearPasswordAuthenticated();
          sessionRef.current = null;
          throw new Error(blockingMessage);
        }
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: resolvedUser,
          method: 'password',
          membership: resolvedUser?.membership ?? null,
          passwordAuthenticated: true,
          memberQrCode,
        },
      });
      deviceLog.success('Password login succeeded');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to complete password login.';
      deviceLog.error('Password login failed', error);
      dispatch({ type: 'LOGIN_ERROR', payload: message });
    }
  }, [fetchMemberQrCode, hydrateTokenLogin, logCookieHydration]);

  const loginWithPin = useCallback(
    async ({ pin }: PinLoginOptions) => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const isValidPin = await verifyPin(pin);
        if (!isValidPin) {
          throw new Error('Incorrect PIN.');
        }

        let session = await ensureValidSession();
        if (!session && sessionRef.current) {
          logSessionSnapshot(
            'auth.pin.sessionFallbackToRef',
            sessionRef.current,
          );
          session = sessionRef.current;
          await persistSessionSnapshot(session);
        }

        if (!session) {
          logSessionSnapshot('auth.pin.sessionMissing', null);
          throw new Error(
            'No saved session. Please log in with your password first.',
          );
        }

        logSessionSnapshot('auth.pin.sessionBeforeUnlock', session);
        let cookieResult = await ensureCookieSession(session);
        logCookieHydration('auth.pin.cookie.initial', cookieResult, {
          hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
        });
        if (!cookieResult.ok && session.tokenLoginUrl) {
          try {
            await hydrateTokenLogin(session.tokenLoginUrl);
            cookieResult = await ensureCookieSession(session);
            logCookieHydration('auth.pin.cookie.retry', cookieResult, {
              hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
            });
          } catch (error) {
            deviceLog.warn('PIN unlock cookie hydration failed', {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        sessionRef.current = session;
        await setSessionLock(false);

        if (!session.user) {
          const refreshedUser = session.token
            ? await refreshPersistedUserProfile(session.token)
            : null;

          if (!refreshedUser) {
            throw new Error(
              'No saved session. Please log in with your password first.',
            );
          }

          sessionRef.current = { ...session, user: refreshedUser };
          const memberQrCode = await fetchMemberQrCode(sessionRef.current);
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: refreshedUser,
              method: 'pin',
              membership: refreshedUser?.membership ?? null,
              passwordAuthenticated: state.hasPasswordAuthenticated,
              memberQrCode,
            },
          });
          deviceLog.success('PIN login succeeded for refreshed user');
          return;
        }

        const memberQrCode = await fetchMemberQrCode(session);
        const resolvedUser = sessionRef.current?.user ?? session.user;

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: resolvedUser,
            method: 'pin',
            membership:
              resolvedUser?.membership ?? state.membership,
            passwordAuthenticated: state.hasPasswordAuthenticated,
            memberQrCode,
          },
        });
        deviceLog.success('PIN login succeeded');
        logSessionSnapshot('auth.pin.sessionAfterUnlock', sessionRef.current);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to sign in with PIN.';
        deviceLog.error('PIN login failed', error);
        dispatch({ type: 'LOGIN_ERROR', payload: message });
      }
    },
    [
      fetchMemberQrCode,
      hydrateTokenLogin,
      logCookieHydration,
      logSessionSnapshot,
      state.hasPasswordAuthenticated,
      state.membership,
    ],
  );

  const loginWithBiometrics = useCallback(
    async (promptMessage?: string) => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const { available } = await isBiometricsAvailable();
        if (!available) {
          throw new Error(
            'Biometric authentication is not available on this device.',
          );
        }

        const enabled = await isBiometricLoginEnabled();
        if (!enabled) {
          throw new Error('Biometric authentication is not configured.');
        }

        const success = await authenticateWithBiometrics(promptMessage);
        if (!success) {
          throw new Error('Biometric authentication was cancelled.');
        }

        let session = await ensureValidSession();
        if (!session && sessionRef.current) {
          logSessionSnapshot(
            'auth.biometrics.sessionFallbackToRef',
            sessionRef.current,
          );
          session = sessionRef.current;
          await persistSessionSnapshot(session);
        }

        if (!session) {
          logSessionSnapshot('auth.biometrics.sessionMissing', null);
          throw new Error(
            'No saved session. Please log in with your password first.',
          );
        }

        logSessionSnapshot('auth.biometrics.sessionBeforeUnlock', session);
        let cookieResult = await ensureCookieSession(session);
        logCookieHydration('auth.biometrics.cookie.initial', cookieResult, {
          hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
        });
        if (!cookieResult.ok && session.tokenLoginUrl) {
          try {
            await hydrateTokenLogin(session.tokenLoginUrl);
            cookieResult = await ensureCookieSession(session);
            logCookieHydration('auth.biometrics.cookie.retry', cookieResult, {
              hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
            });
          } catch (error) {
            deviceLog.warn('Biometric unlock cookie hydration failed', {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        sessionRef.current = session;
        await setSessionLock(false);

        if (!session.user) {
          const refreshedUser = session.token
            ? await refreshPersistedUserProfile(session.token)
            : null;

          if (!refreshedUser) {
            throw new Error(
              'No saved session. Please log in with your password first.',
            );
          }

          sessionRef.current = { ...session, user: refreshedUser };
          const memberQrCode = await fetchMemberQrCode(sessionRef.current);
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: refreshedUser,
              method: 'biometric',
              membership: refreshedUser?.membership ?? null,
              passwordAuthenticated: state.hasPasswordAuthenticated,
              memberQrCode,
            },
          });
          deviceLog.success('Biometric login succeeded for refreshed user');
          return;
        }

        const memberQrCode = await fetchMemberQrCode(session);
        const resolvedUser = sessionRef.current?.user ?? session.user;

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: resolvedUser,
            method: 'biometric',
            membership:
              resolvedUser?.membership ?? state.membership,
            passwordAuthenticated: state.hasPasswordAuthenticated,
            memberQrCode,
          },
        });
        deviceLog.success('Biometric login succeeded');
        logSessionSnapshot('auth.biometrics.sessionAfterUnlock', sessionRef.current);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to complete biometric login.';
        deviceLog.error('Biometric login failed', error);
        dispatch({ type: 'LOGIN_ERROR', payload: message });
      }
    },
    [
      fetchMemberQrCode,
      hydrateTokenLogin,
      logCookieHydration,
      logSessionSnapshot,
      state.hasPasswordAuthenticated,
      state.membership,
    ],
  );

  const canManagePin = useMemo(
    () =>
      state.hasPasswordAuthenticated || (state.isAuthenticated && !!state.user),
    [state.hasPasswordAuthenticated, state.isAuthenticated, state.user],
  );

  const registerPin = useCallback(
    async (pin: string) => {
      if (!canManagePin) {
        throw new Error(
          'Please log in with your username and password before creating a PIN.',
        );
      }

      let session = await ensureValidSession();

      if (!session && sessionRef.current) {
        await persistSessionSnapshot(sessionRef.current);
        session = await ensureValidSession();
      }

      if (!session) {
        if (state.user) {
          session = {
            token: sessionRef.current?.token,
            refreshToken: sessionRef.current?.refreshToken,
            user: state.user,
            locked: false,
          };
        } else {
          throw new Error(
            'You must log in with your password before setting a PIN.',
          );
        }
      }

      const snapshot: PersistedSession = {
        token: session.token ?? sessionRef.current?.token,
        refreshToken: session.refreshToken ?? sessionRef.current?.refreshToken,
        tokenLoginUrl:
          session.tokenLoginUrl ?? sessionRef.current?.tokenLoginUrl ?? null,
        user: session.user ?? state.user ?? sessionRef.current?.user ?? null,
        locked: session.locked,
      };

      sessionRef.current = snapshot;
      await persistSessionSnapshot(snapshot);
      await persistPin(pin);
    },
    [canManagePin, state.user],
  );

  const removePin = useCallback(async () => {
    if (!canManagePin) {
      throw new Error(
        'Please log in with your username and password before changing your PIN.',
      );
    }

    await clearPin();
  }, [canManagePin]);

  const logout = useCallback(async () => {
    let snapshot = sessionRef.current ?? (await ensureValidSession());

    if (snapshot) {
      const mergedSnapshot: PersistedSession = {
        token: snapshot.token,
        refreshToken: snapshot.refreshToken,
        tokenLoginUrl: snapshot.tokenLoginUrl ?? null,
        user: snapshot.user ?? state.user ?? null,
        locked: true,
      };

      sessionRef.current = mergedSnapshot;
      await persistSessionSnapshot(mergedSnapshot);
      logSessionSnapshot('auth.logout.persistedSnapshot', mergedSnapshot);
    } else {
      await setSessionLock(true);
      logSessionSnapshot('auth.logout.lockedWithoutSnapshot', null);
    }

    await clearPasswordAuthenticated();
    deviceLog.info('Session locked. User logged out.');
    dispatch({
      type: 'SET_LOCKED',
      payload: {
        locked: true,
        user: state.user,
        membership: state.membership,
        passwordAuthenticated: false,
        memberQrCode: state.memberQrCode,
      },
    });
  }, [
    logSessionSnapshot,
    state.memberQrCode,
    state.membership,
    state.user,
  ]);

  const resetError = useCallback(() => {
    dispatch({ type: 'RESET_ERROR' });
  }, []);

  const requestPasswordReset = useCallback(async (identifier: string) => {
    try {
      const message = await requestWordpressPasswordReset(identifier);
      deviceLog.info('Password reset requested', { identifier });
      return message;
    } catch (error) {
      deviceLog.error('Password reset request failed', error);
      throw error instanceof Error
        ? error
        : new Error('Unable to send password reset email.');
    }
  }, []);

  const resetPasswordWithCode = useCallback(
    async (options: ResetPasswordOptions) => {
      try {
        const message = await resetWordpressPasswordWithCode(options);
        deviceLog.info('Direct password reset completed', {
          identifier: options.identifier,
        });
        return message;
      } catch (error) {
        deviceLog.error('Direct password reset failed', error);
        throw error instanceof Error
          ? error
          : new Error('Unable to reset password.');
      }
    },
    [],
  );

  const updateProfileAvatar = useCallback(
    async (options: {
      uri: string;
      fileName?: string;
      mimeType?: string;
    }) => {
      try {
        const updatedUser = await uploadWordPressProfileAvatar(options);

        if (sessionRef.current) {
          sessionRef.current = { ...sessionRef.current, user: updatedUser };
        } else {
          sessionRef.current = {
            token: undefined,
            refreshToken: undefined,
            tokenLoginUrl: undefined,
            restNonce: undefined,
            user: updatedUser,
            locked: false,
          };
        }

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: updatedUser,
            method: state.authMethod,
            membership: updatedUser?.membership ?? state.membership,
            passwordAuthenticated: state.hasPasswordAuthenticated,
            memberQrCode: state.memberQrCode,
          },
        });

        deviceLog.success('Profile avatar updated');
        return updatedUser;
      } catch (error) {
        deviceLog.error('Profile avatar update failed', error);
        throw error instanceof Error
          ? error
          : new Error('Unable to update profile photo.');
      }
  },
    [
      state.authMethod,
      state.hasPasswordAuthenticated,
      state.memberQrCode,
      state.membership,
    ],
  );

  const deleteProfileAvatar = useCallback(async () => {
    try {
      const updatedUser = await deleteWordPressProfileAvatar();

      if (sessionRef.current) {
        sessionRef.current = { ...sessionRef.current, user: updatedUser };
      } else {
        sessionRef.current = {
          token: undefined,
          refreshToken: undefined,
          tokenLoginUrl: undefined,
          restNonce: undefined,
          user: updatedUser,
          locked: false,
        };
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: updatedUser,
          method: state.authMethod,
          membership: updatedUser?.membership ?? state.membership,
          passwordAuthenticated: state.hasPasswordAuthenticated,
          memberQrCode: state.memberQrCode,
        },
      });

      deviceLog.success('Profile avatar removed');
      return updatedUser;
    } catch (error) {
      deviceLog.error('Profile avatar removal failed', error);
      throw error instanceof Error
        ? error
        : new Error('Unable to remove profile photo.');
    }
  }, [
    deleteWordPressProfileAvatar,
    state.authMethod,
    state.hasPasswordAuthenticated,
    state.memberQrCode,
    state.membership,
  ]);

  const refreshSession = useCallback(async () => {
    const session = await ensureValidSession();
    if (!session) {
      await clearSession();
      await clearPin();
      sessionRef.current = null;
      dispatch({ type: 'LOGOUT' });
      return;
    }

    sessionRef.current = session;
    const passwordAuthenticated =
      (await hasPasswordAuthenticated()) && !session.locked;

    const memberQrCode = await fetchMemberQrCode(session);

    if (session.locked) {
      dispatch({
        type: 'SET_LOCKED',
        payload: {
          locked: true,
          user: session.user ?? state.user,
          membership: session.user?.membership ?? state.membership,
          passwordAuthenticated: false,
          memberQrCode: memberQrCode ?? state.memberQrCode,
        },
      });
      return;
    }

    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: {
        user: session.user,
        method: state.authMethod,
        membership: session.user?.membership ?? state.membership,
        passwordAuthenticated,
        memberQrCode,
      },
    });
  }, [
    fetchMemberQrCode,
    state.authMethod,
    state.memberQrCode,
    state.membership,
    state.user,
  ]);

  const getSessionToken = useCallback(async () => {
    const session = await ensureValidSession();

    if (!session) {
      sessionRef.current = null;
      return null;
    }

    sessionRef.current = session;

    if (!session.locked) {
      try {
        let cookieResult = await ensureCookieSession(session);
        logCookieHydration('auth.session.cookie.initial', cookieResult, {
          hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
        });

        if (!cookieResult.ok && session.tokenLoginUrl) {
          try {
            await hydrateTokenLogin(session.tokenLoginUrl);
            cookieResult = await ensureCookieSession(session);
            logCookieHydration('auth.session.cookie.retry', cookieResult, {
              hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
            });
          } catch (error) {
            deviceLog.warn('Session token login hydration failed', {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      } catch (error) {
        deviceLog.warn('Session cookie refresh failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return session.token ?? null;
  }, [hydrateTokenLogin, logCookieHydration]);

  const registerAccount = useCallback(async (options: RegisterOptions) => {
    const registrationDate = new Date().toISOString();
    const normalizedAccountType =
      (options.accountType ?? 'member').toLowerCase();
    const isVendor = normalizedAccountType === 'vendor';

    try {
      const message = await registerWordPressAccount({
        ...options,
        registrationDate,
      });
      deviceLog.success('Account registration succeeded', {
        username: options.username,
        accountType: normalizedAccountType,
      });
      if (isVendor) {
        deviceLog.info('Vendor application submitted', {
          username: options.username,
          status: 'pending',
        });
      } else {
        deviceLog.info('WooCommerce customer created', {
          username: options.username,
          role: 'customer',
          membershipPlan: 'blue-membership',
        });
        deviceLog.info('WooCommerce order created', {
          username: options.username,
          membershipPlan: 'blue-membership',
          status: 'completed',
          purchaseDate: registrationDate,
          subscriptionDate: registrationDate,
        });
      }
      return message;
    } catch (error) {
      deviceLog.error('Account registration failed', error);
      throw error instanceof Error
        ? error
        : new Error('Unable to register a new account.');
    }
  }, []);

  const userEmail = state.user?.email ?? null;

  const changePassword = useCallback(
    async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      try {
        let session = sessionRef.current ?? (await ensureValidSession());
        if (!session) {
          throw new Error('Unable to change password.');
        }

        const identifier = userEmail?.trim() ?? session.user?.email?.trim();

        if (identifier) {
          try {
            const refreshed = await loginWithWordPress({
              email: identifier,
              password: currentPassword,
              remember: true,
            });

            if (refreshed) {
              let reauthCookie = await ensureCookieSession(refreshed);
              logCookieHydration('auth.passwordChange.cookie.reauth.initial', reauthCookie, {
                hasTokenLoginUrl: Boolean(refreshed.tokenLoginUrl),
              });
              if (!reauthCookie.ok && refreshed.tokenLoginUrl) {
                try {
                  await hydrateTokenLogin(refreshed.tokenLoginUrl);
                  reauthCookie = await ensureCookieSession(refreshed);
                  logCookieHydration('auth.passwordChange.cookie.reauth.retry', reauthCookie, {
                    hasTokenLoginUrl: Boolean(refreshed.tokenLoginUrl),
                  });
                } catch (error) {
                  deviceLog.warn('Password reauth cookie hydration failed', error);
                }
              }
              session = refreshed;
            }
          } catch (error) {
            deviceLog.warn('Password reauthentication failed', error);
          }
        }

        let changeCookie = await ensureCookieSession(session);
        logCookieHydration('auth.passwordChange.cookie.final.initial', changeCookie, {
          hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
        });
        if (!changeCookie.ok && session.tokenLoginUrl) {
          try {
            await hydrateTokenLogin(session.tokenLoginUrl);
            changeCookie = await ensureCookieSession(session);
            logCookieHydration('auth.passwordChange.cookie.final.retry', changeCookie, {
              hasTokenLoginUrl: Boolean(session.tokenLoginUrl),
            });
          } catch (error) {
            deviceLog.warn('Password change cookie hydration failed', error);
          }
        }
        sessionRef.current = session;

        await updateWordPressPassword({
          token: session.token,
          currentPassword,
          newPassword,
          tokenLoginUrl: session.tokenLoginUrl,
          restNonce: session.restNonce,
          userId: session.user?.id ?? null,
          identifier,
        });
        await refreshSession();
        deviceLog.success('Password updated successfully');
      } catch (error) {
        deviceLog.error('Password update failed', error);
        throw error instanceof Error
          ? error
          : new Error('Unable to change password.');
      }
    },
    [hydrateTokenLogin, logCookieHydration, refreshSession, userEmail],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      loginWithPassword,
      loginWithPin,
      loginWithBiometrics,
      changePassword,
      registerPin,
      removePin,
      logout,
      resetError,
      refreshSession,
      getSessionToken,
      requestPasswordReset,
      registerAccount,
      resetPasswordWithCode,
      updateProfileAvatar,
      deleteProfileAvatar,
    }),
    [
      state,
      loginWithPassword,
      loginWithPin,
      loginWithBiometrics,
      changePassword,
      registerPin,
      removePin,
      logout,
      resetError,
      refreshSession,
      getSessionToken,
      requestPasswordReset,
      registerAccount,
      resetPasswordWithCode,
      updateProfileAvatar,
      deleteProfileAvatar,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = (): AuthContextValue => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider.');
  }
  return context;
};
