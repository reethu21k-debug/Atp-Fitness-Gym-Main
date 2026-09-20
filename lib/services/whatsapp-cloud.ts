// ============================================================================
// WhatsApp Cloud API (Meta) — subscription lifecycle alerts
//
// Scope: exactly two business-initiated notifications —
//   1. Subscription activated -> confirmation + duration
//   2. Subscription expired   -> expiry notice + renewal prompt
//
// This is the ONLY WhatsApp transport in the project. lib/services/whatsapp.ts
// (welcome messages) and lib/services/marketing-dispatch.ts (campaigns) both
// delegate here, so phone normalisation, error classification, timeouts and
// token redaction are implemented once. Nothing relays through Twilio.
//
// This module is the TRANSPORT only. It does not decide *whether* to send —
// that's lib/services/subscription-lifecycle.ts, which owns the database-backed
// idempotency. Everything here is a pure function of its arguments plus env.
//
// ---------------------------------------------------------------------------
// SETUP
//   1. Meta for Developers -> create an app -> add the "WhatsApp" product.
//   2. WhatsApp > API Setup gives you:
//        - an access token (temporary 24h for testing; a permanent System User
//          token from Business Settings for production)
//        - the "Phone number ID" (NOT the phone number itself)
//   3. Environment:
//        WHATSAPP_CLOUD_API_TOKEN=...
//        WHATSAPP_CLOUD_PHONE_NUMBER_ID=...
//        WHATSAPP_CLOUD_API_VERSION=v21.0            (optional)
//        WHATSAPP_DEFAULT_COUNTRY_CODE=91            (optional)
//
// THE 24-HOUR SESSION WINDOW — why templates are mandatory in production
//   Meta only allows free-form "text" messages within 24 hours of the user's
//   last message to your business number. Both alerts here are
//   business-initiated: the member is not mid-conversation. For a subscription
//   that just expired, they are essentially never inside that window, so a
//   plain-text send is rejected with error 131047 ("Re-engagement message").
//
//   Plain text is kept ONLY as a development convenience against a Meta test
//   number. Set these to switch each alert to an approved template:
//        WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE=subscription_confirmed
//        WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE=subscription_expired
//   Body variables are positional, in the order documented on each send
//   function below.
//
// TEMPLATE LANGUAGE CODE
//   `languageCode` must exactly match how the template is registered in
//   WhatsApp Manager. Meta usually stores plain English as "en", not "en_US".
//   A mismatch returns 404 (template not found for name + language), which is
//   easy to misdiagnose as a token or phone-number-ID problem. Check with:
//     GET /{PHONE_NUMBER_ID}/message_templates?fields=name,language,status
//   and override via WHATSAPP_TEMPLATE_LANGUAGE if needed.
// ============================================================================

import { formatDateForDisplay, DEFAULT_TIMEZONE } from "@/lib/utils/datetime";
import { redactString } from "@/lib/services/logger";

const DEFAULT_API_VERSION = "v21.0";
const DEFAULT_TEMPLATE_LANGUAGE = "en";
const REQUEST_TIMEOUT_MS = 15_000;

// ----------------------------------------------------------------------------
// Result shape
//
// `retryable` is the contract with the notification ledger: true schedules
// exponential backoff, false burns the retry budget so we never loop forever on
// a permanently broken send (bad template name, revoked token, invalid number).
// ----------------------------------------------------------------------------
export type CloudSendResult =
  | { success: true; messageId: string | null; recipient: string }
  | {
      success: false;
      skipped?: true;
      error: string;
      errorCode: string | null;
      retryable: boolean;
      httpStatus?: number;
    };

// ----------------------------------------------------------------------------
// Config — read lazily on every call, never at module scope, so the value is
// always the current environment (matters for tests and for Next.js bundling).
// These are server-only: none of these names is NEXT_PUBLIC_*, so Next will
// refuse to inline them into a client bundle.
// ----------------------------------------------------------------------------
function getConfig() {
  const token = process.env.WHATSAPP_CLOUD_API_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId =
    process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION || DEFAULT_API_VERSION,
  };
}

type CloudConfig = NonNullable<ReturnType<typeof getConfig>>;

// ----------------------------------------------------------------------------
// Phone normalisation
//
// Meta wants digits only, country code first, no "+", spaces or dashes:
// "919876543210". The previous implementation just stripped non-digits, so a
// locally-stored 10-digit Indian number ("9876543210") went out as-is and Meta
// either rejected it or routed it somewhere unintended.
// ----------------------------------------------------------------------------
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;

  const cc = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, "");
  let digits = phone
    .replace(/^whatsapp:/i, "")
    .replace(/^00/, "")
    .replace(/\D/g, "");

  if (!digits) return null;

  // National format with a trunk prefix, e.g. "09876543210".
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);

  // Bare national number -> prepend the default country code.
  if (digits.length === 10 && cc) digits = cc + digits;

  // E.164 allows 8..15 digits including the country code.
  if (digits.length < 8 || digits.length > 15) return null;

  return digits;
}

// ----------------------------------------------------------------------------
// Error classification
//
// Meta error codes representing a *transient* condition. Everything else in the
// 4xx range is treated as permanent so the retry budget isn't wasted.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
// ----------------------------------------------------------------------------
const RETRYABLE_META_CODES = new Set([
  1,      // API unknown
  2,      // API service temporarily unavailable
  4,      // Too many calls (app-level rate limit)
  613,    // Rate limit hit
  80007,  // Rate limit issues
  130429, // Cloud API message throughput reached
  131000, // Something went wrong (generic Meta-side)
  131016, // Service temporarily unavailable
  131056, // Pair rate limit
  133016, // Temporarily blocked for throughput
]);

function classify(httpStatus: number, metaCode: number | null): boolean {
  if (metaCode !== null && RETRYABLE_META_CODES.has(metaCode)) return true;
  if (httpStatus === 408 || httpStatus === 429) return true;
  if (httpStatus >= 500) return true;
  return false; // other 4xx: bad token, bad template, bad recipient
}

function parseMetaError(raw: string): { code: number | null; message: string } {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { code?: number; message?: string; error_data?: { details?: string } };
    };
    const err = parsed.error;
    if (!err) return { code: null, message: raw.slice(0, 300) };
    return {
      code: typeof err.code === "number" ? err.code : null,
      // error_data.details is usually the actionable part ("template name does
      // not exist in 'en'"); the top-level message is often generic.
      message: err.error_data?.details || err.message || "Unknown Meta error",
    };
  } catch {
    return { code: null, message: raw.slice(0, 300) };
  }
}

// ----------------------------------------------------------------------------
// Transport
// ----------------------------------------------------------------------------
interface GraphSuccess {
  messages?: { id?: string }[];
}

async function callGraphApi(
  config: CloudConfig,
  recipient: string,
  body: Record<string, unknown>
): Promise<CloudSendResult> {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;

  // Without a timeout a hung connection holds a serverless invocation open
  // until the platform kills it, leaving the notification claimed but
  // unresolved until its lease lapses.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawBody = await res.text().catch(() => "");

    if (!res.ok) {
      const { code, message } = parseMetaError(rawBody);
      return {
        success: false,
        // redactString strips anything token-shaped that Meta echoed back.
        error: redactString(message),
        errorCode: code !== null ? String(code) : String(res.status),
        retryable: classify(res.status, code),
        httpStatus: res.status,
      };
    }

    // Capture wamid.* so a send can be traced and correlated with delivery
    // webhooks. The previous implementation discarded this entirely.
    let messageId: string | null = null;
    try {
      messageId = (JSON.parse(rawBody) as GraphSuccess).messages?.[0]?.id ?? null;
    } catch {
      messageId = null;
    }

    return { success: true, messageId, recipient };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      success: false,
      error: aborted
        ? `Request to Meta timed out after ${REQUEST_TIMEOUT_MS}ms`
        : redactString(err instanceof Error ? err.message : "Unknown network error"),
      errorCode: aborted ? "TIMEOUT" : "NETWORK_ERROR",
      retryable: true, // network blips and timeouts are what retries are for
    };
  } finally {
    clearTimeout(timer);
  }
}

type Preflight =
  | { ok: true; recipient: string; config: CloudConfig }
  | { ok: false; result: CloudSendResult };

function preflight(toPhone: string, what: string): Preflight {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      result: {
        success: false,
        skipped: true,
        error: `WhatsApp Cloud API is not configured — skipped ${what}`,
        errorCode: "NOT_CONFIGURED",
        retryable: false,
      },
    };
  }

  const recipient = normalizePhone(toPhone);
  if (!recipient) {
    return {
      ok: false,
      result: {
        success: false,
        error: "Recipient phone number is missing or not a valid E.164 number",
        errorCode: "INVALID_PHONE",
        retryable: false, // a malformed number will not fix itself
      },
    };
  }

  return { ok: true, recipient, config };
}

// ----------------------------------------------------------------------------
// Low-level senders
// ----------------------------------------------------------------------------
export async function sendWhatsAppCloudText(toPhone: string, body: string): Promise<CloudSendResult> {
  const pre = preflight(toPhone, "text message");
  if (!pre.ok) return pre.result;

  return callGraphApi(pre.config, pre.recipient, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: pre.recipient,
    type: "text",
    text: { body, preview_url: true },
  });
}

export async function sendWhatsAppCloudTemplate(
  toPhone: string,
  templateName: string,
  bodyParams: string[],
  languageCode = process.env.WHATSAPP_TEMPLATE_LANGUAGE || DEFAULT_TEMPLATE_LANGUAGE
): Promise<CloudSendResult> {
  const pre = preflight(toPhone, `template "${templateName}"`);
  if (!pre.ok) return pre.result;

  return callGraphApi(pre.config, pre.recipient, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: pre.recipient,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

/** True when both alerts are configured to go out as approved templates. */
export function isTemplateModeConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE &&
      process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE
  );
}

/** True when a token + phone number ID are present. Used by the health check. */
export function isWhatsAppCloudConfigured(): boolean {
  return getConfig() !== null;
}

// ----------------------------------------------------------------------------
// 1. Subscription activated — confirmation + duration
//
// Template body variables, in order:
//   {{1}} member name   {{2}} plan name   {{3}} gym name
//   {{4}} duration days {{5}} start date  {{6}} end date
// ----------------------------------------------------------------------------
export async function sendSubscriptionConfirmationWhatsApp(params: {
  phone: string;
  memberName: string;
  gymName: string;
  planName: string;
  durationDays: number;
  startDate: string;
  endDate: string;
  timeZone?: string;
}): Promise<CloudSendResult> {
  const { phone, memberName, gymName, planName, durationDays, startDate, endDate } = params;
  const tz = params.timeZone || DEFAULT_TIMEZONE;
  const start = formatDateForDisplay(startDate, tz);
  const end = formatDateForDisplay(endDate, tz);

  const templateName = process.env.WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE;
  if (templateName) {
    return sendWhatsAppCloudTemplate(phone, templateName, [
      memberName,
      planName,
      gymName,
      String(durationDays),
      start,
      end,
    ]);
  }

  const body =
    `Hi ${memberName}, your *${planName}* subscription at ${gymName} is confirmed! ✅\n\n` +
    `Duration: ${durationDays} day${durationDays === 1 ? "" : "s"}\n` +
    `Valid: ${start} – ${end}\n\n` +
    `Thanks for choosing ${gymName}. See you at the gym!`;

  return sendWhatsAppCloudText(phone, body);
}

// ----------------------------------------------------------------------------
// 2. Subscription expired — notice + renewal prompt
//
// Template body variables, in order:
//   {{1}} member name   {{2}} plan name   {{3}} gym name   {{4}} end date
// ----------------------------------------------------------------------------
export async function sendSubscriptionExpiredWhatsApp(params: {
  phone: string;
  memberName: string;
  gymName: string;
  planName: string;
  endDate: string;
  renewUrl?: string;
  timeZone?: string;
}): Promise<CloudSendResult> {
  const { phone, memberName, gymName, planName, endDate, renewUrl } = params;
  const tz = params.timeZone || DEFAULT_TIMEZONE;
  const end = formatDateForDisplay(endDate, tz);

  const templateName = process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE;
  if (templateName) {
    return sendWhatsAppCloudTemplate(phone, templateName, [memberName, planName, gymName, end]);
  }

  const body =
    `Hi ${memberName}, your *${planName}* membership at ${gymName} expired on ${end}. ❌\n\n` +
    `Renew now to keep your access and pick up right where you left off.` +
    (renewUrl ? `\n\nRenew here: ${renewUrl}` : "");

  return sendWhatsAppCloudText(phone, body);
}
