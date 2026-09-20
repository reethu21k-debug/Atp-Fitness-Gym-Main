-- ============================================================================
-- Local test harness — emulates the Supabase-provided primitives that the
-- migrations in supabase/migrations/ assume are already present, so those
-- migration files can be applied verbatim against a plain PostgreSQL instance
-- and the subscription-lifecycle SQL can be exercised for real.
--
-- This file is NOT applied to the hosted database. It exists purely so
-- `tests/sql/run.sh` can stand up a throwaway schema.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Supabase's built-in roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Supabase's auth schema: only the pieces the migrations reference.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Test-controllable current user.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

-- pg_cron is not available here; the scheduling migrations are skipped by the
-- runner, but stub the schema so anything referencing it parses.
create schema if not exists cron;
create or replace function cron.schedule(text, text, text) returns bigint
language sql as $$ select 0::bigint $$;

-- Supabase realtime publication (referenced by 0020).
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

create or replace function cron.unschedule(text) returns boolean
language sql as $$ select true $$;

create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint language sql as $$ select 0::bigint $$;
create or replace function net.http_get(url text, headers jsonb default '{}'::jsonb)
returns bigint language sql as $$ select 0::bigint $$;
