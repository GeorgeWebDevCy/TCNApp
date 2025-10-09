import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RNCamera } from 'react-native-camera';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { validateMemberQrCode } from '../services/wordpressAuthService';
import { MemberValidationResult } from '../types/auth';
import { COLORS } from '../config/theme';

export const VendorScanScreen: React.FC = () => {
  const {
    state: { user },
    logout,
    getSessionToken,
  } = useAuthContext();
  const { t } = useLocalization();
  const [manualToken, setManualToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<MemberValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [lastScannedToken, setLastScannedToken] = useState<string | null>(null);

  const handleValidation = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setError(t('vendor.screen.errors.empty'));
        return;
      }

      setIsValidating(true);
      setError(null);

      try {
        const sessionToken = await getSessionToken();
        const validation = await validateMemberQrCode(trimmed, sessionToken);
        setResult(validation);
        setLastScannedToken(trimmed);
        if (!validation.valid) {
          setError(
            validation.message ?? t('vendor.screen.status.invalidMessage'),
          );
        }
      } catch (validationError) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : t('vendor.screen.errors.generic');
        setError(message);
      } finally {
        setIsValidating(false);
      }
    },
    [getSessionToken, t],
  );

  const handleBarCodeRead = useCallback(
    (event: { data?: string } | undefined) => {
      const token = event?.data?.trim();
      if (!token || isValidating || token === lastScannedToken) {
        return;
      }
      void handleValidation(token);
    },
    [handleValidation, isValidating, lastScannedToken],
  );

  const handleManualSubmit = useCallback(() => {
    void handleValidation(manualToken);
  }, [handleValidation, manualToken]);

  const statusLabel = useMemo(() => {
    if (!result) {
      return null;
    }

    return result.valid
      ? t('vendor.screen.status.valid')
      : t('vendor.screen.status.invalid');
  }, [result, t]);

  const discountLabel = useMemo(() => {
    if (!result?.allowedDiscount) {
      return null;
    }
    const formatted = Math.round(result.allowedDiscount * 100) / 100;
    return `${formatted}%`;
  }, [result?.allowedDiscount]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        testID="vendor-scan-scroll"
      >
        <Text style={styles.title}>{t('vendor.screen.title')}</Text>
        <Text style={styles.subtitle}>{t('vendor.screen.subtitle')}</Text>

        <View style={styles.cameraContainer}>
          {permissionDenied ? (
            <Text style={styles.permissionText} testID="vendor-camera-permission">
              {t('vendor.screen.permissionDenied')}
            </Text>
          ) : (
            <RNCamera
              style={styles.camera}
              captureAudio={false}
              onBarCodeRead={handleBarCodeRead}
              barCodeTypes={[RNCamera.Constants.BarCodeType.qr]}
              androidCameraPermissionOptions={{
                title: t('vendor.screen.cameraPermission.title'),
                message: t('vendor.screen.cameraPermission.message'),
                buttonPositive: t('vendor.screen.cameraPermission.accept'),
                buttonNegative: t('vendor.screen.cameraPermission.decline'),
              }}
              onStatusChange={({ cameraStatus }) => {
                setPermissionDenied(cameraStatus === 'NOT_AUTHORIZED');
              }}
            />
          )}
        </View>

        <View style={styles.manualEntry}>
          <Text style={styles.sectionTitle}>{t('vendor.screen.manualTitle')}</Text>
          <TextInput
            value={manualToken}
            onChangeText={setManualToken}
            placeholder={t('vendor.screen.manualPlaceholder')}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            testID="vendor-manual-input"
          />
          <Pressable
            style={[styles.primaryButton, isValidating && styles.buttonDisabled]}
            onPress={handleManualSubmit}
            accessibilityRole="button"
            disabled={isValidating}
            testID="vendor-manual-submit"
          >
            {isValidating ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('vendor.screen.manualSubmit')}
              </Text>
            )}
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.errorText} testID="vendor-error">
            {error}
          </Text>
        ) : null}

        {result ? (
          <View style={styles.resultCard} testID="vendor-result">
            <Text style={styles.resultTitle}>{statusLabel}</Text>
            {result.memberName ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.memberName', {
                  replace: { name: result.memberName },
                })}
              </Text>
            ) : null}
            {result.membershipTier ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.membershipTier', {
                  replace: { tier: result.membershipTier },
                })}
              </Text>
            ) : null}
            {discountLabel ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.discount', {
                  replace: { discount: discountLabel },
                })}
              </Text>
            ) : null}
            {result.message && !result.valid ? (
              <Text style={styles.resultMessage}>{result.message}</Text>
            ) : null}
          </View>
        ) : null}

        <Pressable
          style={styles.outlineButton}
          accessibilityRole="button"
          onPress={() => void logout()}
          testID="vendor-logout"
        >
          <Text style={styles.outlineButtonText}>{t('vendor.screen.logout')}</Text>
        </Pressable>

        {user?.name ? (
          <Text style={styles.footerNote}>
            {t('vendor.screen.operator', { replace: { name: user.name } })}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 24,
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  cameraContainer: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
  },
  camera: {
    flex: 1,
  },
  permissionText: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.textSecondary,
  },
  manualEntry: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  resultMeta: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resultMessage: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  outlineButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  footerNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

