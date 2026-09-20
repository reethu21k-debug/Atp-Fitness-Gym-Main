import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { runMarketingAutomation } from "@/lib/services/marketing-dispatch";
import { authorizeCronRequest } from "@/lib/utils/cron-auth";

// Node runtime -- nodemailer (the Gmail SMTP transport used everywhere else
// in this app) doesn't run on the Edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/cron/marketing-automation
 *
 * Replaces the old Resend-based `marketing-automation` Supabase Edge
 * Function. Runs once a day (see supabase/migrations for the pg_cron job)
 * and sends birthday wishes + festival offers through the same Gmail SMTP
 * transport used for subscription/welcome/renewal emails
 * (lib/services/email.ts -> sendEmail) -- no Resend call anywhere in this
 * path.
 */
export async function GET(req: NextRequest) {
  // Shared helper: constant-time comparison (the previous `!==` leaked the
  // secret through response timing) and accepts both the pg_cron
  // `x-cron-secret` header and Vercel Cron's `Authorization: Bearer` form.
  if (!authorizeCronRequest(req.headers).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const result = await runMarketingAutomation(admin);
  return NextResponse.json({ success: true, ...result });
}
