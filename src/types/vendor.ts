export interface VendorTierDiscounts {
  [membershipTier: string]: number;
}

export interface VendorTierDefinition {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  discountRates?: VendorTierDiscounts | null;
  promotionSummary?: string | null;
  benefits?: string[] | null;
  metadata?: Record<string, unknown> | null;
}
