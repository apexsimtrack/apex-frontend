import { isApexRequestId } from "./requestId";

// Standardized API error
export class ApiError extends Error {
  status: number;
  code?: string;
  /** Present on some responses (e.g. 429 data export) for client messaging. */
  retryAfterMs?: number;
  /** Set when login is rejected for a suspended account (optional admin note). */
  suspensionReason?: string | null;
  /** HTTP request id echoed by the API. Absent when the call never reached the server. */
  requestId?: string;
  constructor(
    status: number,
    message: string,
    code?: string,
    retryAfterMs?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    if (isApexRequestId(requestId)) this.requestId = requestId;
  }
}

/** Append the API request id to copy the user already sees. Leaves `error.message` unchanged. */
export function withRequestId(message: string, error: unknown): string {
  if (!(error instanceof ApiError) || !error.requestId) return message;
  return `${message} (Request ID: ${error.requestId})`;
}

/** User-visible text for a failed API call, including the request id when the server sent one. */
export function apiErrorText(error: unknown, fallback: string): string {
  const message = error instanceof ApiError ? error.message : fallback;
  return withRequestId(message, error);
}

// PRO_REQUIRED specific error for gated content
export class ProRequiredError extends ApiError {
  constructor(message: string = "This feature requires Apex Pro.") {
    super(403, message, "PRO_REQUIRED");
    this.name = "ProRequiredError";
  }
}

export function isProRequiredError(err: unknown): err is ProRequiredError {
  if (err instanceof ProRequiredError) return true;
  if (err instanceof ApiError && err.code === "PRO_REQUIRED") return true;
  return false;
}
