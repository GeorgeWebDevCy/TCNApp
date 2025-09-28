import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';
import type { BiometryType } from '../services/biometricService';

interface BiometricLoginButtonProps {
  available: boolean;
  loading?: boolean;
  biometryType?: BiometryType;
  onPress: () => void;
}

const biometryLabelKeyMap: Record<NonNullable<BiometryType>, string> = {
  FaceID: 'biometrics.types.FaceID',
  TouchID: 'biometrics.types.TouchID',
  Iris: 'biometrics.types.Iris',
  Biometrics: 'biometrics.types.Biometrics',
  Unknown: 'biometrics.types.Unknown',
};

export const BiometricLoginButton: React.FC<BiometricLoginButtonProps> = ({
  available,
  loading = false,
  biometryType = 'Biometrics',
  onPress,
}) => {
  const { t } = useLocalization();

  const label = useMemo(() => {
    const key = biometryLabelKeyMap[biometryType] ?? 'biometrics.types.Biometrics';
    return t(key);
  }, [biometryType, t]);

  if (!available) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{t('biometrics.quickLogin')}</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[styles.button, loading && styles.buttonDisabled]}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#0EA5E9" />
        ) : (
          <Text style={styles.buttonText}>{t('biometrics.useLabel', { replace: { method: label } })}</Text>
        )}
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  subtitle: {
    color: '#475569',
    fontWeight: '500',
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#0EA5E9',
    backgroundColor: '#ECFEFF',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#0EA5E9',
    fontSize: 16,
    fontWeight: '600',
  },
});
