import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  runSubscriptionExpirySweep,
  retryPendingSubscriptionNotifications,
} from "@/lib/services/subscription-lifecycle";
import { authorizeCronRequest } from "@/lib/utils/cron-auth";
import { lifecycleLog } from "@/lib/services/logger";

// Node runtime: the Supabase service-role client and the crypto-based cron auth
// both expect Node, and this must never run on the Edge runtime.
export const runtime = "nodejs";
// Never cache a job that mutates data.
export const dynamic = "force-dynamic";

/**
 * GET/POST /api/cron/subscription-expiry
 *
 * THE server-side expiry mechanism. Two phases:
 *
 *   1. Expiry sweep — `expire_due_memberships()` atomically flips every active
 *      membership whose `end_date` has passed *in its own gym's timezone* to
 *      'expired', and reports which of them the member should be told about.
 *      For each, the WhatsApp "subscription ended" message is sent through the
 *      claim ledger, so exactly one message goes out per period.
 *
 *   2. Retry sweep — re-attempts notifications (activation *and* expiry) that
 *      previously failed retryably and whose backoff has elapsed. Bounded by
 *      `max_attempts`, so this cannot loop forever.
 *
 * Runs entirely server-side; a member never has to open the app for their
 * subscription to expire or for the message to be sent.
 *
 * Idempotent by construction: run it twice, ten times, or from two instances at
 * once — memberships expire once and members hear once.
 *
 * SCHEDULING
 *   Vercel Cron        -> vercel.json (sends `Authorization: Bearer $CRON_SECRET`)
 *   Supabase pg_cron   -> supabase/migrations/0026_schedule_subscription_expiry.sql
 *                         (sends `x-cron-secret`)
 *   Either works; both are safe to have enabled simultaneously.
 */
async function handle(req: NextRequest) {
  const auth = authorizeCronRequest(req.headers);
  if (!auth.ok) {
    // Deliberately identical response for both reasons: don't reveal whether
    // the server has a secret configured.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  lifecycleLog.info("CRON_RUN_STARTED", { job: "subscription-expiry" });

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const renewUrl = `${appUrl}/dashboard/member/membership`;

  const expiry = await runSubscriptionExpirySweep(admin, { renewUrl });
  const retries = await retryPendingSubscriptionNotifications(admin, { renewUrl });

  const durationMs = Date.now() - startedAt;
  lifecycleLog.info("CRON_RUN_FINISHED", {
    job: "subscription-expiry",
    durationMs,
    expired: expiry.expired,
    sent: expiry.notificationsSent,
    retried: retries.attempted,
  });

  return NextResponse.json({ success: true, durationMs, expiry, retries });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

// Vercel Cron issues GET; pg_net's http_post is more convenient from SQL.
export async function POST(req: NextRequest) {
  return handle(req);
}
