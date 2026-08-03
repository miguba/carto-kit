export type CartoErrorCode =
  | "AUTH_CANCELLED"
  | "AUTH_EXPIRED"
  | "AUTH_FORBIDDEN"
  | "AUTH_REQUIRED"
  | "AUTH_TIMEOUT"
  | "CACHE_UNAVAILABLE"
  | "CAPABILITY_UNAVAILABLE"
  | "CONFIG_INVALID"
  | "FILESYSTEM_ERROR"
  | "INVALID_BUNDLE"
  | "NETWORK_ERROR"
  | "NO_TTY"
  | "RATE_LIMITED"
  | "SERVICE_ERROR"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "USAGE_ERROR";

const EXIT_CODES: Record<CartoErrorCode, number> = {
  USAGE_ERROR: 2,
  CONFIG_INVALID: 3,
  AUTH_REQUIRED: 4,
  AUTH_CANCELLED: 5,
  AUTH_EXPIRED: 6,
  AUTH_FORBIDDEN: 9,
  AUTH_TIMEOUT: 7,
  NO_TTY: 8,
  CAPABILITY_UNAVAILABLE: 12,
  CACHE_UNAVAILABLE: 13,
  INVALID_BUNDLE: 14,
  UNSUPPORTED_SCHEMA_VERSION: 15,
  FILESYSTEM_ERROR: 16,
  NETWORK_ERROR: 10,
  SERVICE_ERROR: 11,
  RATE_LIMITED: 17
};

export class CartoError extends Error {
  readonly code: CartoErrorCode;
  readonly exitCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: CartoErrorCode, message: string, options: {
    retryable?: boolean;
    details?: Record<string, unknown>;
    cause?: unknown;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = "CartoError";
    this.code = code;
    this.exitCode = EXIT_CODES[code];
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export function asCartoError(error: unknown): CartoError {
  if (error instanceof CartoError) return error;
  return new CartoError("SERVICE_ERROR", "The command could not be completed.", { cause: error });
}
