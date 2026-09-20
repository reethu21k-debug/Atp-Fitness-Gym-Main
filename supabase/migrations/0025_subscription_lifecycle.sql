-- ============================================================================
-- GymOS / ATP Fitness — Part 25: Subscription lifecycle + WhatsApp notification
-- ledger.
--
-- WHY THIS EXISTS
--   Before this migration, a membership period had no lifecycle state of its
--   own: `member_memberships` only had `is_current`, and nothing anywhere in
--   the codebase ever transitioned a period to "expired". Expiry was derived
--   on the fly in reports (`end_date < current_date`), which means a member
--   could never be *told* their subscription ended — there was no event to
--   hang a notification off.
--
--   It also had no way to remember that a given notification had already been
--   delivered. The only de-dupe was `renewal_reminder_log`, which is keyed to
--   reminder *windows* (7d/3d/1d/on_expiry) and is written when EITHER the
--   email or the WhatsApp send succeeds — so an email success plus a WhatsApp
--   failure permanently swallowed the WhatsApp message.
--
-- WHAT THIS ADDS
--   1. `member_memberships.status` / `activated_at` / `expired_at` — real
--      lifecycle state for a membership period.
--   2. `subscription_notifications` — a persistent, uniquely-keyed ledger of
--      "we have sent (or tried to send) notification <kind> for membership
--      <id> over channel <channel>". This is the single source of truth for
--      idempotency. Nothing in this system relies on in-memory state.
--   3. `claim_subscription_notification()` — an atomic lease-and-claim so that
--      concurrent senders (double webhook, double cron, two server instances,
--      a restart mid-send) can never both win the right to send.
--   4. `complete_subscription_notification()` — records the outcome, including
--      the provider message id, and schedules bounded exponential backoff for
--      retryable failures only.
--   5. `expire_due_memberships()` — the atomic expiry sweep, timezone-aware
--      per gym, that flips due periods to 'expired' and tells the caller which
--      of them the member should actually be notified about.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. MEMBERSHIP LIFECYCLE STATE
-- ----------------------------------------------------------------------------

create type public.membership_period_status as enum ('active', 'expired', 'cancelled');

alter table public.member_memberships
  add column if not exists status public.membership_period_status not null default 'active',
  add column if not exists activated_at timestamptz,
  add column if not exists expired_at timestamptz;

-- Backfill: anything already past its end date is expired; everything else is
-- active and was activated when the row was created.
update public.member_memberships
   set status = case
         when end_date < current_date then 'expired'::public.membership_period_status
         else 'active'::public.membership_period_status
       end,
       activated_at = coalesce(activated_at, created_at),
       expired_at = case
         when end_date < current_date then coalesce(expired_at, (end_date + 1)::timestamptz)
         else expired_at
       end;

-- The expiry sweep scans exactly this predicate, so index it.
create index if not exists idx_memberships_status_end_date
  on public.member_memberships(status, end_date)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- 2. NOTIFICATION LEDGER
-- ----------------------------------------------------------------------------

create type public.subscription_notification_kind as enum ('activation', 'expiry');
create type public.subscription_notification_status as enum ('pending', 'sent', 'failed', 'skipped');

create table public.subscription_notifications (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.member_memberships(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  kind public.subscription_notification_kind not null,
  channel text not null default 'whatsapp',

  status public.subscription_notification_status not null default 'pending',

  -- Delivery metadata. `provider_message_id` is Meta's wamid.* — recorded so a
  -- send can be traced end-to-end and correlated with delivery webhooks.
  recipient_phone text,
  provider_message_id text,
  provider_status text,

  attempts int not null default 0,
  max_attempts int not null default 5,
  last_error_code text,
  last_error text,

  first_attempt_at timestamptz,
  last_attempt_at timestamptz,
  -- Doubles as the retry schedule AND the claim lease: a claimed row has this
  -- pushed into the future, so a concurrent claimer is refused.
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- THE idempotency guarantee. One notification of a given kind per
  -- membership period per channel. Enforced by Postgres, not by application
  -- code, so it holds across processes, instances and restarts.
  unique (membership_id, kind, channel)
);

create index idx_sub_notifications_gym on public.subscription_notifications(gym_id);
create index idx_sub_notifications_message_id on public.subscription_notifications(provider_message_id)
  where provider_message_id is not null;
-- Drives the retry sweep.
create index idx_sub_notifications_retry on public.subscription_notifications(next_attempt_at)
  where status in ('pending', 'failed');

create trigger trg_sub_notifications_updated_at before update on public.subscription_notifications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. ATOMIC CLAIM
--
-- Returns a row only to the caller that wins the right to send. Everyone else
-- gets zero rows and must not send.
--
-- Refuses when the notification is already 'sent' or 'skipped', when the retry
-- budget is exhausted (no infinite retry loops), or when another sender holds
-- an unexpired lease.
--
-- The INSERT ... ON CONFLICT DO UPDATE ... WHERE form is what makes this safe:
-- Postgres takes a row lock on conflict, so a concurrent claimer blocks and
-- then re-evaluates the WHERE against the winner's committed row.
--
-- Deliberately `returns setof` rather than a bare composite: a plpgsql function
-- declared `returns public.subscription_notifications` hands back a row of all
-- NULLs when nothing was claimed, which PostgREST serialises as an object, not
-- as null — so the caller cannot tell "claimed" from "refused". SETOF makes it
-- unambiguous: zero rows means refused, one row means claimed.
-- ----------------------------------------------------------------------------

create or replace function public.claim_subscription_notification(
  p_membership_id uuid,
  p_kind public.subscription_notification_kind,
  p_channel text default 'whatsapp',
  p_lease_seconds int default 300
)
returns setof public.subscription_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gym_id uuid;
  v_member_id uuid;
  v_row public.subscription_notifications;
begin
  select gym_id, member_id into v_gym_id, v_member_id
    from public.member_memberships
   where id = p_membership_id;

  if v_gym_id is null then
    return;
  end if;

  insert into public.subscription_notifications as sn (
    membership_id, gym_id, member_id, kind, channel,
    status, attempts, first_attempt_at, last_attempt_at, next_attempt_at
  )
  values (
    p_membership_id, v_gym_id, v_member_id, p_kind, p_channel,
    'pending', 1, now(), now(), now() + make_interval(secs => p_lease_seconds)
  )
  on conflict (membership_id, kind, channel) do update
    set attempts        = sn.attempts + 1,
        status          = 'pending',
        last_attempt_at = now(),
        next_attempt_at = now() + make_interval(secs => p_lease_seconds),
        updated_at      = now()
    where sn.status in ('pending', 'failed')
      and sn.attempts < sn.max_attempts
      and sn.next_attempt_at <= now()
  returning sn.* into v_row;

  if v_row.id is null then
    return;
  end if;

  return next v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RECORD THE OUTCOME
--
-- p_retryable = false marks a permanent failure (bad phone number, bad
-- template, revoked token) and burns the remaining retry budget so the sweep
-- stops picking it up. p_retryable = true schedules bounded exponential
-- backoff: 5m, 10m, 20m, 40m, capped at 6h.
-- ----------------------------------------------------------------------------

create or replace function public.complete_subscription_notification(
  p_id uuid,
  p_success boolean,
  p_message_id text default null,
  p_recipient_phone text default null,
  p_error_code text default null,
  p_error text default null,
  p_retryable boolean default true
)
returns setof public.subscription_notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.subscription_notifications;
  v_backoff interval;
begin
  if p_success then
    update public.subscription_notifications
       set status = 'sent',
           sent_at = now(),
           provider_message_id = coalesce(p_message_id, provider_message_id),
           recipient_phone = coalesce(p_recipient_phone, recipient_phone),
           last_error_code = null,
           last_error = null,
           updated_at = now()
     where id = p_id
    returning * into v_row;

    if v_row.id is null then
      return;
    end if;
    return next v_row;
    return;
  end if;

  select least(
           make_interval(secs => 300 * power(2, greatest(attempts - 1, 0))::int),
           interval '6 hours'
         )
    into v_backoff
    from public.subscription_notifications
   where id = p_id;

  update public.subscription_notifications
     set status = case
           when not p_retryable then 'skipped'::public.subscription_notification_status
           when attempts >= max_attempts then 'failed'::public.subscription_notification_status
           else 'failed'::public.subscription_notification_status
         end,
         -- A permanent failure burns the budget so the retry sweep skips it.
         attempts = case when not p_retryable then max_attempts else attempts end,
         recipient_phone = coalesce(p_recipient_phone, recipient_phone),
         last_error_code = p_error_code,
         last_error = left(coalesce(p_error, ''), 500),
         next_attempt_at = now() + coalesce(v_backoff, interval '5 minutes'),
         updated_at = now()
   where id = p_id
  returning * into v_row;

  if v_row.id is null then
    return;
  end if;

  return next v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. ATOMIC EXPIRY SWEEP
--
-- "Due" is evaluated in the OWNING GYM'S timezone (gyms.timezone, default
-- Asia/Kolkata), not in UTC and not in the server's local zone. A membership
-- ending 2026-03-31 stays valid through 23:59:59 IST on the 31st and becomes
-- due at 00:00 IST on 2026-04-01.
--
-- The UPDATE is a single statement, so two concurrent runs cannot both expire
-- the same row: the second re-checks `status = 'active'` against the winner's
-- committed row and matches nothing.
--
-- `should_notify` is false when the member already holds another membership
-- still covering today — i.e. they renewed, so the old period ending is an
-- internal bookkeeping event, not something to message them about.
-- ----------------------------------------------------------------------------

create or replace function public.expire_due_memberships(p_limit int default 500)
returns table (
  membership_id uuid,
  member_id uuid,
  gym_id uuid,
  should_notify boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_notify boolean;
begin
  for r in
    update public.member_memberships m
       set status = 'expired',
           expired_at = now(),
           is_current = false,
           updated_at = now()
     where m.id in (
       select mm.id
         from public.member_memberships mm
         join public.gyms g on g.id = mm.gym_id
        where mm.status = 'active'
          and mm.end_date < ((now() at time zone coalesce(nullif(g.timezone, ''), 'Asia/Kolkata'))::date)
        order by mm.end_date asc
        limit p_limit
        for update of mm skip locked
     )
       and m.status = 'active'
    returning m.id, m.member_id, m.gym_id
  loop
    select not exists (
      select 1
        from public.member_memberships other
        join public.gyms g2 on g2.id = other.gym_id
       where other.member_id = r.member_id
         and other.id <> r.id
         and other.status = 'active'
         and other.end_date >= ((now() at time zone coalesce(nullif(g2.timezone, ''), 'Asia/Kolkata'))::date)
    ) into v_notify;

    -- Only flip the member's own status when nothing else is covering them.
    if v_notify then
      update public.member_details
         set status = 'expired', updated_at = now()
       where profile_id = r.member_id
         and status = 'active';
    end if;

    membership_id := r.id;
    member_id := r.member_id;
    gym_id := r.gym_id;
    should_notify := v_notify;
    return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RETRY SWEEP SOURCE
--
-- Rows whose lease has lapsed and whose retry budget is intact.
-- ----------------------------------------------------------------------------

create or replace function public.due_subscription_notifications(p_limit int default 100)
returns table (
  id uuid,
  membership_id uuid,
  kind public.subscription_notification_kind,
  channel text,
  attempts int
)
language sql
stable
security definer
set search_path = public
as $$
  select sn.id, sn.membership_id, sn.kind, sn.channel, sn.attempts
    from public.subscription_notifications sn
   where sn.status in ('pending', 'failed')
     and sn.attempts < sn.max_attempts
     and sn.next_attempt_at <= now()
   order by sn.next_attempt_at asc
   limit p_limit;
$$;

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
--
-- The ledger is written exclusively by service-role code (server actions, cron
-- route handlers). Gym staff may read their own gym's rows so the failures are
-- visible in the dashboard; nobody but service-role may write.
-- ----------------------------------------------------------------------------

alter table public.subscription_notifications enable row level security;

create policy "sub_notifications_select" on public.subscription_notifications for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );

-- No insert/update/delete policies: anon/authenticated roles cannot write.

revoke all on function public.claim_subscription_notification(uuid, public.subscription_notification_kind, text, int) from public, anon, authenticated;
revoke all on function public.complete_subscription_notification(uuid, boolean, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.expire_due_memberships(int) from public, anon, authenticated;
revoke all on function public.due_subscription_notifications(int) from public, anon, authenticated;

grant execute on function public.claim_subscription_notification(uuid, public.subscription_notification_kind, text, int) to service_role;
grant execute on function public.complete_subscription_notification(uuid, boolean, text, text, text, text, boolean) to service_role;
grant execute on function public.expire_due_memberships(int) to service_role;
grant execute on function public.due_subscription_notifications(int) to service_role;
