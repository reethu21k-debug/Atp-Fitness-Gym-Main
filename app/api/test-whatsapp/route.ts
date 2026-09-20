import { NextRequest, NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/utils/cron-auth";
import {
  isWhatsAppCloudConfigured,
  isTemplateModeConfigured,
  normalizePhone,
  sendSubscriptionExpiredWhatsApp,
} from "@/lib/services/whatsapp-cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint for the WhatsApp Cloud API integration.
 *
 * WHAT CHANGED AND WHY
 *   This was previously an unauthenticated GET that sent a real WhatsApp
 *   message to a phone number hardcoded in the source, and `middleware.ts`
 *   explicitly excluded the path from the auth matcher. Anyone who found the
 *   URL could send messages on your business number in a loop — burning the
 *   Meta messaging quota, and potentially getting the number rate-limited or
 *   flagged for spam.
 *
 *   It is now:
 *     - authenticated with CRON_SECRET (same scheme as the cron routes),
 *     - split so the read-only config check cannot send anything,
 *     - POST-only for the actual send, with the recipient supplied by the
 *       caller rather than baked into the repository.
 *
 * USAGE
 *   Config check (sends nothing):
 *     curl -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/test-whatsapp
 *
 *   Live send:
 *     curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *          -H 'Content-Type: application/json' \
 *          -d '{"phone":"+91XXXXXXXXXX"}' \
 *          $APP_URL/api/test-whatsapp
 */

export async function GET(req: NextRequest) {
  if (!authorizeCronRequest(req.headers).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Booleans only — never echo a token, a phone number ID, or any part of one.
  return NextResponse.json({
    configured: isWhatsAppCloudConfigured(),
    templateMode: isTemplateModeConfigured(),
    apiVersion: process.env.WHATSAPP_CLOUD_API_VERSION || "v21.0",
    webhookVerifyTokenSet: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
    appSecretSet: Boolean(process.env.WHATSAPP_APP_SECRET),
    note: isTemplateModeConfigured()
      ? "Template mode active — business-initiated sends will work outside the 24h window."
      : "Plain-text mode. Meta rejects business-initiated text outside the 24h session window; set WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE and WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE before production.",
  });
}

export async function POST(req: NextRequest) {
  if (!authorizeCronRequest(req.headers).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let phone: string | undefined;
  try {
    ({ phone } = (await req.json()) as { phone?: string });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body with a `phone` field." }, { status: 400 });
  }

  if (!phone || !normalizePhone(phone)) {
    return NextResponse.json(
      { error: "`phone` is required and must be a valid number (E.164 or a 10-digit Indian number)." },
      { status: 400 }
    );
  }

  const result = await sendSubscriptionExpiredWhatsApp({
    phone,
    memberName: "Test Member",
    gymName: process.env.NEXT_PUBLIC_APP_NAME ?? "ATP Fitness",
    planName: "Diagnostic",
    endDate: new Date().toISOString().slice(0, 10),
  });

  // This bypasses the notification ledger on purpose: it is a transport smoke
  // test, not part of the subscription lifecycle, so it writes no ledger row
  // and can never mark a real notification as already-sent.
  return NextResponse.json(result);
}
