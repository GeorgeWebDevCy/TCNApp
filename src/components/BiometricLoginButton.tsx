import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BiometryType } from '../services/biometricService';

interface BiometricLoginButtonProps {
  available: boolean;
  loading?: boolean;
  biometryType?: BiometryType;
  onPress: () => void;
}

const biometryLabelMap: Record<NonNullable<BiometryType>, string> = {
  FaceID: 'Face ID',
  TouchID: 'Touch ID',
  Iris: 'Iris ID',
  Biometrics: 'Biometrics',
  Unknown: 'Biometrics',
};

export const BiometricLoginButton: React.FC<BiometricLoginButtonProps> = ({
  available,
  loading = false,
  biometryType = 'Biometrics',
  onPress,
}) => {
  if (!available) {
    return null;
  }

  const label = biometryType ? biometryLabelMap[biometryType] ?? 'Biometrics' : 'Biometrics';

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>Quick login</Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={[styles.button, loading && styles.buttonDisabled]}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#0EA5E9" />
        ) : (
          <Text style={styles.buttonText}>Use {label}</Text>
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
