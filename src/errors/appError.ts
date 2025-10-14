import { ERROR_CATALOG, ErrorDescriptor, ErrorId, getErrorDescriptor } from './errorCatalog';

export interface AppErrorOptions {
  cause?: unknown;
  overrideMessage?: string;
  metadata?: Record<string, unknown>;
}

export class AppError extends Error {
  public readonly id: ErrorId;
  public readonly code: string;
  public readonly descriptor: ErrorDescriptor;
  public readonly metadata?: Record<string, unknown>;
  public readonly overrideMessage?: string;
  public readonly translationKey?: string;
  public readonly defaultMessage: string;

  override readonly cause?: unknown;

  constructor(id: ErrorId, options: AppErrorOptions = {}) {
    const descriptor = getErrorDescriptor(id);
    const userMessage = normalizeMessage(
      options.overrideMessage ?? descriptor.defaultMessage,
    );
    super(buildErrorMessage(descriptor.code, userMessage));

    Object.setPrototypeOf(this, AppError.prototype);

    this.name = 'AppError';
    this.id = id;
    this.code = descriptor.code;
    this.descriptor = descriptor;
    this.metadata = options.metadata;
    this.overrideMessage = options.overrideMessage
      ? normalizeMessage(options.overrideMessage)
      : undefined;
    this.translationKey = descriptor.translationKey;
    this.defaultMessage = descriptor.defaultMessage;
    this.cause = options.cause;
  }

  /**
   * Message intended for end users without the numeric prefix.
   */
  get displayMessage(): string {
    return this.overrideMessage ?? this.defaultMessage;
  }

  /**
   * Human friendly `CODE: message` string used for toasts/alerts.
   */
  toDisplayString(): string {
    return buildErrorMessage(this.code, this.displayMessage);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      id: this.id,
      code: this.code,
      message: this.displayMessage,
      metadata: this.metadata ?? null,
    };
  }
}

const normalizeMessage = (value: string): string => {
  return value.trim();
};

const buildErrorMessage = (code: string, message: string): string => {
  return `${code}: ${message}`;
};

export const createAppError = (
  id: ErrorId,
  options?: AppErrorOptions,
): AppError => {
  return new AppError(id, options);
};

export const isAppError = (value: unknown): value is AppError => {
  return value instanceof AppError;
};

type EnsureAppErrorOptions = AppErrorOptions & { propagateMessage?: boolean };

const findDescriptorByMessage = (
  message: string,
): ErrorDescriptor | undefined => {
  const normalized = message.trim();
  return Object.values(ERROR_CATALOG).find(
    descriptor => descriptor.defaultMessage === normalized,
  );
};

export const ensureAppError = (
  value: unknown,
  fallbackId: ErrorId = 'UNKNOWN',
  options: EnsureAppErrorOptions = {},
): AppError => {
  if (value instanceof AppError) {
    return value;
  }

  if (value instanceof Error) {
    const normalizedMessage = value.message?.trim() ?? '';
    const descriptor =
      options.overrideMessage || normalizedMessage.length === 0
        ? undefined
        : findDescriptorByMessage(normalizedMessage);
    const targetId = descriptor?.id ?? fallbackId;
    const shouldPropagateMessage =
      options.overrideMessage !== undefined
        ? true
        : options.propagateMessage || !descriptor;
    const message = shouldPropagateMessage ? normalizedMessage : undefined;

    return createAppError(targetId, {
      cause: value,
      overrideMessage: options.overrideMessage ?? message,
      metadata: options.metadata,
    });
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    const descriptor =
      options.overrideMessage || normalized.length === 0
        ? undefined
        : findDescriptorByMessage(normalized);
    const targetId = descriptor?.id ?? fallbackId;
    const message =
      options.overrideMessage ?? (descriptor ? undefined : normalized);

    return createAppError(targetId, {
      overrideMessage: message,
      metadata: options.metadata,
    });
  }

  return createAppError(fallbackId, {
    overrideMessage: options.overrideMessage,
    metadata: {
      ...options.metadata,
      rawValueType: value === null ? 'null' : typeof value,
    },
  });
};

export const findDescriptorByCode = (
  code: string,
): ErrorDescriptor | undefined => {
  return Object.values(ERROR_CATALOG).find(
    descriptor => descriptor.code === code,
  );
};

export const findDescriptorByMessageForTesting = findDescriptorByMessage;
