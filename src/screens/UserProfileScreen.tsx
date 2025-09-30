import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { COLORS } from '../config/theme';
import { BrandLogo } from '../components/BrandLogo';

type UserProfileScreenProps = {
  onBack?: () => void;
};

export const UserProfileScreen: React.FC<UserProfileScreenProps> = ({
  onBack,
}) => {
  const {
    state: { user },
    changePassword,
    registerPin,
    removePin,
  } = useAuthContext();
  const { t, translateError } = useLocalization();
  const {
    pin: hasPin,
    biometrics: biometricsAvailable,
    biometryType,
    loading: pinLoading,
    refresh: refreshAuthAvailability,
  } = useAuthAvailability();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const biometricLabel = useMemo(() => {
    if (!biometryType) {
      return t('biometrics.types.Biometrics');
    }

    const key = `biometrics.types.${biometryType}`;
    return t(key);
  }, [biometryType, t]);

  const displayName = useMemo(() => {
    if (!user) {
      return '';
    }

    if (user.name && user.name.trim().length > 0) {
      return user.name;
    }

    return user.email;
  }, [user]);

  const handlePasswordSubmit = useCallback(async () => {
    setPasswordError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError(t('profile.password.errors.incomplete'));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(t('errors.passwordMismatch'));
      return;
    }

    try {
      setPasswordSubmitting(true);
      await changePassword({ currentPassword, newPassword });
      Alert.alert(
        t('profile.password.successTitle'),
        t('profile.password.successMessage'),
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      const translated = translateError(
        error instanceof Error ? error.message : 'Unable to change password.',
      );
      setPasswordError(translated ?? t('errors.changePassword'));
    } finally {
      setPasswordSubmitting(false);
    }
  }, [
    changePassword,
    confirmPassword,
    currentPassword,
    newPassword,
    t,
    translateError,
  ]);

  const handlePinSubmit = useCallback(async () => {
    setPinError(null);

    if (newPin.length < 4) {
      setPinError(t('errors.pinLength'));
      return;
    }

    if (newPin !== confirmPin) {
      setPinError(t('errors.pinMismatch'));
      return;
    }

    try {
      setPinSubmitting(true);
      await registerPin(newPin);
      await refreshAuthAvailability();
      Alert.alert(
        t('profile.pin.successTitle'),
        t('profile.pin.successMessage'),
      );
      setNewPin('');
      setConfirmPin('');
    } catch (error) {
      const translated = translateError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while saving your PIN.',
      );
      setPinError(translated ?? t('errors.pinSaveGeneric'));
    } finally {
      setPinSubmitting(false);
    }
  }, [
    confirmPin,
    newPin,
    registerPin,
    refreshAuthAvailability,
    t,
    translateError,
  ]);

  const confirmRemovePin = useCallback(() => {
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
              await removePin();
              await refreshAuthAvailability();
              Alert.alert(
                t('profile.pin.removedTitle'),
                t('profile.pin.removedMessage'),
              );
              setNewPin('');
              setConfirmPin('');
            } catch (error) {
              const translated = translateError(
                error instanceof Error
                  ? error.message
                  : 'Something went wrong while removing your PIN.',
              );
              setPinError(translated ?? t('errors.pinRemoveGeneric'));
            } finally {
              setPinSubmitting(false);
            }
          },
        },
      ],
    );
  }, [refreshAuthAvailability, removePin, t, translateError]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandWrapper}>
          <BrandLogo orientation="horizontal" />
        </View>
        <View style={styles.header}>
          <Text style={styles.title}>{t('profile.title')}</Text>
          <Text style={styles.subtitle}>{t('profile.subtitle')}</Text>
          {displayName ? (
            <Text style={styles.userName}>{displayName}</Text>
          ) : null}
          {user?.email ? (
            <Text style={styles.userEmail}>{user.email}</Text>
          ) : null}
        </View>

        <View style={styles.section}>
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
            <TextInput
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder={t('profile.password.currentPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{t('profile.password.newLabel')}</Text>
            <TextInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder={t('profile.password.newPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              {t('profile.password.confirmLabel')}
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder={t('profile.password.confirmPlaceholder')}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>

          {passwordError ? (
            <Text style={styles.errorText}>{passwordError}</Text>
          ) : null}

          <Pressable
            style={[
              styles.primaryButton,
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

        <View style={styles.section}>
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

          <View style={styles.pinStatusRow}>
            {pinLoading ? (
              <ActivityIndicator color={COLORS.primary} />
            ) : (
              <Text style={styles.pinStatusText}>
                {hasPin ? t('profile.pin.hasPin') : t('profile.pin.noPin')}
              </Text>
            )}
            {hasPin ? (
              <Pressable
                onPress={confirmRemovePin}
                style={styles.secondaryButton}
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t('profile.biometric.heading')}
          </Text>
          <Text style={styles.sectionDescription}>
            {t('profile.biometric.description')}
          </Text>

          {pinLoading ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <View style={styles.statusChipsRow}>
                <View
                  style={[
                    styles.statusChip,
                    biometricsAvailable
                      ? styles.statusChipSuccess
                      : styles.statusChipMuted,
                  ]}
                >
                  <Text
                    style={
                      biometricsAvailable
                        ? styles.statusChipTextSuccess
                        : styles.statusChipTextMuted
                    }
                  >
                    {biometricsAvailable
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
              </View>

              <Text style={styles.sectionFootnote}>
                {t('profile.biometric.instructions')}
              </Text>
            </>
          )}
        </View>

        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textOnMuted,
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
