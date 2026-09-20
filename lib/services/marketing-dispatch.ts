import { sendEmail } from "@/lib/services/email";
import { sendWhatsAppCloudText } from "@/lib/services/whatsapp-cloud";
import { fillMessageTemplate, isMonthDayMatch } from "@/lib/utils/marketing-helpers";
import type { createAdminClient } from "@/lib/supabase/server";

// ============================================================================
// MARKETING DISPATCH -- single Node-runtime module that sends every
// Marketing email (campaigns, birthday wishes, festival offers) through the
// same Gmail SMTP transport (lib/services/email.ts -> sendEmail) already
// used for subscription and welcome emails. No Resend, no separate provider.
//
// This replaces the two Resend-based Supabase Edge Functions
// (supabase/functions/campaign-dispatch, supabase/functions/marketing-automation).
// Those ran on Deno, which is why they couldn't use nodemailer directly --
// same reason the renewal-reminder emails were moved to a Next.js API route
// (see app/api/cron/renewal-reminders). This module + its two route handlers
// follow that exact pattern for Marketing.
//
// Callers:
//   - lib/actions/marketing.actions.ts calls dispatchCampaign() directly
//     (same Node process, no HTTP round trip) for "send now" campaigns.
//   - app/api/marketing/campaign-dispatch/route.ts calls
//     sweepScheduledCampaigns() once a minute via pg_cron, for campaigns
//     whose scheduled_at has arrived.
//   - app/api/cron/marketing-automation/route.ts calls
//     runMarketingAutomation() once a day via pg_cron, for birthday wishes
//     and festival offers.
// ============================================================================

type AdminClient = ReturnType<typeof createAdminClient>;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.atpfitness.in";

interface SendResult {
  success: boolean;
  error?: string;
}

/** Strips HTML down to a readable plain-text alternative for the SMTP transport's `text` field. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sends one Marketing email via the shared Gmail SMTP transport
 * (lib/services/email.ts). This is the ONLY email-sending path Marketing
 * uses -- no Resend call anywhere in this module.
 */
async function sendMarketingEmail(to: string, subject: string, html: string): Promise<SendResult> {
  const result = await sendEmail({ to, subject, html, text: htmlToPlainText(html) });
  if (result.success) return { success: true };
  if ("skipped" in result && result.skipped) {
    return { success: false, error: "Email isn't configured on this server (set GMAIL_SMTP_USER / GMAIL_SMTP_APP_PASSWORD)." };
  }
  return { success: false, error: "error" in result && result.error ? result.error : "Email send failed" };
}

/**
 * Campaign WhatsApp send — direct to Meta's Cloud API.
 *
 * Previously went through Twilio's REST API, which relayed to WhatsApp on our
 * behalf. It now uses the same single integration as every other WhatsApp send
 * in the app (lib/services/whatsapp-cloud.ts), so phone normalisation, error
 * classification and token redaction are shared rather than reimplemented.
 *
 * Marketing campaigns are business-initiated, so Meta only accepts free-form
 * text from recipients inside the 24-hour session window. Broadcast campaigns
 * to a cold audience require an approved Marketing-category template — this is
 * a Meta policy constraint, not a limitation of this code.
 */
async function sendWhatsApp(toPhone: string, body: string): Promise<SendResult> {
  const result = await sendWhatsAppCloudText(toPhone, body);
  if (result.success) return { success: true };
  if (result.skipped) {
    return {
      success: false,
      error: "WhatsApp isn't configured on this server (set WHATSAPP_CLOUD_API_TOKEN / WHATSAPP_CLOUD_PHONE_NUMBER_ID).",
    };
  }
  return { success: false, error: result.error };
}

// ============================================================================
// CAMPAIGNS
// ============================================================================

interface AudienceMember {
  leadId: string | null;
  memberId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

/** Resolves a campaign's audience_type into a flat list of recipients. */
async function resolveCampaignAudience(admin: AdminClient, campaign: any): Promise<AudienceMember[]> {
  const gymId = campaign.gym_id;

  if (campaign.audience_type === "leads") {
    const { data } = await admin
      .from("leads")
      .select("id, name, email, phone")
      .eq("gym_id", gymId)
      .not("status", "in", "(converted,lost)");
    return (data ?? []).map((l: any) => ({ leadId: l.id, memberId: null, name: l.name, email: l.email, phone: l.phone }));
  }

  if (campaign.audience_type === "custom_selection") {
    const ids: string[] = campaign.audience_member_ids ?? [];
    if (ids.length === 0) return [];
    const { data } = await admin.from("profiles").select("id, full_name, email, phone").in("id", ids);
    return (data ?? []).map((p: any) => ({ leadId: null, memberId: p.id, name: p.full_name, email: p.email, phone: p.phone }));
  }

  // Member-based audiences: query member_details joined with profiles, then
  // filter in JS by membership status where needed (one code path instead
  // of five near-duplicate queries).
  const { data: members } = await admin
    .from("member_details")
    .select("profile_id, status, profiles:profile_id(full_name, email, phone)")
    .eq("gym_id", gymId);

  let filtered = (members ?? []) as any[];
  if (campaign.audience_type === "active_members") {
    filtered = filtered.filter((m) => m.status === "active");
  } else if (campaign.audience_type === "expired_members") {
    filtered = filtered.filter((m) => m.status === "expired");
  } else if (campaign.audience_type === "frozen_members") {
    filtered = filtered.filter((m) => m.status === "frozen");
  } else if (campaign.audience_type === "expiring_soon") {
    const { data: expiring } = await admin
      .from("members_overview")
      .select("profile_id")
      .eq("gym_id", gymId)
      .gte("days_until_expiry", 0)
      .lte("days_until_expiry", 7);
    const expiringIds = new Set((expiring ?? []).map((e: any) => e.profile_id));
    filtered = filtered.filter((m) => expiringIds.has(m.profile_id));
  }
  // 'all_members' falls through with no extra filter.

  return filtered
    .map((m): AudienceMember | null => {
      const profile = m.profiles as { full_name: string; email: string | null; phone: string | null } | null;
      if (!profile) return null;
      return { leadId: null, memberId: m.profile_id, name: profile.full_name, email: profile.email, phone: profile.phone };
    })
    .filter((x): x is AudienceMember => x !== null);
}

export interface DispatchResult {
  campaignId: string;
  recipientsTotal?: number;
  sentCount?: number;
  failedCount?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

/**
 * Sends a single campaign: resolves the audience, writes one
 * campaign_recipients row per person (unique constraint dedupes a re-run),
 * sends email via the shared SMTP transport and WhatsApp via Meta's Cloud
 * API, then
 * updates both the recipient rows and the campaign's aggregate counters.
 */
export async function dispatchCampaign(admin: AdminClient, campaignId: string): Promise<DispatchResult> {
  const { data: campaign, error } = await admin.from("marketing_campaigns").select("*").eq("id", campaignId).single();

  if (error || !campaign) return { campaignId, error: "Campaign not found" };
  if (campaign.status === "sent" || campaign.status === "sending") {
    return { campaignId, skipped: true, reason: `already ${campaign.status}` };
  }

  await admin.from("marketing_campaigns").update({ status: "sending" }).eq("id", campaignId);

  const audience = await resolveCampaignAudience(admin, campaign);

  if (audience.length > 0) {
    const { error: insertError } = await admin.from("campaign_recipients").insert(
      audience.map((r) => ({
        campaign_id: campaignId,
        gym_id: campaign.gym_id,
        member_id: r.memberId,
        lead_id: r.leadId,
        recipient_name: r.name,
        recipient_email: r.email,
        recipient_phone: r.phone,
        channel: campaign.channel,
        status: "pending",
      }))
    );
    // 23505 = unique violation on (campaign_id, member_id)/(campaign_id, lead_id)
    // -- expected on a retry of a campaign that already has recipient rows
    // from an earlier attempt (e.g. a prior timeout), since those people
    // already have a row and don't need a fresh "pending" one. Any other
    // error is unexpected and should stop the send rather than silently
    // report "sent" with 0 recipients.
    if (insertError && insertError.code !== "23505") {
      await admin
        .from("marketing_campaigns")
        .update({ status: "failed" })
        .eq("id", campaignId);
      return { campaignId, error: `Could not create recipient list: ${insertError.message}` };
    }
  }

  // Pending rows created just now, PLUS any left "pending" from an earlier
  // attempt that never got as far as sending them (e.g. a timeout mid-loop).
  const { data: recipients } = await admin
    .from("campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  let sentCount = 0;
  let failedCount = 0;

  for (const recipient of recipients ?? []) {
    const personalizedMessage = fillMessageTemplate(campaign.message_body, { name: recipient.recipient_name });
    let anySent = false;
    let lastError: string | null = null;

    if ((campaign.channel === "email" || campaign.channel === "both") && recipient.recipient_email) {
      const trackingPixel = `<img src="${APP_URL}/api/marketing/track/open?c=${campaignId}&r=${recipient.id}" width="1" height="1" style="display:none" alt="" />`;
      const html = `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">${personalizedMessage}</div>${trackingPixel}`;
      const result = await sendMarketingEmail(recipient.recipient_email, campaign.subject || campaign.name, html);
      if (result.success) anySent = true;
      else lastError = result.error ?? "Email send failed";
    }

    if ((campaign.channel === "whatsapp" || campaign.channel === "both") && recipient.recipient_phone) {
      const result = await sendWhatsApp(recipient.recipient_phone, personalizedMessage);
      if (result.success) anySent = true;
      else lastError = lastError ?? result.error ?? "WhatsApp send failed";
    }

    if (anySent) {
      await admin
        .from("campaign_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", recipient.id);
      sentCount++;
    } else {
      if (lastError) console.error(`[marketing] campaign ${campaignId} recipient ${recipient.id} failed:`, lastError);
      await admin
        .from("campaign_recipients")
        .update({ status: "failed", error_message: lastError ?? "No valid contact channel" })
        .eq("id", recipient.id);
      failedCount++;
    }
  }

  // Count sent/failed across ALL recipient rows for this campaign, not just
  // the ones processed in this call -- on a retry after a previous partial
  // run (e.g. a timeout), earlier successes are already "sent" in the table
  // and must still be reflected in the campaign's totals.
  const { count: totalSentCount } = await admin
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "sent");
  const { count: totalFailedCount } = await admin
    .from("campaign_recipients")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "failed");

  await admin
    .from("marketing_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipients_total: audience.length,
      recipients_sent: totalSentCount ?? sentCount,
      recipients_failed: totalFailedCount ?? failedCount,
    })
    .eq("id", campaignId);

  return { campaignId, recipientsTotal: audience.length, sentCount, failedCount };
}

/** Sweeps every scheduled campaign whose scheduled_at has arrived and dispatches it. Called by pg_cron once a minute. */
export async function sweepScheduledCampaigns(admin: AdminClient): Promise<DispatchResult[]> {
  const { data: due } = await admin
    .from("marketing_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  const results: DispatchResult[] = [];
  for (const campaign of due ?? []) {
    results.push(await dispatchCampaign(admin, campaign.id));
  }
  return results;
}

// ============================================================================
// AUTOMATION -- birthday wishes + festival offers
// ============================================================================

export interface AutomationResult {
  birthdaysSent: number;
  festivalsSent: number;
  date: string;
}

/**
 * Runs the two daily automated Marketing jobs (birthday wishes, festival
 * offers). Both are idempotent via automated_message_log so nothing is ever
 * sent twice for the same person on the same calendar day. Called by
 * pg_cron once a day.
 */
export async function runMarketingAutomation(admin: AdminClient): Promise<AutomationResult> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const todayYear = today.getUTCFullYear();

  let birthdaysSent = 0;
  let festivalsSent = 0;

  // --------------------------------------------------------------------
  // 1. BIRTHDAY WISHES
  // --------------------------------------------------------------------
  const { data: birthdayConfigs } = await admin
    .from("birthday_campaign_config")
    .select("gym_id, is_enabled, channel, message_template, coupon_id")
    .eq("is_enabled", true);

  for (const config of birthdayConfigs ?? []) {
    const { data: gym } = await admin.from("gyms").select("name").eq("id", config.gym_id).single();

    const { data: members } = await admin
      .from("member_details")
      .select("profile_id, date_of_birth, profiles:profile_id(full_name, email, phone)")
      .eq("gym_id", config.gym_id)
      .eq("status", "active")
      .not("date_of_birth", "is", null);

    let coupon: { code: string } | null = null;
    if (config.coupon_id) {
      const { data: c } = await admin.from("coupons").select("code").eq("id", config.coupon_id).single();
      coupon = c;
    }

    for (const m of (members ?? []) as any[]) {
      const dob = new Date(m.date_of_birth as string);
      if (!isMonthDayMatch(dob, today)) continue;

      const profile = m.profiles as { full_name: string; email: string | null; phone: string | null } | null;
      if (!profile) continue;

      // Idempotency: skip if we already logged this member+automation+day.
      const { error: logError } = await admin.from("automated_message_log").insert({
        gym_id: config.gym_id,
        member_id: m.profile_id,
        automation_type: "birthday",
        sent_on: todayStr,
      });
      if (logError) continue; // unique violation = already sent today

      const vars = { name: profile.full_name, gym_name: gym?.name ?? "ATP Fitness", coupon_code: coupon?.code ?? "" };
      const message = fillMessageTemplate(config.message_template, vars);

      if ((config.channel === "email" || config.channel === "both") && profile.email) {
        const result = await sendMarketingEmail(profile.email, `Happy Birthday, ${profile.full_name}! 🎉`, `<p>${message}</p>`);
        if (!result.success) console.error(`[marketing] birthday email failed for ${profile.email}:`, result.error);
      }
      if ((config.channel === "whatsapp" || config.channel === "both") && profile.phone) {
        const result = await sendWhatsApp(profile.phone, message);
        if (!result.success) console.error(`[marketing] birthday whatsapp failed for ${profile.phone}:`, result.error);
      }
      birthdaysSent++;
    }
  }

  // --------------------------------------------------------------------
  // 2. FESTIVAL OFFERS
  // --------------------------------------------------------------------
  const { data: festivals } = await admin
    .from("festival_offers")
    .select("id, gym_id, name, occurs_on, message_template, channel, coupon_id, last_sent_year")
    .eq("is_active", true);

  for (const festival of festivals ?? []) {
    const occursOn = new Date(festival.occurs_on);
    if (!isMonthDayMatch(occursOn, today)) continue;
    if (festival.last_sent_year === todayYear) continue; // already fired this year

    const { data: gym } = await admin.from("gyms").select("name").eq("id", festival.gym_id).single();
    const { data: members } = await admin
      .from("member_details")
      .select("profile_id, profiles:profile_id(full_name, email, phone)")
      .eq("gym_id", festival.gym_id)
      .eq("status", "active");

    let coupon: { code: string } | null = null;
    if (festival.coupon_id) {
      const { data: c } = await admin.from("coupons").select("code").eq("id", festival.coupon_id).single();
      coupon = c;
    }

    let sentForThisFestival = 0;
    for (const m of (members ?? []) as any[]) {
      const profile = m.profiles as { full_name: string; email: string | null; phone: string | null } | null;
      if (!profile) continue;

      const { error: logError } = await admin.from("automated_message_log").insert({
        gym_id: festival.gym_id,
        member_id: m.profile_id,
        automation_type: `festival:${festival.id}`,
        sent_on: todayStr,
      });
      if (logError) continue;

      const vars = { name: profile.full_name, gym_name: gym?.name ?? "ATP Fitness", coupon_code: coupon?.code ?? "" };
      const message = fillMessageTemplate(festival.message_template, vars);

      if ((festival.channel === "email" || festival.channel === "both") && profile.email) {
        const result = await sendMarketingEmail(profile.email, festival.name, `<p>${message}</p>`);
        if (!result.success) console.error(`[marketing] festival email failed for ${profile.email}:`, result.error);
      }
      if ((festival.channel === "whatsapp" || festival.channel === "both") && profile.phone) {
        const result = await sendWhatsApp(profile.phone, message);
        if (!result.success) console.error(`[marketing] festival whatsapp failed for ${profile.phone}:`, result.error);
      }
      sentForThisFestival++;
      festivalsSent++;
    }

    // Only mark this festival as fired for the year if it actually sent to
    // someone (per-festival, not a global flag across every festival in the loop).
    if (sentForThisFestival > 0) {
      await admin.from("festival_offers").update({ last_sent_year: todayYear }).eq("id", festival.id);
    }
  }

  return { birthdaysSent, festivalsSent, date: todayStr };
}