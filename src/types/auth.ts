export type AuthMethod = 'password' | 'pin' | 'biometric';

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

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string;
  membership?: MembershipInfo | null;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLocked: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  membership: MembershipInfo | null;
  authMethod: AuthMethod | null;
  error: string | null;
  hasPasswordAuthenticated: boolean;
}

export interface LoginOptions {
  username: string;
  password: string;
  mode?: 'token' | 'cookie';
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
}

export interface ResetPasswordOptions {
  identifier: string;
  verificationCode: string;
  newPassword: string;
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
}
