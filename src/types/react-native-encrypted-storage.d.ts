declare module 'react-native-encrypted-storage' {
  export function setItem(key: string, value: string): Promise<void>;
  export function getItem(key: string): Promise<string | null>;
  export function removeItem(key: string): Promise<void>;
  export function clear(): Promise<void>;
}
