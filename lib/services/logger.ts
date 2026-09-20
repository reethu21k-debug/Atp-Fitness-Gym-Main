// ============================================================================
// Structured logging for the subscription lifecycle.
//
// Emits one JSON object per line so Vercel / Supabase log drains can be
// filtered by `event` and correlated by `membershipId` — e.g.
//   event:WHATSAPP_ACTIVATION_FAILED
// gives you every failed activation send with its error code and membership,
// without anyone having to grep free-text console messages.
//
// SAFETY
//   Everything passed through here goes via `redact()`. Access tokens, API
//   secrets, passwords and phone numbers must never reach a log sink — Vercel
//   logs are visible to anyone on the team, and log drains often land in
//   third-party tooling. Phone numbers are masked rather than dropped so a
//   failed delivery can still be traced to the right member (via
//   `membershipId`) without spilling PII into logs.
// ============================================================================

export type LifecycleEvent =
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_ACTIVATED"
  | "WHATSAPP_ACTIVATION_ATTEMPT"
  | "WHATSAPP_ACTIVATION_SUCCESS"
  | "WHATSAPP_ACTIVATION_FAILED"
  | "WHATSAPP_ACTIVATION_SKIPPED"
  | "SUBSCRIPTION_EXPIRY_DETECTED"
  | "SUBSCRIPTION_EXPIRED"
  | "WHATSAPP_EXPIRY_ATTEMPT"
  | "WHATSAPP_EXPIRY_SUCCESS"
  | "WHATSAPP_EXPIRY_FAILED"
  | "WHATSAPP_EXPIRY_SKIPPED"
  | "WHATSAPP_WEBHOOK_RECEIVED"
  | "WHATSAPP_WEBHOOK_REJECTED"
  | "SUBSCRIPTION_NOTIFICATION_RETRY"
  | "CRON_RUN_STARTED"
  | "CRON_RUN_FINISHED";

type Level = "info" | "warn" | "error";

/**
 * Key names whose values are never safe to print. Matched case-insensitively
 * as a substring, so `WHATSAPP_CLOUD_API_TOKEN`, `authorization` and
 * `service_role_key` are all caught.
 */
const SECRET_KEY_PATTERN =
  /(token|secret|password|passwd|api[_-]?key|authorization|auth|credential|signature|service[_-]?role)/i;

/** Bearer tokens / Meta tokens that slip into a free-text error string. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]{16,}/gi,
  /\bEA[A-Za-z0-9]{40,}\b/g, // Meta Graph API access tokens
  // JWTs (Supabase anon / service-role keys, Meta tokens). The header segment
  // is deliberately matched loosely: a compact header such as
  // {"alg":"HS256"} base64-encodes to only 20 chars, so a stricter minimum
  // let real tokens through.
  /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
];

const REDACTED = "[redacted]";

/**
 * Masks a phone number to its last 4 digits: `919876543210` -> `********3210`.
 * Enough to correlate a delivery failure, not enough to contact anyone.
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "*".repeat(digits.length);
  return "*".repeat(digits.length - 4) + digits.slice(-4);
}

export function redactString(value: string): string {
  let out = value;
  for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

function redact(value: unknown, keyHint?: string, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (keyHint && SECRET_KEY_PATTERN.test(keyHint)) return REDACTED;

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return redactString(value.message);
  if (Array.isArray(value)) return value.map((v) => redact(v, undefined, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = k === "phone" || k === "recipientPhone" || k === "to"
        ? maskPhone(typeof v === "string" ? v : null)
        : redact(v, k, depth + 1);
    }
    return out;
  }

  return REDACTED;
}

export interface LogContext {
  membershipId?: string | null;
  memberId?: string | null;
  gymId?: string | null;
  notificationId?: string | null;
  messageId?: string | null;
  phone?: string | null;
  errorCode?: string | null;
  attempts?: number | null;
  [key: string]: unknown;
}

function emit(level: Level, event: LifecycleEvent, context: LogContext = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    scope: "subscription-lifecycle",
    event,
    ...(redact(context) as Record<string, unknown>),
  });

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const lifecycleLog = {
  info: (event: LifecycleEvent, context?: LogContext) => emit("info", event, context),
  warn: (event: LifecycleEvent, context?: LogContext) => emit("warn", event, context),
  error: (event: LifecycleEvent, context?: LogContext) => emit("error", event, context),
};
