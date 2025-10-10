import SHA256 from 'crypto-js/sha256';
import encHex from 'crypto-js/enc-hex';

export const hashWithSalt = (value: string, salt: string): string => {
  return SHA256(`${salt}:${value}`).toString(encHex);
};

const getSecureRandomBytes = (size: number): Uint8Array => {
  if (size <= 0) {
    return new Uint8Array(0);
  }

  if (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto === 'object' &&
    typeof globalThis.crypto?.getRandomValues === 'function'
  ) {
    const buffer = new Uint8Array(size);
    globalThis.crypto.getRandomValues(buffer);
    return buffer;
  }

  let nodeCrypto:
    | {
        randomBytes?: (size: number) => unknown;
      }
    | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    nodeCrypto = require('crypto');
  } catch (error) {
    nodeCrypto = null;
  }

  if (nodeCrypto?.randomBytes) {
    const bytes = nodeCrypto.randomBytes(size);

    if (bytes instanceof Uint8Array) {
      return bytes;
    }

    if (ArrayBuffer.isView(bytes)) {
      const view = bytes as ArrayBufferView;
      return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
    }

    if (bytes instanceof ArrayBuffer) {
      return new Uint8Array(bytes);
    }

    if (Array.isArray(bytes)) {
      return Uint8Array.from(bytes);
    }
  }

  throw new Error('Secure random number generator is not available.');
};

export const generateSalt = (length = 16): string => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let salt = '';
  const randomBytes = getSecureRandomBytes(length);
  for (let i = 0; i < length; i += 1) {
    const randomIndex = randomBytes[i] % charset.length;
    salt += charset[randomIndex];
  }
  return salt;
};
