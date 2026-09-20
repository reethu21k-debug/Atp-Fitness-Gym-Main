-- ============================================================================
-- Subscription lifecycle SQL tests (migration 0025).
--
-- Run via:  tests/sql/run.sh tests/sql/subscription_lifecycle_test.sql
--
-- Every assertion raises an exception on failure, so ON_ERROR_STOP makes the
-- whole run fail loudly. Covers:
--   T1  claim grants exactly once
--   T2  claim is refused while a lease is held  (double webhook / double cron)
--   T3  claim is refused after success           (duplicate protection)
--   T4  failed claims are retryable after backoff, with bounded attempts
--   T5  permanent failures burn the retry budget (no infinite loops)
--   T6  expiry sweep is timezone-aware (Asia/Kolkata boundary)
--   T7  expiry sweep is atomic under repeat execution
--   T8  a renewed member's superseded period expires WITHOUT notification
--   T9  message id round-trips into the ledger
-- ============================================================================

\set ON_ERROR_STOP on

create or replace function assert(cond boolean, label text) returns void
language plpgsql as $$
begin
  if cond is not true then
    raise exception 'ASSERTION FAILED: %', label;
  end if;
  raise notice '  ok  %', label;
end $$;

-- ----------------------------------------------------------------------------
-- Seed
-- ----------------------------------------------------------------------------
do $$
declare
  v_tenant uuid := gen_random_uuid();
  v_gym uuid := gen_random_uuid();
  v_plan uuid := gen_random_uuid();
begin
  insert into public.tenants (id, name, slug) values (v_tenant, 'Test Tenant', 'test-tenant');
  -- Explicit IST gym: the expiry boundary must be evaluated here, not in UTC.
  insert into public.gyms (id, tenant_id, name, code, timezone)
    values (v_gym, v_tenant, 'ATP Fitness Anantapur', 'ATP1', 'Asia/Kolkata');
  insert into public.membership_plans (id, gym_id, name, duration_days, price)
    values (v_plan, v_gym, 'Gold', 30, 3000);

  perform set_config('test.tenant_id', v_tenant::text, false);
  perform set_config('test.gym_id', v_gym::text, false);
  perform set_config('test.plan_id', v_plan::text, false);
end $$;

create or replace function make_member(p_label text) returns uuid
language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  -- The on_auth_user_created trigger inserts the profile row; the app then
  -- fills in tenant/gym, exactly as lib/actions/member.actions.ts does.
  insert into auth.users (id, email, phone) values (v_id, p_label || '@example.test', '+91 95501 92069');
  update public.profiles
     set tenant_id = current_setting('test.tenant_id')::uuid,
         gym_id = current_setting('test.gym_id')::uuid,
         role = 'member',
         full_name = initcap(p_label)
   where id = v_id;
  insert into public.member_details (profile_id, gym_id) values (v_id, current_setting('test.gym_id')::uuid);
  return v_id;
end $$;

create or replace function make_membership(p_member uuid, p_start date, p_end date) returns uuid
language plpgsql as $$
declare v_id uuid;
begin
  insert into public.member_memberships (member_id, gym_id, plan_id, start_date, end_date, amount, amount_paid, payment_status, is_current)
  values (p_member, current_setting('test.gym_id')::uuid, current_setting('test.plan_id')::uuid,
          p_start, p_end, 3000, 3000, 'paid', true)
  returning id into v_id;
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- T1 / T2 / T3 / T9 — claim + duplicate protection
-- ----------------------------------------------------------------------------
do $$
declare
  v_member uuid := make_member('t1');
  v_mem uuid;
  v_first public.subscription_notifications;
  v_second public.subscription_notifications;
  v_done public.subscription_notifications;
begin
  raise notice 'T1/T2/T3/T9 — activation claim + duplicate protection';
  v_mem := make_membership(v_member, current_date, current_date + 30);

  select * into v_first from public.claim_subscription_notification(v_mem, 'activation');
  perform assert(v_first.id is not null, 'T1 first claim is granted');
  perform assert(v_first.attempts = 1, 'T1 first claim records attempt 1');
  perform assert(v_first.status = 'pending', 'T1 first claim is pending');

  -- Second caller arrives while the first still holds the lease: payment
  -- endpoint called twice, webhook redelivered, two server instances, etc.
  select * into v_second from public.claim_subscription_notification(v_mem, 'activation');
  perform assert(v_second.id is null, 'T2 concurrent claim is refused while lease is held');

  select * into v_done from public.complete_subscription_notification(
    v_first.id, true, 'wamid.TEST_ACTIVATION_1', '919550192069');
  perform assert(v_done.status = 'sent', 'T3 completion marks sent');
  perform assert(v_done.provider_message_id = 'wamid.TEST_ACTIVATION_1', 'T9 provider message id is recorded');
  perform assert(v_done.sent_at is not null, 'T9 sent_at timestamp is recorded');
  perform assert(v_done.recipient_phone = '919550192069', 'T9 recipient phone is recorded');

  -- Everything after a success must be refused, forever.
  perform assert(not exists (select 1 from public.claim_subscription_notification(v_mem, 'activation')),
                 'T3 claim after success is refused (no duplicate message)');

  -- Even after any lease would have lapsed.
  update public.subscription_notifications set next_attempt_at = now() - interval '1 day' where id = v_first.id;
  perform assert(not exists (select 1 from public.claim_subscription_notification(v_mem, 'activation')),
                 'T3 claim after success stays refused once the lease lapses');

  -- Exactly one ledger row exists for this membership + kind.
  perform assert(
    (select count(*) from public.subscription_notifications where membership_id = v_mem and kind = 'activation') = 1,
    'T3 exactly one activation ledger row exists');

  -- The expiry notification is a different kind and is NOT blocked by it.
  perform assert(exists (select 1 from public.claim_subscription_notification(v_mem, 'expiry')),
                 'T3 expiry claim is independent of activation');
end $$;

-- ----------------------------------------------------------------------------
-- T4 / T5 — retry behaviour
-- ----------------------------------------------------------------------------
do $$
declare
  v_member uuid := make_member('t4');
  v_mem uuid;
  v_c public.subscription_notifications;
  v_r public.subscription_notifications;
  v_prev timestamptz;
begin
  raise notice 'T4/T5 — retry + backoff';
  v_mem := make_membership(v_member, current_date, current_date + 30);

  -- Retryable failure (5xx / rate limit / network).
  select * into v_c from public.claim_subscription_notification(v_mem, 'activation');
  select * into v_r from public.complete_subscription_notification(v_c.id, false, null, null, '500', 'Meta API responded 500', true);
  perform assert(v_r.status = 'failed', 'T4 retryable failure is marked failed');
  perform assert(v_r.next_attempt_at > now(), 'T4 retryable failure is scheduled for the future');
  perform assert(v_r.last_error_code = '500', 'T4 error code is recorded');

  -- Not yet due -> refused. No hot-looping.
  perform assert(not exists (select 1 from public.claim_subscription_notification(v_mem, 'activation')),
                 'T4 retry is refused before backoff elapses');

  -- Once due -> granted again.
  update public.subscription_notifications set next_attempt_at = now() - interval '1 second' where id = v_c.id;
  select * into v_r from public.claim_subscription_notification(v_mem, 'activation');
  perform assert(v_r.id is not null, 'T4 retry is granted after backoff elapses');
  perform assert(v_r.attempts = 2, 'T4 attempt counter increments');

  -- Backoff must grow, not stay flat.
  select * into v_r from public.complete_subscription_notification(v_c.id, false, null, null, '503', 'unavailable', true);
  v_prev := v_r.next_attempt_at;
  perform assert(v_prev > now() + interval '9 minutes', 'T4 backoff grows exponentially (attempt 2 >= 10m)');

  -- Exhaust the budget: attempts must stop at max_attempts.
  update public.subscription_notifications
     set attempts = max_attempts, next_attempt_at = now() - interval '1 day'
   where id = v_c.id;
  perform assert(not exists (select 1 from public.claim_subscription_notification(v_mem, 'activation')),
                 'T4 claim refused once retry budget is exhausted (no infinite loop)');

  -- T5: a permanent failure burns the budget immediately.
  update public.subscription_notifications
     set attempts = 1, status = 'failed', next_attempt_at = now() - interval '1 day'
   where id = v_c.id;
  select * into v_r from public.complete_subscription_notification(
    v_c.id, false, null, null, '132001', 'Template name does not exist', false);
  perform assert(v_r.status = 'skipped', 'T5 permanent failure is marked skipped');
  perform assert(v_r.attempts = v_r.max_attempts, 'T5 permanent failure burns the retry budget');
  perform assert(not exists (select 1 from public.claim_subscription_notification(v_mem, 'activation')),
                 'T5 permanent failure is never retried');
end $$;

-- ----------------------------------------------------------------------------
-- T6 / T7 — timezone-aware, atomic expiry sweep
-- ----------------------------------------------------------------------------
do $$
declare
  v_member uuid := make_member('t6');
  v_ends_today uuid;
  v_ends_yesterday uuid;
  v_member2 uuid := make_member('t6b');
  v_ist_today date;
  v_rows int;
  v_first_run int;
  v_second_run int;
begin
  raise notice 'T6/T7 — timezone-aware atomic expiry';
  v_ist_today := (now() at time zone 'Asia/Kolkata')::date;

  -- Ends TODAY in IST: still valid, must NOT expire (this is the off-by-one a
  -- UTC-based sweep gets wrong between 18:30 and 00:00 IST).
  v_ends_today := make_membership(v_member, v_ist_today - 30, v_ist_today);
  -- Ended YESTERDAY in IST: due.
  v_ends_yesterday := make_membership(v_member2, v_ist_today - 31, v_ist_today - 1);

  select count(*) into v_first_run from public.expire_due_memberships(100);

  perform assert(
    (select status from public.member_memberships where id = v_ends_today) = 'active',
    'T6 membership ending today (IST) stays active');
  perform assert(
    (select status from public.member_memberships where id = v_ends_yesterday) = 'expired',
    'T6 membership ended yesterday (IST) is expired');
  perform assert(
    (select expired_at from public.member_memberships where id = v_ends_yesterday) is not null,
    'T6 expired_at is stamped');
  perform assert(
    (select status from public.member_details where profile_id = v_member2) = 'expired',
    'T6 member_details.status follows the membership');

  -- T7: running the sweep again must not re-emit the same membership.
  select count(*) into v_second_run from public.expire_due_memberships(100);
  perform assert(v_second_run = 0, 'T7 repeat sweep returns nothing (idempotent)');
  perform assert(
    (select status from public.member_memberships where id = v_ends_yesterday) = 'expired',
    'T7 membership remains expired after repeat sweep');
end $$;

-- ----------------------------------------------------------------------------
-- T8 — renewed member: old period expires quietly
-- ----------------------------------------------------------------------------
do $$
declare
  v_member uuid := make_member('t8');
  v_old uuid;
  v_new uuid;
  v_ist_today date := (now() at time zone 'Asia/Kolkata')::date;
  rec record;
  v_notify boolean;
begin
  raise notice 'T8 — renewed member is not told their old period ended';
  v_old := make_membership(v_member, v_ist_today - 40, v_ist_today - 2);
  v_new := make_membership(v_member, v_ist_today - 1, v_ist_today + 29);

  select should_notify into v_notify
    from public.expire_due_memberships(100)
   where membership_id = v_old;

  perform assert(v_notify is false, 'T8 superseded period is expired without notifying');
  perform assert((select status from public.member_memberships where id = v_old) = 'expired',
                 'T8 superseded period is still marked expired');
  perform assert((select status from public.member_memberships where id = v_new) = 'active',
                 'T8 renewed period stays active');
  perform assert((select status from public.member_details where profile_id = v_member) = 'active',
                 'T8 renewed member stays active');
end $$;

-- ----------------------------------------------------------------------------
-- Due-notification sweep returns only actionable rows
-- ----------------------------------------------------------------------------
do $$
declare v_count int;
begin
  raise notice 'T10 — retry sweep selects only actionable rows';
  select count(*) into v_count
    from public.due_subscription_notifications(100) d
    join public.subscription_notifications sn on sn.id = d.id
   where sn.status = 'sent' or sn.attempts >= sn.max_attempts or sn.next_attempt_at > now();
  perform assert(v_count = 0, 'T10 sweep never returns sent/exhausted/not-yet-due rows');
end $$;

do $$ begin raise notice 'ALL SQL LIFECYCLE TESTS PASSED'; end $$;
