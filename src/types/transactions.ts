import { MembershipInfo } from './auth';

export type MembershipTier =
  | 'Blue'
  | 'Gold'
  | 'Platinum'
  | 'Black'
  | (string & {});

export type VendorTier =
  | 'Sapphire'
  | 'Diamond'
  | (string & {});

export type TransactionStatus = 'pending' | 'completed' | 'failed';

export interface DiscountCalculationRequest {
  membershipTier?: string | null;
  vendorTier?: string | null;
  grossAmount: number;
  currency?: string | null;
}

export interface DiscountCalculationResult {
  discountPercentage: number;
  discountAmount: number;
  netAmount: number;
  currency?: string | null;
  membershipTier?: string | null;
  vendorTier?: string | null;
  message?: string | null;
  grossAmount?: number | null;
}

export interface RecordTransactionRequest
  extends DiscountCalculationRequest {
  memberToken: string;
  memberName?: string | null;
  membership?: MembershipInfo | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
  discountPercentage?: number | null;
  discountAmount?: number | null;
  netAmount?: number | null;
}

export interface TransactionRecord extends DiscountCalculationResult {
  id: string;
  memberToken: string;
  memberName?: string | null;
  membership?: MembershipInfo | null;
  vendorId?: number | null;
  vendorName?: string | null;
  status: TransactionStatus;
  createdAt: string;
  errorMessage?: string | null;
}

export interface MemberLookupResult {
  token: string;
  valid: boolean;
  memberName?: string | null;
  membershipTier?: string | null;
  membership?: MembershipInfo | null;
  allowedDiscount?: number | null;
  message?: string | null;
}
