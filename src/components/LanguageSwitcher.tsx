import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Language } from '../localization/translations';
import { useLocalization } from '../contexts/LocalizationContext';

const languageFlags: Record<Language, string> = {
  en: '🇺🇸',
  th: '🇹🇭',
};

export const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage, t } = useLocalization();

  const options: Array<{ code: Language; label: string; flag: string }> = (
    [
      { code: 'en', flag: languageFlags.en },
      { code: 'th', flag: languageFlags.th },
    ] as const
  ).map((option) => ({
    ...option,
    label: t(`languages.${option.code}`),
  }));

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{t('languageSwitcher.label')}</Text>
      <View style={styles.container} accessibilityRole="radiogroup" accessibilityLabel={t('languageSwitcher.label')}>
        {options.map((option) => {
          const isActive = option.code === language;
          return (
            <Pressable
              key={option.code}
              style={[styles.option, isActive && styles.optionActive]}
              onPress={() => {
                void setLanguage(option.code);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t('languageSwitcher.switchTo', { replace: { language: option.label } })}
              hitSlop={8}
            >
              <Text style={styles.flag}>{option.flag}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'flex-end',
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  container: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    padding: 4,
    borderRadius: 999,
    gap: 8,
  },
  option: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  optionActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  flag: {
    fontSize: 22,
  },
});
