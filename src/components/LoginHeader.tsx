import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

interface LoginHeaderProps {
  title?: string;
  subtitle?: string;
  logoSource?: any;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({
  title = 'Welcome back',
  subtitle = 'Sign in to continue',
  logoSource,
}) => {
  return (
    <View style={styles.container}>
      {logoSource ? <Image source={logoSource} style={styles.logo} resizeMode="contain" /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 32,
  },
  logo: {
    width: 96,
    height: 96,
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
});
