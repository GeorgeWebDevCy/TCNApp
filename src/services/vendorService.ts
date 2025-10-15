import deviceLog from '../utils/deviceLog';
import { WORDPRESS_CONFIG } from '../config/authConfig';
import {
  buildWordPressRequestInit,
  syncWordPressCookiesFromResponse,
} from './wordpressCookieService';
import { ensureValidSessionToken } from './wordpressAuthService';
import { VendorTierDefinition, VendorTierDiscounts } from '../types/vendor';
import { createAppError, ensureAppError } from '../errors';

const VENDOR_ENDPOINTS = {
  tiers: '/wp-json/gn/v1/vendors/tiers',
};

const getString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const getNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const parseDiscounts = (input: unknown): VendorTierDiscounts | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const discounts: VendorTierDiscounts = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = key.trim().toLowerCase();
    const parsedValue = getNumber(value);
    if (!normalizedKey || parsedValue == null) {
      continue;
    }
    const percent =
      parsedValue > 1 || parsedValue < 0
        ? Number(parsedValue.toFixed(2))
        : Number((parsedValue * 100).toFixed(2));
    discounts[normalizedKey] = percent;
  }

  return Object.keys(discounts).length ? discounts : null;
};

const parseStringArray = (input: unknown): string[] | null => {
  if (!Array.isArray(input)) {
    return null;
  }

  const values = input
    .map(item => getString(item))
    .filter((value): value is string => Boolean(value));

  return values.length ? values : null;
};

const parseTier = (input: unknown): VendorTierDefinition | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const payload = input as Record<string, unknown>;
  const id =
    getString(payload.slug) ??
    getString(payload.id) ??
    getString(payload.key) ??
    null;
  const name = getString(payload.name) ?? getString(payload.label) ?? id;

  if (!id || !name) {
    return null;
  }

  const discountRates =
    parseDiscounts(payload.discountRates) ??
    parseDiscounts(payload.discounts) ??
    parseDiscounts(payload.discount_matrix);

  const promotionAllowance =
    getNumber(payload.promotion_allowance) ??
    getNumber(payload.promotionAllowance) ??
    null;

  let promotionSummary =
    getString(payload.promotionSummary) ??
    getString(payload.promotion_frequency) ??
    getString(payload.promotion) ??
    null;

  if (promotionAllowance != null) {
    const normalizedAllowance =
      promotionAllowance > 1 || promotionAllowance < 0
        ? Number(promotionAllowance.toFixed(2))
        : Number((promotionAllowance * 100).toFixed(2));
    promotionSummary = `${normalizedAllowance}%`;
  }

  const benefits =
    parseStringArray(payload.benefits) ??
    parseStringArray(payload.highlight_benefits) ??
    null;

  const description =
    getString(payload.description) ??
    getString(payload.summary) ??
    null;

  return {
    id,
    slug: id,
    name,
    description,
    discountRates,
    promotionSummary,
    benefits,
    metadata: (payload.metadata as Record<string, unknown>) ?? null,
  };
};

export const fetchVendorTiers = async (
  authToken?: string | null,
): Promise<VendorTierDefinition[]> => {
  try {
    const resolvedToken = await ensureValidSessionToken(authToken);
    if (!resolvedToken) {
      throw createAppError('SESSION_TOKEN_UNAVAILABLE');
    }

    const init = await buildWordPressRequestInit({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization:
          resolvedToken && resolvedToken.trim().length > 0
            ? `Bearer ${resolvedToken.trim()}`
            : undefined,
      },
    });

    const response = await fetch(
      `${WORDPRESS_CONFIG.baseUrl}${VENDOR_ENDPOINTS.tiers}`,
      init,
    );
    await syncWordPressCookiesFromResponse(response);

    const contentType = response.headers.get('content-type');
    const isJson = contentType?.includes('application/json');
    const json = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      const overrideMessage =
        typeof json === 'string'
          ? json
          : getString((json as Record<string, unknown>)?.message) ?? undefined;
      throw createAppError('VENDOR_TIERS_FETCH_FAILED', {
        overrideMessage,
        metadata: {
          status: response.status,
        },
      });
    }

    const root = json as Record<string, unknown>;
    const tiersSource = Array.isArray(root?.tiers)
      ? (root.tiers as unknown[])
      : Array.isArray(root?.data)
      ? (root.data as unknown[])
      : Array.isArray(root?.items)
      ? (root.items as unknown[])
      : Array.isArray(root)
      ? (root as unknown[])
      : [];

    const tiers = tiersSource
      .map(parseTier)
      .filter((tier): tier is VendorTierDefinition => Boolean(tier));

    deviceLog.debug('vendorService.fetchVendorTiers.success', {
      count: tiers.length,
    });
    return tiers;
  } catch (error) {
    const appError = ensureAppError(error, 'VENDOR_TIERS_FETCH_FAILED', {
      propagateMessage: true,
    });
    deviceLog.warn('vendorService.fetchVendorTiers.error', {
      code: appError.code,
      message: appError.displayMessage,
    });
    throw appError;
  }
};
