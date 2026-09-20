// ============================================================================
// End-to-end subscription lifecycle tests — Tests A..F from the brief.
//
//   A  New subscription        -> activation sent exactly once, id recorded
//   B  Duplicate payment event -> one subscription, one notification
//   C  Expired subscription    -> expired + expiry message sent once
//   D  Duplicate expiry run    -> still expired, still one message
//   E  WhatsApp failure        -> subscription intact, failure recorded, retried
//   F  Missing phone number    -> subscription fine, skipped safely, no crash
//
// The Graph API is faked throughout: no real WhatsApp message is sent.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { FakeSupabase, asAdminClient } from "../helpers/fake-supabase";
import {
  notifyActivationIfPaid,
  notifySubscriptionActivated,
  runSubscriptionExpirySweep,
  retryPendingSubscriptionNotifications,
} from "@/lib/services/subscription-lifecycle";

let sends: { to: string; type: string }[] = [];

/** Queue of scripted Graph API responses; the last one repeats. */
function mockGraph(responses: { status: number; payload: unknown }[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { to: string; type: string };
      sends.push({ to: body.to, type: body.type });
      const r = responses[Math.min(i++, responses.length - 1)]!;
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        text: async () => JSON.stringify(r.payload),
      } as unknown as Response;
    })
  );
}

const ok = (id: string) => ({
  status: 200,
  payload: { messages: [{ id }], contacts: [{ wa_id: "919550192069" }] },
});
const fail = (status: number, code: number, message: string) => ({
  status,
  payload: { error: { code, message } },
});

function seedActiveSubscription(db: FakeSupabase, over: { phone?: string | null; endDate?: string } = {}) {
  const gym = db.seedGym();
  const plan = db.seedPlan();
  const member = db.seedMember(over.phone === undefined ? {} : { phone: over.phone });
  const membership = db.seedMembership({
    member_id: member.id,
    gym_id: gym.id,
    plan_id: plan.id,
    end_date: over.endDate ?? "2026-05-01",
  });
  return { gym, plan, member, membership };
}

let db: FakeSupabase;

beforeEach(() => {
  sends = [];
  db = new FakeSupabase();
  process.env.WHATSAPP_CLOUD_API_TOKEN = "TEST_TOKEN_NOT_REAL";
  process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = "111111111111111";
  delete process.env.WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE;
  delete process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe("TEST A — new subscription", () => {
  it("sends the activation message exactly once, to the right number, and records the id", async () => {
    mockGraph([ok("wamid.ACTIVATION_A")]);
    const { membership, member } = seedActiveSubscription(db);

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(result?.outcome).toBe("sent");
    expect(sends).toHaveLength(1);
    // Normalised from the stored "+919550192069".
    expect(sends[0]!.to).toBe("919550192069");

    const ledger = db.notificationsFor(membership.id, "activation");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.status).toBe("sent");
    expect(ledger[0]!.provider_message_id).toBe("wamid.ACTIVATION_A");
    expect(ledger[0]!.sent_at).not.toBeNull();
    expect(ledger[0]!.recipient_phone).toBe("919550192069");

    // The subscription itself is untouched and active.
    expect(db.memberships.get(membership.id)!.status).toBe("active");
    expect(db.memberships.get(membership.id)!.activated_at).not.toBeNull();
    expect(member.phone).toBe("+919550192069");
  });

  it("does NOT send for a 'pay later' signup with no money recorded", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db);
    db.memberships.get(membership.id)!.amount_paid = 0;

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(result).toBeNull();
    expect(sends).toHaveLength(0);
    expect(db.notificationsFor(membership.id)).toHaveLength(0);
  });

  it("does NOT send for a subscription that is not active", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db);
    db.memberships.get(membership.id)!.status = "cancelled";

    expect(await notifyActivationIfPaid(asAdminClient(db), membership.id)).toBeNull();
    expect(sends).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("TEST B — duplicate payment event", () => {
  it("sends one message when the same activation is processed twice", async () => {
    mockGraph([ok("wamid.ACTIVATION_B")]);
    const { membership } = seedActiveSubscription(db);

    const first = await notifyActivationIfPaid(asAdminClient(db), membership.id);
    const second = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(first?.outcome).toBe("sent");
    expect(second?.outcome).toBe("already_handled");
    expect(sends).toHaveLength(1);
    expect(db.notificationsFor(membership.id, "activation")).toHaveLength(1);
  });

  it("sends one message under ten concurrent calls (webhook storm / double submit)", async () => {
    mockGraph([ok("wamid.ACTIVATION_B2")]);
    const { membership } = seedActiveSubscription(db);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => notifyActivationIfPaid(asAdminClient(db), membership.id))
    );

    expect(results.filter((r) => r?.outcome === "sent")).toHaveLength(1);
    expect(sends).toHaveLength(1);
    expect(db.notificationsFor(membership.id, "activation")).toHaveLength(1);
  });

  it("stays deduplicated long after the claim lease would have lapsed", async () => {
    mockGraph([ok("wamid.ACTIVATION_B3")]);
    const { membership } = seedActiveSubscription(db);

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    db.advance(7 * 24 * 3600_000); // a week later; server restarts, redeploys
    const later = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(later?.outcome).toBe("already_handled");
    expect(sends).toHaveLength(1);
  });

  it("treats a renewal as a separate subscription period with its own message", async () => {
    mockGraph([ok("wamid.FIRST"), ok("wamid.RENEWAL")]);
    const { membership, member, gym, plan } = seedActiveSubscription(db);

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    const renewed = db.seedMembership({
      member_id: member.id,
      gym_id: gym.id,
      plan_id: plan.id,
      end_date: "2026-06-01",
    });
    await notifyActivationIfPaid(asAdminClient(db), renewed.id);

    expect(sends).toHaveLength(2);
    expect(db.notificationsFor(renewed.id, "activation")[0]!.provider_message_id).toBe("wamid.RENEWAL");
  });
});

// ---------------------------------------------------------------------------
describe("TEST C — expired subscription", () => {
  it("expires a past-due subscription and sends the expiry message once", async () => {
    mockGraph([ok("wamid.EXPIRY_C")]);
    // now = 2026-04-01T06:00Z => 11:30 IST on 2026-04-01
    const { membership } = seedActiveSubscription(db, { endDate: "2026-03-31" });

    const summary = await runSubscriptionExpirySweep(asAdminClient(db), { renewUrl: "https://app.test/renew" });

    expect(summary.expired).toBe(1);
    expect(summary.notificationsSent).toBe(1);
    expect(db.memberships.get(membership.id)!.status).toBe("expired");
    expect(db.memberships.get(membership.id)!.expired_at).not.toBeNull();

    expect(sends).toHaveLength(1);
    const ledger = db.notificationsFor(membership.id, "expiry");
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.status).toBe("sent");
    expect(ledger[0]!.provider_message_id).toBe("wamid.EXPIRY_C");
  });

  it("does not expire a subscription that ends today in the gym's timezone", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db, { endDate: "2026-04-01" });

    const summary = await runSubscriptionExpirySweep(asAdminClient(db));

    expect(summary.expired).toBe(0);
    expect(db.memberships.get(membership.id)!.status).toBe("active");
    expect(sends).toHaveLength(0);
  });

  it("uses IST, not UTC, at the day boundary", async () => {
    // 2026-03-31T20:00Z is still 31 March in UTC but already 1 April in IST.
    db.now = new Date("2026-03-31T20:00:00.000Z");
    mockGraph([ok("wamid.EXPIRY_TZ")]);
    const { membership } = seedActiveSubscription(db, { endDate: "2026-03-31" });

    const summary = await runSubscriptionExpirySweep(asAdminClient(db));

    // Under the old UTC logic this would still be "today" and survive.
    expect(summary.expired).toBe(1);
    expect(db.memberships.get(membership.id)!.status).toBe("expired");
  });

  it("expires a renewed member's old period without messaging them", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const gym = db.seedGym();
    const plan = db.seedPlan();
    const member = db.seedMember();
    const old = db.seedMembership({ member_id: member.id, gym_id: gym.id, plan_id: plan.id, end_date: "2026-03-30" });
    db.seedMembership({ member_id: member.id, gym_id: gym.id, plan_id: plan.id, end_date: "2026-05-01" });

    const summary = await runSubscriptionExpirySweep(asAdminClient(db));

    expect(summary.expired).toBe(1);
    expect(summary.notificationsSent).toBe(0);
    expect(summary.notificationsSkipped).toBe(1);
    expect(db.memberships.get(old.id)!.status).toBe("expired");
    expect(sends).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("TEST D — duplicate expiration execution", () => {
  it("stays expired and sends only one message across three runs", async () => {
    mockGraph([ok("wamid.EXPIRY_D")]);
    const { membership } = seedActiveSubscription(db, { endDate: "2026-03-31" });

    const first = await runSubscriptionExpirySweep(asAdminClient(db));
    const second = await runSubscriptionExpirySweep(asAdminClient(db));
    const third = await runSubscriptionExpirySweep(asAdminClient(db));

    expect(first.expired).toBe(1);
    expect(second.expired).toBe(0);
    expect(third.expired).toBe(0);
    expect(sends).toHaveLength(1);
    expect(db.memberships.get(membership.id)!.status).toBe("expired");
    expect(db.notificationsFor(membership.id, "expiry")).toHaveLength(1);
  });

  it("sends only one message when two sweeps run concurrently", async () => {
    mockGraph([ok("wamid.EXPIRY_D2")]);
    seedActiveSubscription(db, { endDate: "2026-03-31" });

    await Promise.all([
      runSubscriptionExpirySweep(asAdminClient(db)),
      runSubscriptionExpirySweep(asAdminClient(db)),
    ]);

    expect(sends).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("TEST E — WhatsApp failure", () => {
  it("keeps the subscription active, records the failure, and schedules a retry", async () => {
    mockGraph([fail(503, 131000, "Service temporarily unavailable")]);
    const { membership } = seedActiveSubscription(db);

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(result?.outcome).toBe("failed_retryable");
    // The money was taken; the subscription must survive a messaging outage.
    expect(db.memberships.get(membership.id)!.status).toBe("active");

    const row = db.notificationsFor(membership.id, "activation")[0]!;
    expect(row.status).toBe("failed");
    expect(row.last_error_code).toBe("131000");
    expect(row.provider_message_id).toBeNull();
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(db.now.getTime());
  });

  it("does not retry before the backoff elapses", async () => {
    mockGraph([fail(503, 131000, "unavailable"), ok("wamid.RECOVERED")]);
    const { membership } = seedActiveSubscription(db);

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    const retry = await retryPendingSubscriptionNotifications(asAdminClient(db));

    expect(retry.attempted).toBe(0);
    expect(sends).toHaveLength(1);
  });

  it("recovers on retry after backoff and sends exactly one message overall", async () => {
    mockGraph([fail(503, 131000, "unavailable"), ok("wamid.RECOVERED")]);
    const { membership } = seedActiveSubscription(db);

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    db.advance(10 * 60_000); // past the 5-minute first backoff
    const retry = await retryPendingSubscriptionNotifications(asAdminClient(db));

    expect(retry.sent).toBe(1);
    expect(sends).toHaveLength(2); // one failed attempt + one successful

    const row = db.notificationsFor(membership.id, "activation")[0]!;
    expect(row.status).toBe("sent");
    expect(row.provider_message_id).toBe("wamid.RECOVERED");

    // And no duplicate after recovery.
    db.advance(60 * 60_000);
    const again = await retryPendingSubscriptionNotifications(asAdminClient(db));
    expect(again.attempted).toBe(0);
    expect(sends).toHaveLength(2);
  });

  it("stops retrying a permanent failure immediately (bad template)", async () => {
    mockGraph([fail(404, 132001, "Template name does not exist")]);
    const { membership } = seedActiveSubscription(db);

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);
    expect(result?.outcome).toBe("failed_permanent");

    const row = db.notificationsFor(membership.id, "activation")[0]!;
    expect(row.status).toBe("skipped");
    expect(row.attempts).toBe(row.max_attempts);

    db.advance(24 * 3600_000);
    const retry = await retryPendingSubscriptionNotifications(asAdminClient(db));
    expect(retry.attempted).toBe(0);
    expect(sends).toHaveLength(1);
  });

  it("gives up after the retry budget is exhausted — never loops forever", async () => {
    mockGraph([fail(500, 131000, "boom")]);
    const { membership } = seedActiveSubscription(db);

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    for (let i = 0; i < 12; i++) {
      db.advance(12 * 3600_000);
      await retryPendingSubscriptionNotifications(asAdminClient(db));
    }

    const row = db.notificationsFor(membership.id, "activation")[0]!;
    expect(row.attempts).toBeLessThanOrEqual(row.max_attempts);
    expect(sends.length).toBeLessThanOrEqual(row.max_attempts);
    expect(db.memberships.get(membership.id)!.status).toBe("active");
  });

  it("survives an unconfigured integration without breaking the subscription", async () => {
    delete process.env.WHATSAPP_CLOUD_API_TOKEN;
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db);

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(result?.outcome).toBe("failed_permanent");
    expect(db.memberships.get(membership.id)!.status).toBe("active");
    expect(sends).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("TEST F — missing phone number", () => {
  it("skips safely, records a clear reason, makes no API call, and does not crash", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db, { phone: null });

    const result = await notifyActivationIfPaid(asAdminClient(db), membership.id);

    expect(result?.outcome).toBe("failed_permanent");
    expect(result?.errorCode).toBe("MISSING_PHONE");
    expect(sends).toHaveLength(0);

    // The subscription is entirely unaffected.
    expect(db.memberships.get(membership.id)!.status).toBe("active");
    expect(db.memberships.get(membership.id)!.activated_at).not.toBeNull();

    const row = db.notificationsFor(membership.id, "activation")[0]!;
    expect(row.status).toBe("skipped");
    expect(row.last_error_code).toBe("MISSING_PHONE");
  });

  it("does not retry a member with no phone number", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db, { phone: null });

    await notifyActivationIfPaid(asAdminClient(db), membership.id);
    db.advance(24 * 3600_000);
    const retry = await retryPendingSubscriptionNotifications(asAdminClient(db));

    expect(retry.attempted).toBe(0);
    expect(sends).toHaveLength(0);
  });

  it("expires a subscription normally even when the member has no phone", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db, { phone: null, endDate: "2026-03-31" });

    const summary = await runSubscriptionExpirySweep(asAdminClient(db));

    expect(summary.expired).toBe(1);
    expect(summary.notificationsFailed).toBe(1);
    expect(db.memberships.get(membership.id)!.status).toBe("expired");
    expect(sends).toHaveLength(0);
  });

  it("records NO_CONTEXT instead of throwing when the membership vanishes after the claim", async () => {
    mockGraph([ok("wamid.SHOULD_NOT_HAPPEN")]);
    const { membership } = seedActiveSubscription(db);
    const admin = asAdminClient(db);

    // Claim first, then delete the row out from under the sender — a hard
    // delete or an ON DELETE CASCADE mid-flight.
    const claimed = await db.rpc("claim_subscription_notification", {
      p_membership_id: membership.id,
      p_kind: "activation",
      p_channel: "whatsapp",
      p_lease_seconds: 300,
    });
    expect(claimed.data).toHaveLength(1);
    db.memberships.delete(membership.id);
    db.advance(10 * 60_000); // let the lease lapse so the next call can claim

    const result = await notifySubscriptionActivated(admin, membership.id);

    // No claim is possible for a membership that no longer exists, so this is
    // refused rather than crashing. Either way: no send, no throw.
    expect(["already_handled", "no_context"]).toContain(result.outcome);
    expect(sends).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("full lifecycle", () => {
  it("runs subscribe -> activate -> message -> expire -> message with one of each", async () => {
    mockGraph([ok("wamid.LIFECYCLE_ACTIVATION"), ok("wamid.LIFECYCLE_EXPIRY")]);
    const { membership } = seedActiveSubscription(db, { endDate: "2026-04-30" });

    // 1. Payment verified server-side -> activation message.
    const activation = await notifyActivationIfPaid(asAdminClient(db), membership.id);
    expect(activation?.outcome).toBe("sent");
    expect(db.memberships.get(membership.id)!.status).toBe("active");

    // 2. Subscription runs. Daily sweeps do nothing while it is live.
    for (let day = 0; day < 29; day++) {
      db.advance(24 * 3600_000);
      const s = await runSubscriptionExpirySweep(asAdminClient(db));
      expect(s.expired).toBe(0);
    }
    expect(db.memberships.get(membership.id)!.status).toBe("active");

    // 3. End date passes -> expiry + message, without the member visiting.
    db.advance(2 * 24 * 3600_000);
    const sweep = await runSubscriptionExpirySweep(asAdminClient(db));
    expect(sweep.expired).toBe(1);
    expect(sweep.notificationsSent).toBe(1);
    expect(db.memberships.get(membership.id)!.status).toBe("expired");

    // Exactly two messages across the entire lifecycle.
    expect(sends).toHaveLength(2);
    expect(db.notificationsFor(membership.id, "activation")[0]!.provider_message_id).toBe("wamid.LIFECYCLE_ACTIVATION");
    expect(db.notificationsFor(membership.id, "expiry")[0]!.provider_message_id).toBe("wamid.LIFECYCLE_EXPIRY");
  });
});
