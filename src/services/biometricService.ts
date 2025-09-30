export type BiometryType =
  | 'TouchID'
  | 'FaceID'
  | 'Iris'
  | 'Biometrics'
  | 'Unknown'
  | null;

type BiometricsClient = {
  isSensorAvailable: () => Promise<{
    available: boolean;
    biometryType?: BiometryType | null;
  }>;
  simplePrompt: (options: { promptMessage: string }) => Promise<{
    success: boolean;
  }>;
};

let biometricsClient: BiometricsClient | null = null;

try {
  const biometricsModule = require('react-native-biometrics');
  const BiometricsClass = biometricsModule.default ?? biometricsModule;

  if (typeof BiometricsClass === 'function') {
    biometricsClient = new BiometricsClass() as BiometricsClient;
  } else if (biometricsModule.ReactNativeBiometricsLegacy) {
    biometricsClient =
      biometricsModule.ReactNativeBiometricsLegacy as BiometricsClient;
  }
} catch (error) {
  biometricsClient = null;
}

export const isBiometricsAvailable = async (): Promise<{
  available: boolean;
  type: BiometryType;
}> => {
  if (!biometricsClient) {
    return { available: false, type: null };
  }

  try {
    const { available, biometryType } =
      await biometricsClient.isSensorAvailable();
    return { available, type: biometryType ?? 'Unknown' };
  } catch (error) {
    return { available: false, type: null };
  }
};

export const authenticateWithBiometrics = async (
  message = 'Log in with biometrics',
): Promise<boolean> => {
  if (!biometricsClient) {
    throw new Error('Biometric authentication is not configured.');
  }

  try {
    const { success } = await biometricsClient.simplePrompt({
      promptMessage: message,
    });
    return success;
  } catch (error) {
    return false;
  }
};
