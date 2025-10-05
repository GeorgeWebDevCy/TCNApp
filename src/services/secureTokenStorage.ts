import EncryptedStorage from 'react-native-encrypted-storage';
import deviceLog from '../utils/deviceLog';

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const setSecureValue = async (
  key: string,
  value: string | null | undefined,
): Promise<void> => {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    await removeSecureValue(key);
    return;
  }

  try {
    await EncryptedStorage.setItem(key, trimmed);
  } catch (error) {
    deviceLog.error('secureTokenStorage.setError', {
      key,
      message: describeError(error),
    });
    throw error instanceof Error
      ? error
      : new Error('Unable to store secure credential.');
  }
};

export const getSecureValue = async (key: string): Promise<string | null> => {
  try {
    const value = await EncryptedStorage.getItem(key);
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
    return null;
  } catch (error) {
    deviceLog.error('secureTokenStorage.getError', {
      key,
      message: describeError(error),
    });
    return null;
  }
};

export const removeSecureValue = async (key: string): Promise<void> => {
  try {
    await EncryptedStorage.removeItem(key);
  } catch (error) {
    deviceLog.error('secureTokenStorage.removeError', {
      key,
      message: describeError(error),
    });
  }
};
