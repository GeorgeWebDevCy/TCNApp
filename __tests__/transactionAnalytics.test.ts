import {
  buildMonthlySavings,
  buildVendorPerformance,
  buildStatusBreakdown,
  calculateTotalSavings,
  calculateCompletedCount,
} from '../src/utils/transactionAnalytics';
import { TransactionRecord } from '../src/types/transactions';

describe('transaction analytics selectors', () => {
  const baseRecord: TransactionRecord = {
    id: 'base',
    memberToken: 'member',
    status: 'completed',
    createdAt: '2024-01-01T00:00:00.000Z',
    discountPercentage: 10,
    discountAmount: 100,
    netAmount: 900,
    grossAmount: 1000,
    currency: 'THB',
    membershipTier: 'Gold',
    vendorTier: 'Sapphire',
    message: null,
    vendorName: 'Vendor A',
    memberName: 'Member One',
    membership: null,
    errorMessage: null,
  };

  const transactions: TransactionRecord[] = [
    {
      ...baseRecord,
      id: 'jan-complete',
      createdAt: '2024-01-10T00:00:00.000Z',
      discountAmount: 80,
    },
    {
      ...baseRecord,
      id: 'feb-first',
      createdAt: '2024-02-05T00:00:00.000Z',
      discountAmount: 50,
      vendorName: 'Vendor B',
    },
    {
      ...baseRecord,
      id: 'feb-second',
      createdAt: '2024-02-18T00:00:00.000Z',
      discountAmount: 30,
      vendorName: 'Vendor B',
    },
    {
      ...baseRecord,
      id: 'failed',
      createdAt: '2024-02-25T00:00:00.000Z',
      discountAmount: 40,
      status: 'failed',
      vendorName: 'Vendor C',
    },
  ];

  it('groups monthly savings by month', () => {
    const savings = buildMonthlySavings(
      transactions,
      3,
      new Date('2024-03-01T00:00:00.000Z'),
    );
    expect(savings).toHaveLength(3);
    const [january, february, march] = savings;
    expect(january.totalSavings).toBe(80);
    expect(february.totalSavings).toBe(80);
    expect(march.totalSavings).toBe(0);
  });

  it('aggregates vendor performance by vendor name', () => {
    const vendors = buildVendorPerformance(transactions);
    expect(vendors).toEqual([
      { vendorName: 'Vendor B', totalSavings: 80, transactionCount: 2 },
      { vendorName: 'Vendor A', totalSavings: 80, transactionCount: 1 },
    ]);
  });

  it('counts transactions by status', () => {
    const breakdown = buildStatusBreakdown(transactions);
    expect(breakdown).toEqual([
      { status: 'pending', count: 0 },
      { status: 'completed', count: 3 },
      { status: 'failed', count: 1 },
    ]);
  });

  it('calculates totals and completed counts', () => {
    expect(calculateTotalSavings(transactions)).toBe(160);
    expect(calculateCompletedCount(transactions)).toBe(3);
  });
});
