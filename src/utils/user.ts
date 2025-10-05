import { AuthUser } from '../types/auth';

const sanitize = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
};

export const getUserFullName = (user?: AuthUser | null): string | null => {
  if (!user) {
    return null;
  }

  const first = sanitize(user.firstName);
  const last = sanitize(user.lastName);
  const parts = [first, last].filter(part => part.length > 0);
  if (parts.length === 0) {
    return null;
  }

  return parts.join(' ');
};

export const getUserDisplayName = (user?: AuthUser | null): string | null => {
  const fullName = getUserFullName(user);
  if (fullName) {
    return fullName;
  }

  if (user) {
    const fallbackName = sanitize(user.name);
    if (fallbackName) {
      return fallbackName;
    }

    const email = sanitize(user.email);
    if (email) {
      return email;
    }
  }

  return null;
};

export const getUserInitials = (user?: AuthUser | null): string => {
  const fullName = getUserFullName(user);
  if (fullName) {
    return fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('');
  }

  if (user) {
    const fallbackName = sanitize(user.name);
    if (fallbackName) {
      return fallbackName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase() ?? '')
        .join('');
    }

    const email = sanitize(user.email);
    if (email) {
      return email[0]?.toUpperCase() ?? '';
    }
  }

  return '';
};
