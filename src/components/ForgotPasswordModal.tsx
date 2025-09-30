import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { COLORS } from '../config/theme';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (identifier: string) => Promise<string | undefined>;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { t, translateError } = useLocalization();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setIdentifier('');
      setLoading(false);
      setError(null);
      setSuccessMessage(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const message = await onSubmit(trimmed);
      setSuccessMessage(message ?? t('auth.forgotPasswordModal.success'));
    } catch (err) {
      const fallback = 'Unable to send password reset email.';
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const translatedError = useMemo(
    () => (error ? translateError(error) ?? error : null),
    [error, translateError],
  );
  const isSubmitDisabled = loading || identifier.trim().length === 0;
  const hasSuccess = Boolean(successMessage);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {t('auth.forgotPasswordModal.title')}
          </Text>
          <Text style={styles.description}>
            {t('auth.forgotPasswordModal.description')}
          </Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>
              {t('auth.forgotPasswordModal.identifierLabel')}
            </Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading && !hasSuccess}
              style={styles.input}
              placeholder={t('auth.forgotPasswordModal.identifierPlaceholder')}
            />
          </View>

          {translatedError ? (
            <Text style={styles.error}>{translatedError}</Text>
          ) : null}
          {successMessage ? (
            <Text style={styles.success}>{successMessage}</Text>
          ) : null}

          {!hasSuccess ? (
            <Pressable
              style={[
                styles.primaryButton,
                isSubmitDisabled && styles.primaryButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitDisabled}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={COLORS.textOnPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t('auth.forgotPasswordModal.submit')}
                </Text>
              )}
            </Pressable>
          ) : null}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              {hasSuccess
                ? t('auth.forgotPasswordModal.closeAfterSuccess')
                : t('auth.forgotPasswordModal.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: COLORS.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
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
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  error: {
    color: COLORS.error,
    fontSize: 14,
  },
  success: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '500',
  },
});
