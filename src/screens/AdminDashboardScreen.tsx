import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthContext } from '../contexts/AuthContext';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  AdminAccountSummary,
  approveVendorAccount,
  fetchAdminAccounts,
  rejectVendorAccount,
} from '../services/adminService';
import { COLORS } from '../config/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

interface AdminDashboardScreenProps {
  onOpenMemberExperience?: () => void;
}

type ActiveAction = {
  id: number;
  type: 'approve' | 'reject';
} | null;

const resolveStatusLabel = (
  t: ReturnType<typeof useLocalization>['t'],
  status: string | null,
) => {
  if (!status) {
    return t('admin.dashboard.statusLabels.pending');
  }

  const normalized = status.toLowerCase();
  const key = `admin.dashboard.statusLabels.${normalized}`;
  return t(key, {
    defaultValue: t('admin.dashboard.statusLabels.pending'),
  });
};

const resolveStatusStyle = (status: string | null) => {
  const normalized = status ? status.toLowerCase() : 'pending';
  if (normalized === 'active') {
    return styles.statusPillActive;
  }
  if (normalized === 'rejected') {
    return styles.statusPillRejected;
  }
  if (normalized === 'suspended') {
    return styles.statusPillSuspended;
  }
  return styles.statusPillPending;
};

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  onOpenMemberExperience,
}) => {
  const { state, getSessionToken } = useAuthContext();
  const { t } = useLocalization();
  const layout = useResponsiveLayout();

  const [accounts, setAccounts] = useState<AdminAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      if (!token) {
        throw new Error(t('admin.dashboard.errors.load'));
      }
      const directory = await fetchAdminAccounts(token);
      setAccounts(directory);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t('admin.dashboard.errors.load');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getSessionToken, t]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAccounts();
    } finally {
      setRefreshing(false);
    }
  }, [loadAccounts]);

  const pendingVendors = useMemo(
    () =>
      accounts.filter(account => {
        const isVendor = account.accountType === 'vendor';
        const status = account.vendorStatus ?? account.accountStatus;
        return isVendor && (status ?? 'pending').toLowerCase() === 'pending';
      }),
    [accounts],
  );

  const handleActionResult = useCallback(
    async (
      account: AdminAccountSummary,
      action: 'approve' | 'reject',
      performer: (token: string) => Promise<void>,
      errorKey: 'approve' | 'reject',
    ) => {
      setActiveAction({ id: account.id, type: action });
      try {
        const token = await getSessionToken();
        if (!token) {
          throw new Error(t(`admin.dashboard.errors.${errorKey}`));
        }
        await performer(token);
        await loadAccounts();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : t(`admin.dashboard.errors.${errorKey}`);
        Alert.alert(t('admin.dashboard.title'), message);
      } finally {
        setActiveAction(null);
      }
    },
    [getSessionToken, loadAccounts, t],
  );

  const confirmApprove = useCallback(
    (account: AdminAccountSummary) => {
      const displayName = account.name || account.email;
      Alert.alert(
        t('admin.dashboard.confirmations.approveTitle'),
        t('admin.dashboard.confirmations.approveMessage', {
          replace: { name: displayName },
        }),
        [
          {
            text: t('admin.dashboard.actions.cancel'),
            style: 'cancel',
          },
          {
            text: t('admin.dashboard.actions.approve'),
            style: 'default',
            onPress: () =>
              void handleActionResult(
                account,
                'approve',
                token => approveVendorAccount(token, account.id),
                'approve',
              ),
          },
        ],
      );
    },
    [handleActionResult, t],
  );

  const confirmReject = useCallback(
    (account: AdminAccountSummary) => {
      const displayName = account.name || account.email;
      Alert.alert(
        t('admin.dashboard.confirmations.rejectTitle'),
        t('admin.dashboard.confirmations.rejectMessage', {
          replace: { name: displayName },
        }),
        [
          {
            text: t('admin.dashboard.actions.cancel'),
            style: 'cancel',
          },
          {
            text: t('admin.dashboard.actions.reject'),
            style: 'destructive',
            onPress: () =>
              void handleActionResult(
                account,
                'reject',
                token => rejectVendorAccount(token, account.id),
                'reject',
              ),
          },
        ],
      );
    },
    [handleActionResult, t],
  );

  const canReviewVendor = useCallback((account: AdminAccountSummary) => {
    if (account.accountType !== 'vendor') {
      return false;
    }
    const status = (account.vendorStatus ?? account.accountStatus ?? 'pending').toLowerCase();
    return status === 'pending';
  }, []);

  const isActionInFlight = useCallback(
    (accountId: number, type: 'approve' | 'reject') =>
      activeAction?.id === accountId && activeAction.type === type,
    [activeAction],
  );

  const pendingSummaryLabel = useMemo(() => {
    const count = pendingVendors.length;
    if (count === 0) {
      return t('admin.dashboard.pendingSummaryNone');
    }
    return t('admin.dashboard.pendingSummary', {
      replace: { count: count.toString() },
    });
  }, [pendingVendors.length, t]);

  const headerName = state.user?.name ?? state.user?.email ?? '';

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        void onRefresh();
      }}
      tintColor={COLORS.primary}
    />
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: layout.contentPadding }]}
        refreshControl={refreshControl}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('admin.dashboard.title')}</Text>
            <Text style={styles.subtitle}>{t('admin.dashboard.subtitle')}</Text>
            {headerName ? (
              <Text style={styles.operator}>{headerName}</Text>
            ) : null}
          </View>
          {onOpenMemberExperience ? (
            <Pressable
              onPress={onOpenMemberExperience}
              style={styles.secondaryButton}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {t('admin.dashboard.viewMemberApp')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{pendingSummaryLabel}</Text>
          <Text style={styles.summaryHint}>{t('admin.dashboard.refreshHint')}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={COLORS.primary} size="large" />
          </View>
        ) : (
          <View style={styles.sections}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('admin.dashboard.sections.pending')}
              </Text>
              {pendingVendors.length === 0 ? (
                <Text style={styles.emptyMessage}>
                  {t('admin.dashboard.empty.pending')}
                </Text>
              ) : (
                pendingVendors.map(account => {
                  const status = account.vendorStatus ?? account.accountStatus;
                  return (
                    <View style={styles.accountCard} key={`pending-${account.id}`}>
                      <View style={styles.accountHeader}>
                        <View style={styles.accountTitleBlock}>
                          <Text style={styles.accountName}>{account.name}</Text>
                          <Text style={styles.accountEmail}>{account.email}</Text>
                        </View>
                        <View
                          style={[styles.statusPill, resolveStatusStyle(status)]}
                        >
                          <Text style={styles.statusPillText}>
                            {resolveStatusLabel(t, status ?? null)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.accountMeta}>
                        {t('admin.dashboard.tableHeaders.type')}: {account.accountType ?? '—'}
                      </Text>
                      <View style={styles.actionsRow}>
                        <Pressable
                          style={[styles.primaryButton, styles.actionButton]}
                          onPress={() => confirmApprove(account)}
                          disabled={isActionInFlight(account.id, 'approve')}
                          accessibilityRole="button"
                        >
                          {isActionInFlight(account.id, 'approve') ? (
                            <ActivityIndicator
                              color={COLORS.textOnPrimary}
                              size="small"
                            />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              {t('admin.dashboard.actions.approve')}
                            </Text>
                          )}
                        </Pressable>
                        <Pressable
                          style={[styles.dangerButton, styles.actionButton]}
                          onPress={() => confirmReject(account)}
                          disabled={isActionInFlight(account.id, 'reject')}
                          accessibilityRole="button"
                        >
                          {isActionInFlight(account.id, 'reject') ? (
                            <ActivityIndicator color={COLORS.textOnPrimary} size="small" />
                          ) : (
                            <Text style={styles.dangerButtonText}>
                              {t('admin.dashboard.actions.reject')}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('admin.dashboard.sections.directory')}
              </Text>
              {accounts.length === 0 ? (
                <Text style={styles.emptyMessage}>
                  {t('admin.dashboard.empty.directory')}
                </Text>
              ) : (
                accounts.map(account => {
                  const status = account.accountStatus ?? account.vendorStatus;
                  const canReview = canReviewVendor(account);

                  return (
                    <View style={styles.accountCard} key={`account-${account.id}`}>
                      <View style={styles.accountHeader}>
                        <View style={styles.accountTitleBlock}>
                          <Text style={styles.accountName}>{account.name}</Text>
                          <Text style={styles.accountEmail}>{account.email}</Text>
                        </View>
                        <View
                          style={[styles.statusPill, resolveStatusStyle(status)]}
                        >
                          <Text style={styles.statusPillText}>
                            {resolveStatusLabel(t, status ?? null)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.accountMetaRow}>
                        <Text style={styles.accountMeta}>
                          {t('admin.dashboard.tableHeaders.type')}: {account.accountType ?? '—'}
                        </Text>
                        {account.createdAt ? (
                          <Text style={styles.accountMeta}>
                            {account.createdAt}
                          </Text>
                        ) : null}
                      </View>
                      {canReview ? (
                        <View style={styles.actionsRow}>
                          <Pressable
                            style={[styles.primaryButton, styles.actionButton]}
                            onPress={() => confirmApprove(account)}
                            disabled={isActionInFlight(account.id, 'approve')}
                            accessibilityRole="button"
                          >
                            {isActionInFlight(account.id, 'approve') ? (
                              <ActivityIndicator
                                color={COLORS.textOnPrimary}
                                size="small"
                              />
                            ) : (
                              <Text style={styles.primaryButtonText}>
                                {t('admin.dashboard.actions.approve')}
                              </Text>
                            )}
                          </Pressable>
                          <Pressable
                            style={[styles.dangerButton, styles.actionButton]}
                            onPress={() => confirmReject(account)}
                            disabled={isActionInFlight(account.id, 'reject')}
                            accessibilityRole="button"
                          >
                            {isActionInFlight(account.id, 'reject') ? (
                              <ActivityIndicator
                                color={COLORS.textOnPrimary}
                                size="small"
                              />
                            ) : (
                              <Text style={styles.dangerButtonText}>
                                {t('admin.dashboard.actions.reject')}
                              </Text>
                            )}
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        )}
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
    flexGrow: 1,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  operator: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  summaryHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
  },
  loadingContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sections: {
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  emptyMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  accountCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: COLORS.mutedBorder,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  accountTitleBlock: {
    flex: 1,
    gap: 4,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  accountEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  accountMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  accountMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: COLORS.error,
  },
  dangerButtonText: {
    color: COLORS.textOnPrimary,
    fontWeight: '600',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textOnPrimary,
  },
  statusPillActive: {
    backgroundColor: COLORS.success,
  },
  statusPillPending: {
    backgroundColor: COLORS.warning,
  },
  statusPillRejected: {
    backgroundColor: COLORS.error,
  },
  statusPillSuspended: {
    backgroundColor: COLORS.border,
  },
});

export default AdminDashboardScreen;
