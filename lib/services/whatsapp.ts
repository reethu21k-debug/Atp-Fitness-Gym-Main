// ============================================================================
// WhatsApp sending — Meta WhatsApp Cloud API (direct).
//
// MIGRATED OFF TWILIO
//   This module used to wrap the Twilio SDK and send through
//   api.twilio.com/.../Messages.json, i.e. Twilio relayed to WhatsApp on our
//   behalf. Everything now talks to graph.facebook.com directly through
//   lib/services/whatsapp-cloud.ts — one integration, one set of credentials,
//   one place where phone normalisation, error classification, timeouts and
//   token redaction are implemented.
//
//   The exported function names are unchanged so existing call sites keep
//   working; only the transport underneath is different. There is no Twilio
//   account, SID, auth token or `whatsapp:` sender left anywhere in this path.
//
// TEMPLATES APPLY HERE TOO
//   Welcome messages are business-initiated (the member has never messaged the
//   gym's number), so outside the 24-hour session window Meta rejects
//   free-form text with error 131047 — exactly as it does for the subscription
//   alerts. Twilio's sandbox number hid this during development; the Cloud API
//   does not.
//
//   Set these to approved template names to send them properly in production:
//     WHATSAPP_MEMBER_WELCOME_TEMPLATE
//     WHATSAPP_STAFF_WELCOME_TEMPLATE
//   Without them these calls fall back to plain text, which works against a
//   Meta test number but will be rejected for real recipients.
//
//   NOTE ON CREDENTIALS IN TEMPLATES: Meta rejects template parameters
//   containing newlines or tabs, and a temporary password is sensitive. The
//   template variables below deliberately carry the login URL and email, not
//   the password — see sendMemberWelcomeWhatsApp.
// ============================================================================

import {
  sendWhatsAppCloudText,
  sendWhatsAppCloudTemplate,
  type CloudSendResult,
} from "@/lib/services/whatsapp-cloud";

export type WhatsAppResult = CloudSendResult;

/**
 * Generic free-form send. Used by marketing campaigns and ad-hoc messages.
 *
 * Subject to the 24-hour session window: this only reaches a recipient who has
 * messaged the business number recently. For business-initiated sends, use a
 * template.
 */
export async function sendWhatsAppMessage(toPhone: string, body: string): Promise<WhatsAppResult> {
  return sendWhatsAppCloudText(toPhone, body);
}

// ----------------------------------------------------------------------------
// Message bodies (unchanged wording — only the transport moved)
// ----------------------------------------------------------------------------

export function memberWelcomeWhatsAppMessage(params: {
  memberName: string;
  gymName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  const { memberName, gymName, email, temporaryPassword, loginUrl } = params;
  return (
    `Welcome to ${gymName}, ${memberName}! 🏋️\n\n` +
    `Your ATP Fitness account is ready.\nEmail: ${email}\nTemporary password: ${temporaryPassword}\n\n` +
    `Log in here: ${loginUrl}\nYou'll be asked to set a new password on first login.`
  );
}

export function staffWelcomeWhatsAppMessage(params: {
  staffName: string;
  gymName: string;
  role: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}) {
  const { staffName, gymName, role, email, temporaryPassword, loginUrl } = params;
  return (
    `Welcome to the team at ${gymName}, ${staffName}! 👋\n\n` +
    `You've been added as a ${role}.\nEmail: ${email}\nTemporary password: ${temporaryPassword}\n\n` +
    `Log in here: ${loginUrl}\nYou'll be asked to set a new password on first login.`
  );
}

// ----------------------------------------------------------------------------
// Business-initiated sends — template when configured, text otherwise
// ----------------------------------------------------------------------------

/**
 * Member welcome.
 *
 * Template body variables, in order:
 *   {{1}} member name   {{2}} gym name   {{3}} login email   {{4}} login URL
 *
 * The temporary password is intentionally NOT a template variable: the
 * credential is delivered by email (see memberWelcomeEmailHtml), and putting it
 * in a WhatsApp template body would persist it in Meta's message logs.
 */
export async function sendMemberWelcomeWhatsApp(params: {
  phone: string;
  memberName: string;
  gymName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<WhatsAppResult> {
  const templateName = process.env.WHATSAPP_MEMBER_WELCOME_TEMPLATE;
  if (templateName) {
    return sendWhatsAppCloudTemplate(params.phone, templateName, [
      params.memberName,
      params.gymName,
      params.email,
      params.loginUrl,
    ]);
  }
  return sendWhatsAppCloudText(params.phone, memberWelcomeWhatsAppMessage(params));
}

/**
 * Staff welcome.
 *
 * Template body variables, in order:
 *   {{1}} staff name  {{2}} gym name  {{3}} role  {{4}} login email  {{5}} login URL
 */
export async function sendStaffWelcomeWhatsApp(params: {
  phone: string;
  staffName: string;
  gymName: string;
  role: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
}): Promise<WhatsAppResult> {
  const templateName = process.env.WHATSAPP_STAFF_WELCOME_TEMPLATE;
  if (templateName) {
    return sendWhatsAppCloudTemplate(params.phone, templateName, [
      params.staffName,
      params.gymName,
      params.role,
      params.email,
      params.loginUrl,
    ]);
  }
  return sendWhatsAppCloudText(params.phone, staffWelcomeWhatsAppMessage(params));
}

/**
 * Renewal reminder.
 *
 * Retained for the legacy reminder path. The authoritative "subscription
 * ended" message is NOT this — it lives in
 * lib/services/subscription-lifecycle.ts, behind the idempotency ledger.
 */
export async function sendRenewalReminderWhatsApp(
  toPhone: string,
  memberName: string,
  daysLeft: number,
  gymName: string
): Promise<WhatsAppResult> {
  const body =
    daysLeft > 0
      ? `Hi ${memberName}, your membership at ${gymName} expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew soon to avoid a break in access.`
      : `Hi ${memberName}, your membership at ${gymName} has expired. Renew today to keep your progress going.`;
  return sendWhatsAppCloudText(toPhone, body);
}
