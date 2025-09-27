import React, { useMemo } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';

export const HomeScreen: React.FC = () => {
  const { state, logout } = useAuthContext();
  const user = state.user;
  const { t } = useLocalization();
  const greeting = useMemo(
    () => t('home.title', { replace: { name: user?.name ? `, ${user.name}` : '' } }),
    [t, user?.name],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.switcherWrapper}>
          <LanguageSwitcher />
        </View>
        <Text style={styles.title}>{greeting}</Text>
        {user?.email ? <Text style={styles.subtitle}>{user.email}</Text> : null}

        <Pressable onPress={logout} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{t('home.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  switcherWrapper: {
    alignSelf: 'flex-end',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#2563EB',
    borderRadius: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
});
