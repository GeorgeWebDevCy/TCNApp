import type ReactNativeBiometricsType from 'react-native-biometrics';

let ReactNativeBiometrics: typeof ReactNativeBiometricsType | null = null;

try {
  const biometricsModule = require('react-native-biometrics');
  ReactNativeBiometrics = biometricsModule.default ?? biometricsModule;
} catch (error) {
  ReactNativeBiometrics = null;
}

export type BiometryType =
  | 'TouchID'
  | 'FaceID'
  | 'Iris'
  | 'Biometrics'
  | 'Unknown'
  | null;

export const isBiometricsAvailable = async (): Promise<{
  available: boolean;
  type: BiometryType;
}> => {
  if (!ReactNativeBiometrics) {
    return { available: false, type: null };
  }

  try {
    const { available, biometryType } = await ReactNativeBiometrics.isSensorAvailable();
    return { available, type: biometryType ?? 'Unknown' };
  } catch (error) {
    return { available: false, type: null };
  }
};

export const authenticateWithBiometrics = async (
  message = 'Log in with biometrics',
): Promise<boolean> => {
  if (!ReactNativeBiometrics) {
    throw new Error('Biometric authentication is not configured.');
  }

  try {
    const { success } = await ReactNativeBiometrics.simplePrompt({ promptMessage: message });
    return success;
  } catch (error) {
    return false;
  }
};
