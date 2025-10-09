import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { useTransactionContext } from '../contexts/TransactionContext';
import {
  calculateDiscount,
  lookupMember,
  recordTransaction,
} from '../services/transactionService';
import { calculateDiscountForAmount } from '../utils/discount';
import {
  DiscountDescriptor,
  MemberLookupResult,
  TransactionRecord,
} from '../types/transactions';
import { COLORS } from '../config/theme';

type VendorScanScreenProps = {
  onShowAnalytics?: () => void;
};

export const VendorScanScreen: React.FC<VendorScanScreenProps> = ({
  onShowAnalytics,
}) => {
  const {
    state: { user },
    logout,
    getSessionToken,
  } = useAuthContext();
  const { transactions, addTransaction, replaceTransaction, patchTransaction } =
    useTransactionContext();
  const { t } = useLocalization();
  const [manualToken, setManualToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [result, setResult] = useState<MemberLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [grossAmount, setGrossAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleValidation = useCallback(
    async (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) {
        setError(t('vendor.screen.errors.empty'));
        return;
      }

      setIsValidating(true);
      setError(null);

      try {
        const sessionToken = await getSessionToken();
        const validation = await lookupMember(
          trimmed,
          sessionToken,
          vendorId ?? undefined,
        );
        setResult(validation);
        if (!validation.valid) {
          setError(
            validation.message ?? t('vendor.screen.status.invalidMessage'),
          );
          setSubmissionError(validation.message ?? null);
        }
      } catch (validationError) {
        const message =
          validationError instanceof Error
            ? validationError.message
            : t('vendor.screen.errors.generic');
        setError(message);
        setSubmissionError(message);
        setResult(null);
      } finally {
        setIsValidating(false);
        setGrossAmount('');
      }
    },
    [getSessionToken, t, vendorId],
  );

  const handleManualSubmit = useCallback(() => {
    void handleValidation(manualToken);
  }, [handleValidation, manualToken]);

  const statusLabel = useMemo(() => {
    if (!result) {
      return null;
    }

    return result.valid
      ? t('vendor.screen.status.valid')
      : t('vendor.screen.status.invalid');
  }, [result, t]);

  const discountLabel = useMemo(() => {
    if (!result?.allowedDiscount) {
      return null;
    }
    const formatted = Math.round(result.allowedDiscount * 100) / 100;
    return `${formatted}%`;
  }, [result?.allowedDiscount]);

  const vendorTier = user?.vendorTier ?? null;
  const vendorId = user?.id ?? null;
  const membershipTier = useMemo(() => {
    if (!result) {
      return null;
    }
    return result.membershipTier ?? result.membership?.tier ?? null;
  }, [result]);

  const discountDescriptor = result?.discountDescriptor ?? null;

  const calculateWithDescriptor = useCallback(
    (amount: number, descriptor: DiscountDescriptor | null) => {
      if (!descriptor) {
        return calculateDiscountForAmount(amount, membershipTier, vendorTier);
      }

      const normalizedGross = Number.isFinite(amount) ? amount : 0;
      if (descriptor.type === 'amount') {
        const discountAmount = Number(descriptor.value.toFixed(2));
        const discountPercentage = normalizedGross
          ? Number(((discountAmount / normalizedGross) * 100).toFixed(2))
          : 0;
        const netAmount = Number(
          (normalizedGross - discountAmount).toFixed(2),
        );
        return {
          discountPercentage,
          discountAmount,
          netAmount,
          grossAmount: Number(normalizedGross.toFixed(2)),
        };
      }

      const percentage =
        descriptor.value > 1
          ? Number(descriptor.value.toFixed(2))
          : Number((descriptor.value * 100).toFixed(2));
      const discountAmount = Number(
        ((normalizedGross * percentage) / 100).toFixed(2),
      );
      const netAmount = Number(
        (normalizedGross - discountAmount).toFixed(2),
      );
      return {
        discountPercentage: percentage,
        discountAmount,
        netAmount,
        grossAmount: Number(normalizedGross.toFixed(2)),
      };
    },
    [membershipTier, vendorTier],
  );

  const grossAmountValue = useMemo(() => {
    const sanitized = grossAmount.replace(/[^0-9.]/g, '');
    const normalized = Number.parseFloat(sanitized);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
  }, [grossAmount]);

  const localCalculation = useMemo(() => {
    return calculateWithDescriptor(grossAmountValue, discountDescriptor);
  }, [calculateWithDescriptor, discountDescriptor, grossAmountValue]);

  const recentTransactions = useMemo(
    () => transactions.slice(0, 5),
    [transactions],
  );

  const formatCurrency = useCallback(
    (value: number) =>
      Number.isFinite(value)
        ? value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : '0.00',
    [],
  );

  const handleTransactionSubmit = useCallback(async () => {
    if (!result?.valid) {
      setSubmissionError(t('vendor.screen.transaction.errors.noMember'));
      return;
    }

    const parsedAmount = grossAmountValue;

    if (!parsedAmount || parsedAmount <= 0) {
      setSubmissionError(t('vendor.screen.transaction.errors.invalidAmount'));
      return;
    }

    const optimisticCalculation = calculateWithDescriptor(
      parsedAmount,
      discountDescriptor,
    );

    const optimisticTransaction: TransactionRecord = {
      id: `local-${Date.now()}`,
      memberToken: result.token,
      memberId: result.memberId ?? null,
      memberName: result.memberName ?? null,
      membership: result.membership ?? null,
      status: 'pending',
      createdAt: new Date().toISOString(),
      discountPercentage: optimisticCalculation.discountPercentage,
      discountAmount: optimisticCalculation.discountAmount,
      netAmount: optimisticCalculation.netAmount,
      currency: 'THB',
      membershipTier: membershipTier ?? null,
      vendorTier: vendorTier ?? null,
      message: null,
      vendorName: user?.name ?? null,
      vendorId,
      errorMessage: null,
      discountDescriptor: discountDescriptor ?? undefined,
    };

    addTransaction(optimisticTransaction);
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const sessionToken = await getSessionToken();
      const remoteCalculation = await calculateDiscount(
        {
          grossAmount: parsedAmount,
          membershipTier: membershipTier ?? undefined,
          vendorTier: vendorTier ?? undefined,
          currency: 'THB',
          memberToken: result.token,
          memberId: result.memberId ?? undefined,
          vendorId: vendorId ?? undefined,
          discountDescriptor: discountDescriptor ?? undefined,
        },
        sessionToken,
      );

      setResult(previous =>
        previous
          ? {
              ...previous,
              allowedDiscount: remoteCalculation.discountPercentage,
              discountDescriptor:
                remoteCalculation.discountDescriptor ??
                previous.discountDescriptor,
            }
          : previous,
      );

      const recorded = await recordTransaction(
        {
          memberToken: result.token,
          memberId: result.memberId ?? undefined,
          memberName: result.memberName ?? null,
          membership: result.membership ?? null,
          membershipTier: membershipTier ?? undefined,
          vendorTier: vendorTier ?? undefined,
          grossAmount: parsedAmount,
          currency: remoteCalculation.currency ?? 'THB',
          discountPercentage: remoteCalculation.discountPercentage,
          discountAmount: remoteCalculation.discountAmount,
          netAmount: remoteCalculation.netAmount,
          vendorId: vendorId ?? undefined,
          discountDescriptor:
            remoteCalculation.discountDescriptor ??
            discountDescriptor ??
            undefined,
        },
        sessionToken,
      );

      const finalRecord: TransactionRecord = {
        ...optimisticTransaction,
        ...remoteCalculation,
        ...recorded,
        id: recorded.id ?? optimisticTransaction.id,
        status: recorded.status ?? 'completed',
      };

      replaceTransaction(optimisticTransaction.id, finalRecord);

      if (finalRecord.status === 'failed') {
        const message =
          finalRecord.errorMessage ??
          t('vendor.screen.transaction.errors.submit');
        setSubmissionError(message);
      } else {
        setGrossAmount('');
      }
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : t('vendor.screen.transaction.errors.submit');
      patchTransaction(optimisticTransaction.id, {
        status: 'failed',
        errorMessage: message,
      });
      setSubmissionError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    addTransaction,
    getSessionToken,
    grossAmountValue,
    membershipTier,
    patchTransaction,
    replaceTransaction,
    result,
    t,
    user?.name,
    vendorId,
    vendorTier,
    calculateWithDescriptor,
    discountDescriptor,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        testID="vendor-scan-scroll"
      >
        <Text style={styles.title}>{t('vendor.screen.title')}</Text>
        <Text style={styles.subtitle}>{t('vendor.screen.subtitle')}</Text>
        {onShowAnalytics ? (
          <Pressable
            style={styles.analyticsButton}
            accessibilityRole="button"
            onPress={onShowAnalytics}
            testID="vendor-analytics-button"
          >
            <Text style={styles.analyticsButtonText}>
              {t('vendor.screen.viewAnalytics')}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.cameraContainer}>
          <View style={styles.cameraPlaceholder} testID="vendor-camera-unavailable">
            <Text style={styles.permissionText}>
              {t('vendor.screen.cameraUnavailable')}
            </Text>
          </View>
        </View>

        <View style={styles.manualEntry}>
          <Text style={styles.sectionTitle}>{t('vendor.screen.manualTitle')}</Text>
          <TextInput
            value={manualToken}
            onChangeText={setManualToken}
            placeholder={t('vendor.screen.manualPlaceholder')}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            testID="vendor-manual-input"
          />
          <Pressable
            style={[styles.primaryButton, isValidating && styles.buttonDisabled]}
            onPress={handleManualSubmit}
            accessibilityRole="button"
            disabled={isValidating}
            testID="vendor-manual-submit"
          >
            {isValidating ? (
              <ActivityIndicator color={COLORS.textOnPrimary} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {t('vendor.screen.manualSubmit')}
              </Text>
            )}
          </Pressable>
        </View>

        {error ? (
          <Text style={styles.errorText} testID="vendor-error">
            {error}
          </Text>
        ) : null}

        {result ? (
          <View style={styles.resultCard} testID="vendor-result">
            <Text style={styles.resultTitle}>{statusLabel}</Text>
            {result.memberName ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.memberName', {
                  replace: { name: result.memberName },
                })}
              </Text>
            ) : null}
            {result.membershipTier ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.membershipTier', {
                  replace: { tier: result.membershipTier },
                })}
              </Text>
            ) : null}
            {discountLabel ? (
              <Text style={styles.resultMeta}>
                {t('vendor.screen.result.discount', {
                  replace: { discount: discountLabel },
                })}
              </Text>
            ) : null}
            {result.message && !result.valid ? (
              <Text style={styles.resultMessage}>{result.message}</Text>
            ) : null}
          </View>
        ) : null}

        {result?.valid ? (
          <View style={styles.transactionCard} testID="vendor-transaction-card">
            <Text style={styles.sectionTitle}>
              {t('vendor.screen.transaction.title')}
            </Text>
            <Text style={styles.transactionHint}>
              {t('vendor.screen.transaction.hint')}
            </Text>
            <Text style={styles.inputLabel}>
              {t('vendor.screen.transaction.amountLabel')}
            </Text>
            <TextInput
              value={grossAmount}
              onChangeText={setGrossAmount}
              placeholder={t('vendor.screen.transaction.amountPlaceholder')}
              style={styles.input}
              keyboardType="decimal-pad"
              inputMode="decimal"
              testID="vendor-transaction-amount"
            />
            {grossAmountValue > 0 ? (
              <View style={styles.transactionSummary}>
                <Text style={styles.transactionSummaryText}>
                  {t('vendor.screen.transaction.estimatedDiscount', {
                    replace: {
                      amount: formatCurrency(localCalculation.discountAmount),
                      percent: localCalculation.discountPercentage.toFixed(2),
                    },
                  })}
                </Text>
                <Text style={styles.transactionSummaryText}>
                  {t('vendor.screen.transaction.estimatedNet', {
                    replace: {
                      total: formatCurrency(localCalculation.netAmount),
                    },
                  })}
                </Text>
              </View>
            ) : null}
            {submissionError ? (
              <Text style={styles.errorText} testID="vendor-transaction-error">
                {submissionError}
              </Text>
            ) : null}
            <Pressable
              style={[
                styles.primaryButton,
                (isSubmitting || isValidating) && styles.buttonDisabled,
              ]}
              onPress={() => void handleTransactionSubmit()}
              accessibilityRole="button"
              disabled={isSubmitting || isValidating}
              testID="vendor-transaction-submit"
            >
              {isSubmitting ? (
                <ActivityIndicator color={COLORS.textOnPrimary} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {t('vendor.screen.transaction.submit')}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={styles.recentCard}>
          <Text style={styles.sectionTitle}>
            {t('vendor.screen.recent.title')}
          </Text>
          {recentTransactions.length === 0 ? (
            <Text style={styles.resultMessage}>
              {t('vendor.screen.recent.empty')}
            </Text>
          ) : (
            recentTransactions.map(transaction => {
              const statusStyle =
                transaction.status === 'failed'
                  ? styles.statusFailed
                  : transaction.status === 'completed'
                    ? styles.statusCompleted
                    : styles.statusPending;
              const statusLabel = t(
                `vendor.screen.recent.status.${transaction.status}`,
              );
              const memberLabel =
                transaction.memberName && transaction.memberName.length > 0
                  ? transaction.memberName
                  : transaction.memberToken;
              const gross =
                transaction.grossAmount ??
                Number(
                  ((transaction.netAmount ?? 0) +
                    (transaction.discountAmount ?? 0)).toFixed(2),
                );

              return (
                <View style={styles.recentRow} key={transaction.id}>
                  <View style={styles.recentRowHeader}>
                    <Text style={styles.recentRowName}>{memberLabel}</Text>
                    <Text style={[styles.statusBadge, statusStyle]}>
                      {statusLabel}
                    </Text>
                  </View>
                  <Text style={styles.recentRowMeta}>
                    {t('vendor.screen.recent.summary', {
                      replace: {
                        gross: formatCurrency(gross ?? 0),
                        discount: formatCurrency(
                          transaction.discountAmount ?? 0,
                        ),
                        net: formatCurrency(transaction.netAmount ?? 0),
                      },
                    })}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <Pressable
          style={styles.outlineButton}
          accessibilityRole="button"
          onPress={() => void logout()}
          testID="vendor-logout"
        >
          <Text style={styles.outlineButtonText}>{t('vendor.screen.logout')}</Text>
        </Pressable>

        {user?.name ? (
          <Text style={styles.footerNote}>
            {t('vendor.screen.operator', { replace: { name: user.name } })}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    padding: 24,
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
  },
  analyticsButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.mutedBorder,
    backgroundColor: COLORS.surface,
  },
  analyticsButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  cameraContainer: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceMuted,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: COLORS.surfaceMuted,
  },
  permissionText: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.textSecondary,
  },
  manualEntry: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  transactionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  transactionHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  transactionSummary: {
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  transactionSummaryText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
  resultCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 6,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  resultMeta: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  resultMessage: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  outlineButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  recentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  recentRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
    padding: 12,
    gap: 6,
  },
  recentRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  recentRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  recentRowMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
    overflow: 'hidden',
  },
  statusPending: {
    backgroundColor: COLORS.warningBackground,
    color: COLORS.warningText,
  },
  statusCompleted: {
    backgroundColor: COLORS.successBackground,
    color: COLORS.successText,
  },
  statusFailed: {
    backgroundColor: COLORS.errorBackground,
    color: COLORS.errorText,
  },
  footerNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

