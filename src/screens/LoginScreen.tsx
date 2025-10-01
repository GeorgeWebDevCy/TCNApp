import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BiometricLoginButton } from '../components/BiometricLoginButton';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { LoginHeader } from '../components/LoginHeader';
import { PinLoginForm } from '../components/PinLoginForm';
import { RegisterModal } from '../components/RegisterModal';
import { WordPressLoginForm } from '../components/WordPressLoginForm';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useAuthAvailability } from '../hooks/useAuthAvailability';
import { RegisterOptions } from '../types/auth';
import { COLORS } from '../config/theme';

type AuthTabId = 'password' | 'pin';

export const LoginScreen: React.FC = () => {
  const {
    state,
    loginWithPassword,
    loginWithPin,
    loginWithBiometrics,
    registerPin,
    removePin,
    resetError,
    requestPasswordReset,
    registerAccount,
  } = useAuthContext();
  const {
    pin: hasStoredPin,
    biometrics: biometricsEnabled,
    biometricsSupported,
    biometryType,
    loading: availabilityLoading,
    refresh,
  } = useAuthAvailability();
  const { t, translateError } = useLocalization();
  const [activeTab, setActiveTab] = useState<AuthTabId>('password');
  const [lastAttempt, setLastAttempt] = useState<
    'password' | 'pin' | 'biometric' | null
  >(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isForgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [isRegisterVisible, setRegisterVisible] = useState(false);

  const authTabs = useMemo(() => {
    const tabs: Array<{ id: AuthTabId; label: string }> = [
      { id: 'password', label: t('login.tabs.password') },
    ];

    if (hasStoredPin) {
      tabs.push({ id: 'pin', label: t('login.tabs.pin') });
    }

    return tabs;
  }, [hasStoredPin, t]);

  useEffect(() => {
    if (hasStoredPin && state.isLocked) {
      setActiveTab('pin');
    }
  }, [hasStoredPin, state.isLocked]);

  useEffect(() => {
    if (!hasStoredPin && activeTab === 'pin') {
      setActiveTab('password');
    }
  }, [activeTab, hasStoredPin]);

  const handlePasswordSubmit = useCallback(
    async ({ username, password }: { username: string; password: string }) => {
      setLastAttempt('password');
      resetError();
      await loginWithPassword({ username, password });
    },
    [loginWithPassword, resetError],
  );

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      setLastAttempt('pin');
      setPinError(null);
      resetError();
      await loginWithPin({ pin });
    },
    [loginWithPin, resetError],
  );

  const handlePinCreate = useCallback(
    async (pin: string) => {
      setLastAttempt('pin');
      try {
        await registerPin(pin);
        await refresh();
        Alert.alert(
          t('login.alerts.pinSaved.title'),
          t('login.alerts.pinSaved.message'),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'errors.pinSaveGeneric';
        setPinError(message);
      }
    },
    [refresh, registerPin, t],
  );

  const handleRemovePin = useCallback(async () => {
    try {
      await removePin();
      await refresh();
      Alert.alert(
        t('login.alerts.pinRemoved.title'),
        t('login.alerts.pinRemoved.message'),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'errors.pinRemoveGeneric';
      setPinError(message);
    }
  }, [refresh, removePin, t]);

  const handleBiometricLogin = useCallback(async () => {
    setLastAttempt('biometric');
    resetError();
    await loginWithBiometrics(t('biometrics.prompt'));
  }, [loginWithBiometrics, resetError, t]);

  const handleRequestPasswordReset = useCallback(
    (identifier: string) => requestPasswordReset(identifier),
    [requestPasswordReset],
  );

  const handleRegisterAccount = useCallback(
    (options: RegisterOptions) => registerAccount(options),
    [registerAccount],
  );

  const changeTab = useCallback(
    (tabId: (typeof authTabs)[number]['id']) => {
      setActiveTab(tabId);
      setLastAttempt(null);
      setPinError(null);
      resetError();
    },
    [resetError],
  );

  const activeError = useMemo(() => {
    if (lastAttempt === 'pin') {
      return pinError ?? state.error;
    }
    if (lastAttempt === 'password') {
      return state.error;
    }
    if (lastAttempt === 'biometric') {
      return state.error;
    }
    return activeTab === 'pin' ? pinError ?? state.error : state.error;
  }, [activeTab, lastAttempt, pinError, state.error]);

  const isLoading = state.isLoading;
  const greeting =
    state.user?.name !== undefined
      ? t('login.greeting', { replace: { name: state.user.name } })
      : undefined;
  const lockMessage = state.isLocked ? t('login.lockMessage') : undefined;
  const translatedError = translateError(activeError);
  const passwordError =
    lastAttempt === 'password' ? translateError(state.error) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.switcherContainer}>
          <LanguageSwitcher />
        </View>
        <View style={styles.card}>
          <LoginHeader subtitle={greeting ?? t('login.subtitle')} />

          {lockMessage ? (
            <Text style={styles.lockMessage}>{lockMessage}</Text>
          ) : null}

          <View style={styles.tabRow}>
            {authTabs.map(tab => {
              const isActive = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => changeTab(tab.id)}
                  accessibilityRole="button"
                  style={[styles.tabButton, isActive && styles.tabButtonActive]}
                >
                  <Text
                    style={
                      isActive
                        ? styles.tabButtonTextActive
                        : styles.tabButtonText
                    }
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeTab === 'password' ? (
            <WordPressLoginForm
              loading={isLoading && lastAttempt === 'password'}
              error={passwordError}
              onSubmit={handlePasswordSubmit}
              onForgotPassword={() => setForgotPasswordVisible(true)}
              onRegister={() => setRegisterVisible(true)}
            />
          ) : hasStoredPin ? (
            <PinLoginForm
              hasPin={hasStoredPin}
              canManagePin={state.hasPasswordAuthenticated}
              loading={isLoading && lastAttempt === 'pin'}
              error={translatedError}
              onSubmit={handlePinSubmit}
              onCreatePin={handlePinCreate}
              onResetPin={hasStoredPin ? handleRemovePin : undefined}
            />
          ) : (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                {t('login.prompts.pinSetup')}
              </Text>
            </View>
          )}

          {biometricsEnabled ? (
            <>
              <View style={styles.dividerSection}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>{t('common.or')}</Text>
                <View style={styles.divider} />
              </View>

              <BiometricLoginButton
                available={!availabilityLoading}
                biometryType={biometryType}
                loading={isLoading && lastAttempt === 'biometric'}
                onPress={handleBiometricLogin}
              />
            </>
          ) : biometricsSupported ? (
            <Text style={styles.noticeText}>
              {t('login.prompts.biometricSetup')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <ForgotPasswordModal
        visible={isForgotPasswordVisible}
        onClose={() => setForgotPasswordVisible(false)}
        onSubmit={handleRequestPasswordReset}
      />
      <RegisterModal
        visible={isRegisterVisible}
        onClose={() => setRegisterVisible(false)}
        onSubmit={handleRegisterAccount}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: COLORS.surfaceMuted,
  },
  switcherContainer: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 24,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.textPrimary,
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
    gap: 24,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLORS.background,
    padding: 4,
    borderRadius: 999,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: COLORS.surface,
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabButtonText: {
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    textAlign: 'center',
    paddingVertical: 10,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  dividerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  noticeBox: {
    marginTop: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceMuted,
  },
  noticeText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  lockMessage: {
    textAlign: 'center',
    color: COLORS.infoText,
    fontWeight: '600',
  },
});
