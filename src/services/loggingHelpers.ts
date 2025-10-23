import deviceLog from '../utils/deviceLog';

const isFormData = (value: unknown): value is FormData => {
  return typeof FormData !== 'undefined' && value instanceof FormData;
};

const isUrlSearchParams = (value: unknown): value is URLSearchParams => {
  return typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams;
};

const attemptJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

export const headersToRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    const entries: Record<string, string> = {};
    headers.forEach((value, key) => {
      entries[key] = value;
    });
    return entries;
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  return { ...(headers as Record<string, string>) };
};

export const normalizeHeadersForLog = (
  headers?: HeadersInit,
  options: { redactAuthorization?: boolean } = {},
): Record<string, string> => {
  const { redactAuthorization = true } = options;
  const normalized = headersToRecord(headers);

  if (!redactAuthorization) {
    return normalized;
  }

  return Object.entries(normalized).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      if (key.toLowerCase().includes('authorization')) {
        acc[key] = '[REDACTED]';
      } else {
        acc[key] = value;
      }
      return acc;
    },
    {},
  );
};

const describeFormData = (formData: FormData): Record<string, unknown> => {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    entries[key] = value;
  }
  return entries;
};

const describeArrayBuffer = (value: ArrayBuffer | ArrayBufferView): Record<string, unknown> => {
  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', byteLength: value.byteLength };
  }

  return {
    type: value.constructor.name,
    byteLength: value.byteLength,
  };
};

export const describeBodyForLog = (body: unknown): unknown => {
  if (body === undefined) {
    return undefined;
  }

  if (body === null) {
    return null;
  }

  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (!trimmed) {
      return '';
    }
    return attemptJsonParse(trimmed);
  }

  if (isUrlSearchParams(body)) {
    return Object.fromEntries(body.entries());
  }

  if (isFormData(body)) {
    return describeFormData(body);
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { type: body.type, size: body.size };
  }

  if (typeof ArrayBuffer !== 'undefined') {
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return describeArrayBuffer(body as ArrayBuffer | ArrayBufferView);
    }
  }

  if (typeof body === 'object') {
    return body as Record<string, unknown>;
  }

  return body;
};

export const extractQueryParamsForLog = (url?: string | null): Record<string, unknown> => {
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url);
    if (!parsed.search) {
      return {};
    }

    const params = parsed.searchParams;
    const summary: Record<string, unknown> = {};
    const uniqueKeys = new Set(params.keys());
    uniqueKeys.forEach(key => {
      const values = params.getAll(key);
      summary[key] = values.length <= 1 ? values[0] ?? null : values;
    });
    return summary;
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error) };
  }
};

export const logNumberedDebugBlock = (
  event: string,
  blockNumber: number,
  stage: string,
  payloadFactory: () => Record<string, unknown>,
): void => {
  try {
    const payload = payloadFactory();
    deviceLog.debug(event, {
      blockNumber,
      stage,
      ...payload,
    });
  } catch (error) {
    deviceLog.debug(`${event}.fallback`, {
      blockNumber,
      stage,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const describeResponsePayloadForLog = async (
  response: Response,
): Promise<unknown> => {
  try {
    const clone = response.clone();
    const text = await clone.text();
    if (!text) {
      return null;
    }

    return attemptJsonParse(text);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
};

