import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  sendEmail,
  renewalReminderEmailHtml,
  renewalReminderEmailText,
  renewalReminderEmailSubject,
  type RenewalReminderKind,
} from "@/lib/services/email";
import { authorizeCronRequest } from "@/lib/utils/cron-auth";
import { todayInTimeZone, addDaysToDateString, DEFAULT_TIMEZONE } from "@/lib/utils/datetime";
import type { ReminderType } from "@/types/database";

// Node runtime -- nodemailer (the Gmail SMTP transport used everywhere else
// in this app, e.g. password resets) doesn't run on the Edge runtime.
export const runtime = "nodejs";

/**
 * GET /api/cron/renewal-reminders
 *
 * Runs once a day (see supabase/migrations for the pg_cron job that calls
 * this with the x-cron-secret header). For every currently-active
 * membership whose end_date lands exactly 7, 3, or 1 day(s) from now, or
 * is today, sends one reminder email via the same Gmail SMTP transport
 * used for password resets -- not the Resend-based renewal-reminders Edge
 * Function, which is a separate WhatsApp+Resend pipeline.
 *
 * Each membership + window is only ever sent once, tracked in
 * renewal_reminder_log (same table/shape the Edge Function already uses),
 * so re-running this on the same day is safe.
 *
 * SCOPE: renewal REMINDERS only (email). The subscription-ended WhatsApp
 * message is owned by /api/cron/subscription-expiry.
 */

type Window = { type: Extract<ReminderType, "before_7d" | "before_3d" | "before_1d" | "on_expiry">; offsetDays: number; kind: RenewalReminderKind };

const WINDOWS: Window[] = [
  { type: "before_7d", offsetDays: 7, kind: "before_7d" },
  { type: "before_3d", offsetDays: 3, kind: "before_3d" },
  { type: "before_1d", offsetDays: 1, kind: "before_1d" },
  { type: "on_expiry", offsetDays: 0, kind: "on_expiry" },
];

// Reminder windows are matched against `end_date`, a Postgres `date`. "Today"
// must therefore be today in the gym's local calendar, not in UTC. The previous
// UTC version meant that for the first 5.5 hours of every IST day the job
// compared against yesterday's date, so the 7d/3d/1d windows were consistently
// off by one.
function dateOffset(days: number, timeZone: string = DEFAULT_TIMEZONE) {
  return addDaysToDateString(todayInTimeZone(timeZone), days);
}

export async function GET(req: NextRequest) {
  // Shared helper: constant-time comparison, accepts both the pg_cron
  // `x-cron-secret` header and Vercel Cron's `Authorization: Bearer` form.
  if (!authorizeCronRequest(req.headers).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const results: Record<string, number> = {};

  for (const window of WINDOWS) {
    const targetDate = dateOffset(window.offsetDays);

    const { data: memberships, error } = await admin
      .from("member_memberships")
      .select(
        "id, end_date, profiles:member_id(full_name, email, phone), gyms:gym_id(name), membership_plans:plan_id(name)"
      )
      .eq("is_current", true)
      .eq("end_date", targetDate);

    if (error) {
      console.error(`renewal-reminders: query failed for ${window.type}:`, error.message);
      continue;
    }

    let sentCount = 0;
    for (const m of memberships ?? []) {
      // De-dupe: never send the same window twice for the same membership.
      const { data: existing } = await admin
        .from("renewal_reminder_log")
        .select("id")
        .eq("membership_id", m.id)
        .eq("reminder_type", window.type)
        .maybeSingle();
      if (existing) continue;

      const member = m.profiles as unknown as { full_name: string; email: string | null; phone: string | null } | null;
      const gym = m.gyms as unknown as { name: string } | null;
      const plan = m.membership_plans as unknown as { name: string } | null;
      if (!member || (!member.email && !member.phone)) continue;

      const gymName = gym?.name ?? "your gym";
      const planName = plan?.name ?? "Membership";
      const daysUntilExpiry = window.kind === "on_expiry" ? 0 : window.offsetDays;

      let sentAny = false;

      if (member.email) {
        const emailResult = await sendEmail({
          to: member.email,
          subject: renewalReminderEmailSubject({ gymName, kind: window.kind, daysUntilExpiry }),
          html: renewalReminderEmailHtml({
            memberName: member.full_name,
            gymName,
            planName,
            endDate: m.end_date,
            kind: window.kind,
            daysUntilExpiry,
            membershipUrl: `${appUrl}/dashboard/member/membership`,
          }),
          text: renewalReminderEmailText({
            memberName: member.full_name,
            gymName,
            planName,
            endDate: m.end_date,
            kind: window.kind,
            daysUntilExpiry,
            membershipUrl: `${appUrl}/dashboard/member/membership`,
          }),
        });

        if (!emailResult.success) {
          console.error(`renewal-reminders: send failed for membership ${m.id}:`, emailResult);
        } else {
          sentAny = true;
        }
      }

      // NOTE: the WhatsApp "subscription ended" message is NOT sent from here.
      // It used to be, piggybacked on the on_expiry window, which made it
      // unreliable in two ways: it fired on `end_date = today` (the member's
      // last VALID day, not after expiry), and it was matched by exact date
      // equality, so a single missed run lost that member's message forever.
      // It now belongs to /api/cron/subscription-expiry, which expires the
      // period atomically and sends through the idempotent notification ledger.
      if (!sentAny) continue;

      // The de-dupe read above is advisory; this unique-constraint-aware insert
      // is what actually prevents a double send when two runs overlap.
      const { error: logError } = await admin
        .from("renewal_reminder_log")
        .insert({ membership_id: m.id, reminder_type: window.type });
      if (logError) {
        console.error(`renewal-reminders: could not log ${window.type} for ${m.id}:`, logError.message);
      }
      sentCount++;
    }
    results[window.type] = sentCount;
  }

  return NextResponse.json({ success: true, sent: results });
}