import { WORDPRESS_CONFIG } from '../config/authConfig';
import { AccountStatus, AccountType } from '../types/auth';
import { createAppError, ensureAppError, ErrorId } from '../errors';

export interface AdminAccountSummary {
  id: number;
  name: string;
  email: string;
  accountType: AccountType | null;
  accountStatus: AccountStatus | null;
  vendorStatus: AccountStatus | null;
  createdAt?: string | null;
}

const getString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const normalizeAccountType = (value: unknown): AccountType | null => {
  const raw = getString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (normalized === 'administrator' || normalized === 'admin') {
    return 'admin';
  }

  if (normalized === 'staff' || normalized === 'manager' || normalized === 'shop_manager') {
    return 'staff';
  }

  if (
    normalized === 'vendor' ||
    normalized === 'tcn_vendor' ||
    normalized === 'store_vendor' ||
    normalized === 'seller'
  ) {
    return 'vendor';
  }

  if (normalized === 'customer' || normalized === 'member' || normalized === 'subscriber') {
    return 'member';
  }

  return normalized as AccountType;
};

const normalizeAccountStatus = (value: unknown): AccountStatus | null => {
  const raw = getString(value);
  if (!raw) {
    return null;
  }

  const normalized = raw.toLowerCase();

  if (normalized === 'active' || normalized === 'approved' || normalized === 'publish') {
    return 'active';
  }

  if (
    normalized === 'pending' ||
    normalized === 'awaiting' ||
    normalized === 'awaiting_approval' ||
    normalized === 'pending-activation' ||
    normalized === 'review'
  ) {
    return 'pending';
  }

  if (normalized === 'rejected' || normalized === 'denied' || normalized === 'declined') {
    return 'rejected';
  }

  if (normalized === 'suspended' || normalized === 'disabled' || normalized === 'blocked') {
    return 'suspended';
  }

  return normalized as AccountStatus;
};

const parseAdminAccount = (record: Record<string, unknown>): AdminAccountSummary | null => {
  const idSource = record.id ?? record.user_id ?? record.userId ?? record.ID;
  const parsedId =
    typeof idSource === 'number'
      ? idSource
      : typeof idSource === 'string'
      ? Number.parseInt(idSource, 10)
      : Number.NaN;

  if (!Number.isFinite(parsedId)) {
    return null;
  }

  const meta =
    (record.meta as Record<string, unknown> | undefined) ?? undefined;

  const email =
    getString(record.email) ??
    getString(record.user_email) ??
    getString(meta?.email) ??
    '';

  const name =
    getString(record.name) ??
    getString(record.display_name) ??
    getString(record.user_display_name) ??
    getString(meta?.name) ??
    email;

  const accountType =
    normalizeAccountType(record.account_type) ??
    normalizeAccountType(record.accountType) ??
    normalizeAccountType(record.role) ??
    normalizeAccountType(meta?.account_type) ??
    normalizeAccountType(meta?.accountType) ??
    normalizeAccountType(meta?.role) ??
    null;

  const accountStatus =
    normalizeAccountStatus(record.account_status) ??
    normalizeAccountStatus(record.accountStatus) ??
    normalizeAccountStatus(record.status) ??
    normalizeAccountStatus(meta?.account_status) ??
    normalizeAccountStatus(meta?.accountStatus) ??
    null;

  const vendorStatus =
    normalizeAccountStatus(record.vendor_status) ??
    normalizeAccountStatus(record.vendorStatus) ??
    normalizeAccountStatus(meta?.vendor_status) ??
    normalizeAccountStatus(meta?.vendorStatus) ??
    null;

  const createdAt =
    getString(record.created_at) ??
    getString(record.registered_date) ??
    getString(record.user_registered) ??
    getString(meta?.created_at) ??
    null;

  return {
    id: Number(parsedId),
    name: name ?? email,
    email,
    accountType,
    accountStatus,
    vendorStatus,
    createdAt,
  };
};

const extractAccountsFromPayload = (
  payload: unknown,
): AdminAccountSummary[] => {
  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
    ? Array.isArray((payload as Record<string, unknown>).accounts)
      ? ((payload as Record<string, unknown>).accounts as unknown[])
      : Array.isArray((payload as Record<string, unknown>).users)
      ? ((payload as Record<string, unknown>).users as unknown[])
      : []
    : [];

  return candidates
    .map(candidate => {
      if (!candidate || typeof candidate !== 'object') {
        return null;
      }

      return parseAdminAccount(candidate as Record<string, unknown>);
    })
    .filter((entry): entry is AdminAccountSummary => Boolean(entry));
};

const extractErrorMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const directMessage = getString(record.message);
  if (directMessage) {
    return directMessage;
  }

  const data = record.data as Record<string, unknown> | undefined;
  if (data) {
    const nested = getString(data.message) ?? getString(data.error);
    if (nested) {
      return nested;
    }
  }

  return null;
};

const buildUrl = (path: string): string =>
  `${WORDPRESS_CONFIG.baseUrl}${path}`;

export const fetchAdminAccounts = async (
  token: string,
): Promise<AdminAccountSummary[]> => {
  const endpoint = WORDPRESS_CONFIG.endpoints.admin.accounts;
  try {
    const response = await fetch(buildUrl(endpoint), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const overrideMessage = extractErrorMessage(json) ?? undefined;
      throw createAppError('ADMIN_DASHBOARD_LOAD_FAILED', {
        overrideMessage,
        metadata: {
          status: response.status,
        },
      });
    }

    return extractAccountsFromPayload(json);
  } catch (error) {
    throw ensureAppError(error, 'ADMIN_DASHBOARD_LOAD_FAILED', {
      propagateMessage: true,
    });
  }
};

const postAdminAction = async (
  token: string,
  path: string,
  fallbackId: ErrorId,
  body?: Record<string, unknown>,
): Promise<void> => {
  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      return;
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const overrideMessage = extractErrorMessage(payload) ?? undefined;
    throw createAppError(fallbackId, {
      overrideMessage,
      metadata: {
        status: response.status,
      },
    });
  } catch (error) {
    throw ensureAppError(error, fallbackId, { propagateMessage: true });
  }
};

export const approveVendorAccount = async (
  token: string,
  vendorId: number,
): Promise<void> => {
  const path = WORDPRESS_CONFIG.endpoints.admin.approveVendor(vendorId);
  await postAdminAction(token, path, 'ADMIN_VENDOR_APPROVE_FAILED');
};

export const rejectVendorAccount = async (
  token: string,
  vendorId: number,
  reason?: string,
): Promise<void> => {
  const path = WORDPRESS_CONFIG.endpoints.admin.rejectVendor(vendorId);
  const payload = reason ? { reason } : undefined;
  await postAdminAction(
    token,
    path,
    'ADMIN_VENDOR_REJECT_FAILED',
    payload,
  );
};
