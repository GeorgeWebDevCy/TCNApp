import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { ErrorId, createAppError, ensureAppError } from '../errors';
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
  reauthenticateWithStoredCredentials,
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
          deviceLog.debug('auth.memberQr.fetchSuccess', {
            userId: user.id,
            hasPayload: Boolean(qrCode.payload ?? user.qrPayload ?? null),
            tokenSuffix:
              qrCode.token && qrCode.token.length > 4
                ? qrCode.token.slice(-4)
                : qrCode.token,
          });
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

        let blockingErrorId: ErrorId | null = null;
        if (normalizedStatus === 'pending') {
          blockingErrorId = 'AUTH_VENDOR_PENDING';
        } else if (normalizedStatus === 'rejected') {
          blockingErrorId = 'AUTH_VENDOR_REJECTED';
        } else if (normalizedStatus === 'suspended') {
          blockingErrorId = 'AUTH_VENDOR_SUSPENDED';
        }

        if (blockingErrorId) {
          deviceLog.warn('Vendor login blocked', {
            status: normalizedStatus,
            userId: resolvedUser?.id ?? null,
            errorCode: blockingErrorId,
          });
          await clearSession();
          await clearPasswordAuthenticated();
          sessionRef.current = null;
          throw createAppError(blockingErrorId);
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
      const appError = ensureAppError(error, 'AUTH_PASSWORD_LOGIN_FAILED', {
        propagateMessage: true,
      });
      deviceLog.error('Password login failed', {
        code: appError.code,
        message: appError.displayMessage,
        cause:
          error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
      dispatch({
        type: 'LOGIN_ERROR',
        payload: appError.toDisplayString(),
      });
    }
  }, [fetchMemberQrCode, hydrateTokenLogin, logCookieHydration]);

  const loginWithPin = useCallback(
    async ({ pin }: PinLoginOptions) => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const isValidPin = await verifyPin(pin);
        if (!isValidPin) {
          throw createAppError('AUTH_PIN_INCORRECT');
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
          throw createAppError('AUTH_NO_SAVED_SESSION');
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
            throw createAppError('AUTH_NO_SAVED_SESSION');
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
        const appError = ensureAppError(error, 'AUTH_PIN_LOGIN_FAILED', {
          propagateMessage: true,
        });
        deviceLog.error('PIN login failed', {
          code: appError.code,
          message: appError.displayMessage,
          cause:
            error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        dispatch({
          type: 'LOGIN_ERROR',
          payload: appError.toDisplayString(),
        });
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
          throw createAppError('AUTH_BIOMETRICS_UNAVAILABLE');
        }

        const enabled = await isBiometricLoginEnabled();
        if (!enabled) {
          throw createAppError('AUTH_BIOMETRICS_NOT_CONFIGURED');
        }

        const success = await authenticateWithBiometrics(promptMessage);
        if (!success) {
          throw createAppError('AUTH_BIOMETRICS_CANCELLED');
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
          throw createAppError('AUTH_NO_SAVED_SESSION');
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
            throw createAppError('AUTH_NO_SAVED_SESSION');
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
        const appError = ensureAppError(error, 'AUTH_BIOMETRIC_LOGIN_FAILED', {
          propagateMessage: true,
        });
        deviceLog.error('Biometric login failed', {
          code: appError.code,
          message: appError.displayMessage,
          cause:
            error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        dispatch({
          type: 'LOGIN_ERROR',
          payload: appError.toDisplayString(),
        });
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
        throw createAppError('AUTH_LOGIN_BEFORE_PIN_CREATION');
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
            tokenExpiresAt:
              sessionRef.current?.tokenExpiresAt ?? null,
            user: state.user,
            locked: false,
          };
        } else {
          throw createAppError('AUTH_LOGIN_BEFORE_PIN_SETTING');
        }
      }

      const snapshot: PersistedSession = {
        token: session.token ?? sessionRef.current?.token,
        refreshToken: session.refreshToken ?? sessionRef.current?.refreshToken,
        tokenLoginUrl:
          session.tokenLoginUrl ?? sessionRef.current?.tokenLoginUrl ?? null,
        tokenExpiresAt:
          session.tokenExpiresAt ?? sessionRef.current?.tokenExpiresAt ?? null,
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
      throw createAppError('AUTH_LOGIN_BEFORE_PIN_CHANGE');
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
        tokenExpiresAt:
          snapshot.tokenExpiresAt ?? sessionRef.current?.tokenExpiresAt ?? null,
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
      const appError = ensureAppError(
        error,
        'AUTH_PASSWORD_RESET_EMAIL_FAILED',
        {
          propagateMessage: true,
        },
      );
      deviceLog.error('Password reset request failed', {
        code: appError.code,
        message: appError.displayMessage,
        cause:
          error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
      throw appError;
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
        const appError = ensureAppError(error, 'AUTH_RESET_PASSWORD_FAILED', {
          propagateMessage: true,
        });
        deviceLog.error('Direct password reset failed', {
          code: appError.code,
          message: appError.displayMessage,
          cause:
            error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        throw appError;
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
        const appError = ensureAppError(
          error,
          'PROFILE_AVATAR_UPDATE_FAILED',
          {
            propagateMessage: true,
          },
        );
        deviceLog.error('Profile avatar update failed', {
          code: appError.code,
          message: appError.displayMessage,
          cause:
            error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        throw appError;
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
      const appError = ensureAppError(
        error,
        'PROFILE_AVATAR_REMOVE_FAILED',
        {
          propagateMessage: true,
        },
      );
      deviceLog.error('Profile avatar removal failed', {
        code: appError.code,
        message: appError.displayMessage,
        cause:
          error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
      throw appError;
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
    let session = await ensureValidSession();

    if (!session?.token) {
      deviceLog.warn('auth.getSessionToken.missingToken', {
        hasSession: Boolean(session),
        locked: session?.locked ?? null,
        hasUser: Boolean(session?.user ?? null),
      });

      const reauthenticated = await reauthenticateWithStoredCredentials();
      if (reauthenticated?.token) {
        deviceLog.info('auth.getSessionToken.reauthenticated', {
          userId: reauthenticated.user?.id ?? null,
        });
        session = reauthenticated;
      } else if (!session) {
        sessionRef.current = null;
        return null;
      }
    }

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

    if (!session.token) {
      deviceLog.warn('auth.getSessionToken.unresolved');
      return null;
    }

    return session.token;
  }, [
    hydrateTokenLogin,
    logCookieHydration,
    reauthenticateWithStoredCredentials,
  ]);

  const getPersistedSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }

    const session = await ensureValidSession();
    if (session) {
      sessionRef.current = session;
    }

    return session ?? null;
  }, []);

  const registerAccount = useCallback(async (options: RegisterOptions) => {
    const normalizedAccountType =
      (options.accountType ?? 'member').toLowerCase();
    const isVendor = normalizedAccountType === 'vendor';
    const defaultMembershipPlan = isVendor ? undefined : 'blue-membership';

    try {
      const message = await registerWordPressAccount({
        ...options,
        membershipPlan: options.membershipPlan ?? defaultMembershipPlan,
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
        deviceLog.info('Member account registered', {
          username: options.username,
          membershipPlan: options.membershipPlan ?? defaultMembershipPlan ?? null,
        });
      }
      return message;
    } catch (error) {
      const appError = ensureAppError(error, 'AUTH_REGISTER_ACCOUNT_FAILED', {
        propagateMessage: true,
      });
      deviceLog.error('Account registration failed', {
        code: appError.code,
        message: appError.displayMessage,
        cause:
          error instanceof Error ? error.message : String(error ?? 'unknown'),
      });
      throw appError;
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
          throw createAppError('AUTH_CHANGE_PASSWORD_FAILED');
        }

        const identifier = userEmail?.trim() ?? session.user?.email?.trim();

        if (identifier) {
          try {
            const refreshed = await loginWithWordPress({
              identifier,
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
        const appError = ensureAppError(error, 'AUTH_CHANGE_PASSWORD_FAILED', {
          propagateMessage: true,
        });
        deviceLog.error('Password update failed', {
          code: appError.code,
          message: appError.displayMessage,
          cause:
            error instanceof Error ? error.message : String(error ?? 'unknown'),
        });
        throw appError;
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
      getPersistedSession,
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
      getPersistedSession,
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
    throw createAppError('PROVIDER_AUTH_MISSING');
  }
  return context;
};
