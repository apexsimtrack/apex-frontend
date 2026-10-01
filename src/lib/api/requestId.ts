/** Same shape the API generates: `crypto.randomBytes(8).toString("hex")`. */
const APEX_REQUEST_ID_RE = /^[0-9a-f]{16}$/;

export function isApexRequestId(value: unknown): value is string {
  return typeof value === "string" && APEX_REQUEST_ID_RE.test(value);
}

export function createApexRequestId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Body `requestId` wins, then the `X-Request-Id` response header. Invalid values are ignored. */
export function responseRequestId(header: string | null | undefined, body: unknown): string | undefined {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const fromBody = (body as { requestId?: unknown }).requestId;
    if (isApexRequestId(fromBody)) return fromBody;
  }
  const trimmed = header?.trim();
  return isApexRequestId(trimmed) ? trimmed : undefined;
}
