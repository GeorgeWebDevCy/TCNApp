import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Language,
  TranslationDictionary,
  TranslationValue,
  translations,
} from '../localization/translations';

const LANGUAGE_STORAGE_KEY = '@tcnapp/language';
const FALLBACK_LANGUAGE: Language = 'en';

type TranslateOptions = {
  defaultValue?: string;
  replace?: Record<string, string | number>;
};

type LocalizationContextValue = {
  language: Language;
  setLanguage: (language: Language) => Promise<void>;
  t: (key: string, options?: TranslateOptions) => string;
  translateError: (
    value: string | null | undefined,
  ) => string | null | undefined;
};

const LocalizationContext = React.createContext<
  LocalizationContextValue | undefined
>(undefined);

const resolveTranslation = (
  dictionary: TranslationDictionary,
  key: string,
): TranslationValue | undefined => {
  return key
    .split('.')
    .reduce<TranslationValue | undefined>((current, segment) => {
      if (current && typeof current === 'object') {
        return current[segment];
      }
      return undefined;
    }, dictionary);
};

const formatTranslation = (
  template: string,
  replacements?: Record<string, string | number>,
): string => {
  if (!replacements) {
    return template;
  }

  return template.replace(/{{\s*([^\s{}]+)\s*}}/g, (match, token) => {
    const value = replacements[token];
    return value !== undefined && value !== null ? String(value) : match;
  });
};

const errorMessageToKeyMap: Record<string, string> = {
  'Unable to complete password login.': 'errors.passwordLogin',
  'Incorrect PIN.': 'errors.incorrectPin',
  'No saved session. Please log in with your password first.':
    'errors.noSavedSession',
  'Unable to sign in with PIN.': 'errors.pinLogin',
  'Biometric authentication is not available on this device.':
    'errors.biometricsUnavailable',
  'Biometric authentication was cancelled.': 'errors.biometricsCancelled',
  'Unable to complete biometric login.': 'errors.biometricLogin',
  'Please log in with your username and password before creating a PIN.':
    'errors.loginBeforePinCreation',
  'You must log in with your password before setting a PIN.':
    'errors.loginBeforePinSetting',
  'Please log in with your username and password before changing your PIN.':
    'errors.loginBeforePinChange',
  'PIN must contain at least 4 digits.': 'errors.pinLength',
  'Biometric authentication is not configured.':
    'errors.biometricsNotConfigured',
  'Unable to log in with WordPress credentials.': 'errors.wordpressCredentials',
  'Something went wrong while saving your PIN.': 'errors.pinSaveGeneric',
  'Something went wrong while removing your PIN.': 'errors.pinRemoveGeneric',
  'Unable to send password reset email.': 'errors.passwordReset',
  'Unable to register a new account.': 'errors.registerAccount',
  'Passwords do not match.': 'errors.passwordMismatch',
  'Unable to change password.': 'errors.changePassword',
  'PIN entries do not match.': 'errors.pinMismatch',
};

export const LocalizationProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(FALLBACK_LANGUAGE);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (storedLanguage === 'en' || storedLanguage === 'th') {
          setLanguageState(storedLanguage);
          return;
        }
      } catch (error) {
        // Ignore storage errors and fall back to default language.
      }
    };

    void bootstrap();
  }, []);

  const translate = useCallback(
    (key: string, options?: TranslateOptions) => {
      const currentDictionary = translations[language];
      const fallbackDictionary = translations[FALLBACK_LANGUAGE];

      const value =
        resolveTranslation(currentDictionary, key) ??
        resolveTranslation(fallbackDictionary, key);
      if (typeof value === 'string') {
        return formatTranslation(value, options?.replace);
      }

      if (typeof options?.defaultValue === 'string') {
        return formatTranslation(options.defaultValue, options.replace);
      }

      return key;
    },
    [language],
  );

  const updateLanguage = useCallback(async (newLanguage: Language) => {
    setLanguageState(newLanguage);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
    } catch (error) {
      // Ignore persistence errors; language will still update for current session.
    }
  }, []);

  const translateError = useCallback<
    LocalizationContextValue['translateError']
  >(
    value => {
      if (!value) {
        return value;
      }

      const key =
        errorMessageToKeyMap[value] ??
        (value.startsWith('errors.') ? value : undefined);
      if (key) {
        return translate(key);
      }

      return value;
    },
    [translate],
  );

  const contextValue = useMemo<LocalizationContextValue>(
    () => ({
      language,
      setLanguage: updateLanguage,
      t: translate,
      translateError,
    }),
    [language, translate, translateError, updateLanguage],
  );

  return (
    <LocalizationContext.Provider value={contextValue}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = (): LocalizationContextValue => {
  const context = React.useContext(LocalizationContext);
  if (!context) {
    throw new Error(
      'useLocalization must be used within a LocalizationProvider.',
    );
  }
  return context;
};
