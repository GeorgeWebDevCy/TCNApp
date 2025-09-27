import React, { useCallback, useEffect, useMemo, useReducer } from 'react';
import { authenticateWithBiometrics, isBiometricsAvailable } from '../services/biometricService';
import { clearPin, registerPin as persistPin, verifyPin } from '../services/pinService';
import {
  clearSession,
  ensureValidSession,
  loginWithPassword as loginWithWordPress,
  refreshPersistedUserProfile,
  setSessionLock,
} from '../services/wordpressAuthService';
import { AuthContextValue, AuthState, AuthUser, LoginOptions, PinLoginOptions } from '../types/auth';

interface LoginSuccessPayload {
  user: AuthUser | null;
  method: AuthState['authMethod'];
}

type AuthAction =
  | { type: 'BOOTSTRAP_START' }
  | {
      type: 'BOOTSTRAP_COMPLETE';
      payload: { user: AuthUser | null; locked: boolean };
    }
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: LoginSuccessPayload }
  | { type: 'LOGIN_ERROR'; payload: string }
  | { type: 'SET_LOCKED'; payload: { locked: boolean; user: AuthUser | null } }
  | { type: 'LOGOUT' }
  | { type: 'RESET_ERROR' };

const initialState: AuthState = {
  isAuthenticated: false,
  isLocked: false,
  isLoading: true,
  user: null,
  authMethod: null,
  error: null,
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
        authMethod: action.payload.method,
        error: null,
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
        authMethod: null,
        isLoading: false,
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

export const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const bootstrap = useCallback(async () => {
    dispatch({ type: 'BOOTSTRAP_START' });

    const session = await ensureValidSession();

    dispatch({
      type: 'BOOTSTRAP_COMPLETE',
      payload: {
        user: session?.user ?? null,
        locked: session?.locked ?? false,
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
      await setSessionLock(false);
      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: session.user, method: 'password' },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to complete password login.';
      dispatch({ type: 'LOGIN_ERROR', payload: message });
    }
  }, []);

  const loginWithPin = useCallback(async ({ pin }: PinLoginOptions) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const isValidPin = await verifyPin(pin);
      if (!isValidPin) {
        throw new Error('Incorrect PIN.');
      }

      const session = await ensureValidSession();
      if (!session) {
        throw new Error('No saved session. Please log in with your password first.');
      }

      await setSessionLock(false);

      if (!session.user) {
        const refreshedUser = await refreshPersistedUserProfile(session.token);
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: refreshedUser, method: 'pin' },
        });
        return;
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: session.user, method: 'pin' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in with PIN.';
      dispatch({ type: 'LOGIN_ERROR', payload: message });
    }
  }, []);

  const loginWithBiometrics = useCallback(async () => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const { available } = await isBiometricsAvailable();
      if (!available) {
        throw new Error('Biometric authentication is not available on this device.');
      }

      const success = await authenticateWithBiometrics();
      if (!success) {
        throw new Error('Biometric authentication was cancelled.');
      }

      const session = await ensureValidSession();
      if (!session) {
        throw new Error('No saved session. Please log in with your password first.');
      }

      await setSessionLock(false);

      if (!session.user) {
        const refreshedUser = await refreshPersistedUserProfile(session.token);
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: { user: refreshedUser, method: 'biometric' },
        });
        return;
      }

      dispatch({
        type: 'LOGIN_SUCCESS',
        payload: { user: session.user, method: 'biometric' },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to complete biometric login.';
      dispatch({ type: 'LOGIN_ERROR', payload: message });
    }
  }, []);

  const registerPin = useCallback(async (pin: string) => {
    const session = await ensureValidSession();
    if (!session) {
      throw new Error('You must log in with your password before setting a PIN.');
    }

    await persistPin(pin);
  }, []);

  const removePin = useCallback(async () => {
    await clearPin();
  }, []);

  const logout = useCallback(async () => {
    await setSessionLock(true);
    dispatch({
      type: 'SET_LOCKED',
      payload: { locked: true, user: state.user },
    });
  }, [state.user]);

  const resetError = useCallback(() => {
    dispatch({ type: 'RESET_ERROR' });
  }, []);

  const refreshSession = useCallback(async () => {
    const session = await ensureValidSession();
    if (!session) {
      await clearSession();
      await clearPin();
      dispatch({ type: 'LOGOUT' });
      return;
    }

    if (session.locked) {
      dispatch({
        type: 'SET_LOCKED',
        payload: { locked: true, user: session.user ?? state.user },
      });
      return;
    }

    dispatch({
      type: 'LOGIN_SUCCESS',
      payload: { user: session.user, method: state.authMethod },
    });
  }, [state.authMethod, state.user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      loginWithPassword,
      loginWithPin,
      loginWithBiometrics,
      registerPin,
      removePin,
      logout,
      resetError,
      refreshSession,
    }),
    [
      state,
      loginWithPassword,
      loginWithPin,
      loginWithBiometrics,
      registerPin,
      removePin,
      logout,
      resetError,
      refreshSession,
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
