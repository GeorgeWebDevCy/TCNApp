import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuthAvailability } from '../hooks/useAuthAvailability';
import { authenticateWithBiometrics } from '../services/biometricService';
import { setBiometricLoginEnabled } from '../services/biometricPreferenceService';
import { COLORS } from '../config/theme';
import { BrandLogo } from '../components/BrandLogo';
import { MemberQrCard } from '../components/MemberQrCard';
import { launchImageLibrary } from 'react-native-image-picker';
import { getUserDisplayName, getUserInitials } from '../utils/user';
import { PasswordVisibilityToggle } from '../components/PasswordVisibilityToggle';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import deviceLog from '../utils/deviceLog';
import { createAppError, ensureAppError } from '../errors';

type UserProfileScreenProps = {
  onBack?: () => void;
};

export const UserProfileScreen: React.FC<UserProfileScreenProps> = ({
  onBack,
}) => {
  const {
    state: { user, memberQrCode },
    changePassword,
    registerPin,
    removePin,
    updateProfileAvatar,
    deleteProfileAvatar,
  } = useAuthContext();
  const { t, translateError } = useLocalization();
  const {
    pin: hasPin,
    biometrics: biometricsEnabled,
    biometricsSupported,
    biometryType,
    loading: availabilityLoading,
    refresh: refreshAuthAvailability,
  } = useAuthAvailability();
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      deviceLog.info(`profile.${event}`, {
        userId: user?.id ?? null,
        hasPin,
        biometricsEnabled,
        biometricsSupported,
        ...payload,
      });
    },
    [biometricsEnabled, biometricsSupported, hasPin, user?.id],
  );
  const layout = useResponsiveLayout();
  const responsiveStyles = useMemo(() => {
    const stackAvatar = layout.width < 640;
    const stackPinStatus = layout.width < 520;
    const avatarSize = layout.isTablet ? 96 : layout.isSmallPhone ? 64 : 80;
    return {
      container: {
        paddingHorizontal: layout.contentPadding,
        paddingVertical: layout.contentPadding,
        width: '100%',
        alignSelf: 'center' as const,
        maxWidth: layout.maxContentWidth,
      },
      brandWrapper: layout.isTablet ? { alignItems: 'center' as const } : {},
      header: layout.isTablet
        ? { alignItems: 'center' as const, gap: 8 }
        : {},
      title: layout.isTablet ? { fontSize: 28, textAlign: 'center' as const } : {},
      subtitle: layout.isTablet ? { textAlign: 'center' as const } : {},
      avatarSection: stackAvatar
        ? {
            flexDirection: 'column' as const,
            alignItems: 'flex-start' as const,
            gap: 12,
          }
        : { alignItems: 'center' as const },
      avatar: {
        width: avatarSize,
        height: avatarSize,
        borderRadius: avatarSize / 2,
      },
      avatarActions: {
        flexWrap: 'wrap' as const,
        gap: 12,
        width: stackAvatar ? '100%' : undefined,
      },
      section: {
        padding: layout.isSmallPhone ? 16 : layout.isLargeTablet ? 24 : 20,
      },
      primaryButton:
        layout.width < 520
          ? { width: '100%' as const, alignSelf: 'stretch' as const }
          : {},
      outlineButton:
        layout.width < 520
          ? { width: '100%' as const, alignSelf: 'stretch' as const }
          : {},
      secondaryButton:
        layout.width < 520
          ? { width: '100%' as const, alignSelf: 'stretch' as const }
          : {},
      statusChipsRow: layout.width < 520 ? { flexDirection: 'column' as const } : {},
      biometricButtonsRow:
        layout.width < 520
          ? { flexDirection: 'column' as const, alignItems: 'stretch' as const }
          : {},
      pinStatusRow: stackPinStatus
        ? {
            flexDirection: 'column' as const,
            alignItems: 'stretch' as const,
            gap: 8,
          }
        : {},
      backButton:
        layout.width < 520
          ? { width: '100%' as const }
          : { alignSelf: 'center' as const },
    };
  }, [layout]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometricSubmitting, setBiometricSubmitting] = useState(false);
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);

  const biometricLabel = useMemo(() => {
    if (!biometryType) {
      return t('biometrics.types.Biometrics');
    }

    const key = `biometrics.types.${biometryType}`;
    return t(key);
  }, [biometryType, t]);

  const displayName = useMemo(() => getUserDisplayName(user) ?? '', [user]);
  const avatarInitials = useMemo(() => getUserInitials(user), [user]);

  const roleLabel = useMemo(() => {
    const normalized = (user?.accountType ?? '').toLowerCase();
    const key = normalized
      ? `profile.qr.accountTypes.${normalized}`
      : 'profile.qr.accountTypes.member';
    const defaultValue =
      normalized && normalized !== 'member'
        ? t('profile.qr.accountTypes.member')
        : undefined;
    return t(key, {
      defaultValue,
      replace: { type: user?.accountType ?? '' },
    });
  }, [user?.accountType, t]);

  useEffect(() => {
    logEvent('screen.entered');
    return () => {
      logEvent('screen.exited');
    };
  }, [logEvent]);

  const handleChangeAvatar = useCallback(async () => {
    try {
      logEvent('avatar.change.start');
      const result = await launchImageLibrary({
        mediaType: 'photo',
        selectionLimit: 1,
        quality: 0.85,
      });

      if (result.didCancel || !result.assets || result.assets.length === 0) {
        logEvent('avatar.change.cancelled');
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        logEvent('avatar.change.invalidSelection');
        throw createAppError('AUTH_IMAGE_SELECTION_REQUIRED');
      }

      setAvatarSubmitting(true);
      await updateProfileAvatar({
        uri: asset.uri,
        fileName: asset.fileName ?? undefined,
        mimeType: asset.type ?? undefined,
      });
      logEvent('avatar.change.success');

      Alert.alert(
        t('profile.avatar.successTitle'),
        t('profile.avatar.successMessage'),
      );
    } catch (error) {
      const appError = ensureAppError(error, 'PROFILE_AVATAR_UPDATE_FAILED', {
        propagateMessage: true,
      });
      logEvent('avatar.change.error', {
        code: appError.code,
        message: appError.displayMessage,
      });
      Alert.alert(
        t('profile.avatar.errorTitle'),
        translateError(appError) ?? t('profile.avatar.errorMessage'),
      );
    } finally {
      setAvatarSubmitting(false);
    }
  }, [logEvent, t, translateError, updateProfileAvatar]);

  const performRemoveAvatar = useCallback(async () => {
    try {
      setAvatarSubmitting(true);
      logEvent('avatar.remove.start');
      await deleteProfileAvatar();
      logEvent('avatar.remove.success');
      Alert.alert(
        t('profile.avatar.removeSuccessTitle'),
        t('profile.avatar.removeSuccessMessage'),
      );
    } catch (error) {
      const appError = ensureAppError(error, 'PROFILE_AVATAR_REMOVE_FAILED', {
        propagateMessage: true,
      });
      logEvent('avatar.remove.error', {
        code: appError.code,
        message: appError.displayMessage,
      });
      Alert.alert(
        t('profile.avatar.errorTitle'),
        translateError(appError) ?? t('profile.avatar.removeErrorMessage'),
      );
    } finally {
      setAvatarSubmitting(false);
    }
  }, [deleteProfileAvatar, logEvent, t, translateError]);

  const handleRemoveAvatar = useCallback(() => {
    logEvent('avatar.remove.prompt');
    Alert.alert(
      t('profile.avatar.removeConfirmTitle'),
      t('profile.avatar.removeConfirmMessage'),
      [
        {
          text: t('profile.avatar.removeConfirmCancel'),
          style: 'cancel',
        },
        {
          text: t('profile.avatar.removeConfirmAction'),
          style: 'destructive',
          onPress: () => {
            logEvent('avatar.remove.confirmed');
            void performRemoveAvatar();
          },
        },
      ],
    );
  }, [logEvent, performRemoveAvatar, t]);

  const handlePasswordSubmit = useCallback(async () => {
    setPasswordError(null);
    logEvent('password.change.attempt', {
      hasCurrentPassword: Boolean(currentPassword),
      hasNewPassword: Boolean(newPassword),
      hasConfirmPassword: Boolean(confirmPassword),
    });

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('profile.password.errors.incomplete'));
      logEvent('password.change.validationFailed', { reason: 'incomplete' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('errors.passwordMismatch'));
      logEvent('password.change.validationFailed', { reason: 'mismatch' });
      return;
    }

    try {
      setPasswordSubmitting(true);
      logEvent('password.change.start');
      await changePassword({ currentPassword, newPassword });
      logEvent('password.change.success');
      Alert.alert(
        t('profile.password.successTitle'),
        t('profile.password.successMessage'),
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const appError = ensureAppError(error, 'AUTH_CHANGE_PASSWORD_FAILED', {
        propagateMessage: true,
      });
      setPasswordError(
        translateError(appError) ?? t('errors.changePassword'),
      );
      logEvent('password.change.error', {
        code: appError.code,
        message: appError.displayMessage,
      });
    } finally {
      setPasswordSubmitting(false);
    }
  }, [
    changePassword,
    confirmPassword,
    currentPassword,
    logEvent,
    newPassword,
    t,
    translateError,
  ]);

  const handlePinSubmit = useCallback(async () => {
    setPinError(null);
    logEvent('pin.create.attempt', {
      length: newPin.length,
      matches: newPin === confirmPin,
    });

    if (newPin.length < 4) {
      setPinError(t('errors.pinLength'));
      logEvent('pin.create.validationFailed', { reason: 'length' });
      return;
    }

    if (newPin !== confirmPin) {
      setPinError(t('errors.pinMismatch'));
      logEvent('pin.create.validationFailed', { reason: 'mismatch' });
      return;
    }

    try {
      setPinSubmitting(true);
      logEvent('pin.create.start');
      await registerPin(newPin);
      await refreshAuthAvailability();
      logEvent('pin.create.success');
      Alert.alert(
        t('profile.pin.successTitle'),
        t('profile.pin.successMessage'),
      );
      setNewPin('');
      setConfirmPin('');
    } catch (error) {
      const appError = ensureAppError(error, 'AUTH_PIN_SAVE_FAILED', {
        propagateMessage: true,
      });
      setPinError(
        translateError(appError) ?? t('errors.pinSaveGeneric'),
      );
      logEvent('pin.create.error', {
        code: appError.code,
        message: appError.displayMessage,
      });
    } finally {
      setPinSubmitting(false);
    }
  }, [
    confirmPin,
    logEvent,
    newPin,
    registerPin,
    refreshAuthAvailability,
    t,
    translateError,
  ]);

  const confirmRemovePin = useCallback(() => {
    logEvent('pin.remove.prompt');
    Alert.alert(
      t('profile.pin.removeConfirmTitle'),
      t('profile.pin.removeConfirmMessage'),
      [
        {
          text: t('profile.pin.removeConfirmCancel'),
          style: 'cancel',
        },
        {
          text: t('profile.pin.removeConfirmConfirm'),
          style: 'destructive',
          onPress: async () => {
            try {
              setPinSubmitting(true);
              logEvent('pin.remove.start');
              await removePin();
              await refreshAuthAvailability();
              logEvent('pin.remove.success');
              Alert.alert(
                t('profile.pin.removedTitle'),
                t('profile.pin.removedMessage'),
              );
              setNewPin('');
              setConfirmPin('');
            } catch (error) {
              const appError = ensureAppError(error, 'AUTH_PIN_REMOVE_FAILED', {
                propagateMessage: true,
              });
              setPinError(
                translateError(appError) ?? t('errors.pinRemoveGeneric'),
              );
              logEvent('pin.remove.error', {
                code: appError.code,
                message: appError.displayMessage,
              });
            } finally {
              setPinSubmitting(false);
            }
          },
        },
      ],
    );
  }, [logEvent, refreshAuthAvailability, removePin, t, translateError]);

  const handleEnableBiometrics = useCallback(async () => {
    if (biometricSubmitting) {
      return;
    }

    setBiometricError(null);
    logEvent('biometric.enable.attempt');

    if (!biometricsSupported) {
      setBiometricError(t('errors.biometricsUnavailable'));
      logEvent('biometric.enable.validationFailed', { reason: 'unsupported' });
      return;
    }

    try {
      setBiometricSubmitting(true);
      const success = await authenticateWithBiometrics(t('biometrics.prompt'));

      if (!success) {
        setBiometricError(t('errors.biometricsCancelled'));
        logEvent('biometric.enable.cancelled');
        return;
      }

      await setBiometricLoginEnabled(true);
      await refreshAuthAvailability();
      logEvent('biometric.enable.success');
      Alert.alert(
        t('profile.biometric.enabledTitle'),
        t('profile.biometric.enabledMessage', {
          replace: { method: biometricLabel },
        }),
      );
    } catch (error) {
      const appError = ensureAppError(error, 'AUTH_BIOMETRIC_LOGIN_FAILED', {
        propagateMessage: true,
      });
      setBiometricError(
        translateError(appError) ?? t('errors.biometricLogin'),
      );
      logEvent('biometric.enable.error', {
        code: appError.code,
        message: appError.displayMessage,
      });
    } finally {
      setBiometricSubmitting(false);
    }
  }, [
    biometricLabel,
    biometricSubmitting,
    logEvent,
    biometricsSupported,
    refreshAuthAvailability,
    t,
    translateError,
  ]);

  const handleDisableBiometrics = useCallback(() => {
    logEvent('biometric.disable.prompt');
    Alert.alert(
      t('profile.biometric.disableConfirmTitle'),
      t('profile.biometric.disableConfirmMessage'),
      [
        {
          text: t('profile.biometric.disableConfirmCancel'),
          style: 'cancel',
        },
        {
          text: t('profile.biometric.disableConfirmConfirm'),
          style: 'destructive',
          onPress: async () => {
            setBiometricSubmitting(true);
            setBiometricError(null);
            try {
              logEvent('biometric.disable.start');
              await setBiometricLoginEnabled(false);
              await refreshAuthAvailability();
              logEvent('biometric.disable.success');
              Alert.alert(
                t('profile.biometric.disabledTitle'),
                t('profile.biometric.disabledMessage'),
              );
            } catch (error) {
              const appError = ensureAppError(
                error,
                'AUTH_BIOMETRIC_LOGIN_FAILED',
                {
                  propagateMessage: true,
                },
              );
              setBiometricError(
                translateError(appError) ?? t('errors.biometricLogin'),
              );
              logEvent('biometric.disable.error', {
                code: appError.code,
                message: appError.displayMessage,
              });
            } finally {
              setBiometricSubmitting(false);
            }
          },
        },
      ],
    );
  }, [
    logEvent,
    refreshAuthAvailability,
    t,
    translateError,
  ]);

  const handleBackPress = useCallback(() => {
    logEvent('navigation.back');
    onBack?.();
  }, [logEvent, onBack]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, responsiveStyles.container]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.brandWrapper, responsiveStyles.brandWrapper]}>
          <BrandLogo
            orientation={layout.isTablet ? 'horizontal' : 'vertical'}
          />
        </View>
        <View style={[styles.header, responsiveStyles.header]}>
          <Text style={[styles.title, responsiveStyles.title]}>
            {t('profile.title')}
          </Text>
          <Text style={[styles.subtitle, responsiveStyles.subtitle]}>
            {t('profile.subtitle')}
          </Text>
        </View>
        <View
          style={[styles.avatarSection, responsiveStyles.avatarSection]}
        >
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              style={[styles.avatarImage, responsiveStyles.avatar]}
            />
          ) : (
            <View style={[styles.avatarPlaceholder, responsiveStyles.avatar]}>
              <Text style={styles.avatarInitials}>{avatarInitials}</Text>
            </View>
          )}
          <View style={styles.avatarContent}>
            {displayName ? (
              <Text style={styles.avatarName}>{displayName}</Text>
            ) : null}
            {user?.email ? (
              <Text style={styles.avatarEmail}>{user.email}</Text>
            ) : null}
            <View style={styles.avatarMetaRow}>
              <Text style={styles.avatarMetaLabel}>{t('profile.qr.roleLabel')}</Text>
              <Text style={styles.avatarMetaValue}>{roleLabel}</Text>
            </View>
            <Text style={styles.avatarHint}>{t('profile.avatar.subtitle')}</Text>
            <View style={[styles.avatarActions, responsiveStyles.avatarActions]}>
              <Pressable
                onPress={handleChangeAvatar}
                style={styles.avatarButton}
                accessibilityRole="button"
                disabled={avatarSubmitting}
              >
                {avatarSubmitting ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Text style={styles.avatarButtonText}>
                    {t('profile.avatar.changeButton')}
                  </Text>
                )}
              </Pressable>
              {user?.avatarUrl ? (
                <Pressable
                  onPress={handleRemoveAvatar}
                  style={[styles.avatarButton, styles.avatarSecondaryButton]}
                  accessibilityRole="button"
                  disabled={avatarSubmitting}
                >
                  {avatarSubmitting ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.avatarButtonText,
                        styles.avatarSecondaryButtonText,
                      ]}
                    >
                      {t('profile.avatar.removeButton')}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        {(user?.accountType ?? '').toLowerCase() !== 'vendor' ? (
          <MemberQrCard
            qrCode={memberQrCode}
            accountType={user?.accountType ?? null}
            style={[styles.section, responsiveStyles.section]}
          />
        ) : null}

        <View style={[styles.section, responsiveStyles.section]}>
          <Text style={styles.sectionTitle}>
            {t('profile.password.heading')}
          </Text>
          <Text style={styles.sectionDescription}>
            {t('profile.password.description')}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t('profile.password.currentLabel')}
            </Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder={t('profile.password.currentPlaceholder')}
                secureTextEntry={!showCurrentPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.passwordInput}
                textContentType="password"
                autoComplete="password"
              />
              <PasswordVisibilityToggle
                visible={showCurrentPassword}
                onToggle={() =>
                  setShowCurrentPassword(visible => !visible)
                }
                labelShow={t('auth.forms.showPassword')}
                labelHide={t('auth.forms.hidePassword')}
                style={styles.togglePasswordButton}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('profile.password.newLabel')}</Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder={t('profile.password.newPlaceholder')}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.passwordInput}
                textContentType="newPassword"
                autoComplete="password-new"
              />
              <PasswordVisibilityToggle
                visible={showNewPassword}
                onToggle={() => setShowNewPassword(visible => !visible)}
                labelShow={t('auth.forms.showPassword')}
                labelHide={t('auth.forms.hidePassword')}
                style={styles.togglePasswordButton}
              />
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t('profile.password.confirmLabel')}
            </Text>
            <View style={styles.passwordInputWrapper}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={t('profile.password.confirmPlaceholder')}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.passwordInput}
                textContentType="newPassword"
                autoComplete="password-new"
              />
              <PasswordVisibilityToggle
                visible={showConfirmPassword}
                onToggle={() =>
                  setShowConfirmPassword(visible => !visible)
                }
                labelShow={t('auth.forms.showPassword')}
                labelHide={t('auth.forms.hidePassword')}
                style={styles.togglePasswordButton}
              />
            </View>
          </View>

          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
              responsiveStyles.primaryButton,
              passwordSubmitting ? styles.buttonDisabled : null,
            ]}
            onPress={handlePasswordSubmit}
            disabled={passwordSubmitting}
            accessibilityRole="button"
          >
            {passwordSubmitting ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('profile.password.submit')}
              </Text>
            )}
          </Pressable>
        </View>

        <View style={[styles.section, responsiveStyles.section]}>
          <Text style={styles.sectionTitle}>{t('profile.pin.heading')}</Text>
          <Text style={styles.sectionDescription}>
            {t('profile.pin.description')}
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('profile.pin.newLabel')}</Text>
            <TextInput
              value={newPin}
              onChangeText={setNewPin}
              placeholder={t('profile.pin.newPlaceholder')}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('profile.pin.confirmLabel')}</Text>
            <TextInput
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder={t('profile.pin.confirmPlaceholder')}
              keyboardType="number-pad"
              secureTextEntry
              style={styles.input}
            />
          </View>

          {pinError ? <Text style={styles.errorText}>{pinError}</Text> : null}

          <Pressable
            style={[
              styles.primaryButton,
              responsiveStyles.primaryButton,
              pinSubmitting ? styles.buttonDisabled : null,
            ]}
            onPress={handlePinSubmit}
            disabled={pinSubmitting}
            accessibilityRole="button"
          >
            {pinSubmitting ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('profile.pin.submit')}
              </Text>
            )}
          </Pressable>

          <View style={[styles.pinStatusRow, responsiveStyles.pinStatusRow]}>
            {availabilityLoading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.pinStatusText}>
                {hasPin ? t('profile.pin.hasPin') : t('profile.pin.noPin')}
              </Text>
            )}
            {hasPin ? (
              <Pressable
                onPress={confirmRemovePin}
                style={[styles.secondaryButton, responsiveStyles.secondaryButton]}
                disabled={pinSubmitting}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>
                  {t('profile.pin.remove')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[styles.section, responsiveStyles.section]}>
          <Text style={styles.sectionTitle}>
            {t('profile.biometric.heading')}
          </Text>
          <Text style={styles.sectionDescription}>
            {t('profile.biometric.description')}
          </Text>

          {availabilityLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <View
                style={[styles.statusChipsRow, responsiveStyles.statusChipsRow]}
              >
                <View
                  style={[
                    styles.statusChip,
                    biometricsSupported
                      ? styles.statusChipSuccess
                      : styles.statusChipMuted,
                  ]}
                >
                  <Text
                    style={
                      biometricsSupported
                        ? styles.statusChipTextSuccess
                        : styles.statusChipTextMuted
                    }
                  >
                    {biometricsSupported
                      ? t('profile.biometric.available', {
                          replace: { method: biometricLabel },
                        })
                      : t('profile.biometric.unavailable')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusChip,
                    hasPin
                      ? styles.statusChipSuccess
                      : styles.statusChipWarning,
                  ]}
                >
                  <Text
                    style={
                      hasPin
                        ? styles.statusChipTextSuccess
                        : styles.statusChipTextWarning
                    }
                  >
                    {hasPin
                      ? t('profile.biometric.pinReady')
                      : t('profile.biometric.pinRequired')}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusChip,
                    biometricsEnabled
                      ? styles.statusChipSuccess
                      : styles.statusChipMuted,
                  ]}
                >
                  <Text
                    style={
                      biometricsEnabled
                        ? styles.statusChipTextSuccess
                        : styles.statusChipTextMuted
                    }
                  >
                    {biometricsEnabled
                      ? t('profile.biometric.enabledStatus', {
                          replace: { method: biometricLabel },
                        })
                      : t('profile.biometric.disabledStatus')}
                  </Text>
                </View>
              </View>

              {biometricError ? (
                <Text style={styles.errorText}>{biometricError}</Text>
              ) : null}

              <View
                style={[styles.biometricButtonsRow, responsiveStyles.biometricButtonsRow]}
              >
                {biometricsSupported && !biometricsEnabled ? (
                  <Pressable
                    style={[
                      styles.primaryButton,
                      responsiveStyles.primaryButton,
                      biometricSubmitting ? styles.buttonDisabled : null,
                    ]}
                    disabled={biometricSubmitting}
                    accessibilityRole="button"
                    onPress={handleEnableBiometrics}
                  >
                    {biometricSubmitting ? (
                      <ActivityIndicator color={COLORS.textOnPrimary} />
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {t('profile.biometric.enable')}
                      </Text>
                    )}
                  </Pressable>
                ) : null}

                {biometricsEnabled ? (
                  <Pressable
                    style={[
                      styles.outlineButton,
                      responsiveStyles.outlineButton,
                      biometricSubmitting ? styles.buttonDisabled : null,
                    ]}
                    accessibilityRole="button"
                    disabled={biometricSubmitting}
                    onPress={handleDisableBiometrics}
                  >
                    <Text style={styles.outlineButtonText}>
                      {t('profile.biometric.disable')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.sectionFootnote}>
                {t('profile.biometric.instructions')}
              </Text>
            </>
          )}
        </View>

        {onBack ? (
          <Pressable
            onPress={handleBackPress}
            style={[styles.backButton, responsiveStyles.backButton]}
            accessibilityRole="button"
          >
            <Text style={styles.backButtonText}>
              {t('profile.actions.back')}
            </Text>
          </Pressable>
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
    flexGrow: 1,
    padding: 24,
    gap: 24,
  },
  brandWrapper: {
    alignItems: 'center',
  },
  header: {
    gap: 6,
  },
  avatarSection: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceMuted,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  avatarContent: {
    flex: 1,
    gap: 6,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  avatarEmail: {
    fontSize: 14,
    color: COLORS.textOnMuted,
  },
  avatarHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  avatarActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  avatarButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  avatarSecondaryButton: {
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
  },
  avatarButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
  },
  avatarMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  avatarMetaLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  avatarMetaValue: {
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  avatarSecondaryButtonText: {
    color: COLORS.textSecondary,
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
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  sectionDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  statusChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipSuccess: {
    backgroundColor: COLORS.successBackground,
    borderColor: COLORS.successBorder,
  },
  statusChipWarning: {
    backgroundColor: COLORS.warningBackground,
    borderColor: COLORS.warningBorder,
  },
  statusChipMuted: {
    backgroundColor: COLORS.surfaceMuted,
    borderColor: COLORS.mutedBorder,
  },
  statusChipTextSuccess: {
    color: COLORS.successText,
    fontWeight: '600',
  },
  statusChipTextWarning: {
    color: COLORS.warningText,
    fontWeight: '600',
  },
  statusChipTextMuted: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sectionFootnote: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 4,
  },
  biometricButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.background,
    color: COLORS.textPrimary,
  },
  passwordInputWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.textPrimary,
  },
  togglePasswordButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  outlineButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.errorBorder,
    backgroundColor: COLORS.errorBackground,
  },
  secondaryButtonText: {
    color: COLORS.errorText,
    fontWeight: '600',
  },
  pinStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pinStatusText: {
    fontSize: 13,
    color: COLORS.textOnMuted,
  },
  backButton: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.infoBackground,
    marginBottom: 12,
  },
  backButtonText: {
    color: COLORS.infoText,
    fontWeight: '600',
    fontSize: 15,
  },
});
