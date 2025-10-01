import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@tcnapp:biometric-login-enabled';

export const isBiometricLoginEnabled = async (): Promise<boolean> => {
  const value = await AsyncStorage.getItem(STORAGE_KEY);
  return value === 'true';
};

export const setBiometricLoginEnabled = async (
  enabled: boolean,
): Promise<void> => {
  if (enabled) {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
  } else {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
};
