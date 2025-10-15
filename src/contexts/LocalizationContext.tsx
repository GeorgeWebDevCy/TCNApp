import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Language,
  TranslationDictionary,
  TranslationValue,
  translations,
} from '../localization/translations';
import {
  AppError,
  ERROR_CATALOG,
  ErrorDescriptor,
  createAppError,
  findDescriptorByCode,
  isAppError,
} from '../errors';
import deviceLog from '../utils/deviceLog';

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
    value: string | AppError | null | undefined,
    options?: { includeCode?: boolean },
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
  'A username or email address and password are required.': 'errors.passwordLogin',
  'Too many attempts. Try again shortly.': 'errors.passwordLogin',
  'Your account is suspended. Contact support for assistance.': 'errors.vendorSuspended',
  'Something went wrong while saving your PIN.': 'errors.pinSaveGeneric',
  'Something went wrong while removing your PIN.': 'errors.pinRemoveGeneric',
  'Unable to send password reset email.': 'errors.passwordReset',
  'Unable to reset password.': 'errors.resetPassword',
  'Unable to register a new account.': 'errors.registerAccount',
  'Passwords do not match.': 'errors.passwordMismatch',
  'Please select a vendor tier.': 'errors.vendorTierRequired',
  'Unable to change password.': 'errors.changePassword',
  'Unable to update profile photo.': 'profile.avatar.errors.updateFailed',
  'Unable to remove profile photo.': 'profile.avatar.errors.removeFailed',
  'Unable to load vendor tiers.': 'auth.registerModal.vendorTierError',
  'Unable to load membership plans. Please try again.':
    'membership.screen.loadError',
  'Unable to load admin data. Pull to refresh to try again.':
    'admin.dashboard.errors.load',
  'Unable to approve the vendor. Please try again.':
    'admin.dashboard.errors.approve',
  'Unable to reject the vendor. Please try again.':
    'admin.dashboard.errors.reject',
  'Unable to load transactions.': 'analytics.errors.fetch',
  'Unable to store secure credential.': 'errors.generic',
  'PIN entries do not match.': 'errors.pinMismatch',
  'Your vendor account is pending approval.': 'errors.vendorPending',
  'Your vendor application has been rejected.': 'errors.vendorRejected',
  'Your vendor account has been suspended. Contact support for assistance.':
    'errors.vendorSuspended',
};

const translationKeyToDescriptor: Record<string, ErrorDescriptor> =
  Object.values(ERROR_CATALOG).reduce<Record<string, ErrorDescriptor>>(
    (accumulator, descriptor) => {
      if (descriptor.translationKey) {
        accumulator[descriptor.translationKey] = descriptor;
      }
      return accumulator;
    },
    {},
  );

type ParsedCodedMessage = {
  code: string;
  message: string;
};

const parseCodedMessage = (value: string): ParsedCodedMessage | null => {
  const match = value.match(/^(E\d{4})\s*:\s*(.+)$/);
  if (!match) {
    return null;
  }

  return {
    code: match[1],
    message: match[2],
  };
};

const formatWithCode = (
  code: string | undefined,
  message: string,
  includeCode: boolean,
): string => {
  if (!code || !includeCode) {
    return message;
  }
  return `${code}: ${message}`;
};

export const LocalizationProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [language, setLanguageState] = useState<Language>(FALLBACK_LANGUAGE);
  const missingTranslationKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (storedLanguage === 'en' || storedLanguage === 'th') {
          setLanguageState(storedLanguage);
          deviceLog.info('localization.bootstrap.success', {
            language: storedLanguage,
          });
          return;
        }
        deviceLog.debug('localization.bootstrap.noStoredLanguage');
      } catch (error) {
        deviceLog.warn('localization.bootstrap.storageError', {
          message: error instanceof Error ? error.message : String(error),
        });
      }

      deviceLog.info('localization.bootstrap.fallback', {
        language: FALLBACK_LANGUAGE,
      });
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

      const missingKeyIdentifier = `${language}:${key}`;
      if (!missingTranslationKeysRef.current.has(missingKeyIdentifier)) {
        missingTranslationKeysRef.current.add(missingKeyIdentifier);
        deviceLog.warn('localization.translation.missing', {
          language,
          key,
        });
      }

      return key;
    },
    [language],
  );

  const updateLanguage = useCallback(async (newLanguage: Language) => {
    setLanguageState(newLanguage);
    try {
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage);
      deviceLog.info('localization.language.updated', {
        language: newLanguage,
      });
    } catch (error) {
      deviceLog.warn('localization.language.persistError', {
        language: newLanguage,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const translateError = useCallback<
    LocalizationContextValue['translateError']
  >(
    (value, options) => {
      if (value === null || value === undefined) {
        return value ?? null;
      }

      const includeCode = options?.includeCode ?? true;

      if (isAppError(value)) {
        const descriptor = value.descriptor;
        const localized =
          descriptor.translationKey
            ? translate(descriptor.translationKey, {
                defaultValue: value.displayMessage,
              })
            : value.displayMessage;
        const finalMessage =
          value.overrideMessage && value.overrideMessage.trim().length > 0
            ? value.overrideMessage.trim()
            : localized;
        const formatted = formatWithCode(
          value.code,
          finalMessage,
          includeCode,
        );
        deviceLog.debug('localization.translateError', {
          id: value.id,
          code: value.code,
          language,
        });
        return formatted;
      }

      if (typeof value !== 'string') {
        return String(value);
      }

      const parsed = parseCodedMessage(value);
      if (parsed) {
        const descriptor = findDescriptorByCode(parsed.code);
        const localized =
          descriptor?.translationKey
            ? translate(descriptor.translationKey, {
                defaultValue: descriptor.defaultMessage,
              })
            : descriptor?.defaultMessage ?? parsed.message;
        const finalMessage =
          parsed.message && parsed.message.trim().length > 0
            ? parsed.message.trim()
            : localized;
        return formatWithCode(parsed.code, finalMessage, includeCode);
      }

      const translationKey =
        errorMessageToKeyMap[value] ??
        (value.startsWith('errors.') ? value : undefined);
      if (translationKey) {
        const descriptor = translationKeyToDescriptor[translationKey];
        const localized = translate(translationKey);
        const formatted = formatWithCode(
          descriptor?.code,
          localized,
          includeCode && Boolean(descriptor?.code),
        );
        deviceLog.debug('localization.translateError', {
          key: translationKey,
          language,
          code: descriptor?.code ?? null,
        });
        return formatted;
      }

      return includeCode
        ? value
        : value.replace(/^[A-Z]\d{4}:\s*/, '');
    },
    [language, translate],
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
    throw createAppError('PROVIDER_LOCALIZATION_MISSING');
  }
  return context;
};
