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

export type DiscountDescriptorType = 'percentage' | 'amount' | (string & {});

export interface DiscountDescriptor {
  token?: string | null;
  label?: string | null;
  type: DiscountDescriptorType;
  value: number;
  currency?: string | null;
  maxUses?: number | null;
  expiresAt?: string | null;
}

export interface DiscountUsage {
  usesToday: number | null;
  usesTotal: number | null;
}

export interface DiscountCalculationRequest {
  membershipTier?: string | null;
  vendorTier?: string | null;
  grossAmount: number;
  currency?: string | null;
  memberToken?: string | null;
  memberId?: number | null;
  vendorId?: number | null;
  discountDescriptor?: DiscountDescriptor | null;
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
  discountDescriptor?: DiscountDescriptor | null;
}

export interface RecordTransactionRequest
  extends DiscountCalculationRequest {
  memberToken: string;
  memberId?: number | null;
  vendorId?: number | null;
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
  memberId?: number | null;
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
  memberId?: number | null;
  memberName?: string | null;
  membershipTier?: string | null;
  membership?: MembershipInfo | null;
  allowedDiscount?: number | null;
  discountDescriptor?: DiscountDescriptor | null;
  eligible?: boolean | null;
  usage?: DiscountUsage | null;
  message?: string | null;
}
