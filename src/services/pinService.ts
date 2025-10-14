import AsyncStorage from '@react-native-async-storage/async-storage';
import { PIN_CONFIG } from '../config/authConfig';
import { generateSalt, hashWithSalt } from '../utils/hash';
import { createAppError } from '../errors';

const getStoredHash = async (): Promise<string | null> => {
  return AsyncStorage.getItem(PIN_CONFIG.storageKey);
};

const getStoredSalt = async (): Promise<string | null> => {
  return AsyncStorage.getItem(PIN_CONFIG.saltKey);
};

export const hasPin = async (): Promise<boolean> => {
  const storedHash = await getStoredHash();
  return Boolean(storedHash);
};

export const registerPin = async (pin: string): Promise<void> => {
  if (pin.length < 4) {
    throw createAppError('AUTH_PIN_LENGTH');
  }

  const salt = generateSalt();
  const hash = hashWithSalt(pin, salt);

  await AsyncStorage.multiSet([
    [PIN_CONFIG.storageKey, hash],
    [PIN_CONFIG.saltKey, salt],
  ]);
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  const [storedHash, salt] = await Promise.all([
    getStoredHash(),
    getStoredSalt(),
  ]);

  if (!storedHash || !salt) {
    return false;
  }

  const incomingHash = hashWithSalt(pin, salt);
  return incomingHash === storedHash;
};

export const clearPin = async (): Promise<void> => {
  await AsyncStorage.multiRemove([PIN_CONFIG.storageKey, PIN_CONFIG.saltKey]);
};
