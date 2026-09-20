-- ============================================================================
-- Schedule the subscription expiry + notification retry sweep.
--
-- ONLY APPLY THIS IF YOU ARE **NOT** USING VERCEL CRON.
--   vercel.json already schedules /api/cron/subscription-expiry. Running both
--   is harmless (the sweep is idempotent — see migration 0025), but it is
--   pointless load. Pick one.
--
-- TIMEZONE
--   pg_cron schedules are interpreted in the database's timezone, which on
--   Supabase is UTC. The expiry predicate itself is evaluated per-gym in
--   `expire_due_memberships()` using `gyms.timezone`, so the schedule only
--   controls *how soon after local midnight* a member hears from us.
--
--   18:30 UTC = 00:00 IST  -> catches expiries right at the IST day boundary.
--   02:00 UTC = 07:30 IST  -> a second daily pass, so a single failed run never
--                             costs a member their message. Re-running is safe.
--
--   The retry sweep runs hourly so a transient Meta outage recovers within the
--   hour rather than waiting a full day.
--
-- BEFORE APPLYING
--   Replace <APP_URL> (e.g. https://app.atpfitness.in — no trailing slash) and
--   <CRON_SECRET> (the same value as CRON_SECRET in your deployment env).
--   Supabase does not allow reading secrets from inside a migration, so these
--   placeholders must be substituted by hand.
-- ============================================================================

create extension if not exists pg_net;

-- Idempotent: drop any previous definition so re-applying doesn't duplicate.
select cron.unschedule('subscription-expiry-midnight-ist')
  where exists (select 1 from cron.job where jobname = 'subscription-expiry-midnight-ist');
select cron.unschedule('subscription-expiry-morning-ist')
  where exists (select 1 from cron.job where jobname = 'subscription-expiry-morning-ist');
select cron.unschedule('subscription-notification-retry')
  where exists (select 1 from cron.job where jobname = 'subscription-notification-retry');

select cron.schedule(
  'subscription-expiry-midnight-ist',
  '30 18 * * *', -- 00:00 Asia/Kolkata
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/subscription-expiry',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'subscription-expiry-morning-ist',
  '0 2 * * *', -- 07:30 Asia/Kolkata — safety net for a missed midnight run
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/subscription-expiry',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Hourly retry pass for notifications that failed retryably (Meta 5xx, rate
-- limits, network blips). Bounded by max_attempts in the ledger.
select cron.schedule(
  'subscription-notification-retry',
  '15 * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/subscription-expiry',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
