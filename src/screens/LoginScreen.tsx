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
import { getUserDisplayName } from '../utils/user';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import deviceLog from '../utils/deviceLog';

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
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      deviceLog.info(`login.${event}`, {
        userId: state.user?.id ?? null,
        locked: state.isLocked,
        ...payload,
      });
    },
    [state.isLocked, state.user?.id],
  );
  const [activeTab, setActiveTab] = useState<AuthTabId>('password');
  const [lastAttempt, setLastAttempt] = useState<
    'password' | 'pin' | 'biometric' | null
  >(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isForgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const [isRegisterVisible, setRegisterVisible] = useState(false);

  useEffect(() => {
    logEvent('screen.entered', {
      hasStoredPin,
      biometricsEnabled,
      biometricsSupported,
    });

    return () => {
      logEvent('screen.exited');
    };
  }, [
    biometricsEnabled,
    biometricsSupported,
    hasStoredPin,
    logEvent,
  ]);

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
      logEvent('state.lockedWithPin');
      setActiveTab('pin');
    }
  }, [hasStoredPin, logEvent, state.isLocked]);

  useEffect(() => {
    if (!hasStoredPin && activeTab === 'pin') {
      logEvent('state.pinUnavailable');
      setActiveTab('password');
    }
  }, [activeTab, hasStoredPin, logEvent]);

  useEffect(() => {
    logEvent('tab.changed', { tab: activeTab });
  }, [activeTab, logEvent]);

  const handlePasswordSubmit = useCallback(
    async ({
      identifier,
      password,
    }: {
      identifier: string;
      password: string;
    }) => {
      setLastAttempt('password');
      resetError();
      logEvent('password.submit', { hasIdentifier: Boolean(identifier) });
      // Persist credentials for secure re-auth fallback
      await loginWithPassword({ identifier, password, remember: true });
    },
    [logEvent, loginWithPassword, resetError],
  );

  const handlePinSubmit = useCallback(
    async (pin: string) => {
      setLastAttempt('pin');
      setPinError(null);
      resetError();
      logEvent('pin.submit');
      await loginWithPin({ pin });
    },
    [logEvent, loginWithPin, resetError],
  );

  const handlePinCreate = useCallback(
    async (pin: string) => {
      setLastAttempt('pin');
      try {
        logEvent('pin.create.start');
        await registerPin(pin);
        await refresh();
        logEvent('pin.create.success');
        Alert.alert(
          t('login.alerts.pinSaved.title'),
          t('login.alerts.pinSaved.message'),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'errors.pinSaveGeneric';
        setPinError(message);
        logEvent('pin.create.error', { message });
      }
    },
    [logEvent, refresh, registerPin, t],
  );

  const handleRemovePin = useCallback(async () => {
    try {
      logEvent('pin.remove.start');
      await removePin();
      await refresh();
      logEvent('pin.remove.success');
      Alert.alert(
        t('login.alerts.pinRemoved.title'),
        t('login.alerts.pinRemoved.message'),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'errors.pinRemoveGeneric';
      setPinError(message);
      logEvent('pin.remove.error', { message });
    }
  }, [logEvent, refresh, removePin, t]);

  const handleBiometricLogin = useCallback(async () => {
    setLastAttempt('biometric');
    resetError();
    logEvent('biometric.attempt', {
      supported: biometricsSupported,
      enabled: biometricsEnabled,
    });
    await loginWithBiometrics(t('biometrics.prompt'));
  }, [
    biometricsEnabled,
    biometricsSupported,
    logEvent,
    loginWithBiometrics,
    resetError,
    t,
  ]);

  const handleRequestPasswordReset = useCallback(
    (identifier: string) => {
      logEvent('passwordReset.requested', {
        hasIdentifier: Boolean(identifier),
      });
      return requestPasswordReset(identifier);
    },
    [logEvent, requestPasswordReset],
  );

  const handleRegisterAccount = useCallback(
    (options: RegisterOptions) => {
      logEvent('register.submitted', {
        hasEmail: Boolean(options.email),
        isVendor: options.accountType === 'vendor',
      });
      return registerAccount(options);
    },
    [logEvent, registerAccount],
  );

  const changeTab = useCallback(
    (tabId: (typeof authTabs)[number]['id']) => {
      setActiveTab(tabId);
      setLastAttempt(null);
      setPinError(null);
      resetError();
      logEvent('tab.manualChange', { tab: tabId });
    },
    [logEvent, resetError],
  );

  const handleShowForgotPassword = useCallback(() => {
    logEvent('modal.forgotPassword.opened');
    setForgotPasswordVisible(true);
  }, [logEvent]);

  const handleHideForgotPassword = useCallback(() => {
    logEvent('modal.forgotPassword.closed');
    setForgotPasswordVisible(false);
  }, [logEvent]);

  const handleShowRegister = useCallback(() => {
    logEvent('modal.register.opened');
    setRegisterVisible(true);
  }, [logEvent]);

  const handleHideRegister = useCallback(() => {
    logEvent('modal.register.closed');
    setRegisterVisible(false);
  }, [logEvent]);

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
  const loginDisplayName = useMemo(
    () => getUserDisplayName(state.user),
    [state.user],
  );
  const greeting = loginDisplayName
    ? t('login.greeting', { replace: { name: loginDisplayName } })
    : undefined;
  const lockMessage = state.isLocked ? t('login.lockMessage') : undefined;
  const translatedError = translateError(activeError);
  const passwordError =
    lastAttempt === 'password' ? translateError(state.error) : null;

  const layout = useResponsiveLayout();
  const responsiveStyles = useMemo(() => {
    const effectiveMaxWidth = layout.maxContentWidth ?? 420;
    const cardMaxWidth = layout.isLargeTablet
      ? Math.min(effectiveMaxWidth, 560)
      : layout.isTablet
      ? Math.min(effectiveMaxWidth, 480)
      : effectiveMaxWidth;
    const stackTabs = layout.width < 420;
    const stackSecondary = layout.width < 420;
    const stackDivider = layout.width < 380;

    return {
      scrollContainer: {
        paddingHorizontal: layout.contentPadding,
        paddingVertical: layout.contentPadding,
      },
      switcherContainer: {
        maxWidth: cardMaxWidth,
        alignSelf: 'stretch' as const,
        alignItems: layout.width < 520 ? ('flex-start' as const) : ('flex-end' as const),
      },
      card: {
        maxWidth: cardMaxWidth,
        padding: layout.isSmallPhone ? 20 : layout.isLargeTablet ? 28 : 24,
        gap: layout.isSmallPhone ? 20 : 24,
      },
      tabRow: stackTabs
        ? {
            flexDirection: 'column' as const,
            gap: 8,
            padding: 6,
          }
        : {
            paddingHorizontal: layout.width < 520 ? 6 : 4,
          },
      tabButton: stackTabs
        ? { width: '100%' as const }
        : { flex: 1 },
      tabButtonText: stackTabs ? { paddingVertical: 8 } : {},
      dividerSection: stackDivider
        ? {
            flexDirection: 'column' as const,
            gap: 8,
            alignItems: 'stretch' as const,
          }
        : {},
      divider: stackDivider ? { width: '100%' as const } : {},
      secondaryActions: stackSecondary
        ? {
            flexDirection: 'column' as const,
            gap: 8,
            alignItems: 'stretch' as const,
          }
        : {
            gap: 8,
          },
      noticeText: stackSecondary ? { textAlign: 'center' as const } : {},
      lockMessage: stackSecondary ? { textAlign: 'center' as const } : {},
    };
  }, [layout]);

  useEffect(() => {
    if (state.error) {
      logEvent('error', { message: state.error });
    }
  }, [logEvent, state.error]);

  useEffect(() => {
    if (pinError) {
      logEvent('pin.validationError', { message: pinError });
    }
  }, [logEvent, pinError]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <ScrollView
        contentContainerStyle={[styles.scrollContainer, responsiveStyles.scrollContainer]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.switcherContainer, responsiveStyles.switcherContainer]}>
          <LanguageSwitcher />
        </View>
        <View style={[styles.card, responsiveStyles.card]}>
          <LoginHeader subtitle={greeting ?? t('login.subtitle')} />

          {lockMessage ? (
            <Text style={[styles.lockMessage, responsiveStyles.lockMessage]}>
              {lockMessage}
            </Text>
          ) : null}

          <View style={[styles.tabRow, responsiveStyles.tabRow]}>
            {authTabs.map(tab => {
              const isActive = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => changeTab(tab.id)}
                  accessibilityRole="button"
                  style={[
                    styles.tabButton,
                    responsiveStyles.tabButton,
                    isActive && styles.tabButtonActive,
                  ]}
                >
                  <Text
                    style={
                      isActive
                        ? [styles.tabButtonTextActive, responsiveStyles.tabButtonText]
                        : [styles.tabButtonText, responsiveStyles.tabButtonText]
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
              onForgotPassword={handleShowForgotPassword}
              onRegister={handleShowRegister}
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
              <View style={[styles.dividerSection, responsiveStyles.dividerSection]}>
                <View style={[styles.divider, responsiveStyles.divider]} />
                <Text style={styles.dividerText}>{t('common.or')}</Text>
                <View style={[styles.divider, responsiveStyles.divider]} />
              </View>

              <BiometricLoginButton
                available={!availabilityLoading}
                biometryType={biometryType}
                loading={isLoading && lastAttempt === 'biometric'}
                onPress={handleBiometricLogin}
              />
            </>
          ) : biometricsSupported ? (
            <Text style={[styles.noticeText, responsiveStyles.noticeText]}>
              {t('login.prompts.biometricSetup')}
            </Text>
          ) : null}
        </View>
      </ScrollView>
  <ForgotPasswordModal
    visible={isForgotPasswordVisible}
    onClose={handleHideForgotPassword}
    onSubmit={handleRequestPasswordReset}
  />
  <RegisterModal
    visible={isRegisterVisible}
    onClose={handleHideRegister}
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
