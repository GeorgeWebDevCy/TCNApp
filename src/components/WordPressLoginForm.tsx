import React, { useState } from 'react';
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

interface WordPressLoginFormProps {
  loading?: boolean;
  error?: string | null;
  onSubmit: (payload: { username: string; password: string }) => void;
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { t } = useLocalization();

  const handleSubmit = () => {
    if (loading) {
      return;
    }

    onSubmit({ username, password });
  };

  const disabled = loading || !username || !password;

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', android: undefined })}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      style={styles.container}
    >
      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('auth.forms.usernameLabel')}</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
          style={styles.input}
          placeholder={t('auth.forms.usernamePlaceholder')}
        />
      </View>
      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('auth.forms.passwordLabel')}</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
          placeholder={t('auth.forms.passwordPlaceholder')}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handleSubmit}
        accessibilityRole="button"
        style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
        disabled={disabled}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{t('auth.forms.submit')}</Text>
        )}
      </Pressable>

      <View style={styles.secondaryActions}>
        <Pressable onPress={onForgotPassword} hitSlop={8} accessibilityRole="link">
          <Text style={styles.linkText}>{t('auth.forms.forgotPassword')}</Text>
        </Pressable>
        <Pressable onPress={onRegister} hitSlop={8} accessibilityRole="link">
          <Text style={styles.linkText}>{t('auth.forms.register')}</Text>
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
    color: '#1E293B',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
  },
  primaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  linkText: {
    color: '#2563EB',
    fontWeight: '500',
  },
});
