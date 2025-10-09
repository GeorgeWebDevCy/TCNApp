import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  PermissionsAndroid,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { CameraScreen } from 'react-native-camera-kit';
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
  const cameraKitAvailable = Platform.OS !== 'web';
  const blockedPermissionLoggedRef = useRef<'granted' | 'denied' | 'unknown' | null>(
    null,
  );

  useEffect(() => {
    deviceLog.debug('qrScanner.cameraKit.detected', {
      available: cameraKitAvailable,
      platform: Platform.OS,
    });
  }, [cameraKitAvailable]);

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
          if (value.nativeEvent) {
            const nested = tryExtract(value.nativeEvent);
            if (nested) return nested;
          }
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

  if (!cameraKitAvailable) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            QR scanning is not available on this device.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <CameraScreen
        style={styles.native}
        cameraType="back"
        scanBarcode
        hideControls
        showFrame
        onReadCode={handleNativeScan}
      />
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

