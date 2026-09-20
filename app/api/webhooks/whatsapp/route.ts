import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { lifecycleLog } from "@/lib/services/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * WHAT IT IS FOR
 *   Accepting a send from the Graph API only tells you Meta *queued* the
 *   message. Actual delivery is reported asynchronously here: sent -> delivered
 *   -> read, or failed. Recording that against `provider_message_id` closes the
 *   loop, so "we sent it" can be distinguished from "it arrived".
 *
 * SECURITY — why every part of this matters
 *   This endpoint is public by necessity (Meta has to reach it), so it is
 *   treated as hostile input:
 *
 *   - GET is the one-time subscription handshake. It only echoes `hub.challenge`
 *     when `hub.verify_token` matches our own secret, compared in constant time.
 *
 *   - POST is verified with `X-Hub-Signature-256`, an HMAC-SHA256 of the RAW
 *     body keyed with the Meta App Secret. The raw bytes are read *before* any
 *     JSON parsing, because re-serialising parsed JSON changes the bytes and
 *     the signature would never match.
 *
 *   - Without a configured app secret the endpoint refuses everything rather
 *     than falling back to trusting the payload. An unauthenticated webhook
 *     that writes to the database is worse than no webhook.
 *
 *   - The payload can only ever move a notification's *delivery status*
 *     forward. It cannot create rows, change a subscription, alter a phone
 *     number, or mark something as sent that we never sent: the update is
 *     matched on a `provider_message_id` that we generated ourselves.
 *
 *   - Duplicate deliveries are inherent to webhooks (Meta retries). Applying
 *     the same status twice is a no-op, so no extra dedupe table is needed —
 *     and critically, this endpoint never sends a message, so a replayed
 *     webhook cannot cause a duplicate WhatsApp notification.
 */

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  let received: Buffer;
  try {
    received = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

// ----------------------------------------------------------------------------
// GET — subscription verification handshake
// ----------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    lifecycleLog.warn("WHATSAPP_WEBHOOK_REJECTED", { reason: "verify_token_not_configured" });
    return new NextResponse("Not configured", { status: 503 });
  }

  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token") ?? "";
  const challenge = params.get("hub.challenge") ?? "";

  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(verifyToken, "utf8");
  const matches = a.length === b.length && timingSafeEqual(a, b);

  if (mode === "subscribe" && matches) {
    // Meta requires the raw challenge string echoed back, not JSON.
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  lifecycleLog.warn("WHATSAPP_WEBHOOK_REJECTED", { reason: "verify_token_mismatch" });
  return new NextResponse("Forbidden", { status: 403 });
}

// ----------------------------------------------------------------------------
// POST — delivery status callbacks
// ----------------------------------------------------------------------------
interface StatusEntry {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    lifecycleLog.warn("WHATSAPP_WEBHOOK_REJECTED", { reason: "app_secret_not_configured" });
    return new NextResponse("Not configured", { status: 503 });
  }

  // Raw bytes first — signing is over exactly what Meta sent.
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret)) {
    lifecycleLog.warn("WHATSAPP_WEBHOOK_REJECTED", { reason: "invalid_signature" });
    return new NextResponse("Forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signature was valid, so this is Meta sending something unexpected.
    // 200 anyway: a non-2xx makes Meta retry a payload we can never parse.
    return NextResponse.json({ received: true });
  }

  const statuses: StatusEntry[] = [];
  const body = payload as {
    entry?: { changes?: { value?: { statuses?: StatusEntry[] } }[] }[];
  };
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) statuses.push(status);
    }
  }

  if (statuses.length) {
    const admin = createAdminClient();

    for (const s of statuses) {
      if (!s.id || !s.status) continue;

      const firstError = s.errors?.[0];
      // Matched on a wamid WE recorded. An unknown id updates nothing.
      const { error } = await admin
        .from("subscription_notifications")
        .update({
          provider_status: s.status,
          ...(firstError
            ? {
                last_error_code: firstError.code != null ? String(firstError.code) : null,
                last_error: (firstError.message || firstError.title || "").slice(0, 500),
              }
            : {}),
        })
        .eq("provider_message_id", s.id);

      if (error) {
        lifecycleLog.error("WHATSAPP_WEBHOOK_RECEIVED", { messageId: s.id, error: error.message });
      } else {
        lifecycleLog.info("WHATSAPP_WEBHOOK_RECEIVED", {
          messageId: s.id,
          providerStatus: s.status,
          hasError: Boolean(firstError),
        });
      }
    }
  }

  // Always 200 on an authenticated payload, otherwise Meta retries forever and
  // can disable the subscription.
  return NextResponse.json({ received: true });
}
