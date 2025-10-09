import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthContext } from '../contexts/AuthContext';
import { useTransactionContext } from '../contexts/TransactionContext';
import {
  fetchMemberTransactions,
  fetchVendorTransactions,
} from '../services/transactionService';
import { TransactionRecord } from '../types/transactions';
import {
  MonthlySavingsDatum,
  VendorPerformanceDatum,
  StatusBreakdownDatum,
  buildMonthlySavings,
  buildStatusBreakdown,
  buildVendorPerformance,
  calculateCompletedCount,
  calculateTotalSavings,
} from '../utils/transactionAnalytics';

interface UseTransactionsAnalyticsOptions {
  preservePending?: boolean;
}

export interface UseTransactionsAnalyticsResult {
  transactions: TransactionRecord[];
  monthlySavings: MonthlySavingsDatum[];
  topVendors: VendorPerformanceDatum[];
  statusBreakdown: StatusBreakdownDatum[];
  totalSavings: number;
  completedCount: number;
  isLoading: boolean;
  isEmpty: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => Promise<void>;
}

const sortTransactionsByDate = (
  records: TransactionRecord[],
): TransactionRecord[] => {
  return [...records].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return Number.isFinite(right) && Number.isFinite(left)
      ? right - left
      : 0;
  });
};

const mergeTransactions = (
  primary: TransactionRecord[],
  secondary: TransactionRecord[],
): TransactionRecord[] => {
  const byId = new Map<string, TransactionRecord>();
  primary.forEach(record => {
    if (record.id) {
      byId.set(record.id, record);
    }
  });
  secondary.forEach(record => {
    if (record.id && !byId.has(record.id)) {
      byId.set(record.id, record);
    }
  });
  return sortTransactionsByDate(Array.from(byId.values()));
};

const useTransactionsAnalytics = (
  fetcher: (token?: string | null) => Promise<TransactionRecord[]>,
  options: UseTransactionsAnalyticsOptions = {},
): UseTransactionsAnalyticsResult => {
  const { getSessionToken } = useAuthContext();
  const { transactions, setTransactions } = useTransactionContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      const remote = await fetcher(token);
      const pending = options.preservePending
        ? transactions.filter(record => record.status !== 'completed')
        : [];
      const merged = options.preservePending
        ? mergeTransactions(remote, pending)
        : sortTransactionsByDate(remote);
      setTransactions(merged);
      setLastUpdated(new Date());
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : 'Unable to load transactions.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [fetcher, getSessionToken, options.preservePending, setTransactions, transactions]);

  useEffect(() => {
    if (!transactions.length) {
      void refresh();
    }
  }, [refresh, transactions.length]);

  const monthlySavings = useMemo(
    () => buildMonthlySavings(transactions),
    [transactions],
  );
  const topVendors = useMemo(
    () => buildVendorPerformance(transactions),
    [transactions],
  );
  const statusBreakdown = useMemo(
    () => buildStatusBreakdown(transactions),
    [transactions],
  );
  const totalSavings = useMemo(
    () => calculateTotalSavings(transactions),
    [transactions],
  );
  const completedCount = useMemo(
    () => calculateCompletedCount(transactions),
    [transactions],
  );

  return {
    transactions,
    monthlySavings,
    topVendors,
    statusBreakdown,
    totalSavings,
    completedCount,
    isLoading,
    isEmpty: completedCount === 0,
    error,
    lastUpdated,
    refresh,
  };
};

export const useMemberTransactions = (): UseTransactionsAnalyticsResult => {
  return useTransactionsAnalytics(fetchMemberTransactions);
};

export const useVendorTransactions = (): UseTransactionsAnalyticsResult => {
  return useTransactionsAnalytics(fetchVendorTransactions, {
    preservePending: true,
  });
};
