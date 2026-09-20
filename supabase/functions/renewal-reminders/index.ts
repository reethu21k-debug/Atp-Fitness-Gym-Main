// Supabase Edge Function — renewal-reminders
// Runs once daily via pg_cron (see migration 0006_schedule_renewal_reminders.sql).
// For each active membership whose end_date matches one of the reminder
// windows, sends an email + WhatsApp message and logs it so it's never sent
// twice for the same membership + window.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "ATP Fitness <no-reply@atpfitness.in>";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN");
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
const WHATSAPP_API_VERSION = Deno.env.get("WHATSAPP_CLOUD_API_VERSION") ?? "v21.0";
const WHATSAPP_COUNTRY_CODE = Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE") ?? "91";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://app.atpfitness.in";

type Window = { type: string; offsetDays: number; kind: "before" | "after" };

const WINDOWS: Window[] = [
  { type: "before_30d", offsetDays: 30, kind: "before" },
  { type: "before_15d", offsetDays: 15, kind: "before" },
  { type: "before_7d", offsetDays: 7, kind: "before" },
  { type: "before_3d", offsetDays: 3, kind: "before" },
  { type: "before_1d", offsetDays: 1, kind: "before" },
  { type: "after_1d", offsetDays: 1, kind: "after" },
  { type: "after_3d", offsetDays: 3, kind: "after" },
  { type: "after_7d", offsetDays: 7, kind: "after" },
  { type: "after_30d", offsetDays: 30, kind: "after" },
];

function dateOffset(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  }).catch((err) => console.error("resend send failed", err));
}

// Direct to Meta's WhatsApp Cloud API. This function previously relayed
// through Twilio; there is no Twilio account or sender involved anywhere in
// the project any more.
//
// Meta wants digits only, country code first, no "+" or separators. A bare
// 10-digit national number gets the default country code prepended.
function normalizePhone(phone: string): string | null {
  let digits = phone.replace(/^whatsapp:/i, "").replace(/^00/, "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = WHATSAPP_COUNTRY_CODE + digits;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

async function sendWhatsApp(toPhone: string, body: string) {
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;

  const to = normalizePhone(toPhone);
  if (!to) {
    console.error("whatsapp send skipped: recipient is not a valid number");
    return;
  }

  await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body, preview_url: true },
    }),
    // Never log the error object verbatim — it can echo the bearer token.
  }).catch((err) => console.error("whatsapp send failed:", err instanceof Error ? err.message : "unknown"));
}

Deno.serve(async (req) => {
  // Simple shared-secret check so this endpoint can't be triggered by anyone
  // who finds the URL — pg_cron sends this header (see the scheduling migration).
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const results: Record<string, number> = {};

  for (const window of WINDOWS) {
    const targetDate = window.kind === "before" ? dateOffset(window.offsetDays) : dateOffset(-window.offsetDays);

    const { data: memberships, error } = await supabase
      .from("member_memberships")
      .select(
        "id, member_id, gym_id, end_date, profiles:member_id(full_name, email, phone), gyms:gym_id(name)"
      )
      .eq("is_current", true)
      .eq("end_date", targetDate);

    if (error) {
      console.error(`query failed for ${window.type}`, error);
      continue;
    }

    let sentCount = 0;
    for (const m of memberships ?? []) {
      // Skip if already logged for this membership + window (unique constraint
      // also protects this at the DB level, this check avoids the extra call).
      const { data: existing } = await supabase
        .from("renewal_reminder_log")
        .select("id")
        .eq("membership_id", m.id)
        .eq("reminder_type", window.type)
        .maybeSingle();
      if (existing) continue;

      const member = m.profiles as unknown as { full_name: string; email: string | null; phone: string | null };
      const gym = m.gyms as unknown as { name: string };
      const daysText = window.kind === "before" ? `in ${window.offsetDays} day(s)` : `${window.offsetDays} day(s) ago`;

      const subject =
        window.kind === "before"
          ? `Your membership at ${gym.name} expires ${daysText}`
          : `Your membership at ${gym.name} expired ${daysText}`;

      const message =
        window.kind === "before"
          ? `Hi ${member.full_name}, your membership at ${gym.name} expires ${daysText}. Renew soon to avoid a break in access. ${APP_URL}/dashboard/member/membership`
          : `Hi ${member.full_name}, your membership at ${gym.name} expired ${daysText}. Renew today to keep your progress going. ${APP_URL}/dashboard/member/membership`;

      if (member.email) {
        await sendEmail(member.email, subject, `<p>${message}</p>`);
      }
      if (member.phone) {
        await sendWhatsApp(member.phone, message);
      }

      await supabase.from("renewal_reminder_log").insert({ membership_id: m.id, reminder_type: window.type });
      sentCount++;
    }
    results[window.type] = sentCount;
  }

  return new Response(JSON.stringify({ success: true, sent: results }), {
    headers: { "Content-Type": "application/json" },
  });
});