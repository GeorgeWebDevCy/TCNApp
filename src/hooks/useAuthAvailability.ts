import { useCallback, useEffect, useState } from 'react';
import { isBiometricsAvailable, type BiometryType } from '../services/biometricService';
import { hasPin } from '../services/pinService';

interface AuthAvailability {
  pin: boolean;
  biometrics: boolean;
  biometryType: BiometryType;
  loading: boolean;
  refresh: () => Promise<void>;
}

export const useAuthAvailability = (): AuthAvailability => {
  const [state, setState] = useState({
    pin: false,
    biometrics: false,
    biometryType: null as BiometryType,
    loading: true,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));

    const [pinAvailable, biometricsInfo] = await Promise.all([
      hasPin(),
      isBiometricsAvailable(),
    ]);

    setState({
      pin: pinAvailable,
      biometrics: biometricsInfo.available,
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
