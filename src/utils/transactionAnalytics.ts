import { TransactionRecord, TransactionStatus } from '../types/transactions';

export interface MonthlySavingsDatum {
  monthKey: string;
  date: Date;
  totalSavings: number;
  transactionCount: number;
}

export interface VendorPerformanceDatum {
  vendorName: string;
  totalSavings: number;
  transactionCount: number;
}

export interface StatusBreakdownDatum {
  status: TransactionStatus;
  count: number;
}

const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
});

const getMonthKey = (value: Date): string => {
  const [month, year] = MONTH_KEY_FORMATTER.format(value).split('/');
  return `${year}-${month}`;
};

const clampToMonthStart = (date: Date): Date => {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

export const buildMonthlySavings = (
  transactions: TransactionRecord[],
  months = 6,
  referenceDate = new Date(),
): MonthlySavingsDatum[] => {
  const reference = clampToMonthStart(new Date(referenceDate));
  const buckets = new Map<string, MonthlySavingsDatum>();

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthDate = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - offset, 1),
    );
    const key = getMonthKey(monthDate);
    buckets.set(key, {
      monthKey: key,
      date: monthDate,
      totalSavings: 0,
      transactionCount: 0,
    });
  }

  transactions.forEach(transaction => {
    if (transaction.status !== 'completed') {
      return;
    }
    const createdAt = new Date(transaction.createdAt);
    if (Number.isNaN(createdAt.getTime())) {
      return;
    }

    const normalized = clampToMonthStart(createdAt);
    const key = getMonthKey(normalized);
    const bucket = buckets.get(key);
    if (!bucket) {
      return;
    }

    bucket.totalSavings += Number(transaction.discountAmount ?? 0);
    bucket.transactionCount += 1;
  });

  return Array.from(buckets.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
};

export const buildVendorPerformance = (
  transactions: TransactionRecord[],
): VendorPerformanceDatum[] => {
  const vendors = new Map<string, VendorPerformanceDatum>();

  transactions.forEach(transaction => {
    if (transaction.status !== 'completed') {
      return;
    }
    const vendorName = transaction.vendorName?.trim() || 'unknown';
    const bucket = vendors.get(vendorName) ?? {
      vendorName,
      totalSavings: 0,
      transactionCount: 0,
    };

    bucket.totalSavings += Number(transaction.discountAmount ?? 0);
    bucket.transactionCount += 1;
    vendors.set(vendorName, bucket);
  });

  return Array.from(vendors.values()).sort((a, b) => {
    if (b.totalSavings === a.totalSavings) {
      return b.transactionCount - a.transactionCount;
    }
    return b.totalSavings - a.totalSavings;
  });
};

export const buildStatusBreakdown = (
  transactions: TransactionRecord[],
): StatusBreakdownDatum[] => {
  const initial: Record<TransactionStatus, number> = {
    pending: 0,
    completed: 0,
    failed: 0,
  };

  transactions.forEach(transaction => {
    initial[transaction.status] += 1;
  });

  return (Object.keys(initial) as TransactionStatus[]).map(status => ({
    status,
    count: initial[status],
  }));
};

export const calculateTotalSavings = (
  transactions: TransactionRecord[],
): number => {
  return transactions
    .filter(transaction => transaction.status === 'completed')
    .reduce((total, transaction) => total + Number(transaction.discountAmount ?? 0), 0);
};

export const calculateCompletedCount = (
  transactions: TransactionRecord[],
): number => {
  return transactions.filter(transaction => transaction.status === 'completed').length;
};
