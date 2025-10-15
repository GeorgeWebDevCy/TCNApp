import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { COLORS } from '../config/theme';
import { PasswordVisibilityToggle } from './PasswordVisibilityToggle';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface WordPressLoginFormProps {
  loading?: boolean;
  error?: string | null;
  onSubmit: (payload: { identifier: string; password: string }) => void;
  onForgotPassword: () => void;
  onRegister: () => void;
}

export const WordPressLoginForm: React.FC<WordPressLoginFormProps> = ({
  loading = false,
  error,
  onSubmit,
  onForgotPassword,
  onRegister,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { t } = useLocalization();
  const layout = useResponsiveLayout();
  const responsiveStyles = useMemo(() => {
    const stackSecondary = layout.width < 420;
    return {
      container: {
        gap: layout.isSmallPhone ? 14 : 16,
      },
      input: layout.isSmallPhone ? { paddingVertical: 10 } : {},
      secondaryActions: stackSecondary
        ? {
            flexDirection: 'column' as const,
            alignItems: 'stretch' as const,
            gap: 8,
            paddingHorizontal: 0,
            justifyContent: 'flex-start' as const,
          }
        : {
            gap: 12,
          },
      linkText: stackSecondary ? { textAlign: 'center' as const } : {},
    };
  }, [layout]);

  const handleSubmit = () => {
    if (loading) {
      return;
    }

    onSubmit({ identifier, password });
  };

  const disabled = loading || !identifier || !password;

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      style={[styles.container, responsiveStyles.container]}
    >
      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('auth.forms.identifierLabel')}</Text>
        <TextInput
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
          style={[styles.input, responsiveStyles.input]}
          placeholder={t('auth.forms.identifierPlaceholder')}
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('auth.forms.passwordLabel')}</Text>
        <View style={styles.passwordInputWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!passwordVisible}
            style={[styles.passwordInput, responsiveStyles.input]}
            placeholder={t('auth.forms.passwordPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            autoComplete="password"
          />
          <PasswordVisibilityToggle
            visible={passwordVisible}
            onToggle={() => setPasswordVisible(visible => !visible)}
            labelShow={t('auth.forms.showPassword')}
            labelHide={t('auth.forms.hidePassword')}
            style={styles.togglePasswordButton}
          />
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
        disabled={disabled}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.primaryButtonText}>{t('auth.forms.submit')}</Text>
        )}
      </Pressable>

      <View style={[styles.secondaryActions, responsiveStyles.secondaryActions]}>
        <Pressable
          onPress={onForgotPassword}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={[styles.linkText, responsiveStyles.linkText]}>
            {t('auth.forms.forgotPassword')}
          </Text>
        </Pressable>
        <Pressable onPress={onRegister} hitSlop={8} accessibilityRole="link">
          <Text style={[styles.linkText, responsiveStyles.linkText]}>
            {t('auth.forms.register')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: COLORS.textOnMuted,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  passwordInputWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  togglePasswordButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '500',
  },
});
