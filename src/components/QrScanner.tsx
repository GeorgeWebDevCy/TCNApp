import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import QrWebScanner from './QrWebScanner';
import deviceLog from '../utils/deviceLog';

type QrScannerProps = {
  onScan: (text: string) => void;
  style?: StyleProp<ViewStyle>;
};

const ANDROID_CAMERA_PERMISSION = PermissionsAndroid.PERMISSIONS.CAMERA;

export const QrScanner: React.FC<QrScannerProps> = ({ onScan, style }) => {
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown'>(
    Platform.OS === 'android' ? 'unknown' : 'granted',
  );
  const [nativeModule, setNativeModule] = useState<null | {
    // Try a handful of common export names; we'll pick the first that exists at runtime
    default?: React.ComponentType<any>;
    Scanner?: React.ComponentType<any>;
    QRScanner?: React.ComponentType<any>;
    BarcodeScanner?: React.ComponentType<any>;
    CameraScanner?: React.ComponentType<any>;
  }>(null);
  const loggedWebFallbackRef = useRef(false);
  const blockedPermissionLoggedRef = useRef<'granted' | 'denied' | 'unknown' | null>(
    null,
  );

  useEffect(() => {
    // Dynamically require to avoid hard dependency at build time.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('react-native-scanner');
      if (mod && typeof mod === 'object') {
        setNativeModule(mod);
        deviceLog.debug('qrScanner.nativeModule.detected', {
          exports: Object.keys(mod).slice(0, 5),
        });
      } else {
        setNativeModule(null);
        deviceLog.info('qrScanner.nativeModule.unavailable', {
          reason: 'invalid_module',
        });
      }
    } catch (error) {
      setNativeModule(null);
      deviceLog.warn('qrScanner.nativeModule.error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    const request = async () => {
      if (Platform.OS !== 'android') {
        return;
      }
      deviceLog.debug('qrScanner.permission.request.start', {
        platform: Platform.OS,
      });
      try {
        const has = await PermissionsAndroid.check(ANDROID_CAMERA_PERMISSION);
        if (has) {
          setPermission('granted');
          deviceLog.debug('qrScanner.permission.request.cached', {
            result: 'granted',
          });
          return;
        }
        const res = await PermissionsAndroid.request(ANDROID_CAMERA_PERMISSION, {
          title: 'Camera Permission',
          message: 'TCN needs camera access to scan member QR codes.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        });
        setPermission(res === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied');
        deviceLog.debug('qrScanner.permission.request.complete', {
          result: res,
        });
      } catch (error) {
        setPermission('denied');
        deviceLog.warn('qrScanner.permission.request.error', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void request();
  }, []);

  useEffect(() => {
    deviceLog.debug('qrScanner.permission.state', {
      platform: Platform.OS,
      state: permission,
    });
  }, [permission]);

  const handleNativeScan = useCallback(
    (event: unknown) => {
      // Attempt to normalize various callback payload shapes.
      const tryExtract = (value: any): string | null => {
        if (!value) return null;
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') {
          const candidates = [
            value?.data,
            value?.text,
            value?.codeStringValue,
            value?.value,
            value?.content,
          ];
          for (const c of candidates) {
            if (typeof c === 'string' && c.trim().length > 0) return c.trim();
          }
        }
        return null;
      };

      const text = tryExtract(event);
      if (text) {
        deviceLog.debug('qrScanner.native.scan', {
          length: text.length,
          suffix: text.length > 4 ? text.slice(-4) : text,
        });
        onScan(text);
      }
    },
    [onScan],
  );

  const NativeComponent = useMemo(() => {
    if (!nativeModule) return null;
    return (
      nativeModule.Scanner ||
      nativeModule.QRScanner ||
      nativeModule.BarcodeScanner ||
      nativeModule.CameraScanner ||
      nativeModule.default ||
      null
    ) as React.ComponentType<any> | null;
  }, [nativeModule]);

  if (Platform.OS === 'android' && permission !== 'granted') {
    if (blockedPermissionLoggedRef.current !== permission) {
      deviceLog.info('qrScanner.permission.blocked', {
        platform: Platform.OS,
        state: permission,
      });
      blockedPermissionLoggedRef.current = permission;
    }
    return (
      <View style={[styles.container, style]}>
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Camera permission is required to scan QR codes.
          </Text>
        </View>
      </View>
    );
  }

  if (NativeComponent) {
    // Pass multiple potential prop names so whichever the library expects will be wired.
    return (
      <View style={[styles.container, style]}>
        <NativeComponent
          style={styles.native}
          onRead={handleNativeScan}
          onScan={handleNativeScan}
          onCodeScanned={handleNativeScan}
          onScanned={handleNativeScan}
          onBarCodeRead={handleNativeScan}
        />
      </View>
    );
  }

  // Fallback to WebView-based scanner if the native module is not installed.
  if (!loggedWebFallbackRef.current) {
    deviceLog.info('qrScanner.webScanner.fallback', {
      hasNativeModule: Boolean(nativeModule),
    });
    loggedWebFallbackRef.current = true;
  }
  return (
    <View style={[styles.container, style]}>
      <QrWebScanner onScan={onScan} style={StyleSheet.absoluteFill} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  native: {
    flex: 1,
  },
  permissionBanner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  permissionText: {
    textAlign: 'center',
  },
});

export default QrScanner;

