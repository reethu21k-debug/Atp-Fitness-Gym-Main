// ============================================================================
// Subscription lifecycle notifications — the single place that decides whether
// a WhatsApp alert should go out, and records what happened.
//
// WHY THIS MODULE EXISTS
//   Before this, the activation message was a side effect buried inside
//   `recordPayment()`. That produced two opposite bugs at once:
//     - New members got NOTHING. `createMember()` inserts the membership and
//       the first payment directly and never calls `recordPayment()`, so the
//       main "user subscribes" path never reached the WhatsApp code at all.
//     - Existing members got TOO MANY. Every payment row fired a send, so a
//       6-installment EMI plan sent six "subscription confirmed" messages, and
//       a retried request sent another.
//
//   The fix is to key notifications off the SUBSCRIPTION PERIOD, not off the
//   payment, and to hold that decision in Postgres rather than in memory.
//
// THE IDEMPOTENCY CONTRACT
//   `claim_subscription_notification()` returns at most one row, ever, per
//   (membership_id, kind, channel) until that row is released. Zero rows means
//   "someone else has this, or it is already done" — and the caller MUST NOT
//   send. This holds across page refreshes, duplicate endpoint calls, webhook
//   redelivery, overlapping cron runs, multiple server instances and process
//   restarts, because the arbiter is a unique index plus a row lock, not a
//   variable in this process.
//
//   Nothing here uses a global, an in-memory Set, or setTimeout for dedupe.
//
// FAILURE ISOLATION
//   No function in this module throws. A WhatsApp outage must never roll back a
//   payment or block member creation — the money is already taken and the
//   subscription is genuinely active. Delivery failure is recorded separately
//   in the ledger and retried by the cron sweep.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, SubscriptionNotification, SubscriptionNotificationKind } from "@/types/database";
import {
  sendSubscriptionConfirmationWhatsApp,
  sendSubscriptionExpiredWhatsApp,
  type CloudSendResult,
} from "@/lib/services/whatsapp-cloud";
import { lifecycleLog, type LifecycleEvent } from "@/lib/services/logger";
import { DEFAULT_TIMEZONE } from "@/lib/utils/datetime";

type AdminClient = SupabaseClient<Database>;

export type NotifyOutcome =
  | "sent"
  | "already_handled" // claim refused: done, in flight, or budget exhausted
  | "failed_retryable"
  | "failed_permanent"
  | "no_context"; // membership/member row vanished

export interface NotifyResult {
  outcome: NotifyOutcome;
  membershipId: string;
  kind: SubscriptionNotificationKind;
  messageId?: string | null;
  errorCode?: string | null;
}

// Per-kind log event names, so a log drain can filter on
// `event:WHATSAPP_ACTIVATION_FAILED` without parsing message text.
const EVENTS: Record<
  SubscriptionNotificationKind,
  { attempt: LifecycleEvent; success: LifecycleEvent; failed: LifecycleEvent; skipped: LifecycleEvent }
> = {
  activation: {
    attempt: "WHATSAPP_ACTIVATION_ATTEMPT",
    success: "WHATSAPP_ACTIVATION_SUCCESS",
    failed: "WHATSAPP_ACTIVATION_FAILED",
    skipped: "WHATSAPP_ACTIVATION_SKIPPED",
  },
  expiry: {
    attempt: "WHATSAPP_EXPIRY_ATTEMPT",
    success: "WHATSAPP_EXPIRY_SUCCESS",
    failed: "WHATSAPP_EXPIRY_FAILED",
    skipped: "WHATSAPP_EXPIRY_SKIPPED",
  },
};

// ----------------------------------------------------------------------------
// Context loading
// ----------------------------------------------------------------------------
interface MembershipContext {
  membershipId: string;
  memberId: string;
  gymId: string;
  memberName: string;
  phone: string | null;
  gymName: string;
  timeZone: string;
  planName: string;
  durationDays: number;
  startDate: string;
  endDate: string;
}

async function loadMembershipContext(
  admin: AdminClient,
  membershipId: string
): Promise<MembershipContext | null> {
  const { data, error } = await admin
    .from("member_memberships")
    .select(
      "id, member_id, gym_id, start_date, end_date, profiles:member_id(full_name, phone), gyms:gym_id(name, timezone), membership_plans:plan_id(name, duration_days)"
    )
    .eq("id", membershipId)
    .maybeSingle();

  if (error || !data) return null;

  const member = data.profiles as unknown as { full_name: string | null; phone: string | null } | null;
  const gym = data.gyms as unknown as { name: string | null; timezone: string | null } | null;
  const plan = data.membership_plans as unknown as { name: string | null; duration_days: number | null } | null;

  return {
    membershipId: data.id,
    memberId: data.member_id,
    gymId: data.gym_id,
    memberName: member?.full_name?.trim() || "there",
    // The member's phone is read from the database, never from the request —
    // a caller cannot redirect a notification to a number of their choosing.
    phone: member?.phone?.trim() || null,
    gymName: gym?.name?.trim() || "your gym",
    timeZone: gym?.timezone?.trim() || DEFAULT_TIMEZONE,
    planName: plan?.name?.trim() || "Membership",
    durationDays: plan?.duration_days ?? 0,
    startDate: data.start_date,
    endDate: data.end_date,
  };
}

// ----------------------------------------------------------------------------
// Claim / complete wrappers
//
// Both RPCs are declared `returns setof`, so supabase-js hands back an array.
// Empty array = refused. A plain composite return would have produced an
// all-null object here, indistinguishable from a real claim.
// ----------------------------------------------------------------------------
async function claim(
  admin: AdminClient,
  membershipId: string,
  kind: SubscriptionNotificationKind
): Promise<SubscriptionNotification | null> {
  const { data, error } = await admin.rpc("claim_subscription_notification", {
    p_membership_id: membershipId,
    p_kind: kind,
    p_channel: "whatsapp",
    p_lease_seconds: 300,
  });

  if (error) {
    lifecycleLog.error(EVENTS[kind].failed, {
      membershipId,
      stage: "claim",
      error: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as SubscriptionNotification[];
  return rows[0] ?? null;
}

async function complete(
  admin: AdminClient,
  notificationId: string,
  args: {
    success: boolean;
    messageId?: string | null;
    recipientPhone?: string | null;
    errorCode?: string | null;
    error?: string | null;
    retryable?: boolean;
  }
): Promise<void> {
  const { error } = await admin.rpc("complete_subscription_notification", {
    p_id: notificationId,
    p_success: args.success,
    p_message_id: args.messageId ?? null,
    p_recipient_phone: args.recipientPhone ?? null,
    p_error_code: args.errorCode ?? null,
    p_error: args.error ?? null,
    p_retryable: args.retryable ?? true,
  });

  if (error) {
    // The send already happened; failing to record it is bad but must not
    // throw. The lease will lapse and the sweep may retry — which is why the
    // message id is recorded first where possible.
    lifecycleLog.error("SUBSCRIPTION_NOTIFICATION_RETRY", {
      notificationId,
      stage: "complete",
      error: error.message,
    });
  }
}

// ----------------------------------------------------------------------------
// Core dispatcher
// ----------------------------------------------------------------------------
async function dispatch(
  admin: AdminClient,
  membershipId: string,
  kind: SubscriptionNotificationKind,
  options?: { renewUrl?: string }
): Promise<NotifyResult> {
  const events = EVENTS[kind];

  // 1. Win the right to send — or stop here.
  const claimed = await claim(admin, membershipId, kind);
  if (!claimed) {
    lifecycleLog.info(events.skipped, { membershipId, kind, reason: "not_claimed" });
    return { outcome: "already_handled", membershipId, kind };
  }

  try {
    // 2. Gather everything from the database (the source of truth).
    const ctx = await loadMembershipContext(admin, membershipId);
    if (!ctx) {
      await complete(admin, claimed.id, {
        success: false,
        errorCode: "NO_CONTEXT",
        error: "Membership or related member/gym row could not be loaded",
        retryable: false,
      });
      lifecycleLog.error(events.failed, { membershipId, notificationId: claimed.id, errorCode: "NO_CONTEXT" });
      return { outcome: "no_context", membershipId, kind, errorCode: "NO_CONTEXT" };
    }

    // 3. A member with no phone number is a permanent, non-crashing skip. The
    //    subscription itself is unaffected.
    if (!ctx.phone) {
      await complete(admin, claimed.id, {
        success: false,
        errorCode: "MISSING_PHONE",
        error: "Member has no phone number on file",
        retryable: false,
      });
      lifecycleLog.warn(events.skipped, {
        membershipId,
        memberId: ctx.memberId,
        gymId: ctx.gymId,
        notificationId: claimed.id,
        errorCode: "MISSING_PHONE",
      });
      return { outcome: "failed_permanent", membershipId, kind, errorCode: "MISSING_PHONE" };
    }

    lifecycleLog.info(events.attempt, {
      membershipId,
      memberId: ctx.memberId,
      gymId: ctx.gymId,
      notificationId: claimed.id,
      phone: ctx.phone,
      attempts: claimed.attempts,
    });

    // 4. Send.
    let result: CloudSendResult;
    if (kind === "activation") {
      result = await sendSubscriptionConfirmationWhatsApp({
        phone: ctx.phone,
        memberName: ctx.memberName,
        gymName: ctx.gymName,
        planName: ctx.planName,
        durationDays: ctx.durationDays,
        startDate: ctx.startDate,
        endDate: ctx.endDate,
        timeZone: ctx.timeZone,
      });
    } else {
      result = await sendSubscriptionExpiredWhatsApp({
        phone: ctx.phone,
        memberName: ctx.memberName,
        gymName: ctx.gymName,
        planName: ctx.planName,
        endDate: ctx.endDate,
        renewUrl: options?.renewUrl,
        timeZone: ctx.timeZone,
      });
    }

    // 5. Record the outcome.
    if (result.success) {
      await complete(admin, claimed.id, {
        success: true,
        messageId: result.messageId,
        recipientPhone: result.recipient,
      });
      lifecycleLog.info(events.success, {
        membershipId,
        memberId: ctx.memberId,
        gymId: ctx.gymId,
        notificationId: claimed.id,
        messageId: result.messageId,
        phone: result.recipient,
      });
      return { outcome: "sent", membershipId, kind, messageId: result.messageId };
    }

    await complete(admin, claimed.id, {
      success: false,
      recipientPhone: ctx.phone,
      errorCode: result.errorCode,
      error: result.error,
      retryable: result.retryable,
    });
    lifecycleLog.error(events.failed, {
      membershipId,
      memberId: ctx.memberId,
      gymId: ctx.gymId,
      notificationId: claimed.id,
      errorCode: result.errorCode,
      retryable: result.retryable,
      error: result.error,
      attempts: claimed.attempts,
    });
    return {
      outcome: result.retryable ? "failed_retryable" : "failed_permanent",
      membershipId,
      kind,
      errorCode: result.errorCode,
    };
  } catch (err) {
    // Anything unexpected: release the claim as a retryable failure so the
    // sweep picks it up, rather than leaving it stuck until the lease lapses.
    const message = err instanceof Error ? err.message : "Unknown error";
    await complete(admin, claimed.id, {
      success: false,
      errorCode: "UNEXPECTED",
      error: message,
      retryable: true,
    });
    lifecycleLog.error(events.failed, {
      membershipId,
      notificationId: claimed.id,
      errorCode: "UNEXPECTED",
      error: message,
    });
    return { outcome: "failed_retryable", membershipId, kind, errorCode: "UNEXPECTED" };
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Message 1 — subscription activated.
 *
 * Safe to call from anywhere a subscription becomes active-and-paid, as many
 * times as you like: at most one message is ever sent per membership period.
 * Never throws.
 */
export async function notifySubscriptionActivated(
  admin: AdminClient,
  membershipId: string
): Promise<NotifyResult> {
  return dispatch(admin, membershipId, "activation");
}

/**
 * Message 2 — subscription ended.
 *
 * Called by the expiry sweep after the period has been atomically marked
 * expired in the database. Never throws.
 */
export async function notifySubscriptionExpired(
  admin: AdminClient,
  membershipId: string,
  options?: { renewUrl?: string }
): Promise<NotifyResult> {
  return dispatch(admin, membershipId, "expiry", options);
}

/**
 * Activation entry point used by the payment paths.
 *
 * Gates on the DATABASE's view of the subscription, not on anything the caller
 * passed in: the period must exist, be active, and have money recorded against
 * it. A frontend claiming "payment succeeded" can never trigger a message on
 * its own — `amount_paid` is only ever written by a permission-checked server
 * action inserting a `payments` row.
 */
export async function notifyActivationIfPaid(
  admin: AdminClient,
  membershipId: string
): Promise<NotifyResult | null> {
  const { data, error } = await admin
    .from("member_memberships")
    .select("id, status, amount_paid, activated_at")
    .eq("id", membershipId)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== "active") return null;
  if ((data.amount_paid ?? 0) <= 0) return null; // "pay later" — confirm when money actually arrives

  if (!data.activated_at) {
    await admin
      .from("member_memberships")
      .update({ activated_at: new Date().toISOString() })
      .eq("id", membershipId)
      .is("activated_at", null);
  }

  lifecycleLog.info("SUBSCRIPTION_ACTIVATED", { membershipId });
  return notifySubscriptionActivated(admin, membershipId);
}

// ----------------------------------------------------------------------------
// Expiry sweep
// ----------------------------------------------------------------------------
export interface ExpirySweepResult {
  expired: number;
  notificationsSent: number;
  notificationsFailed: number;
  notificationsSkipped: number;
}

/**
 * Finds every active membership whose end date has passed IN ITS OWN GYM'S
 * TIMEZONE, marks them expired atomically, and sends the expiry message.
 *
 * The expiry itself happens in one SQL statement, so two concurrent runs cannot
 * both expire the same row. The message is then gated by the same claim ledger,
 * so even if this function is executed twice the member hears once.
 *
 * Runs entirely server-side: the member never has to visit the site.
 */
export async function runSubscriptionExpirySweep(
  admin: AdminClient,
  options?: { limit?: number; renewUrl?: string }
): Promise<ExpirySweepResult> {
  const summary: ExpirySweepResult = {
    expired: 0,
    notificationsSent: 0,
    notificationsFailed: 0,
    notificationsSkipped: 0,
  };

  const { data, error } = await admin.rpc("expire_due_memberships", {
    p_limit: options?.limit ?? 500,
  });

  if (error) {
    lifecycleLog.error("SUBSCRIPTION_EXPIRY_DETECTED", { stage: "sweep", error: error.message });
    return summary;
  }

  const rows = (data ?? []) as {
    membership_id: string;
    member_id: string;
    gym_id: string;
    should_notify: boolean;
  }[];

  summary.expired = rows.length;
  if (rows.length) {
    lifecycleLog.info("SUBSCRIPTION_EXPIRY_DETECTED", { count: rows.length });
  }

  for (const row of rows) {
    lifecycleLog.info("SUBSCRIPTION_EXPIRED", {
      membershipId: row.membership_id,
      memberId: row.member_id,
      gymId: row.gym_id,
      willNotify: row.should_notify,
    });

    // A member who already renewed has a newer period covering today — telling
    // them their old period ended would be wrong and alarming.
    if (!row.should_notify) {
      summary.notificationsSkipped++;
      continue;
    }

    const result = await notifySubscriptionExpired(admin, row.membership_id, {
      renewUrl: options?.renewUrl,
    });

    if (result.outcome === "sent") summary.notificationsSent++;
    else if (result.outcome === "already_handled") summary.notificationsSkipped++;
    else summary.notificationsFailed++;
  }

  return summary;
}

// ----------------------------------------------------------------------------
// Retry sweep
// ----------------------------------------------------------------------------
export interface RetrySweepResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Re-attempts notifications that previously failed retryably and whose backoff
 * has elapsed. Bounded by `max_attempts` in the ledger, so this can never
 * become an infinite retry loop, and permanent failures are never picked up.
 *
 * This is what makes a WhatsApp outage recoverable: the subscription stayed
 * correct, and the message lands once Meta is healthy again.
 */
export async function retryPendingSubscriptionNotifications(
  admin: AdminClient,
  options?: { limit?: number; renewUrl?: string }
): Promise<RetrySweepResult> {
  const summary: RetrySweepResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 };

  const { data, error } = await admin.rpc("due_subscription_notifications", {
    p_limit: options?.limit ?? 100,
  });

  if (error) {
    lifecycleLog.error("SUBSCRIPTION_NOTIFICATION_RETRY", { stage: "sweep", error: error.message });
    return summary;
  }

  const rows = (data ?? []) as {
    id: string;
    membership_id: string;
    kind: SubscriptionNotificationKind;
    attempts: number;
  }[];

  for (const row of rows) {
    summary.attempted++;
    lifecycleLog.info("SUBSCRIPTION_NOTIFICATION_RETRY", {
      notificationId: row.id,
      membershipId: row.membership_id,
      kind: row.kind,
      attempts: row.attempts,
    });

    const result = await dispatch(admin, row.membership_id, row.kind, {
      renewUrl: options?.renewUrl,
    });

    if (result.outcome === "sent") summary.sent++;
    else if (result.outcome === "already_handled") summary.skipped++;
    else summary.failed++;
  }

  return summary;
}
