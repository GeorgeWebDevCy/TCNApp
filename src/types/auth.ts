export type AuthMethod = 'password' | 'pin' | 'biometric';

export type AccountType =
  | 'member'
  | 'vendor'
  | 'staff'
  | 'admin'
  | 'guest'
  | (string & {});

export type AccountStatus =
  | 'active'
  | 'pending'
  | 'rejected'
  | 'suspended'
  | (string & {});

export type RegisterAccountType = 'member' | 'vendor';

export interface MembershipBenefit {
  id: string;
  title: string;
  description?: string;
  discountPercentage?: number;
}

export interface MembershipInfo {
  tier: string;
  expiresAt: string | null;
  benefits: MembershipBenefit[];
}

export interface MemberQrCode {
  token: string;
  payload?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
}

export interface MembershipPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval?: 'day' | 'week' | 'month' | 'year';
  description?: string;
  features?: string[];
  highlight?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WooCommerceCredentialBundle {
  consumerKey: string;
  consumerSecret: string;
  basicAuthorizationHeader?: string | null;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string;
  membership?: MembershipInfo | null;
  woocommerceCredentials?: WooCommerceCredentialBundle | null;
  accountType?: AccountType | null;
  accountStatus?: AccountStatus | null;
  vendorTier?: string | null;
  vendorStatus?: AccountStatus | null;
  qrPayload?: string | null;
  qrToken?: string | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLocked: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  membership: MembershipInfo | null;
  memberQrCode: MemberQrCode | null;
  authMethod: AuthMethod | null;
  error: string | null;
  hasPasswordAuthenticated: boolean;
}

export interface LoginOptions {
  email: string;
  password: string;
  mode?: 'token';
  remember?: boolean;
}

export interface PinLoginOptions {
  pin: string;
}

export interface RegisterOptions {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  registrationDate?: string;
  accountType?: RegisterAccountType;
}

export interface ResetPasswordOptions {
  identifier: string;
  verificationCode: string;
  newPassword: string;
  resetKey?: string;
}

export interface AuthContextValue {
  state: AuthState;
  loginWithPassword: (options: LoginOptions) => Promise<void>;
  loginWithPin: (options: PinLoginOptions) => Promise<void>;
  loginWithBiometrics: (promptMessage?: string) => Promise<void>;
  changePassword: (options: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  registerPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  logout: () => Promise<void>;
  resetError: () => void;
  refreshSession: () => Promise<void>;
  getSessionToken: () => Promise<string | null>;
  requestPasswordReset: (identifier: string) => Promise<string | undefined>;
  registerAccount: (options: RegisterOptions) => Promise<string | undefined>;
  resetPasswordWithCode: (
    options: ResetPasswordOptions,
  ) => Promise<string | undefined>;
  updateProfileAvatar: (options: {
    uri: string;
    fileName?: string;
    mimeType?: string;
  }) => Promise<AuthUser>;
  deleteProfileAvatar: () => Promise<AuthUser>;
}

export interface MemberValidationResult {
  token: string;
  valid: boolean;
  memberName?: string | null;
  membershipTier?: string | null;
  allowedDiscount?: number | null;
  membership?: MembershipInfo | null;
  message?: string | null;
}
