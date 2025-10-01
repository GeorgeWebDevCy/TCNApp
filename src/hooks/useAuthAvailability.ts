import { useCallback, useEffect, useState } from 'react';
import { isBiometricsAvailable, type BiometryType } from '../services/biometricService';
import { isBiometricLoginEnabled } from '../services/biometricPreferenceService';
import { hasPin } from '../services/pinService';

interface AuthAvailability {
  pin: boolean;
  biometrics: boolean;
  biometricsSupported: boolean;
  biometryType: BiometryType;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useAuthAvailability = (): AuthAvailability => {
  const [state, setState] = useState({
    pin: false,
    biometrics: false,
    biometricsSupported: false,
    biometryType: null as BiometryType,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const [pinAvailable, biometricsInfo, biometricsEnabled] = await Promise.all([
      hasPin(),
      isBiometricsAvailable(),
      isBiometricLoginEnabled(),
    ]);

    setState({
      pin: pinAvailable,
      biometrics: biometricsInfo.available && biometricsEnabled,
      biometricsSupported: biometricsInfo.available,
      biometryType: biometricsInfo.type,
      loading: false,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
};
