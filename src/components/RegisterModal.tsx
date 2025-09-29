import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import { RegisterOptions } from '../types/auth';

interface RegisterModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (options: RegisterOptions) => Promise<string | undefined>;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({ visible, onClose, onSubmit }) => {
  const { t, translateError } = useLocalization();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setFirstName('');
      setLastName('');
      setLoading(false);
      setError(null);
      setSuccessMessage(null);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (loading) {
      return;
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!trimmedUsername || !trimmedEmail || !password) {
      setError('Unable to register a new account.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const message = await onSubmit({
        username: trimmedUsername,
        email: trimmedEmail,
        password,
        firstName: trimmedFirstName || undefined,
        lastName: trimmedLastName || undefined,
      });
      setSuccessMessage(message ?? t('auth.registerModal.success'));
    } catch (err) {
      const fallback = 'Unable to register a new account.';
      const message = err instanceof Error ? err.message : fallback;
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const translatedError = useMemo(() => (error ? translateError(error) ?? error : null), [error, translateError]);
  const isSubmitDisabled =
    loading || !username.trim() || !email.trim() || !password || !confirmPassword || successMessage !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>{t('auth.registerModal.title')}</Text>
            <Text style={styles.description}>{t('auth.registerModal.description')}</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('auth.registerModal.usernameLabel')}</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && successMessage === null}
                style={styles.input}
                placeholder={t('auth.registerModal.usernamePlaceholder')}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('auth.registerModal.emailLabel')}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!loading && successMessage === null}
                style={styles.input}
                placeholder={t('auth.registerModal.emailPlaceholder')}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('auth.registerModal.passwordLabel')}</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading && successMessage === null}
                style={styles.input}
                placeholder={t('auth.registerModal.passwordPlaceholder')}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{t('auth.registerModal.confirmPasswordLabel')}</Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                editable={!loading && successMessage === null}
                style={styles.input}
                placeholder={t('auth.registerModal.confirmPasswordPlaceholder')}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.halfFormGroup}>
                <Text style={styles.label}>{t('auth.registerModal.firstNameLabel')}</Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  editable={!loading && successMessage === null}
                  style={styles.input}
                  placeholder={t('auth.registerModal.firstNamePlaceholder')}
                />
              </View>
              <View style={styles.halfFormGroup}>
                <Text style={styles.label}>{t('auth.registerModal.lastNameLabel')}</Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  editable={!loading && successMessage === null}
                  style={styles.input}
                  placeholder={t('auth.registerModal.lastNamePlaceholder')}
                />
              </View>
            </View>

            {translatedError ? <Text style={styles.error}>{translatedError}</Text> : null}
            {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}

            {successMessage === null ? (
              <Pressable
                style={[styles.primaryButton, isSubmitDisabled && styles.primaryButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitDisabled}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>{t('auth.registerModal.submit')}</Text>
                )}
              </Pressable>
            ) : null}

            <Pressable onPress={onClose} accessibilityRole="button" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {successMessage
                  ? t('auth.registerModal.closeAfterSuccess')
                  : t('auth.registerModal.cancel')}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    maxHeight: '90%',
  },
  scrollContent: {
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  description: {
    fontSize: 14,
    color: '#475569',
  },
  formGroup: {
    gap: 8,
  },
  halfFormGroup: {
    flex: 1,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
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
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: '#2563EB',
    fontWeight: '600',
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
  },
  success: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '500',
  },
});
