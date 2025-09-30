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
  refreshPersistedUserProfile,
  updatePassword as updateWordPressPassword,
  setSessionLock,
  persistSessionSnapshot,
} from '../services/wordpressAuthService';
import type { PersistedSession } from '../services/wordpressAuthService';
import {
  AuthContextValue,
  AuthState,
  AuthUser,
  LoginOptions,
  MembershipInfo,
  PinLoginOptions,
  RegisterOptions,
} from '../types/auth';

interface LoginSuccessPayload {
  user: AuthUser | null;
  method: AuthState['authMethod'];
  passwordAuthenticated: boolean;
  membership: MembershipInfo | null;
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

export const AuthContext = React.createContext<AuthContextValue | undefined>(
  undefined,
);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const sessionRef = useRef<PersistedSession | null>(null);

  const bootstrap = useCallback(async () => {
    dispatch({ type: 'BOOTSTRAP_START' });

    const session = await ensureValidSession();
    sessionRef.current = session;
    const passwordAuthenticated =
      (await hasPasswordAuthenticated()) &&
      Boolean(session) &&
      !session?.locked;

    dispatch({
      type: 'BOOTSTRAP_COMPLETE',
      payload: {
        user: session?.user ?? null,
        locked: session?.locked ?? false,
        membership: session?.user?.membership ?? null,
        passwordAuthenticated,
      },
    });
  }, []);

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
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: {
          user: session.user,
          method: 'password',
          membership: session.user?.membership ?? null,
          passwordAuthenticated: true,
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
  }, []);

  const loginWithPin = useCallback(
    async ({ pin }: PinLoginOptions) => {
      dispatch({ type: 'LOGIN_START' });
      try {
        const isValidPin = await verifyPin(pin);
        if (!isValidPin) {
          throw new Error('Incorrect PIN.');
        }

        const session = await ensureValidSession();
        if (!session) {
          throw new Error(
            'No saved session. Please log in with your password first.',
          );
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
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: refreshedUser,
              method: 'pin',
              membership: refreshedUser?.membership ?? null,
              passwordAuthenticated: state.hasPasswordAuthenticated,
            },
          });
          deviceLog.success('PIN login succeeded for refreshed user');
          return;
        }

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: session.user,
            method: 'pin',
            membership: session.user?.membership ?? state.membership,
            passwordAuthenticated: state.hasPasswordAuthenticated,
          },
        });
        deviceLog.success('PIN login succeeded');
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to sign in with PIN.';
        deviceLog.error('PIN login failed', error);
        dispatch({ type: 'LOGIN_ERROR', payload: message });
      }
    },
    [state.hasPasswordAuthenticated, state.membership],
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

        const success = await authenticateWithBiometrics(promptMessage);
        if (!success) {
          throw new Error('Biometric authentication was cancelled.');
        }

        const session = await ensureValidSession();
        if (!session) {
          throw new Error(
            'No saved session. Please log in with your password first.',
          );
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
          dispatch({
            type: 'LOGIN_SUCCESS',
            payload: {
              user: refreshedUser,
              method: 'biometric',
              membership: refreshedUser?.membership ?? null,
              passwordAuthenticated: state.hasPasswordAuthenticated,
            },
          });
          deviceLog.success('Biometric login succeeded for refreshed user');
          return;
        }

        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: session.user,
            method: 'biometric',
            membership: session.user?.membership ?? state.membership,
            passwordAuthenticated: state.hasPasswordAuthenticated,
          },
        });
        deviceLog.success('Biometric login succeeded');
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to complete biometric login.';
        deviceLog.error('Biometric login failed', error);
        dispatch({ type: 'LOGIN_ERROR', payload: message });
      }
    },
    [state.hasPasswordAuthenticated, state.membership],
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
        throw new Error(
          'You must log in with your password before setting a PIN.',
        );
      }

      await persistPin(pin);
    },
    [canManagePin],
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
    await setSessionLock(true);
    await clearPasswordAuthenticated();
    deviceLog.info('Session locked. User logged out.');
    sessionRef.current = null;
    dispatch({
      type: 'SET_LOCKED',
      payload: {
        locked: true,
        user: state.user,
        membership: state.membership,
        passwordAuthenticated: false,
      },
    });
  }, [state.membership, state.user]);

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

    if (session.locked) {
      dispatch({
        type: 'SET_LOCKED',
        payload: {
          locked: true,
          user: session.user ?? state.user,
          membership: session.user?.membership ?? state.membership,
          passwordAuthenticated: false,
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
      },
    });
  }, [state.authMethod, state.membership, state.user]);

  const registerAccount = useCallback(async (options: RegisterOptions) => {
    try {
      const message = await registerWordPressAccount(options);
      deviceLog.info('Account registration succeeded', {
        username: options.username,
      });
      return message;
    } catch (error) {
      deviceLog.error('Account registration failed', error);
      throw error instanceof Error
        ? error
        : new Error('Unable to register a new account.');
    }
  }, []);

  const changePassword = useCallback(
    async ({
      currentPassword,
      newPassword,
    }: {
      currentPassword: string;
      newPassword: string;
    }) => {
      if (!state.user?.email) {
        throw new Error('Unable to change password.');
      }

      if (!state.hasPasswordAuthenticated) {
        throw new Error(
          'Please log in with your username and password before changing your password.',
        );
      }

      const identifier = state.user.email.trim();
      if (identifier.length === 0) {
        throw new Error('Unable to change password.');
      }

      try {
        const session = await loginWithWordPress({
          username: identifier,
          password: currentPassword,
        });
        if (!session.token) {
          throw new Error('Unable to change password.');
        }

        await updateWordPressPassword({ token: session.token, newPassword });
        await loginWithWordPress({
          username: identifier,
          password: newPassword,
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
    [refreshSession, state.hasPasswordAuthenticated, state.user?.email],
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
      requestPasswordReset,
      registerAccount,
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
      requestPasswordReset,
      registerAccount,
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
