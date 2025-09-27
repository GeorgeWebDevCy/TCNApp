import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalization } from '../contexts/LocalizationContext';

interface LoginHeaderProps {
  title?: string;
  subtitle?: string;
  logoSource?: any;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({
  title,
  subtitle,
  logoSource,
}) => {
  const { t } = useLocalization();
  const resolvedTitle = useMemo(() => title ?? t('login.header.title'), [title, t]);
  const resolvedSubtitle = useMemo(() => subtitle ?? t('login.header.subtitle'), [subtitle, t]);

  return (
    <View style={styles.container}>
      {logoSource ? <Image source={logoSource} style={styles.logo} resizeMode="contain" /> : null}
      <Text style={styles.title}>{resolvedTitle}</Text>
      <Text style={styles.subtitle}>{resolvedSubtitle}</Text>
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
