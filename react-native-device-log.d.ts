declare module 'react-native-device-log' {
  import * as React from 'react';
  import { ViewProps } from 'react-native';

  export interface StorageAdapter {
    getItem(key: string): Promise<string | null> | string | null;
    setItem(key: string, value: string): Promise<void> | void;
    removeItem(key: string): Promise<void> | void;
  }

  export interface DeviceLogOptions {
    logToConsole?: boolean;
    logRNErrors?: boolean;
    maxNumberToRender?: number;
    maxNumberToPersist?: number;
  }

  export interface DeviceLog {
    init(adapter?: StorageAdapter, options?: DeviceLogOptions): Promise<void>;
    log(...params: unknown[]): void;
    info(...params: unknown[]): void;
    debug(...params: unknown[]): void;
    warn(...params: unknown[]): void;
    error(...params: unknown[]): void;
    success(...params: unknown[]): void;
    clear(): Promise<void> | void;
    startTimer(name: string): void;
    stopTimer(name: string): void;
    logTime(name: string): void;
  }

  export interface LogViewProps extends ViewProps {
    inverted?: boolean;
    multiExpanded?: boolean;
    timeStampFormat?: string;
  }

  export const LogView: React.ComponentType<LogViewProps>;
  export class InMemoryAdapter implements StorageAdapter {
    constructor(initialState?: Record<string, string>);
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  }

  const deviceLog: DeviceLog;
  export default deviceLog;
}
