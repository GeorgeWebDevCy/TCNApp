import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';

export const hashWithSalt = (value: string, salt: string): string => {
  return SHA256(`${salt}:${value}`).toString(encHex);
};

export const generateSalt = (length = 16): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let salt = '';
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    salt += charset[randomIndex];
  }
  return salt;
};
