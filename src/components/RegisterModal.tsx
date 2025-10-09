import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { RegisterAccountType, RegisterOptions } from '../types/auth';
import { COLORS } from '../config/theme';
import { PasswordVisibilityToggle } from './PasswordVisibilityToggle';
import { fetchVendorTiers } from '../services/vendorService';
import { VendorTierDefinition } from '../types/vendor';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface RegisterModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (options: RegisterOptions) => Promise<string | undefined>;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const { t, translateError } = useLocalization();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] =
    useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [accountType, setAccountType] = useState<RegisterAccountType>('member');
  const [vendorTiers, setVendorTiers] = useState<VendorTierDefinition[]>([]);
  const [selectedVendorTier, setSelectedVendorTier] = useState<string | null>(
    null,
  );
  const [isLoadingVendorTiers, setIsLoadingVendorTiers] = useState(false);
  const [vendorTierError, setVendorTierError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const layout = useResponsiveLayout();

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setPasswordVisible(false);
      setConfirmPasswordVisible(false);
      setFirstName('');
      setLastName('');
      setAccountType('member');
      setVendorTiers([]);
      setSelectedVendorTier(null);
      setIsLoadingVendorTiers(false);
      setVendorTierError(null);
      setLoading(false);
      setError(null);
      setSuccessMessage(null);
    }
  }, [visible]);

  const fallbackVendorTiers = useMemo<VendorTierDefinition[]>(
    () => [
      {
        id: 'sapphire',
        slug: 'sapphire',
        name: 'Sapphire',
        description: t('auth.registerModal.vendorTierSapphireDescription'),
        discountRates: {
          gold: 2.5,
          platinum: 5,
          black: 10,
        },
        promotionSummary: t(
          'auth.registerModal.vendorTierSapphirePromotions',
        ),
        benefits: null,
        metadata: null,
      },
      {
        id: 'diamond',
        slug: 'diamond',
        name: 'Diamond',
        description: t('auth.registerModal.vendorTierDiamondDescription'),
        discountRates: {
          gold: 5,
          platinum: 10,
          black: 20,
        },
        promotionSummary: t(
          'auth.registerModal.vendorTierDiamondPromotions',
        ),
        benefits: null,
        metadata: null,
      },
    ],
    [t],
  );

  useEffect(() => {
    if (!visible || accountType !== 'vendor' || successMessage !== null) {
      return;
    }

    let isMounted = true;
    setIsLoadingVendorTiers(true);
    setVendorTierError(null);

    fetchVendorTiers()
      .then(tiers => {
        if (!isMounted) {
          return;
        }
        const list = tiers.length ? tiers : fallbackVendorTiers;
        setVendorTiers(list);
        if (list.length === 1) {
          setSelectedVendorTier(list[0].slug);
        } else if (
          selectedVendorTier &&
          !list.some(tier => tier.slug === selectedVendorTier)
        ) {
          setSelectedVendorTier(null);
        }
      })
      .catch(fetchError => {
        if (!isMounted) {
          return;
        }
        setVendorTierError(
          fetchError instanceof Error
            ? fetchError.message
            : t('auth.registerModal.vendorTierError'),
        );
        setVendorTiers(fallbackVendorTiers);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingVendorTiers(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [
    accountType,
    fallbackVendorTiers,
    selectedVendorTier,
    successMessage,
    t,
    visible,
  ]);

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

    if (accountType === 'vendor' && !selectedVendorTier) {
      setError('Please select a vendor tier.');
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
        accountType,
        vendorTier: selectedVendorTier ?? undefined,
      });
      if (accountType === 'vendor') {
        setSuccessMessage(
          message ?? t('auth.registerModal.successVendor'),
        );
      } else {
        setSuccessMessage(message ?? t('auth.registerModal.success'));
      }
    } catch (err) {
      const fallback = 'Unable to register a new account.';
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
  const vendorTierNotice = useMemo(() => {
    if (isLoadingVendorTiers) {
      return t('auth.registerModal.vendorTierLoading');
    }
    if (vendorTierError) {
      return (
        translateError(vendorTierError) ??
        vendorTierError ??
        t('auth.registerModal.vendorTierError')
      );
    }
    return null;
  }, [
    isLoadingVendorTiers,
    t,
    translateError,
    vendorTierError,
  ]);
  const isSubmitDisabled =
    loading ||
    !username.trim() ||
    !email.trim() ||
    !password ||
    !confirmPassword ||
    successMessage !== null ||
    (accountType === 'vendor' && !selectedVendorTier);

  const containerStyles = useMemo(() => {
    const maxWidth = layout.isTablet ? 520 : 420;
    return {
      overlay: {
        padding: layout.isSmallPhone ? 16 : 24,
      },
      card: {
        maxWidth,
      },
      scrollContent: {
        padding: layout.isSmallPhone ? 20 : 24,
      },
    };
  }, [layout]);

  const formatDiscountSummary = useCallback((discounts?: {
    [tier: string]: number;
  } | null) => {
    if (!discounts) {
      return null;
    }

    const entries = Object.entries(discounts)
      .map(([tier, value]) => {
        const normalizedTier = tier.charAt(0).toUpperCase() + tier.slice(1);
        return `${normalizedTier} ${Number(value).toFixed(1)}%`;
      })
      .join(' · ');

    return entries.length ? entries : null;
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, containerStyles.overlay]}>
        <View style={[styles.card, containerStyles.card]}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, containerStyles.scrollContent]}
          >
            <Text style={styles.title}>{t('auth.registerModal.title')}</Text>
            <Text style={styles.description}>
              {t('auth.registerModal.description')}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t('auth.registerModal.usernameLabel')}
              </Text>
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
              <Text style={styles.label}>
                {t('auth.registerModal.emailLabel')}
              </Text>
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
              <Text style={styles.label}>
                {t('auth.registerModal.passwordLabel')}
              </Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!passwordVisible}
                  editable={!loading && successMessage === null}
                  style={styles.passwordInput}
                  placeholder={t('auth.registerModal.passwordPlaceholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                />
                <PasswordVisibilityToggle
                  visible={passwordVisible}
                  onToggle={() => setPasswordVisible(visible => !visible)}
                  labelShow={t('auth.forms.showPassword')}
                  labelHide={t('auth.forms.hidePassword')}
                  style={styles.togglePasswordButton}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t('auth.registerModal.confirmPasswordLabel')}
              </Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!confirmPasswordVisible}
                  editable={!loading && successMessage === null}
                  style={styles.passwordInput}
                  placeholder={t(
                    'auth.registerModal.confirmPasswordPlaceholder',
                  )}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  autoComplete="password-new"
                />
                <PasswordVisibilityToggle
                  visible={confirmPasswordVisible}
                  onToggle={() =>
                    setConfirmPasswordVisible(visible => !visible)
                  }
                  labelShow={t('auth.forms.showPassword')}
                  labelHide={t('auth.forms.hidePassword')}
                  style={styles.togglePasswordButton}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfFormGroup}>
                <Text style={styles.label}>
                  {t('auth.registerModal.firstNameLabel')}
                </Text>
                <TextInput
                  value={firstName}
                  onChangeText={setFirstName}
                  editable={!loading && successMessage === null}
                  style={styles.input}
                  placeholder={t('auth.registerModal.firstNamePlaceholder')}
                />
              </View>
              <View style={styles.halfFormGroup}>
                <Text style={styles.label}>
                  {t('auth.registerModal.lastNameLabel')}
                </Text>
                <TextInput
                  value={lastName}
                  onChangeText={setLastName}
                  editable={!loading && successMessage === null}
                  style={styles.input}
                  placeholder={t('auth.registerModal.lastNamePlaceholder')}
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {t('auth.registerModal.accountTypeLabel')}
              </Text>
              <View style={styles.accountTypeRow}>
                <Pressable
                  style={[
                    styles.accountTypeOption,
                    accountType === 'member' && styles.accountTypeOptionActive,
                    successMessage !== null && styles.accountTypeOptionDisabled,
                  ]}
                  disabled={loading || successMessage !== null}
                  onPress={() => setAccountType('member')}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.accountTypeLabel,
                      accountType === 'member' && styles.accountTypeLabelActive,
                    ]}
                  >
                    {t('auth.registerModal.memberOption')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.accountTypeOption,
                    accountType === 'vendor' && styles.accountTypeOptionActive,
                    successMessage !== null && styles.accountTypeOptionDisabled,
                  ]}
                  disabled={loading || successMessage !== null}
                  onPress={() => setAccountType('vendor')}
                  accessibilityRole="button"
                >
                  <Text
                    style={[
                      styles.accountTypeLabel,
                      accountType === 'vendor' && styles.accountTypeLabelActive,
                    ]}
                  >
                    {t('auth.registerModal.vendorOption')}
                  </Text>
                </Pressable>
              </View>
              {accountType === 'vendor' ? (
                <Text style={styles.helperText}>
                  {t('auth.registerModal.vendorDescription')}
                </Text>
              ) : null}
            </View>

            {accountType === 'vendor' ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>
                  {t('auth.registerModal.vendorTierLabel')}
                </Text>
                {vendorTierNotice ? (
                  <Text style={styles.notice}>{vendorTierNotice}</Text>
                ) : null}
                <View style={styles.vendorTierList}>
                  {vendorTiers.map(tier => {
                    const isActive = selectedVendorTier === tier.slug;
                    const discountSummary = formatDiscountSummary(
                      tier.discountRates ?? null,
                    );
                    return (
                      <Pressable
                        key={tier.slug}
                        style={[
                          styles.vendorTierOption,
                          isActive && styles.vendorTierOptionActive,
                          successMessage !== null &&
                            styles.accountTypeOptionDisabled,
                        ]}
                        accessibilityRole="button"
                        disabled={loading || successMessage !== null}
                        onPress={() => setSelectedVendorTier(tier.slug)}
                      >
                        <Text
                          style={[
                            styles.vendorTierName,
                            isActive && styles.vendorTierNameActive,
                          ]}
                        >
                          {tier.name}
                        </Text>
                        {tier.description ? (
                          <Text style={styles.vendorTierDescription}>
                            {tier.description}
                          </Text>
                        ) : null}
                        {discountSummary ? (
                          <Text style={styles.vendorTierMeta}>
                            {t('auth.registerModal.vendorTierDiscounts', {
                              replace: { summary: discountSummary },
                            })}
                          </Text>
                        ) : null}
                        {tier.promotionSummary ? (
                          <Text style={styles.vendorTierMeta}>
                            {t('auth.registerModal.vendorTierPromotions', {
                              replace: { summary: tier.promotionSummary },
                            })}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {translatedError ? (
              <Text style={styles.error}>{translatedError}</Text>
            ) : null}
            {successMessage ? (
              <Text style={styles.success}>{successMessage}</Text>
            ) : null}

            {successMessage === null ? (
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
                    {t('auth.registerModal.submit')}
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
    maxHeight: '90%',
  },
  scrollContent: {
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
  helperText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  notice: {
    fontSize: 13,
    color: COLORS.textOnMuted,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  accountTypeOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
  },
  accountTypeOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  accountTypeOptionDisabled: {
    opacity: 0.6,
  },
  accountTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    color: COLORS.textSecondary,
  },
  accountTypeLabelActive: {
    color: COLORS.primary,
  },
  vendorTierList: {
    gap: 12,
  },
  vendorTierOption: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    backgroundColor: COLORS.surface,
    gap: 6,
  },
  vendorTierOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryMuted,
  },
  vendorTierName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  vendorTierNameActive: {
    color: COLORS.primary,
  },
  vendorTierDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  vendorTierMeta: {
    fontSize: 13,
    color: COLORS.textOnMuted,
  },
  passwordInputWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  togglePasswordButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
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
