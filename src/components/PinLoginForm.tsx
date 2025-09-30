import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { COLORS } from '../config/theme';

interface PinLoginFormProps {
  hasPin: boolean;
  canManagePin: boolean;
  loading?: boolean;
  error?: string | null;
  onSubmit: (pin: string) => void;
  onCreatePin: (pin: string) => void;
  onResetPin?: () => void;
}

export const PinLoginForm: React.FC<PinLoginFormProps> = ({
  hasPin,
  canManagePin,
  loading = false,
  error,
  onSubmit,
  onCreatePin,
  onResetPin,
}) => {
  const [pin, setPin] = useState('');
  const [confirmationPin, setConfirmationPin] = useState('');
  const [mode, setMode] = useState<'login' | 'create'>(
    hasPin ? 'login' : 'create',
  );
  const { t } = useLocalization();

  useEffect(() => {
    setMode(hasPin ? 'login' : 'create');
    setPin('');
    setConfirmationPin('');
  }, [hasPin]);

  const canSubmit = useMemo(() => {
    if (loading) {
      return false;
    }

    if (mode === 'login') {
      return pin.length >= 4;
    }

    if (!canManagePin) {
      return false;
    }

    return pin.length >= 4 && pin === confirmationPin;
  }, [canManagePin, confirmationPin, loading, mode, pin]);

  const handlePrimaryAction = () => {
    if (!canSubmit) {
      return;
    }

    if (mode === 'login') {
      onSubmit(pin);
      return;
    }

    onCreatePin(pin);
    setMode('login');
    setPin('');
    setConfirmationPin('');
  };

  const toggleMode = () => {
    setMode(prev => (prev === 'login' ? 'create' : 'login'));
    setPin('');
    setConfirmationPin('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>
          {mode === 'login'
            ? t('auth.pinForm.titleLogin')
            : t('auth.pinForm.titleCreate')}
        </Text>
        {hasPin && canManagePin ? (
          <Pressable
            onPress={toggleMode}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.linkText}>
              {mode === 'login'
                ? t('auth.pinForm.toggleCreate')
                : t('auth.pinForm.toggleUseExisting')}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('auth.pinForm.pinLabel')}</Text>
        <TextInput
          value={pin}
          onChangeText={setPin}
          keyboardType="number-pad"
          secureTextEntry
          style={styles.input}
          maxLength={8}
          placeholder="••••"
        />
      </View>

      {mode === 'create' ? (
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('auth.pinForm.confirmPinLabel')}</Text>
          <TextInput
            value={confirmationPin}
            onChangeText={setConfirmationPin}
            keyboardType="number-pad"
            secureTextEntry
            style={styles.input}
            maxLength={8}
            placeholder="••••"
          />
        </View>
      ) : null}

      {mode === 'create' && !canManagePin ? (
        <Text style={styles.helperText}>
          {t('auth.pinForm.helperRequiresPassword')}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={handlePrimaryAction}
        style={[
          styles.primaryButton,
          !canSubmit && styles.primaryButtonDisabled,
        ]}
        disabled={!canSubmit}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textOnPrimary} />
        ) : (
          <Text style={styles.primaryButtonText}>
            {mode === 'login'
              ? t('auth.pinForm.submitLogin')
              : t('auth.pinForm.submitCreate')}
          </Text>
        )}
      </Pressable>

      {mode === 'login' && hasPin && onResetPin && canManagePin ? (
        <Pressable onPress={onResetPin} hitSlop={8} style={styles.dangerButton}>
          <Text style={styles.dangerButtonText}>
            {t('auth.pinForm.removePin')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  linkText: {
    color: COLORS.primary,
    fontWeight: '500',
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: COLORS.textOnMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.textPrimary,
  },
  error: {
    color: COLORS.error,
    textAlign: 'center',
  },
  helperText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    textAlign: 'center',
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
  dangerButton: {
    alignItems: 'center',
  },
  dangerButtonText: {
    color: COLORS.error,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
});
