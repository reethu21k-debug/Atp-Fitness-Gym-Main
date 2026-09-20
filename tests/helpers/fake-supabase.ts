// ============================================================================
// An in-memory stand-in for the Supabase service-role client.
//
// SCOPE AND HONESTY ABOUT WHAT THIS PROVES
//   The RPC implementations below are a faithful port of the SQL in
//   supabase/migrations/0025_subscription_lifecycle.sql. The SQL itself is
//   verified separately, against a real PostgreSQL 16 instance, by
//   tests/sql/subscription_lifecycle_test.sql (including a 20-way concurrency
//   race on claim_subscription_notification).
//
//   What THIS fake proves is the TypeScript orchestration on top of that
//   contract: that lib/services/subscription-lifecycle.ts claims before
//   sending, sends exactly once, records the message id, classifies failures
//   correctly, and never lets a delivery problem corrupt subscription state.
//
//   It is not a substitute for the SQL tests, and it is not a Postgres
//   emulator. Real serialisability is asserted in the SQL suite.
// ============================================================================

export interface FakeMembership {
  id: string;
  member_id: string;
  gym_id: string;
  plan_id: string | null;
  start_date: string;
  end_date: string;
  amount_paid: number;
  status: "active" | "expired" | "cancelled";
  is_current: boolean;
  activated_at: string | null;
  expired_at: string | null;
}

export interface FakeProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
}

export interface FakeGym {
  id: string;
  name: string;
  timezone: string;
}

export interface FakePlan {
  id: string;
  name: string;
  duration_days: number;
}

export interface FakeNotification {
  id: string;
  membership_id: string;
  gym_id: string;
  member_id: string;
  kind: "activation" | "expiry";
  channel: string;
  status: "pending" | "sent" | "failed" | "skipped";
  recipient_phone: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  attempts: number;
  max_attempts: number;
  last_error_code: string | null;
  last_error: string | null;
  first_attempt_at: string | null;
  last_attempt_at: string | null;
  next_attempt_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

export class FakeSupabase {
  memberships = new Map<string, FakeMembership>();
  profiles = new Map<string, FakeProfile>();
  gyms = new Map<string, FakeGym>();
  plans = new Map<string, FakePlan>();
  notifications: FakeNotification[] = [];

  /** Controllable clock so backoff can be tested without waiting. */
  now = new Date("2026-04-01T06:00:00.000Z");

  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }

  private iso() {
    return this.now.toISOString();
  }

  // --------------------------------------------------------------------------
  // Seeding
  // --------------------------------------------------------------------------
  seedGym(over: Partial<FakeGym> = {}): FakeGym {
    const gym: FakeGym = { id: nextId(), name: "ATP Fitness", timezone: "Asia/Kolkata", ...over };
    this.gyms.set(gym.id, gym);
    return gym;
  }

  seedPlan(over: Partial<FakePlan> = {}): FakePlan {
    const plan: FakePlan = { id: nextId(), name: "Gold", duration_days: 30, ...over };
    this.plans.set(plan.id, plan);
    return plan;
  }

  seedMember(over: Partial<FakeProfile> = {}): FakeProfile {
    const p: FakeProfile = { id: nextId(), full_name: "Rithik", phone: "+919550192069", ...over };
    this.profiles.set(p.id, p);
    return p;
  }

  seedMembership(over: Partial<FakeMembership> & { member_id: string; gym_id: string }): FakeMembership {
    const m: FakeMembership = {
      id: nextId(),
      plan_id: null,
      start_date: "2026-03-02",
      end_date: "2026-04-01",
      amount_paid: 3000,
      status: "active",
      is_current: true,
      activated_at: null,
      expired_at: null,
      ...over,
    };
    this.memberships.set(m.id, m);
    return m;
  }

  notificationsFor(membershipId: string, kind?: "activation" | "expiry") {
    return this.notifications.filter(
      (n) => n.membership_id === membershipId && (kind ? n.kind === kind : true)
    );
  }

  // --------------------------------------------------------------------------
  // .from(...) query-builder surface — only the operations the lifecycle code
  // actually uses.
  // --------------------------------------------------------------------------
  from(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const db = this;
    const state: { filters: [string, unknown][]; update?: Record<string, unknown>; isNull?: string } = {
      filters: [],
    };

    const builder = {
      select() {
        return builder;
      },
      update(values: Record<string, unknown>) {
        state.update = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters.push([column, value]);
        return builder;
      },
      is(column: string, value: unknown) {
        if (value === null) state.isNull = column;
        return builder;
      },
      async maybeSingle() {
        const row = db.resolveRow(table, state.filters);
        return { data: row, error: null };
      },
      async single() {
        const row = db.resolveRow(table, state.filters);
        return { data: row, error: row ? null : { message: "not found" } };
      },
      // An update with no .single() is awaited directly.
      then(resolve: (v: { data: null; error: null }) => unknown) {
        db.applyUpdate(table, state);
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    };

    return builder;
  }

  private applyUpdate(
    table: string,
    state: { filters: [string, unknown][]; update?: Record<string, unknown>; isNull?: string }
  ) {
    if (!state.update) return;
    if (table === "member_memberships") {
      const idFilter = state.filters.find(([c]) => c === "id");
      if (!idFilter) return;
      const row = this.memberships.get(String(idFilter[1]));
      if (!row) return;
      if (state.isNull && (row as unknown as Record<string, unknown>)[state.isNull] != null) return;
      Object.assign(row, state.update);
    }
    if (table === "subscription_notifications") {
      const midFilter = state.filters.find(([c]) => c === "provider_message_id");
      if (!midFilter) return;
      for (const n of this.notifications) {
        if (n.provider_message_id === midFilter[1]) Object.assign(n, state.update);
      }
    }
  }

  private resolveRow(table: string, filters: [string, unknown][]) {
    if (table !== "member_memberships") return null;
    const idFilter = filters.find(([c]) => c === "id");
    if (!idFilter) return null;
    const m = this.memberships.get(String(idFilter[1]));
    if (!m) return null;

    const profile = this.profiles.get(m.member_id) ?? null;
    const gym = this.gyms.get(m.gym_id) ?? null;
    const plan = m.plan_id ? this.plans.get(m.plan_id) ?? null : null;

    // Shape mirrors PostgREST's embedded-resource response.
    return {
      ...m,
      profiles: profile ? { full_name: profile.full_name, phone: profile.phone } : null,
      gyms: gym ? { name: gym.name, timezone: gym.timezone } : null,
      membership_plans: plan ? { name: plan.name, duration_days: plan.duration_days } : null,
    };
  }

  // --------------------------------------------------------------------------
  // RPCs — ports of migration 0025
  // --------------------------------------------------------------------------
  async rpc(name: string, args: Record<string, unknown>) {
    switch (name) {
      case "claim_subscription_notification":
        return { data: this.claim(args), error: null };
      case "complete_subscription_notification":
        return { data: this.complete(args), error: null };
      case "expire_due_memberships":
        return { data: this.expireDue(args), error: null };
      case "due_subscription_notifications":
        return { data: this.dueNotifications(args), error: null };
      default:
        return { data: null, error: { message: `unknown rpc ${name}` } };
    }
  }

  /** Mirrors INSERT ... ON CONFLICT DO UPDATE ... WHERE (lease + budget). */
  private claim(args: Record<string, unknown>): FakeNotification[] {
    const membershipId = String(args.p_membership_id);
    const kind = args.p_kind as "activation" | "expiry";
    const channel = String(args.p_channel ?? "whatsapp");
    const leaseMs = Number(args.p_lease_seconds ?? 300) * 1000;

    const membership = this.memberships.get(membershipId);
    if (!membership) return [];

    const existing = this.notifications.find(
      (n) => n.membership_id === membershipId && n.kind === kind && n.channel === channel
    );

    if (!existing) {
      const row: FakeNotification = {
        id: nextId(),
        membership_id: membershipId,
        gym_id: membership.gym_id,
        member_id: membership.member_id,
        kind,
        channel,
        status: "pending",
        recipient_phone: null,
        provider_message_id: null,
        provider_status: null,
        attempts: 1,
        max_attempts: 5,
        last_error_code: null,
        last_error: null,
        first_attempt_at: this.iso(),
        last_attempt_at: this.iso(),
        next_attempt_at: new Date(this.now.getTime() + leaseMs).toISOString(),
        sent_at: null,
        created_at: this.iso(),
        updated_at: this.iso(),
      };
      this.notifications.push(row);
      return [{ ...row }];
    }

    // The three refusal conditions, exactly as in the SQL WHERE clause.
    const claimable =
      (existing.status === "pending" || existing.status === "failed") &&
      existing.attempts < existing.max_attempts &&
      new Date(existing.next_attempt_at).getTime() <= this.now.getTime();

    if (!claimable) return [];

    existing.attempts += 1;
    existing.status = "pending";
    existing.last_attempt_at = this.iso();
    existing.next_attempt_at = new Date(this.now.getTime() + leaseMs).toISOString();
    existing.updated_at = this.iso();
    return [{ ...existing }];
  }

  private complete(args: Record<string, unknown>): FakeNotification[] {
    const row = this.notifications.find((n) => n.id === String(args.p_id));
    if (!row) return [];

    if (args.p_success) {
      row.status = "sent";
      row.sent_at = this.iso();
      row.provider_message_id = (args.p_message_id as string | null) ?? row.provider_message_id;
      row.recipient_phone = (args.p_recipient_phone as string | null) ?? row.recipient_phone;
      row.last_error_code = null;
      row.last_error = null;
      row.updated_at = this.iso();
      return [{ ...row }];
    }

    const retryable = args.p_retryable !== false;
    // 5m * 2^(attempts-1), capped at 6h — matches the SQL.
    const backoffMs = Math.min(300_000 * Math.pow(2, Math.max(row.attempts - 1, 0)), 6 * 3600_000);

    row.status = retryable ? "failed" : "skipped";
    if (!retryable) row.attempts = row.max_attempts; // burn the budget
    row.recipient_phone = (args.p_recipient_phone as string | null) ?? row.recipient_phone;
    row.last_error_code = (args.p_error_code as string | null) ?? null;
    row.last_error = ((args.p_error as string | null) ?? "").slice(0, 500);
    row.next_attempt_at = new Date(this.now.getTime() + backoffMs).toISOString();
    row.updated_at = this.iso();
    return [{ ...row }];
  }

  /** Mirrors the timezone-aware atomic sweep. */
  private expireDue(args: Record<string, unknown>) {
    const limit = Number(args.p_limit ?? 500);
    const out: { membership_id: string; member_id: string; gym_id: string; should_notify: boolean }[] = [];

    const todayIn = (tz: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
        this.now
      );

    for (const m of this.memberships.values()) {
      if (out.length >= limit) break;
      if (m.status !== "active") continue;
      const tz = this.gyms.get(m.gym_id)?.timezone ?? "Asia/Kolkata";
      if (!(m.end_date < todayIn(tz))) continue;

      m.status = "expired";
      m.expired_at = this.iso();
      m.is_current = false;

      const covered = [...this.memberships.values()].some((other) => {
        if (other.member_id !== m.member_id || other.id === m.id) return false;
        if (other.status !== "active") return false;
        const otherTz = this.gyms.get(other.gym_id)?.timezone ?? "Asia/Kolkata";
        return other.end_date >= todayIn(otherTz);
      });

      out.push({ membership_id: m.id, member_id: m.member_id, gym_id: m.gym_id, should_notify: !covered });
    }

    return out;
  }

  private dueNotifications(args: Record<string, unknown>) {
    const limit = Number(args.p_limit ?? 100);
    return this.notifications
      .filter(
        (n) =>
          (n.status === "pending" || n.status === "failed") &&
          n.attempts < n.max_attempts &&
          new Date(n.next_attempt_at).getTime() <= this.now.getTime()
      )
      .sort((a, b) => a.next_attempt_at.localeCompare(b.next_attempt_at))
      .slice(0, limit)
      .map((n) => ({ id: n.id, membership_id: n.membership_id, kind: n.kind, channel: n.channel, attempts: n.attempts }));
  }
}

/** Typed as `any` at the boundary: this deliberately implements only the
 *  narrow slice of the SupabaseClient surface the lifecycle code touches. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asAdminClient(db: FakeSupabase): any {
  return db;
}
