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

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl?: string;
  membership?: MembershipInfo | null;
}

export interface WordPressTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
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
}

export interface PinLoginOptions {
  pin: string;
}

export interface AuthContextValue {
  state: AuthState;
  loginWithPassword: (options: LoginOptions) => Promise<void>;
  loginWithPin: (options: PinLoginOptions) => Promise<void>;
  loginWithBiometrics: (promptMessage?: string) => Promise<void>;
  registerPin: (pin: string) => Promise<void>;
  removePin: () => Promise<void>;
  logout: () => Promise<void>;
  resetError: () => void;
  refreshSession: () => Promise<void>;
}
