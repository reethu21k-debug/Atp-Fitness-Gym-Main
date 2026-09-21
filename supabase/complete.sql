

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";

-- ============================================================================
-- ENUMS
-- ============================================================================

create type public.app_role as enum (
  'super_admin',
  'gym_owner',
  'receptionist',
  'trainer',
  'member'
);

create type public.subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'suspended'
);

create type public.member_status as enum (
  'active', 'inactive', 'expired', 'frozen', 'cancelled'
);

-- ============================================================================
-- PLATFORM: TENANTS (Gym Businesses) & BRANCHES
-- A "tenant" is the top-level owner account (one owner -> many gyms/branches)
-- ============================================================================

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  owner_id uuid, -- fk added after profiles table exists
  logo_url text,
  primary_color text default '#6366F1',
  subscription_plan text not null default 'trial',
  subscription_status public.subscription_status not null default 'trialing',
  trial_ends_at timestamptz default (now() + interval '14 days'),
  feature_flags jsonb not null default '{}'::jsonb,
  billing_email text,
  is_white_label boolean not null default false,
  custom_domain text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  city text,
  state text,
  country text default 'India',
  postal_code text,
  phone text,
  email text,
  timezone text default 'Asia/Kolkata',
  latitude double precision,
  longitude double precision,
  gps_checkin_radius_meters int default 200,
  opening_hours jsonb default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index idx_gyms_tenant on public.gyms(tenant_id);

-- ============================================================================
-- PROFILES (extends auth.users) + ROLE ASSIGNMENT
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete set null,
  role public.app_role not null default 'member',
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  two_factor_enabled boolean not null default false,
  two_factor_secret text,
  must_reset_password boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_tenant on public.profiles(tenant_id);
create index idx_profiles_gym on public.profiles(gym_id);
create index idx_profiles_role on public.profiles(role);

alter table public.tenants
  add constraint tenants_owner_fk foreign key (owner_id) references public.profiles(id) on delete set null;

-- Per-gym permission overrides (fine-grained RBAC beyond the 5 base roles)
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  resource text not null,      -- e.g. 'members', 'revenue_reports', 'settings'
  action text not null,        -- e.g. 'create', 'read', 'update', 'delete'
  allowed boolean not null default true,
  unique (role, resource, action)
);

create table public.staff_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resource text not null,
  action text not null,
  allowed boolean not null,
  created_at timestamptz not null default now(),
  unique (profile_id, resource, action)
);

-- ============================================================================
-- AUDIT LOG (every sensitive action)
-- ============================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index idx_audit_tenant on public.audit_logs(tenant_id, created_at desc);

-- ============================================================================
-- SUPPORT TICKETS (Super Admin <-> Gym Owners)
-- ============================================================================

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  subject text not null,
  description text not null,
  status text not null default 'open', -- open, in_progress, resolved, closed
  priority text not null default 'normal',
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- updated_at trigger helper (reused across all tables)
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_updated_at before update on public.tenants
  for each row execute function public.set_updated_at();
create trigger trg_gyms_updated_at before update on public.gyms
  for each row execute function public.set_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

-- ============================================================================
-- AUTH HELPER FUNCTIONS (used throughout every RLS policy in the project)
-- SECURITY DEFINER so they can read profiles without recursive RLS issues
-- ============================================================================

create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_gym_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select gym_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.is_gym_owner_or_above()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin','gym_owner')
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('super_admin','gym_owner','receptionist','trainer')
  );
$$;

create or replace function public.has_permission(p_resource text, p_action text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.app_role;
  v_override boolean;
  v_default boolean;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then return false; end if;
  if v_role = 'super_admin' then return true; end if;

  select allowed into v_override
  from public.staff_permission_overrides
  where profile_id = auth.uid() and resource = p_resource and action = p_action;

  if v_override is not null then return v_override; end if;

  select allowed into v_default
  from public.permissions
  where role = v_role and resource = p_resource and action = p_action;

  return coalesce(v_default, false);
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.tenants enable row level security;
alter table public.gyms enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.staff_permission_overrides enable row level security;
alter table public.audit_logs enable row level security;
alter table public.support_tickets enable row level security;

-- TENANTS: super admin sees all; owner sees their own tenant; staff/members see their own tenant read-only
create policy "tenants_select" on public.tenants for select
  using (public.is_super_admin() or id = public.current_tenant_id());

create policy "tenants_insert_super_admin" on public.tenants for insert
  with check (public.is_super_admin());

create policy "tenants_update" on public.tenants for update
  using (public.is_super_admin() or (owner_id = auth.uid()))
  with check (public.is_super_admin() or (owner_id = auth.uid()));

create policy "tenants_delete_super_admin" on public.tenants for delete
  using (public.is_super_admin());

-- GYMS: scoped to tenant
create policy "gyms_select" on public.gyms for select
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());

create policy "gyms_insert" on public.gyms for insert
  with check (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.current_role() = 'gym_owner'));

create policy "gyms_update" on public.gyms for update
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.current_role() = 'gym_owner'));

create policy "gyms_delete" on public.gyms for delete
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.current_role() = 'gym_owner'));

-- PROFILES: users see themselves; staff see everyone in their tenant; super admin sees all
create policy "profiles_select" on public.profiles for select
  using (
    public.is_super_admin()
    or id = auth.uid()
    or tenant_id = public.current_tenant_id()
  );

create policy "profiles_insert" on public.profiles for insert
  with check (
    public.is_super_admin()
    or id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.is_staff())
  );

create policy "profiles_update" on public.profiles for update
  using (
    public.is_super_admin()
    or id = auth.uid()
    or (tenant_id = public.current_tenant_id() and public.current_role() in ('gym_owner','receptionist'))
  );

create policy "profiles_delete" on public.profiles for delete
  using (public.is_super_admin() or public.current_role() = 'gym_owner');

-- PERMISSIONS (global default matrix): readable by all authenticated, writable by super admin only
create policy "permissions_select" on public.permissions for select using (true);
create policy "permissions_write_super_admin" on public.permissions for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- STAFF OVERRIDES: gym owner manages their own staff; super admin manages all
create policy "overrides_select" on public.staff_permission_overrides for select
  using (
    public.is_super_admin()
    or profile_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = profile_id and p.tenant_id = public.current_tenant_id())
  );
create policy "overrides_write" on public.staff_permission_overrides for all
  using (public.is_super_admin() or public.current_role() = 'gym_owner')
  with check (public.is_super_admin() or public.current_role() = 'gym_owner');

-- AUDIT LOGS: read-only to tenant admins, insert by any authenticated staff action (via server actions/service role)
create policy "audit_select" on public.audit_logs for select
  using (public.is_super_admin() or (tenant_id = public.current_tenant_id() and public.current_role() = 'gym_owner'));
create policy "audit_insert" on public.audit_logs for insert
  with check (auth.uid() is not null);

-- SUPPORT TICKETS
create policy "tickets_select" on public.support_tickets for select
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());
create policy "tickets_insert" on public.support_tickets for insert
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());
create policy "tickets_update" on public.support_tickets for update
  using (public.is_super_admin() or tenant_id = public.current_tenant_id());

-- ============================================================================
-- SEED DEFAULT PERMISSION MATRIX
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','members','create',true), ('gym_owner','members','read',true),
  ('gym_owner','members','update',true), ('gym_owner','members','delete',true),
  ('gym_owner','revenue_reports','read',true), ('gym_owner','settings','update',true),
  ('receptionist','members','create',true), ('receptionist','members','read',true),
  ('receptionist','members','update',true), ('receptionist','members','delete',false),
  ('receptionist','revenue_reports','read',false), ('receptionist','settings','update',false),
  ('receptionist','payments','create',true), ('receptionist','attendance','create',true),
  ('trainer','workout_plans','create',true), ('trainer','workout_plans','read',true),
  ('trainer','diet_plans','create',true), ('trainer','members','read',true),
  ('trainer','members','update',false), ('trainer','members','delete',false),
  ('member','profile','read',true), ('member','profile','update',true)
on conflict (role, resource, action) do nothing;

-- ============================================================================
-- HANDLE NEW AUTH USER -> auto-create profile row
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.phone,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();


-- ===========================================================================
-- FILE: 0002_marketing_leads.sql
-- ===========================================================================
-- ============================================================================
-- Marketing site contact form submissions.
-- These are anonymous, pre-tenant leads — distinct from support_tickets,
-- which are always scoped to an existing tenant.
-- ============================================================================

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  gym_name text,
  message text not null,
  status text not null default 'new', -- new, contacted, converted, dismissed
  created_at timestamptz not null default now()
);

create index idx_marketing_leads_status on public.marketing_leads(status, created_at desc);

alter table public.marketing_leads enable row level security;

-- Anyone (anonymous visitors) can submit; only super admins can read/manage.
-- Inserts happen exclusively via the service-role client in the contact
-- Server Action, so no public insert policy is needed here.
create policy "marketing_leads_select_super_admin" on public.marketing_leads for select
  using (public.is_super_admin());

create policy "marketing_leads_update_super_admin" on public.marketing_leads for update
  using (public.is_super_admin());


-- ===========================================================================
-- FILE: 0003_members_module.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 3: Members Module
-- membership_plans, member_details (extends profiles for role=member),
-- member_memberships, member_documents
-- ============================================================================

create type public.payment_status as enum ('paid', 'partial', 'pending', 'refunded');
create type public.gender as enum ('male', 'female', 'other', 'prefer_not_to_say');
create type public.blood_group as enum ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown');

-- ============================================================================
-- MEMBERSHIP PLANS (per-gym catalog: 1/3/6/12 month + custom)
-- ============================================================================

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  duration_days int not null,               -- 30, 90, 180, 365, or custom
  price numeric(10,2) not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_plans_gym on public.membership_plans(gym_id);

create trigger trg_plans_updated_at before update on public.membership_plans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- MEMBER DETAILS (1:1 extension of profiles where role = 'member')
-- ============================================================================

create table public.member_details (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  date_of_birth date,
  gender public.gender,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  blood_group public.blood_group default 'unknown',
  medical_conditions text,
  height_cm numeric(5,2),
  weight_kg numeric(5,2),
  joining_date date not null default current_date,
  assigned_trainer_id uuid references public.profiles(id) on delete set null,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_member_details_gym on public.member_details(gym_id);
create index idx_member_details_trainer on public.member_details(assigned_trainer_id);
create index idx_member_details_status on public.member_details(status);

create trigger trg_member_details_updated_at before update on public.member_details
  for each row execute function public.set_updated_at();

-- ============================================================================
-- MEMBER MEMBERSHIPS (renewal history: one row per membership period)
-- ============================================================================

create table public.member_memberships (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  plan_id uuid references public.membership_plans(id) on delete set null,
  start_date date not null default current_date,
  end_date date not null,
  amount numeric(10,2) not null,
  discount_amount numeric(10,2) not null default 0,
  amount_paid numeric(10,2) not null default 0,
  payment_status public.payment_status not null default 'pending',
  trainer_id uuid references public.profiles(id) on delete set null,
  is_current boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_memberships_member on public.member_memberships(member_id);
create index idx_memberships_gym on public.member_memberships(gym_id);
create index idx_memberships_end_date on public.member_memberships(end_date);
create index idx_memberships_current on public.member_memberships(member_id, is_current) where is_current;

create trigger trg_memberships_updated_at before update on public.member_memberships
  for each row execute function public.set_updated_at();

-- Only one "current" membership per member at a time.
create or replace function public.enforce_single_current_membership()
returns trigger
language plpgsql
as $$
begin
  if new.is_current then
    update public.member_memberships
    set is_current = false
    where member_id = new.member_id and id <> new.id and is_current = true;

    update public.member_details
    set status = 'active'
    where profile_id = new.member_id;
  end if;
  return new;
end;
$$;

create trigger trg_single_current_membership
  after insert or update of is_current on public.member_memberships
  for each row when (new.is_current) execute function public.enforce_single_current_membership();

-- ============================================================================
-- MEMBER DOCUMENTS (certificates, transformation photos, medical docs — Cloudinary)
-- ============================================================================

create table public.member_documents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  doc_type text not null, -- 'photo', 'transformation', 'certificate', 'medical', 'other'
  cloudinary_public_id text not null,
  url text not null,
  caption text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_documents_member on public.member_documents(member_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.membership_plans enable row level security;
alter table public.member_details enable row level security;
alter table public.member_memberships enable row level security;
alter table public.member_documents enable row level security;

-- PLANS: readable by everyone in the tenant, writable by owner
create policy "plans_select" on public.membership_plans for select
  using (
    public.is_super_admin()
    or exists (select 1 from public.gyms g where g.id = gym_id and g.tenant_id = public.current_tenant_id())
  );
create policy "plans_write" on public.membership_plans for all
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));

-- MEMBER DETAILS: staff in the same gym can read/write per has_permission();
-- the member themself can read (and update limited fields via a narrower
-- Server Action, RLS here just gates row visibility).
create policy "member_details_select" on public.member_details for select
  using (
    public.is_super_admin()
    or profile_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "member_details_insert" on public.member_details for insert
  with check (public.is_super_admin() or (public.has_permission('members','create') and gym_id = public.current_gym_id()));
create policy "member_details_update" on public.member_details for update
  using (
    public.is_super_admin()
    or (public.has_permission('members','update') and gym_id = public.current_gym_id())
    or profile_id = auth.uid()
  );
create policy "member_details_delete" on public.member_details for delete
  using (public.is_super_admin() or (public.has_permission('members','delete') and gym_id = public.current_gym_id()));

-- MEMBERSHIPS: staff in gym manage; member reads own
create policy "memberships_select" on public.member_memberships for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "memberships_write" on public.member_memberships for all
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));

-- DOCUMENTS: staff in gym manage; member reads/uploads own
create policy "documents_select" on public.member_documents for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "documents_insert" on public.member_documents for insert
  with check (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "documents_delete" on public.member_documents for delete
  using (public.is_super_admin() or (public.has_permission('members','update') and gym_id = public.current_gym_id()));

-- ============================================================================
-- VIEW: members list with computed current-membership fields (for the table UI)
-- ============================================================================

create or replace view public.members_overview as
select
  p.id as profile_id,
  p.tenant_id,
  p.gym_id,
  p.full_name,
  p.email,
  p.phone,
  p.avatar_url,
  p.is_active,
  md.date_of_birth,
  md.gender,
  md.status,
  md.joining_date,
  md.assigned_trainer_id,
  tr.full_name as trainer_name,
  mm.id as membership_id,
  mm.plan_id,
  mp.name as plan_name,
  mm.start_date,
  mm.end_date,
  mm.payment_status,
  mm.amount,
  mm.amount_paid,
  (mm.end_date - current_date) as days_until_expiry
from public.profiles p
join public.member_details md on md.profile_id = p.id
left join public.profiles tr on tr.id = md.assigned_trainer_id
left join public.member_memberships mm on mm.member_id = p.id and mm.is_current = true
left join public.membership_plans mp on mp.id = mm.plan_id
where p.role = 'member';

alter view public.members_overview set (security_invoker = true);


-- ===========================================================================
-- FILE: 0004_seed_default_plans.sql
-- ===========================================================================
-- ============================================================================
-- Auto-seed the standard 1/3/6/12-month plans whenever a new gym is created,
-- so the member registration form always has options — owners can edit
-- pricing or add custom plans afterward from Settings.
-- ============================================================================

create or replace function public.seed_default_membership_plans()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.membership_plans (gym_id, name, duration_days, price, description) values
    (new.id, '1 Month', 30, 1500, 'Monthly membership'),
    (new.id, '3 Months', 90, 4000, 'Quarterly membership — save vs. monthly'),
    (new.id, '6 Months', 180, 7000, 'Half-yearly membership — better value'),
    (new.id, '12 Months', 365, 12000, 'Annual membership — best value');
  return new;
end;
$$;

create trigger trg_seed_default_plans
  after insert on public.gyms
  for each row execute function public.seed_default_membership_plans();


-- ===========================================================================
-- FILE: 0005_payments_and_renewals.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 4: Payments & Renewals
-- ============================================================================

create type public.payment_method as enum ('cash', 'upi', 'card', 'bank', 'split');
create type public.installment_status as enum ('pending', 'paid', 'overdue', 'waived');
create type public.reminder_type as enum (
  'before_30d', 'before_15d', 'before_7d', 'before_3d', 'before_1d',
  'after_1d', 'after_3d', 'after_7d', 'after_30d'
);

-- ============================================================================
-- SEQUENCES for human-friendly, gapless-per-gym invoice/receipt numbers
-- ============================================================================

create table public.gym_number_sequences (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  next_invoice_number int not null default 1,
  next_receipt_number int not null default 1
);

create or replace function public.next_invoice_number(p_gym_id uuid)
returns text
language plpgsql
as $$
declare
  v_num int;
  v_code text;
begin
  insert into public.gym_number_sequences (gym_id) values (p_gym_id)
    on conflict (gym_id) do nothing;

  update public.gym_number_sequences
  set next_invoice_number = next_invoice_number + 1
  where gym_id = p_gym_id
  returning next_invoice_number - 1 into v_num;

  select code into v_code from public.gyms where id = p_gym_id;
  return coalesce(v_code, 'INV') || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_num::text, 5, '0');
end;
$$;

create or replace function public.next_receipt_number(p_gym_id uuid)
returns text
language plpgsql
as $$
declare
  v_num int;
  v_code text;
begin
  insert into public.gym_number_sequences (gym_id) values (p_gym_id)
    on conflict (gym_id) do nothing;

  update public.gym_number_sequences
  set next_receipt_number = next_receipt_number + 1
  where gym_id = p_gym_id
  returning next_receipt_number - 1 into v_num;

  select code into v_code from public.gyms where id = p_gym_id;
  return 'RCT-' || coalesce(v_code, 'GX') || '-' || to_char(now(), 'YYYY') || '-' || lpad(v_num::text, 5, '0');
end;
$$;

-- ============================================================================
-- PAYMENTS
-- ============================================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  membership_id uuid references public.member_memberships(id) on delete set null,
  amount numeric(10,2) not null check (amount >= 0),
  gst_rate numeric(5,2) not null default 0,       -- e.g. 18.00 for 18% GST
  gst_amount numeric(10,2) not null default 0,
  total_amount numeric(10,2) not null,             -- amount + gst_amount
  method public.payment_method not null,
  transaction_reference text,                      -- UPI ref / card auth code / bank UTR
  invoice_number text not null,
  receipt_number text not null,
  notes text,
  is_refunded boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_payments_gym on public.payments(gym_id, created_at desc);
create index idx_payments_member on public.payments(member_id);
create index idx_payments_membership on public.payments(membership_id);

-- Split payment breakdown (only populated when method = 'split')
create table public.payment_splits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  method public.payment_method not null,
  amount numeric(10,2) not null check (amount > 0),
  transaction_reference text
);

create index idx_splits_payment on public.payment_splits(payment_id);

-- ============================================================================
-- REFUNDS
-- ============================================================================

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  refunded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_refunds_payment on public.refunds(payment_id);

-- ============================================================================
-- EMI INSTALLMENTS (for memberships paid in installments)
-- ============================================================================

create table public.emi_installments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.member_memberships(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  installment_number int not null,
  due_date date not null,
  amount numeric(10,2) not null,
  status public.installment_status not null default 'pending',
  paid_payment_id uuid references public.payments(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (membership_id, installment_number)
);

create index idx_emi_membership on public.emi_installments(membership_id);
create index idx_emi_due_date on public.emi_installments(due_date) where status in ('pending','overdue');

-- ============================================================================
-- RENEWAL REMINDER LOG (prevents duplicate sends from the scheduled function)
-- ============================================================================

create table public.renewal_reminder_log (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.member_memberships(id) on delete cascade,
  reminder_type public.reminder_type not null,
  sent_at timestamptz not null default now(),
  unique (membership_id, reminder_type)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.gym_number_sequences enable row level security;
alter table public.payments enable row level security;
alter table public.payment_splits enable row level security;
alter table public.refunds enable row level security;
alter table public.emi_installments enable row level security;
alter table public.renewal_reminder_log enable row level security;

create policy "sequences_select" on public.gym_number_sequences for select
  using (public.is_super_admin() or gym_id = public.current_gym_id());

create policy "payments_select" on public.payments for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "payments_insert" on public.payments for insert
  with check (public.is_super_admin() or (public.has_permission('payments','create') and gym_id = public.current_gym_id()));
create policy "payments_update" on public.payments for update
  using (public.is_super_admin() or (public.current_role() in ('gym_owner') and gym_id = public.current_gym_id()));

create policy "splits_select" on public.payment_splits for select
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.payments p
      where p.id = payment_id and (p.member_id = auth.uid() or (public.is_staff() and p.gym_id = public.current_gym_id()))
    )
  );
create policy "splits_insert" on public.payment_splits for insert
  with check (
    public.is_super_admin()
    or exists (select 1 from public.payments p where p.id = payment_id and p.gym_id = public.current_gym_id() and public.is_staff())
  );

create policy "refunds_select" on public.refunds for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "refunds_insert" on public.refunds for insert
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));

create policy "emi_select" on public.emi_installments for select
  using (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or exists (select 1 from public.member_memberships mm where mm.id = membership_id and mm.member_id = auth.uid())
  );
create policy "emi_write" on public.emi_installments for all
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));

create policy "reminder_log_select" on public.renewal_reminder_log for select
  using (public.is_super_admin() or exists (
    select 1 from public.member_memberships mm where mm.id = membership_id and mm.gym_id = public.current_gym_id()
  ));
-- Inserts to the reminder log happen only via the service-role Edge Function.

-- ============================================================================
-- VIEW: payments with member/gym context (for the Payments table UI)
-- ============================================================================

create or replace view public.payments_overview as
select
  pay.id,
  pay.gym_id,
  pay.member_id,
  pr.full_name as member_name,
  pay.membership_id,
  mp.name as plan_name,
  pay.amount,
  pay.gst_rate,
  pay.gst_amount,
  pay.total_amount,
  pay.method,
  pay.invoice_number,
  pay.receipt_number,
  pay.is_refunded,
  pay.created_at
from public.payments pay
join public.profiles pr on pr.id = pay.member_id
left join public.member_memberships mm on mm.id = pay.membership_id
left join public.membership_plans mp on mp.id = mm.plan_id;

alter view public.payments_overview set (security_invoker = true);


-- ===========================================================================
-- FILE: 0006_schedule_renewal_reminders.sql
-- ===========================================================================
-- ============================================================================
-- Schedule the renewal-reminders Edge Function to run once a day at 09:00 UTC.
-- Requires the pg_net extension (for HTTP calls from Postgres) and the
-- `app.settings.cron_secret` / `app.settings.edge_function_url` GUCs to be
-- set via `alter database postgres set ...` from the Supabase dashboard, or
-- replace the placeholders below directly before running this migration.
-- ============================================================================

create extension if not exists pg_net;

-- NOTE: Replace these two placeholders with your actual project values
-- before applying this migration (Supabase doesn't allow reading secrets
-- from within SQL migrations for security reasons):
--   <PROJECT_REF>   e.g. abcdefghijklmnop
--   <CRON_SECRET>   the same value as CRON_SECRET in your Edge Function env

select cron.schedule(
  'renewal-reminders-daily',
  '0 9 * * *', -- every day at 09:00 UTC
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/renewal-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ===========================================================================
-- FILE: 0007_permission_matrix_payments.sql
-- ===========================================================================
-- ============================================================================
-- Extend the default permission matrix for the Payments module.
-- gym_owner implicitly has full access via other checks in some policies,
-- but has_permission() looks up explicit rows — add them so recordPayment/
-- issueRefund don't silently fail for gym owners.
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','payments','create',true),
  ('gym_owner','payments','read',true),
  ('gym_owner','refunds','create',true),
  ('receptionist','refunds','create',false)
on conflict (role, resource, action) do nothing;


-- ===========================================================================
-- FILE: 0008_attendance.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 5: Attendance
-- Stateless rotating QR (HMAC-signed, no token table needed) + check-in records
-- ============================================================================

create type public.checkin_method as enum ('qr', 'manual');

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  check_in_at timestamptz not null default now(),
  check_out_at timestamptz,
  duration_minutes int,
  method public.checkin_method not null default 'qr',
  gps_lat double precision,
  gps_lng double precision,
  gps_verified boolean not null default false,
  checked_in_by uuid references public.profiles(id), -- staff, for manual check-ins
  created_at timestamptz not null default now()
);

create index idx_attendance_gym_date on public.attendance_records(gym_id, check_in_at desc);
create index idx_attendance_member on public.attendance_records(member_id, check_in_at desc);
-- Enforce: a member can't have two open (not checked-out) sessions at once.
create unique index idx_attendance_one_open_session
  on public.attendance_records(member_id)
  where check_out_at is null;

-- Auto-compute duration on checkout.
create or replace function public.compute_attendance_duration()
returns trigger
language plpgsql
as $$
begin
  if new.check_out_at is not null and old.check_out_at is null then
    new.duration_minutes := greatest(0, round(extract(epoch from (new.check_out_at - new.check_in_at)) / 60)::int);
  end if;
  return new;
end;
$$;

create trigger trg_attendance_duration
  before update of check_out_at on public.attendance_records
  for each row execute function public.compute_attendance_duration();

alter table public.attendance_records enable row level security;

create policy "attendance_select" on public.attendance_records for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );

create policy "attendance_insert" on public.attendance_records for insert
  with check (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );

create policy "attendance_update" on public.attendance_records for update
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );

-- ============================================================================
-- VIEW: today's attendance with member context (for the front-desk dashboard)
-- ============================================================================

create or replace view public.attendance_today as
select
  a.id,
  a.gym_id,
  a.member_id,
  p.full_name as member_name,
  p.avatar_url,
  a.check_in_at,
  a.check_out_at,
  a.duration_minutes,
  a.method,
  a.gps_verified
from public.attendance_records a
join public.profiles p on p.id = a.member_id
where a.check_in_at >= date_trunc('day', now())
order by a.check_in_at desc;

alter view public.attendance_today set (security_invoker = true);


-- ===========================================================================
-- FILE: 0009_permission_matrix_attendance.sql
-- ===========================================================================
insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','attendance','create',true),
  ('gym_owner','attendance','read',true),
  ('trainer','attendance','read',true)
on conflict (role, resource, action) do nothing;


-- ===========================================================================
-- FILE: 0010_trainer_module.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 6: Trainer Module
-- Workout planner, diet planner, progress tracking (transformation photos
-- already live in member_documents from Part 3)
-- ============================================================================

create type public.plan_frequency as enum ('daily', 'weekly', 'monthly');
create type public.meal_type as enum ('breakfast', 'lunch', 'dinner', 'snacks');

-- ============================================================================
-- WORKOUT PLANS
-- ============================================================================

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  frequency public.plan_frequency not null default 'weekly',
  start_date date not null default current_date,
  end_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workout_plans_member on public.workout_plans(member_id);
create index idx_workout_plans_trainer on public.workout_plans(trainer_id);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_label text not null,   -- 'Monday', 'Day 1', 'Week 1', etc. depending on frequency
  day_order int not null default 0,
  notes text
);

create index idx_workout_days_plan on public.workout_days(workout_plan_id);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_name text not null,
  sets int,
  reps text,              -- text to allow ranges like "8-12" or "AMRAP"
  weight_kg numeric(6,2),
  video_url text,
  notes text,
  order_index int not null default 0
);

create index idx_workout_exercises_day on public.workout_exercises(workout_day_id);

create trigger trg_workout_plans_updated_at before update on public.workout_plans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- DIET PLANS
-- ============================================================================

create table public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  trainer_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  start_date date not null default current_date,
  end_date date,
  daily_calorie_target int,
  daily_protein_g numeric(6,2),
  daily_carbs_g numeric(6,2),
  daily_fat_g numeric(6,2),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_diet_plans_member on public.diet_plans(member_id);
create index idx_diet_plans_trainer on public.diet_plans(trainer_id);

create table public.diet_meals (
  id uuid primary key default gen_random_uuid(),
  diet_plan_id uuid not null references public.diet_plans(id) on delete cascade,
  meal_type public.meal_type not null,
  items text not null,      -- freeform description, e.g. "2 eggs, 1 toast, 1 banana"
  calories int,
  protein_g numeric(6,2),
  carbs_g numeric(6,2),
  fat_g numeric(6,2),
  order_index int not null default 0
);

create index idx_diet_meals_plan on public.diet_meals(diet_plan_id);

create trigger trg_diet_plans_updated_at before update on public.diet_plans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- PROGRESS TRACKING (measurements, BMI, body fat — charted weekly/monthly/yearly)
-- ============================================================================

create table public.member_progress (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  chest_cm numeric(5,2),
  waist_cm numeric(5,2),
  hips_cm numeric(5,2),
  arms_cm numeric(5,2),
  thighs_cm numeric(5,2),
  notes text,
  recorded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_progress_member on public.member_progress(member_id, recorded_at desc);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.diet_plans enable row level security;
alter table public.diet_meals enable row level security;
alter table public.member_progress enable row level security;

-- Trainers manage plans for members assigned to them; gym owner sees/manages
-- all in their gym; member reads their own.
create policy "workout_plans_select" on public.workout_plans for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  );
create policy "workout_plans_write" on public.workout_plans for all
  using (
    public.is_super_admin()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  )
  with check (
    public.is_super_admin()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  );

create policy "workout_days_select" on public.workout_days for select
  using (exists (
    select 1 from public.workout_plans wp where wp.id = workout_plan_id
    and (public.is_super_admin() or wp.member_id = auth.uid() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ));
create policy "workout_days_write" on public.workout_days for all
  using (exists (
    select 1 from public.workout_plans wp where wp.id = workout_plan_id
    and (public.is_super_admin() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ))
  with check (exists (
    select 1 from public.workout_plans wp where wp.id = workout_plan_id
    and (public.is_super_admin() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ));

create policy "workout_exercises_select" on public.workout_exercises for select
  using (exists (
    select 1 from public.workout_days wd join public.workout_plans wp on wp.id = wd.workout_plan_id
    where wd.id = workout_day_id
    and (public.is_super_admin() or wp.member_id = auth.uid() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ));
create policy "workout_exercises_write" on public.workout_exercises for all
  using (exists (
    select 1 from public.workout_days wd join public.workout_plans wp on wp.id = wd.workout_plan_id
    where wd.id = workout_day_id
    and (public.is_super_admin() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ))
  with check (exists (
    select 1 from public.workout_days wd join public.workout_plans wp on wp.id = wd.workout_plan_id
    where wd.id = workout_day_id
    and (public.is_super_admin() or wp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and wp.gym_id = public.current_gym_id()))
  ));

create policy "diet_plans_select" on public.diet_plans for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  );
create policy "diet_plans_write" on public.diet_plans for all
  using (
    public.is_super_admin()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  )
  with check (
    public.is_super_admin()
    or trainer_id = auth.uid()
    or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id())
  );

create policy "diet_meals_select" on public.diet_meals for select
  using (exists (
    select 1 from public.diet_plans dp where dp.id = diet_plan_id
    and (public.is_super_admin() or dp.member_id = auth.uid() or dp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and dp.gym_id = public.current_gym_id()))
  ));
create policy "diet_meals_write" on public.diet_meals for all
  using (exists (
    select 1 from public.diet_plans dp where dp.id = diet_plan_id
    and (public.is_super_admin() or dp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and dp.gym_id = public.current_gym_id()))
  ))
  with check (exists (
    select 1 from public.diet_plans dp where dp.id = diet_plan_id
    and (public.is_super_admin() or dp.trainer_id = auth.uid()
         or (public.current_role() = 'gym_owner' and dp.gym_id = public.current_gym_id()))
  ));

create policy "progress_select" on public.member_progress for select
  using (
    public.is_super_admin()
    or member_id = auth.uid()
    or (public.is_staff() and gym_id = public.current_gym_id())
  );
create policy "progress_write" on public.member_progress for all
  using (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or member_id = auth.uid()
  )
  with check (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or member_id = auth.uid()
  );

-- ============================================================================
-- PERMISSION MATRIX ADDITIONS
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('trainer','workout_plans','update',true), ('trainer','workout_plans','delete',true),
  ('trainer','diet_plans','read',true), ('trainer','diet_plans','update',true), ('trainer','diet_plans','delete',true),
  ('trainer','progress','create',true), ('trainer','progress','read',true),
  ('gym_owner','workout_plans','create',true), ('gym_owner','workout_plans','read',true),
  ('gym_owner','diet_plans','create',true), ('gym_owner','diet_plans','read',true),
  ('gym_owner','progress','create',true), ('gym_owner','progress','read',true),
  ('member','workout_plans','read',true), ('member','diet_plans','read',true), ('member','progress','read',true)
on conflict (role, resource, action) do nothing;


-- ===========================================================================
-- FILE: 0011_crm.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 7: Receptionist & CRM
-- Leads pipeline (walk-ins, trials, conversions, follow-ups)
-- ============================================================================

create type public.lead_status as enum ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost');
create type public.lead_source as enum ('walk_in', 'referral', 'online', 'phone', 'social', 'other');
create type public.lead_activity_type as enum ('call', 'whatsapp', 'email', 'note', 'status_change', 'trial_scheduled');

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  source public.lead_source not null default 'walk_in',
  status public.lead_status not null default 'new',
  interested_plan_id uuid references public.membership_plans(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  trial_date timestamptz,
  follow_up_date date,
  notes text,
  converted_member_id uuid references public.profiles(id) on delete set null,
  lost_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_leads_gym on public.leads(gym_id, status);
create index idx_leads_follow_up on public.leads(gym_id, follow_up_date) where status not in ('converted', 'lost');
create index idx_leads_assigned on public.leads(assigned_to);

create trigger trg_leads_updated_at before update on public.leads
  for each row execute function public.set_updated_at();

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  activity_type public.lead_activity_type not null,
  description text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_lead_activities_lead on public.lead_activities(lead_id, created_at desc);

-- Auto-log every status change as an activity, so the timeline is always complete.
create or replace function public.log_lead_status_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.lead_activities (lead_id, gym_id, activity_type, description, created_by)
    values (new.id, new.gym_id, 'status_change', 'Status changed from ' || old.status || ' to ' || new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_lead_status_change
  after update of status on public.leads
  for each row execute function public.log_lead_status_change();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

create policy "leads_select" on public.leads for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "leads_insert" on public.leads for insert
  with check (public.is_super_admin() or (public.has_permission('leads','create') and gym_id = public.current_gym_id()));
create policy "leads_update" on public.leads for update
  using (public.is_super_admin() or (public.has_permission('leads','update') and gym_id = public.current_gym_id()));
create policy "leads_delete" on public.leads for delete
  using (public.is_super_admin() or (public.has_permission('leads','delete') and gym_id = public.current_gym_id()));

create policy "lead_activities_select" on public.lead_activities for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "lead_activities_insert" on public.lead_activities for insert
  with check (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));

-- ============================================================================
-- PERMISSION MATRIX
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','leads','create',true), ('gym_owner','leads','read',true),
  ('gym_owner','leads','update',true), ('gym_owner','leads','delete',true),
  ('receptionist','leads','create',true), ('receptionist','leads','read',true),
  ('receptionist','leads','update',true), ('receptionist','leads','delete',false)
on conflict (role, resource, action) do nothing;

-- ============================================================================
-- VIEW: leads with assignee/plan context (for the pipeline board)
-- ============================================================================

create or replace view public.leads_overview as
select
  l.id, l.gym_id, l.name, l.phone, l.email, l.source, l.status,
  l.interested_plan_id, mp.name as plan_name,
  l.assigned_to, pr.full_name as assigned_to_name,
  l.trial_date, l.follow_up_date, l.notes, l.converted_member_id, l.lost_reason,
  l.created_at, l.updated_at
from public.leads l
left join public.membership_plans mp on mp.id = l.interested_plan_id
left join public.profiles pr on pr.id = l.assigned_to;

alter view public.leads_overview set (security_invoker = true);


-- ===========================================================================
-- FILE: 0012_schedule_crm_reminders.sql
-- ===========================================================================
-- ============================================================================
-- Schedule crm-follow-up-reminders to run once a day at 08:30 UTC (ahead of
-- the 09:00 renewal-reminders run from Part 4, so staff see CRM follow-ups
-- before the gym opens).
-- Replace <PROJECT_REF> and <CRON_SECRET> the same way as migration 0006.
-- ============================================================================

select cron.schedule(
  'crm-follow-up-reminders-daily',
  '30 8 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/crm-follow-up-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ===========================================================================
-- FILE: 0013_ai_features.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 8: AI Features
-- Chat history for the AI assistant + cached risk/forecast analysis results
-- (AI calls are not cheap or instant — cache results, refresh on demand)
-- ============================================================================

create type public.ai_chat_role as enum ('user', 'assistant');
create type public.risk_level as enum ('low', 'medium', 'high');

create table public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  role public.ai_chat_role not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index idx_ai_chat_member on public.ai_chat_messages(member_id, created_at);

create table public.member_risk_scores (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  risk_score int not null check (risk_score between 0 and 100),
  risk_level public.risk_level not null,
  factors jsonb not null default '[]'::jsonb,
  ai_narrative text,
  computed_at timestamptz not null default now()
);

create index idx_risk_scores_gym on public.member_risk_scores(gym_id, risk_score desc);

create table public.revenue_forecasts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  forecast_month date not null,
  projected_revenue numeric(12,2) not null,
  confidence text not null default 'medium', -- low, medium, high
  ai_narrative text,
  computed_at timestamptz not null default now(),
  unique (gym_id, forecast_month)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.ai_chat_messages enable row level security;
alter table public.member_risk_scores enable row level security;
alter table public.revenue_forecasts enable row level security;

create policy "ai_chat_select" on public.ai_chat_messages for select
  using (public.is_super_admin() or member_id = auth.uid() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));
create policy "ai_chat_insert" on public.ai_chat_messages for insert
  with check (public.is_super_admin() or member_id = auth.uid());

create policy "risk_scores_select" on public.member_risk_scores for select
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));
create policy "risk_scores_write" on public.member_risk_scores for all
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));

create policy "forecasts_select" on public.revenue_forecasts for select
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));
create policy "forecasts_write" on public.revenue_forecasts for all
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));


-- ===========================================================================
-- FILE: 0014_inventory_payroll.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 9: Inventory & Payroll
-- ============================================================================

create type public.inventory_category as enum ('equipment', 'supplement', 'accessory', 'other');
create type public.inventory_txn_type as enum ('restock', 'sale', 'adjustment', 'damage');
create type public.payslip_status as enum ('draft', 'finalized', 'paid');

-- ============================================================================
-- INVENTORY
-- ============================================================================

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  category public.inventory_category not null default 'equipment',
  barcode text,
  quantity int not null default 0,
  unit text not null default 'piece',
  cost_price numeric(10,2),
  sell_price numeric(10,2),
  low_stock_threshold int not null default 5,
  expiry_date date,
  supplier text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inventory_gym on public.inventory_items(gym_id);
create index idx_inventory_barcode on public.inventory_items(gym_id, barcode) where barcode is not null;
create index idx_inventory_low_stock on public.inventory_items(gym_id) where quantity <= low_stock_threshold;
create index idx_inventory_expiry on public.inventory_items(gym_id, expiry_date) where expiry_date is not null;

create trigger trg_inventory_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  type public.inventory_txn_type not null,
  quantity_change int not null, -- positive for restock, negative for sale/damage
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_inventory_txn_item on public.inventory_transactions(item_id, created_at desc);

-- Keep item.quantity in sync automatically — the single source of truth for
-- "current stock" is the sum of transactions, applied via trigger so the UI
-- never has to remember to update both.
create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
as $$
begin
  update public.inventory_items
  set quantity = quantity + new.quantity_change
  where id = new.item_id;
  return new;
end;
$$;

create trigger trg_apply_inventory_transaction
  after insert on public.inventory_transactions
  for each row execute function public.apply_inventory_transaction();

-- ============================================================================
-- PAYROLL
-- ============================================================================

create table public.staff_salary_config (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  base_salary numeric(10,2) not null default 0,
  commission_rate numeric(5,2) not null default 0, -- % of payments they processed/generated
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  unique (staff_id)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  month date not null, -- first day of the month this payslip covers
  base_salary numeric(10,2) not null default 0,
  commission_amount numeric(10,2) not null default 0,
  bonus_amount numeric(10,2) not null default 0,
  deductions_amount numeric(10,2) not null default 0,
  present_days int,
  total_working_days int,
  net_pay numeric(10,2) not null default 0,
  status public.payslip_status not null default 'draft',
  notes text,
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (gym_id, staff_id, month)
);

create index idx_payslips_gym_month on public.payslips(gym_id, month desc);
create index idx_payslips_staff on public.payslips(staff_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.staff_salary_config enable row level security;
alter table public.payslips enable row level security;

create policy "inventory_select" on public.inventory_items for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "inventory_insert" on public.inventory_items for insert
  with check (public.is_super_admin() or (public.has_permission('inventory','create') and gym_id = public.current_gym_id()));
create policy "inventory_update" on public.inventory_items for update
  using (public.is_super_admin() or (public.has_permission('inventory','update') and gym_id = public.current_gym_id()));
create policy "inventory_delete" on public.inventory_items for delete
  using (public.is_super_admin() or (public.has_permission('inventory','delete') and gym_id = public.current_gym_id()));

create policy "inventory_txn_select" on public.inventory_transactions for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "inventory_txn_insert" on public.inventory_transactions for insert
  with check (public.is_super_admin() or (public.has_permission('inventory','update') and gym_id = public.current_gym_id()));

-- Payroll is gym-owner only — salary data is sensitive.
create policy "salary_config_select" on public.staff_salary_config for select
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()) or staff_id = auth.uid());
create policy "salary_config_write" on public.staff_salary_config for all
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));

create policy "payslips_select" on public.payslips for select
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()) or staff_id = auth.uid());
create policy "payslips_write" on public.payslips for all
  using (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.current_role() = 'gym_owner' and gym_id = public.current_gym_id()));

-- ============================================================================
-- PERMISSION MATRIX
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','inventory','create',true), ('gym_owner','inventory','read',true),
  ('gym_owner','inventory','update',true), ('gym_owner','inventory','delete',true),
  ('receptionist','inventory','create',true), ('receptionist','inventory','read',true),
  ('receptionist','inventory','update',true), ('receptionist','inventory','delete',false)
on conflict (role, resource, action) do nothing;

-- ============================================================================
-- VIEW: inventory with computed low-stock / expiring flags
-- ============================================================================

create or replace view public.inventory_overview as
select
  i.*,
  (i.quantity <= i.low_stock_threshold) as is_low_stock,
  (i.expiry_date is not null and i.expiry_date <= current_date + interval '30 days') as is_expiring_soon
from public.inventory_items i
where i.is_active = true;

alter view public.inventory_overview set (security_invoker = true);


-- ===========================================================================
-- FILE: 0015_schedule_inventory_alerts.sql
-- ===========================================================================
-- ============================================================================
-- Schedule inventory-alerts to run weekly, Monday 07:00 UTC.
-- Replace <PROJECT_REF> and <CRON_SECRET> the same way as migration 0006.
-- ============================================================================

select cron.schedule(
  'inventory-alerts-weekly',
  '0 7 * * 1',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/inventory-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ===========================================================================
-- FILE: 0016_marketing.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 10: Marketing
-- Campaigns (WhatsApp/Email), Coupons, Referrals, Audience Segmentation,
-- Birthday/Festival automation, Campaign Analytics
-- ============================================================================

create type public.campaign_channel as enum ('email', 'whatsapp', 'both');
create type public.campaign_audience_type as enum (
  'all_members', 'active_members', 'expired_members', 'expiring_soon',
  'frozen_members', 'leads', 'custom_selection'
);
create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled');
create type public.campaign_trigger as enum ('manual', 'birthday', 'festival', 'renewal_expiring', 'welcome');
create type public.coupon_discount_type as enum ('percentage', 'flat');
create type public.referral_status as enum ('pending', 'converted', 'rewarded', 'expired');

-- ============================================================================
-- CAMPAIGNS (WhatsApp / Email marketing campaigns)
-- ============================================================================

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  channel public.campaign_channel not null default 'email',
  audience_type public.campaign_audience_type not null default 'all_members',
  audience_member_ids uuid[], -- used only when audience_type = 'custom_selection'
  subject text, -- email subject (ignored for whatsapp-only)
  message_body text not null,
  image_url text, -- optional Cloudinary banner/image for email or WhatsApp media
  trigger_type public.campaign_trigger not null default 'manual',
  status public.campaign_status not null default 'draft',
  scheduled_at timestamptz, -- null = send immediately when triggered
  sent_at timestamptz,
  recipients_total int not null default 0,
  recipients_sent int not null default 0,
  recipients_failed int not null default 0,
  opens_count int not null default 0, -- email open tracking (pixel)
  clicks_count int not null default 0, -- link click tracking
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaigns_gym on public.marketing_campaigns(gym_id);
create index idx_campaigns_status on public.marketing_campaigns(gym_id, status);
create index idx_campaigns_scheduled on public.marketing_campaigns(scheduled_at) where status = 'scheduled';

create trigger trg_campaigns_updated_at before update on public.marketing_campaigns
  for each row execute function public.set_updated_at();

-- Per-recipient send log: lets us show exactly who received a campaign,
-- track delivery failures per person, and support open/click tracking
-- without ever re-sending to someone twice for the same campaign.
create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  recipient_name text not null,
  recipient_email text,
  recipient_phone text,
  channel public.campaign_channel not null,
  status text not null default 'pending', -- pending | sent | failed | opened | clicked
  error_message text,
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_campaign_recipients_campaign on public.campaign_recipients(campaign_id);
create index idx_campaign_recipients_member on public.campaign_recipients(member_id);
-- one recipient row per member/lead per campaign — prevents duplicate sends
create unique index uq_campaign_recipient_member on public.campaign_recipients(campaign_id, member_id) where member_id is not null;
create unique index uq_campaign_recipient_lead on public.campaign_recipients(campaign_id, lead_id) where lead_id is not null;

-- ============================================================================
-- COUPONS
-- ============================================================================

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  code text not null,
  description text,
  discount_type public.coupon_discount_type not null default 'percentage',
  discount_value numeric(10,2) not null, -- % (0-100) or flat currency amount
  max_discount_amount numeric(10,2), -- caps a percentage discount, optional
  min_purchase_amount numeric(10,2) not null default 0,
  applicable_plan_ids uuid[], -- null/empty = applies to all plans
  usage_limit int, -- total redemptions allowed across all members; null = unlimited
  usage_limit_per_member int not null default 1,
  times_used int not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, code)
);

create index idx_coupons_gym on public.coupons(gym_id);
create index idx_coupons_code on public.coupons(gym_id, code);
create index idx_coupons_active on public.coupons(gym_id) where is_active = true;

create trigger trg_coupons_updated_at before update on public.coupons
  for each row execute function public.set_updated_at();

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  membership_id uuid references public.member_memberships(id) on delete set null,
  discount_applied numeric(10,2) not null,
  redeemed_at timestamptz not null default now()
);

create index idx_coupon_redemptions_coupon on public.coupon_redemptions(coupon_id);
create index idx_coupon_redemptions_member on public.coupon_redemptions(member_id);

-- Keep coupons.times_used in sync automatically, same "ledger drives the
-- counter" pattern used for inventory quantity in Part 9.
create or replace function public.apply_coupon_redemption()
returns trigger
language plpgsql
as $$
begin
  update public.coupons set times_used = times_used + 1 where id = new.coupon_id;
  return new;
end;
$$;

create trigger trg_apply_coupon_redemption
  after insert on public.coupon_redemptions
  for each row execute function public.apply_coupon_redemption();

-- Validates a coupon server-side: existence, active window, usage caps, and
-- (if provided) the per-member usage cap — called from the redeem action so
-- the same rules can never be bypassed by a client-side-only check.
create or replace function public.validate_coupon(
  p_gym_id uuid,
  p_code text,
  p_member_id uuid,
  p_purchase_amount numeric
)
returns table (
  is_valid boolean,
  reason text,
  coupon_id uuid,
  discount_type public.coupon_discount_type,
  discount_value numeric,
  max_discount_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon public.coupons%rowtype;
  v_member_uses int;
begin
  select * into v_coupon from public.coupons
  where gym_id = p_gym_id and code = upper(p_code) and is_active = true;

  if not found then
    return query select false, 'This coupon code is not valid.', null::uuid, null::public.coupon_discount_type, null::numeric, null::numeric;
    return;
  end if;

  if v_coupon.valid_from > now() then
    return query select false, 'This coupon is not active yet.', v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
    return;
  end if;

  if v_coupon.valid_until is not null and v_coupon.valid_until < now() then
    return query select false, 'This coupon has expired.', v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
    return;
  end if;

  if v_coupon.usage_limit is not null and v_coupon.times_used >= v_coupon.usage_limit then
    return query select false, 'This coupon has reached its usage limit.', v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
    return;
  end if;

  if p_purchase_amount < v_coupon.min_purchase_amount then
    return query select false, format('This coupon requires a minimum purchase of %s.', v_coupon.min_purchase_amount), v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
    return;
  end if;

  select count(*) into v_member_uses from public.coupon_redemptions
  where coupon_id = v_coupon.id and member_id = p_member_id;

  if v_member_uses >= v_coupon.usage_limit_per_member then
    return query select false, 'You have already used this coupon the maximum number of times.', v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
    return;
  end if;

  return query select true, null::text, v_coupon.id, v_coupon.discount_type, v_coupon.discount_value, v_coupon.max_discount_amount;
end;
$$;

-- ============================================================================
-- REFERRAL PROGRAM
-- ============================================================================

create table public.referral_program_config (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  is_enabled boolean not null default true,
  referrer_reward_type public.coupon_discount_type not null default 'flat',
  referrer_reward_value numeric(10,2) not null default 0,
  referee_reward_type public.coupon_discount_type not null default 'percentage',
  referee_reward_value numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

create trigger trg_referral_config_updated_at before update on public.referral_program_config
  for each row execute function public.set_updated_at();

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  referrer_member_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null,
  referee_name text,
  referee_phone text,
  referee_member_id uuid references public.profiles(id) on delete set null,
  status public.referral_status not null default 'pending',
  referrer_reward_coupon_id uuid references public.coupons(id) on delete set null,
  referee_reward_coupon_id uuid references public.coupons(id) on delete set null,
  converted_at timestamptz,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (gym_id, referral_code)
);

create index idx_referrals_gym on public.referrals(gym_id);
create index idx_referrals_referrer on public.referrals(referrer_member_id);
create index idx_referrals_status on public.referrals(gym_id, status);

-- Every active member gets a stable, human-shareable referral code the
-- moment they're created, so "referred by" links always resolve to a code
-- rather than requiring staff to generate one manually first.
create or replace function public.get_or_create_referral_code(p_member_id uuid, p_gym_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_full_name text;
begin
  select referral_code into v_code from public.referrals
  where referrer_member_id = p_member_id and gym_id = p_gym_id and referee_member_id is null
  limit 1;

  if v_code is not null then
    return v_code;
  end if;

  select full_name into v_full_name from public.profiles where id = p_member_id;
  v_code := upper(regexp_replace(coalesce(split_part(v_full_name, ' ', 1), 'MEMBER'), '[^a-zA-Z]', '', 'g'));
  v_code := left(v_code, 6) || left(replace(p_member_id::text, '-', ''), 4);
  v_code := upper(v_code);

  insert into public.referrals (gym_id, referrer_member_id, referral_code, status)
  values (p_gym_id, p_member_id, v_code, 'pending')
  on conflict (gym_id, referral_code) do nothing;

  return v_code;
end;
$$;

-- ============================================================================
-- AUDIENCE SEGMENTS (saved, reusable filters for campaign targeting)
-- ============================================================================

create table public.audience_segments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null,
  audience_type public.campaign_audience_type not null,
  filters jsonb not null default '{}'::jsonb, -- e.g. {"expiringWithinDays": 7, "planIds": [...]}
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_segments_gym on public.audience_segments(gym_id);

-- ============================================================================
-- BIRTHDAY / FESTIVAL AUTOMATED OFFERS
-- ============================================================================

create table public.festival_offers (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  name text not null, -- e.g. "New Year Offer", "Diwali Special"
  occurs_on date not null, -- month/day matters; year is ignored at send time
  message_template text not null,
  channel public.campaign_channel not null default 'both',
  coupon_id uuid references public.coupons(id) on delete set null,
  is_active boolean not null default true,
  last_sent_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_festival_offers_gym on public.festival_offers(gym_id);

create trigger trg_festival_offers_updated_at before update on public.festival_offers
  for each row execute function public.set_updated_at();

-- Per-gym toggle + template for automatic birthday wishes, sent by the
-- marketing-automation Edge Function.
create table public.birthday_campaign_config (
  gym_id uuid primary key references public.gyms(id) on delete cascade,
  is_enabled boolean not null default true,
  channel public.campaign_channel not null default 'both',
  message_template text not null default 'Happy Birthday, {{name}}! 🎉 Wishing you strength and health this year. Team {{gym_name}}',
  coupon_id uuid references public.coupons(id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger trg_birthday_config_updated_at before update on public.birthday_campaign_config
  for each row execute function public.set_updated_at();

-- Idempotency log so the daily automation function never sends the same
-- birthday/festival wish twice for the same person on the same calendar day.
create table public.automated_message_log (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid references public.profiles(id) on delete cascade,
  automation_type text not null, -- 'birthday' | 'festival:<festival_offer_id>'
  sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (gym_id, member_id, automation_type, sent_on)
);

create index idx_automated_log_lookup on public.automated_message_log(gym_id, automation_type, sent_on);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.marketing_campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.referral_program_config enable row level security;
alter table public.referrals enable row level security;
alter table public.audience_segments enable row level security;
alter table public.festival_offers enable row level security;
alter table public.birthday_campaign_config enable row level security;
alter table public.automated_message_log enable row level security;

-- Campaigns: staff (owner/reception) can read; only marketing-permitted
-- roles can write. Members/trainers have no access — campaigns are an
-- internal marketing tool, not member-facing data.
create policy "campaigns_select" on public.marketing_campaigns for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "campaigns_insert" on public.marketing_campaigns for insert
  with check (public.is_super_admin() or (public.has_permission('marketing','create') and gym_id = public.current_gym_id()));
create policy "campaigns_update" on public.marketing_campaigns for update
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));
create policy "campaigns_delete" on public.marketing_campaigns for delete
  using (public.is_super_admin() or (public.has_permission('marketing','delete') and gym_id = public.current_gym_id()));

create policy "campaign_recipients_select" on public.campaign_recipients for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "campaign_recipients_insert" on public.campaign_recipients for insert
  with check (public.is_super_admin() or (public.has_permission('marketing','create') and gym_id = public.current_gym_id()));
create policy "campaign_recipients_update" on public.campaign_recipients for update
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));

-- Coupons: staff can manage; members can read active coupons for their own
-- gym so a "have a code?" field at checkout can validate client-side hints
-- (the actual authoritative check is always the validate_coupon() RPC).
create policy "coupons_select" on public.coupons for select
  using (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or (public.current_role() = 'member' and gym_id = public.current_gym_id() and is_active = true)
  );
create policy "coupons_insert" on public.coupons for insert
  with check (public.is_super_admin() or (public.has_permission('marketing','create') and gym_id = public.current_gym_id()));
create policy "coupons_update" on public.coupons for update
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));
create policy "coupons_delete" on public.coupons for delete
  using (public.is_super_admin() or (public.has_permission('marketing','delete') and gym_id = public.current_gym_id()));

create policy "coupon_redemptions_select" on public.coupon_redemptions for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()) or member_id = auth.uid());
create policy "coupon_redemptions_insert" on public.coupon_redemptions for insert
  with check (public.is_super_admin() or gym_id = public.current_gym_id());

-- Referral config: staff manage, members can read (to know their reward).
create policy "referral_config_select" on public.referral_program_config for select
  using (public.is_super_admin() or gym_id = public.current_gym_id());
create policy "referral_config_write" on public.referral_program_config for all
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));

-- Referrals: staff see all in their gym; a member can see referrals they made.
create policy "referrals_select" on public.referrals for select
  using (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or referrer_member_id = auth.uid()
  );
create policy "referrals_insert" on public.referrals for insert
  with check (
    public.is_super_admin()
    or (public.is_staff() and gym_id = public.current_gym_id())
    or (referrer_member_id = auth.uid() and gym_id = public.current_gym_id())
  );
create policy "referrals_update" on public.referrals for update
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));

create policy "segments_all" on public.audience_segments for all
  using (public.is_super_admin() or (public.has_permission('marketing','read') and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.has_permission('marketing','create') and gym_id = public.current_gym_id()));

create policy "festival_offers_select" on public.festival_offers for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "festival_offers_write" on public.festival_offers for all
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));

create policy "birthday_config_select" on public.birthday_campaign_config for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
create policy "birthday_config_write" on public.birthday_campaign_config for all
  using (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()))
  with check (public.is_super_admin() or (public.has_permission('marketing','update') and gym_id = public.current_gym_id()));

create policy "automated_log_select" on public.automated_message_log for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id()));
-- Inserts to automated_message_log come only from the service-role Edge
-- Function (bypasses RLS); no client-side insert policy is defined on purpose.

-- ============================================================================
-- PERMISSION MATRIX
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','marketing','create',true), ('gym_owner','marketing','read',true),
  ('gym_owner','marketing','update',true), ('gym_owner','marketing','delete',true),
  ('receptionist','marketing','create',false), ('receptionist','marketing','read',true),
  ('receptionist','marketing','update',false), ('receptionist','marketing','delete',false)
on conflict (role, resource, action) do nothing;

-- ============================================================================
-- COUNTER INCREMENT RPC (for the public, unauthenticated tracking routes)
-- ============================================================================

-- Used by the open-tracking pixel and click-tracking redirect routes, which
-- run with no user session (an email client fetching an image has none), so
-- they use the admin client — this RPC keeps the increment atomic and column
-- name whitelisted rather than letting a route build dynamic SQL.
create or replace function public.increment_campaign_counter(p_campaign_id uuid, p_column text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_column = 'opens_count' then
    update public.marketing_campaigns set opens_count = opens_count + 1 where id = p_campaign_id;
  elsif p_column = 'clicks_count' then
    update public.marketing_campaigns set clicks_count = clicks_count + 1 where id = p_campaign_id;
  end if;
end;
$$;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Campaign analytics: delivery + engagement rates computed once, not
-- recalculated ad hoc in every UI that shows campaign performance.
create or replace view public.campaign_analytics as
select
  c.id,
  c.gym_id,
  c.name,
  c.channel,
  c.status,
  c.trigger_type,
  c.scheduled_at,
  c.sent_at,
  c.recipients_total,
  c.recipients_sent,
  c.recipients_failed,
  c.opens_count,
  c.clicks_count,
  case when c.recipients_sent > 0 then round((c.opens_count::numeric / c.recipients_sent) * 100, 1) else 0 end as open_rate,
  case when c.recipients_sent > 0 then round((c.clicks_count::numeric / c.recipients_sent) * 100, 1) else 0 end as click_rate,
  case when c.recipients_total > 0 then round((c.recipients_sent::numeric / c.recipients_total) * 100, 1) else 0 end as delivery_rate,
  c.created_at
from public.marketing_campaigns c;

alter view public.campaign_analytics set (security_invoker = true);

-- Referral overview: joins referrer/referee names so the UI never has to
-- do client-side joins across profiles.
create or replace view public.referrals_overview as
select
  r.id,
  r.gym_id,
  r.referrer_member_id,
  rp.full_name as referrer_name,
  r.referral_code,
  r.referee_name,
  r.referee_phone,
  r.referee_member_id,
  refp.full_name as referee_actual_name,
  r.status,
  r.referrer_reward_coupon_id,
  r.referee_reward_coupon_id,
  r.converted_at,
  r.rewarded_at,
  r.created_at
from public.referrals r
join public.profiles rp on rp.id = r.referrer_member_id
left join public.profiles refp on refp.id = r.referee_member_id;

alter view public.referrals_overview set (security_invoker = true);

-- Coupon overview with a computed "is_expired" flag, mirroring the
-- inventory_overview computed-flag pattern from Part 9.
create or replace view public.coupons_overview as
select
  c.*,
  (c.valid_until is not null and c.valid_until < now()) as is_expired,
  (c.usage_limit is not null and c.times_used >= c.usage_limit) as is_exhausted
from public.coupons c;

alter view public.coupons_overview set (security_invoker = true);


-- ===========================================================================
-- FILE: 0017_schedule_marketing_automation.sql
-- ===========================================================================
-- ============================================================================
-- Schedule the two Part 10 Edge Functions.
-- Replace <PROJECT_REF> and <CRON_SECRET> the same way as migration 0006.
--
-- marketing-automation: once daily at 07:30 UTC — birthday wishes + festival
--   offers (ahead of the gym's opening hours, after inventory-alerts' slot).
-- campaign-dispatch: every minute, with an empty body — sweeps for any
--   scheduled campaign whose scheduled_at has arrived. Sending itself is
--   fast (recipient loop), and the function is a no-op (near-instant) when
--   nothing is due, so a 1-minute cadence keeps scheduled-send delay low
--   without meaningful cost.
-- ============================================================================

select cron.schedule(
  'marketing-automation-daily',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/marketing-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'campaign-dispatch-sweep',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/campaign-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ===========================================================================
-- FILE: 0018_reports_analytics.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 11: Reports & Analytics
-- Adds: expenses ledger (needed for Profit & Loss), plus reporting views/
-- functions that aggregate data already captured by Parts 1–10. Reports are
-- read-only rollups — no new "facts" are invented, they're derived straight
-- from payments, memberships, attendance, inventory, and payroll.
-- ============================================================================

create type public.expense_category as enum (
  'rent', 'utilities', 'salaries', 'equipment', 'marketing', 'maintenance', 'other'
);

-- ============================================================================
-- EXPENSES (manual ledger — payroll net_pay is pulled in separately for P&L
-- so staff salaries aren't double-entered here; category 'salaries' covers
-- anything paid outside the payroll module, e.g. a one-off contractor).
-- ============================================================================

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  category public.expense_category not null default 'other',
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  vendor text,
  expense_date date not null default current_date,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_expenses_gym_date on public.expenses(gym_id, expense_date desc);
create index idx_expenses_category on public.expenses(gym_id, category);

create trigger trg_expenses_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;

create policy "expenses_select" on public.expenses for select
  using (public.is_super_admin() or (public.is_staff() and gym_id = public.current_gym_id() and public.has_permission('reports','read')));
create policy "expenses_insert" on public.expenses for insert
  with check (public.is_super_admin() or (public.has_permission('expenses','create') and gym_id = public.current_gym_id()));
create policy "expenses_update" on public.expenses for update
  using (public.is_super_admin() or (public.has_permission('expenses','update') and gym_id = public.current_gym_id()));
create policy "expenses_delete" on public.expenses for delete
  using (public.is_super_admin() or (public.has_permission('expenses','delete') and gym_id = public.current_gym_id()));

-- ============================================================================
-- PERMISSION MATRIX — reports/expenses are gym-owner only. Matches the spec's
-- "Receptionist cannot view revenue reports" restriction explicitly.
-- ============================================================================

insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','reports','read',true),
  ('gym_owner','expenses','create',true),
  ('gym_owner','expenses','update',true),
  ('gym_owner','expenses','delete',true),
  ('receptionist','reports','read',false),
  ('receptionist','expenses','create',false),
  ('trainer','reports','read',false)
on conflict (role, resource, action) do nothing;

-- ============================================================================
-- REVENUE REPORT — daily net revenue (payments minus same-day refunds isn't
-- tracked per-day for refunds, so refunds are shown as their own column,
-- consistent with how Part 4 books them as separate rows, not reversals).
-- ============================================================================

create or replace function public.report_revenue(p_gym_id uuid, p_start date, p_end date)
returns table (
  day date,
  gross_amount numeric,
  gst_amount numeric,
  refund_amount numeric,
  net_amount numeric,
  transaction_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    d::date as day,
    coalesce(p.gross, 0) as gross_amount,
    coalesce(p.gst, 0) as gst_amount,
    coalesce(r.refunded, 0) as refund_amount,
    coalesce(p.gross, 0) - coalesce(r.refunded, 0) as net_amount,
    coalesce(p.cnt, 0) as transaction_count
  from generate_series(p_start, p_end, interval '1 day') d
  left join (
    select created_at::date as day, sum(total_amount) as gross, sum(gst_amount) as gst, count(*) as cnt
    from public.payments
    where gym_id = p_gym_id and created_at::date between p_start and p_end
    group by created_at::date
  ) p on p.day = d::date
  left join (
    select r.created_at::date as day, sum(r.amount) as refunded
    from public.refunds r
    where r.gym_id = p_gym_id and r.created_at::date between p_start and p_end
    group by r.created_at::date
  ) r on r.day = d::date
  order by d;
$$;

-- ============================================================================
-- MEMBERSHIP REPORT — active/expired/frozen counts and revenue by plan.
-- ============================================================================

create or replace function public.report_membership_summary(p_gym_id uuid)
returns table (
  plan_name text,
  active_count bigint,
  expired_count bigint,
  total_revenue numeric
)
language sql stable security definer set search_path = public
as $$
  select
    coalesce(mp.name, 'Custom / Deleted Plan') as plan_name,
    count(*) filter (where mm.is_current and mm.end_date >= current_date) as active_count,
    count(*) filter (where mm.end_date < current_date) as expired_count,
    coalesce(sum(mm.amount_paid), 0) as total_revenue
  from public.member_memberships mm
  left join public.membership_plans mp on mp.id = mm.plan_id
  where mm.gym_id = p_gym_id
  group by mp.name
  order by total_revenue desc;
$$;

-- ============================================================================
-- ATTENDANCE REPORT — daily check-ins, unique members, avg session duration.
-- ============================================================================

create or replace function public.report_attendance(p_gym_id uuid, p_start date, p_end date)
returns table (
  day date,
  check_ins bigint,
  unique_members bigint,
  avg_duration_minutes numeric
)
language sql stable security definer set search_path = public
as $$
  select
    d::date as day,
    coalesce(a.cnt, 0) as check_ins,
    coalesce(a.uniq, 0) as unique_members,
    coalesce(a.avg_dur, 0) as avg_duration_minutes
  from generate_series(p_start, p_end, interval '1 day') d
  left join (
    select check_in_at::date as day, count(*) as cnt, count(distinct member_id) as uniq,
           avg(duration_minutes) filter (where duration_minutes is not null) as avg_dur
    from public.attendance_records
    where gym_id = p_gym_id and check_in_at::date between p_start and p_end
    group by check_in_at::date
  ) a on a.day = d::date
  order by d;
$$;

-- ============================================================================
-- TRAINER PERFORMANCE — active clients, revenue attributed via memberships,
-- workout/diet plans authored, and average client attendance rate.
-- ============================================================================

create or replace function public.report_trainer_performance(p_gym_id uuid, p_start date, p_end date)
returns table (
  trainer_id uuid,
  trainer_name text,
  active_clients bigint,
  revenue_generated numeric,
  workout_plans_created bigint,
  diet_plans_created bigint,
  avg_client_checkins numeric
)
language sql stable security definer set search_path = public
as $$
  select
    p.id as trainer_id,
    p.full_name as trainer_name,
    count(distinct md.profile_id) filter (where md.status = 'active') as active_clients,
    coalesce(sum(mm.amount_paid) filter (where mm.created_at::date between p_start and p_end), 0) as revenue_generated,
    count(distinct wp.id) filter (where wp.created_at::date between p_start and p_end) as workout_plans_created,
    count(distinct dp.id) filter (where dp.created_at::date between p_start and p_end) as diet_plans_created,
    coalesce((
      select avg(sub.cnt) from (
        select ar.member_id, count(*) as cnt
        from public.attendance_records ar
        join public.member_details md2 on md2.profile_id = ar.member_id
        where md2.assigned_trainer_id = p.id and ar.check_in_at::date between p_start and p_end
        group by ar.member_id
      ) sub
    ), 0) as avg_client_checkins
  from public.profiles p
  left join public.member_details md on md.assigned_trainer_id = p.id
  left join public.member_memberships mm on mm.trainer_id = p.id
  left join public.workout_plans wp on wp.trainer_id = p.id
  left join public.diet_plans dp on dp.trainer_id = p.id
  where p.gym_id = p_gym_id and p.role = 'trainer'
  group by p.id, p.full_name
  order by revenue_generated desc;
$$;

-- ============================================================================
-- INVENTORY REPORT — stock value, low-stock count, movement in range.
-- ============================================================================

create or replace function public.report_inventory(p_gym_id uuid, p_start date, p_end date)
returns table (
  item_id uuid,
  item_name text,
  category public.inventory_category,
  quantity int,
  stock_value numeric,
  units_sold_in_range bigint,
  is_low_stock boolean
)
language sql stable security definer set search_path = public
as $$
  select
    i.id as item_id,
    i.name as item_name,
    i.category,
    i.quantity,
    coalesce(i.quantity * i.cost_price, 0) as stock_value,
    coalesce((
      select sum(-t.quantity_change) from public.inventory_transactions t
      where t.item_id = i.id and t.type = 'sale' and t.created_at::date between p_start and p_end
    ), 0) as units_sold_in_range,
    i.quantity <= i.low_stock_threshold as is_low_stock
  from public.inventory_items i
  where i.gym_id = p_gym_id and i.is_active
  order by stock_value desc;
$$;

-- ============================================================================
-- PAYMENTS REPORT — breakdown by method, for reconciliation.
-- ============================================================================

create or replace function public.report_payments_by_method(p_gym_id uuid, p_start date, p_end date)
returns table (
  method public.payment_method,
  transaction_count bigint,
  total_amount numeric
)
language sql stable security definer set search_path = public
as $$
  select method, count(*) as transaction_count, sum(total_amount) as total_amount
  from public.payments
  where gym_id = p_gym_id and created_at::date between p_start and p_end
  group by method
  order by total_amount desc;
$$;

-- ============================================================================
-- PROFIT & LOSS — monthly revenue (net of refunds) vs. expenses (manual
-- ledger + finalized/paid payroll net pay, so payroll isn't double counted
-- against a separate "salaries" manual entry unless one is also logged).
-- ============================================================================

create or replace function public.report_profit_loss(p_gym_id uuid, p_start date, p_end date)
returns table (
  month date,
  revenue numeric,
  refunds numeric,
  manual_expenses numeric,
  payroll_expenses numeric,
  total_expenses numeric,
  profit numeric
)
language sql stable security definer set search_path = public
as $$
  select
    m::date as month,
    coalesce(rev.total, 0) as revenue,
    coalesce(rf.total, 0) as refunds,
    coalesce(exp.total, 0) as manual_expenses,
    coalesce(pay.total, 0) as payroll_expenses,
    coalesce(exp.total, 0) + coalesce(pay.total, 0) as total_expenses,
    coalesce(rev.total, 0) - coalesce(rf.total, 0) - coalesce(exp.total, 0) - coalesce(pay.total, 0) as profit
  from generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month') m
  left join (
    select date_trunc('month', created_at) as month, sum(total_amount) as total
    from public.payments where gym_id = p_gym_id
    group by 1
  ) rev on rev.month = m
  left join (
    select date_trunc('month', created_at) as month, sum(amount) as total
    from public.refunds where gym_id = p_gym_id
    group by 1
  ) rf on rf.month = m
  left join (
    select date_trunc('month', expense_date) as month, sum(amount) as total
    from public.expenses where gym_id = p_gym_id
    group by 1
  ) exp on exp.month = m
  left join (
    select month as month, sum(net_pay) as total
    from public.payslips where gym_id = p_gym_id and status in ('finalized','paid')
    group by 1
  ) pay on pay.month = m
  order by m;
$$;

-- ============================================================================
-- ANALYTICS — retention (still-active members from N months ago cohort),
-- growth (new vs. lost members per month), renewal rate (renewed vs. expired).
-- ============================================================================

create or replace function public.analytics_growth(p_gym_id uuid, p_start date, p_end date)
returns table (
  month date,
  new_members bigint,
  churned_members bigint,
  net_growth bigint,
  total_active_at_month_end bigint
)
language sql stable security definer set search_path = public
as $$
  select
    m::date as month,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id and date_trunc('month', md.joining_date) = m
    ), 0) as new_members,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id and md.status = 'cancelled'
        and date_trunc('month', md.updated_at) = m
    ), 0) as churned_members,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id and date_trunc('month', md.joining_date) = m
    ), 0) - coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id and md.status = 'cancelled' and date_trunc('month', md.updated_at) = m
    ), 0) as net_growth,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id and md.joining_date <= (m + interval '1 month' - interval '1 day')
        and (md.status <> 'cancelled' or md.updated_at > (m + interval '1 month' - interval '1 day'))
    ), 0) as total_active_at_month_end
  from generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month') m
  order by m;
$$;

create or replace function public.analytics_renewal_rate(p_gym_id uuid, p_start date, p_end date)
returns table (
  month date,
  expiring_count bigint,
  renewed_count bigint,
  renewal_rate numeric
)
language sql stable security definer set search_path = public
as $$
  with expiring as (
    select mm.id, mm.member_id, date_trunc('month', mm.end_date) as month
    from public.member_memberships mm
    where mm.gym_id = p_gym_id and mm.end_date between p_start and p_end
  )
  select
    e.month::date as month,
    count(*) as expiring_count,
    count(*) filter (
      where exists (
        select 1 from public.member_memberships mm2
        where mm2.member_id = e.member_id and mm2.start_date > (
          select end_date from public.member_memberships where id = e.id
        )
        and mm2.start_date <= (select end_date from public.member_memberships where id = e.id) + interval '14 days'
      )
    ) as renewed_count,
    round(
      100.0 * count(*) filter (
        where exists (
          select 1 from public.member_memberships mm2
          where mm2.member_id = e.member_id and mm2.start_date > (
            select end_date from public.member_memberships where id = e.id
          )
          and mm2.start_date <= (select end_date from public.member_memberships where id = e.id) + interval '14 days'
        )
      ) / nullif(count(*), 0), 1
    ) as renewal_rate
  from expiring e
  group by e.month
  order by e.month;
$$;

create or replace function public.analytics_retention(p_gym_id uuid)
returns table (
  cohort_months_ago int,
  cohort_size bigint,
  still_active bigint,
  retention_rate numeric
)
language sql stable security definer set search_path = public
as $$
  select
    n as cohort_months_ago,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id
        and date_trunc('month', md.joining_date) = date_trunc('month', current_date) - (n || ' months')::interval
    ), 0) as cohort_size,
    coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id
        and date_trunc('month', md.joining_date) = date_trunc('month', current_date) - (n || ' months')::interval
        and md.status = 'active'
    ), 0) as still_active,
    round(100.0 * coalesce((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id
        and date_trunc('month', md.joining_date) = date_trunc('month', current_date) - (n || ' months')::interval
        and md.status = 'active'
    ), 0) / nullif((
      select count(*) from public.member_details md
      where md.gym_id = p_gym_id
        and date_trunc('month', md.joining_date) = date_trunc('month', current_date) - (n || ' months')::interval
    ), 0), 1) as retention_rate
  from generate_series(1, 6) n
  order by cohort_months_ago;
$$;

-- ============================================================================
-- Grant execute on all report/analytics functions to authenticated role —
-- they're security definer and internally scoped by p_gym_id, but the RLS-
-- equivalent gating happens in the calling Server Action via has_permission().
-- ============================================================================
grant execute on function
  public.report_revenue(uuid, date, date),
  public.report_membership_summary(uuid),
  public.report_attendance(uuid, date, date),
  public.report_trainer_performance(uuid, date, date),
  public.report_inventory(uuid, date, date),
  public.report_payments_by_method(uuid, date, date),
  public.report_profit_loss(uuid, date, date),
  public.analytics_growth(uuid, date, date),
  public.analytics_renewal_rate(uuid, date, date),
  public.analytics_retention(uuid)
to authenticated;


-- ===========================================================================
-- FILE: 0019_super_admin_console.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 12: Super Admin Console
-- Subscription plan catalog, platform billing/invoices, feature flag catalog,
-- platform settings (singleton), support ticket threaded replies, and
-- platform-wide analytics functions. Every table here is super-admin-only —
-- this module manages the platform itself, not any single tenant's data.
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

create type public.invoice_status as enum (
  'draft', 'open', 'paid', 'void', 'uncollectible'
);

-- ============================================================================
-- SUBSCRIPTION PLAN CATALOG
-- The platform's own pricing plans (distinct from a gym's membership_plans,
-- which are what a gym sells to ITS members). Tenants.subscription_plan
-- stores the `code` of one of these rows.
-- ============================================================================

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, -- 'trial', 'starter', 'growth', 'enterprise'
  name text not null,
  description text,
  monthly_price numeric(10,2) not null default 0,
  annual_price numeric(10,2) not null default 0,
  currency text not null default 'INR',
  max_gyms int, -- null = unlimited
  max_members int, -- null = unlimited
  max_staff int, -- null = unlimited
  features jsonb not null default '[]'::jsonb, -- list of feature strings shown on pricing card
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- PLATFORM BILLING: invoices issued by the platform to a tenant (SaaS fees —
-- not to be confused with a gym's own `payments` table, which is a gym
-- billing its members). Manually recorded/marked-paid for now: no live
-- payment gateway integration is in scope for this module.
-- ============================================================================

create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null unique,
  plan_code text references public.subscription_plans(code),
  billing_period_start date not null,
  billing_period_end date not null,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status public.invoice_status not null default 'open',
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_platform_invoices_tenant on public.platform_invoices(tenant_id, issued_at desc);
create index idx_platform_invoices_status on public.platform_invoices(status);

create trigger trg_platform_invoices_updated_at before update on public.platform_invoices
  for each row execute function public.set_updated_at();

-- Gapless platform invoice numbers, same pattern as the gym-level
-- next_invoice_number/next_receipt_number functions from Part 4.
create sequence if not exists public.platform_invoice_seq;

create or replace function public.next_platform_invoice_number()
returns text
language sql
security definer set search_path = public
as $$
  select 'PLT-INV-' || to_char(now(), 'YYYY') || '-' ||
    lpad(nextval('public.platform_invoice_seq')::text, 6, '0');
$$;

-- ============================================================================
-- FEATURE FLAG CATALOG
-- A known-flags registry so Super Admin gets a real toggle UI (name,
-- description, default) instead of hand-typing arbitrary JSON keys.
-- The actual per-tenant on/off state still lives in tenants.feature_flags
-- jsonb (added in Part 1) — this table is the catalog of *what* a flag
-- means and its platform-wide default, not a duplicate of tenant state.
-- ============================================================================

create table public.feature_flag_catalog (
  key text primary key, -- e.g. 'ai_features', 'multi_branch', 'white_label'
  label text not null,
  description text,
  default_enabled boolean not null default false,
  category text not null default 'general', -- general, ai, billing, branding
  created_at timestamptz not null default now()
);

-- ============================================================================
-- PLATFORM SETTINGS (singleton row — global config for the whole SaaS)
-- ============================================================================

create table public.platform_settings (
  id boolean primary key default true constraint platform_settings_singleton check (id),
  platform_name text not null default 'GymOS',
  support_email text,
  default_trial_days int not null default 14,
  maintenance_mode boolean not null default false,
  maintenance_message text,
  allow_new_registrations boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

create trigger trg_platform_settings_updated_at before update on public.platform_settings
  for each row execute function public.set_updated_at();

-- ============================================================================
-- SUPPORT TICKET REPLIES (threaded conversation between platform + tenant)
-- ============================================================================

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  message text not null,
  is_internal_note boolean not null default false, -- super-admin-only private note
  created_at timestamptz not null default now()
);

create index idx_ticket_messages_ticket on public.support_ticket_messages(ticket_id, created_at);

-- ============================================================================
-- TENANT SUSPENSION / IMPERSONATION AUDIT
-- A dedicated log (distinct from the generic audit_logs table) for the two
-- most sensitive super-admin powers, so they're always separately queryable.
-- ============================================================================

create table public.tenant_admin_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null, -- 'suspended', 'reactivated', 'plan_changed', 'flag_toggled', 'impersonation_started'
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_tenant_admin_actions_tenant on public.tenant_admin_actions(tenant_id, created_at desc);

-- ============================================================================
-- RLS — every table here is super-admin-only. Tenants get read-only access
-- to their own invoices (so a gym owner can see what they're billed) and to
-- the ticket messages on their own tickets; nothing else.
-- ============================================================================

alter table public.subscription_plans enable row level security;
alter table public.platform_invoices enable row level security;
alter table public.feature_flag_catalog enable row level security;
alter table public.platform_settings enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.tenant_admin_actions enable row level security;

-- Subscription plans: publicly readable (pricing page needs this), only
-- super admin can write.
create policy "subscription_plans_select" on public.subscription_plans for select
  using (true);
create policy "subscription_plans_write" on public.subscription_plans for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Platform invoices: super admin full access; a tenant's own gym_owner can
-- read (but never write) their own tenant's invoices.
create policy "platform_invoices_select" on public.platform_invoices for select
  using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id() and public.current_role() = 'gym_owner')
  );
create policy "platform_invoices_write" on public.platform_invoices for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Feature flag catalog: readable by any authenticated user (settings pages
-- may want to know what a flag means), writable by super admin only.
create policy "feature_flag_catalog_select" on public.feature_flag_catalog for select
  using (auth.uid() is not null);
create policy "feature_flag_catalog_write" on public.feature_flag_catalog for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Platform settings: readable by any authenticated user (e.g. maintenance
-- banner), writable by super admin only.
create policy "platform_settings_select" on public.platform_settings for select
  using (auth.uid() is not null);
create policy "platform_settings_write" on public.platform_settings for update
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Ticket messages: super admin sees/writes all; a tenant's staff can
-- see/write messages on their own tenant's tickets, but never internal notes.
create policy "ticket_messages_select" on public.support_ticket_messages for select
  using (
    public.is_super_admin()
    or (
      not is_internal_note
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.tenant_id = public.current_tenant_id()
      )
    )
  );
create policy "ticket_messages_insert" on public.support_ticket_messages for insert
  with check (
    public.is_super_admin()
    or (
      not is_internal_note
      and author_id = auth.uid()
      and exists (
        select 1 from public.support_tickets t
        where t.id = ticket_id and t.tenant_id = public.current_tenant_id()
      )
    )
  );

-- Tenant admin actions: super-admin-only, fully.
create policy "tenant_admin_actions_select" on public.tenant_admin_actions for select
  using (public.is_super_admin());
create policy "tenant_admin_actions_insert" on public.tenant_admin_actions for insert
  with check (public.is_super_admin());

-- ============================================================================
-- TENANTS OVERVIEW VIEW — for the Tenants table UI (search/sort/paginate)
-- ============================================================================

create or replace view public.tenants_overview as
select
  t.*,
  owner.full_name as owner_full_name,
  owner.email as owner_email,
  owner.phone as owner_phone,
  (select count(*) from public.gyms g where g.tenant_id = t.id) as gym_count,
  (select count(*) from public.profiles p where p.tenant_id = t.id and p.role = 'member') as member_count
from public.tenants t
left join public.profiles owner on owner.id = t.owner_id;

-- ============================================================================
-- PLATFORM-WIDE ANALYTICS FUNCTIONS (super-admin-only reads, enforced in the
-- Server Action layer via requireRole('super_admin') — these functions
-- themselves are plain aggregations with no gym_id scoping since they are,
-- by design, cross-tenant)
-- ============================================================================

-- MRR + tenant counts by plan and status, for the platform overview page.
create or replace function public.platform_overview_stats()
returns table (
  total_tenants bigint,
  active_tenants bigint,
  trialing_tenants bigint,
  suspended_tenants bigint,
  past_due_tenants bigint,
  total_gyms bigint,
  total_members bigint,
  mrr numeric
)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*) from public.tenants) as total_tenants,
    (select count(*) from public.tenants where subscription_status = 'active') as active_tenants,
    (select count(*) from public.tenants where subscription_status = 'trialing') as trialing_tenants,
    (select count(*) from public.tenants where subscription_status = 'suspended') as suspended_tenants,
    (select count(*) from public.tenants where subscription_status = 'past_due') as past_due_tenants,
    (select count(*) from public.gyms) as total_gyms,
    (select count(*) from public.member_details) as total_members,
    coalesce((
      select sum(sp.monthly_price)
      from public.tenants t
      join public.subscription_plans sp on sp.code = t.subscription_plan
      where t.subscription_status = 'active'
    ), 0) as mrr;
$$;

-- New tenants signed up per month, for a growth chart.
create or replace function public.platform_tenant_growth(p_start date, p_end date)
returns table (
  month date,
  new_tenants bigint,
  cumulative_tenants bigint
)
language sql stable security definer set search_path = public
as $$
  with months as (
    select generate_series(date_trunc('month', p_start), date_trunc('month', p_end), interval '1 month')::date as month
  ),
  monthly as (
    select date_trunc('month', created_at)::date as month, count(*) as new_tenants
    from public.tenants
    where created_at::date between p_start and p_end
    group by 1
  )
  select
    m.month,
    coalesce(mo.new_tenants, 0) as new_tenants,
    (select count(*) from public.tenants t where t.created_at::date <= (m.month + interval '1 month' - interval '1 day')::date) as cumulative_tenants
  from months m
  left join monthly mo on mo.month = m.month
  order by m.month;
$$;

-- Per-tenant usage summary for the tenant detail page.
create or replace function public.tenant_usage_summary(p_tenant_id uuid)
returns table (
  gym_count bigint,
  staff_count bigint,
  member_count bigint,
  active_member_count bigint,
  total_revenue numeric,
  last_activity_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*) from public.gyms where tenant_id = p_tenant_id) as gym_count,
    (select count(*) from public.profiles where tenant_id = p_tenant_id and role in ('gym_owner','receptionist','trainer')) as staff_count,
    (select count(*) from public.profiles where tenant_id = p_tenant_id and role = 'member') as member_count,
    (select count(*) from public.member_details md join public.gyms g on g.id = md.gym_id where g.tenant_id = p_tenant_id and md.status = 'active') as active_member_count,
    coalesce((select sum(p.total_amount) from public.payments p join public.gyms g on g.id = p.gym_id where g.tenant_id = p_tenant_id), 0) as total_revenue,
    (select max(last_login_at) from public.profiles where tenant_id = p_tenant_id) as last_activity_at;
$$;

-- Support ticket volume/status breakdown for the platform overview.
create or replace function public.platform_ticket_stats()
returns table (
  open_count bigint,
  in_progress_count bigint,
  resolved_count bigint,
  closed_count bigint,
  urgent_open_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    count(*) filter (where status = 'open') as open_count,
    count(*) filter (where status = 'in_progress') as in_progress_count,
    count(*) filter (where status = 'resolved') as resolved_count,
    count(*) filter (where status = 'closed') as closed_count,
    count(*) filter (where status = 'open' and priority = 'urgent') as urgent_open_count
  from public.support_tickets;
$$;

-- ============================================================================
-- TENANT SUSPEND / REACTIVATE (server-authoritative — the same function the
-- Server Action calls, so suspension can never be a client-only UI flag)
-- ============================================================================

create or replace function public.suspend_tenant(p_tenant_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can suspend a tenant.';
  end if;

  update public.tenants set subscription_status = 'suspended' where id = p_tenant_id;

  insert into public.tenant_admin_actions (tenant_id, actor_id, action, reason)
  values (p_tenant_id, auth.uid(), 'suspended', p_reason);
end;
$$;

create or replace function public.reactivate_tenant(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only a super admin can reactivate a tenant.';
  end if;

  update public.tenants set subscription_status = 'active' where id = p_tenant_id;

  insert into public.tenant_admin_actions (tenant_id, actor_id, action)
  values (p_tenant_id, auth.uid(), 'reactivated');
end;
$$;

-- ============================================================================
-- SEED: default subscription plan catalog (matches tenants.subscription_plan
-- default 'trial' from Part 1, plus the three commercial tiers)
-- ============================================================================

insert into public.subscription_plans (code, name, description, monthly_price, annual_price, max_gyms, max_members, max_staff, features, sort_order) values
  ('trial', 'Trial', '14-day free trial of the Growth plan.', 0, 0, 1, 100, 5,
    '["All Growth features", "14 days, no card required"]'::jsonb, 0),
  ('starter', 'Starter', 'For a single gym just getting started.', 2999, 29990, 1, 200, 5,
    '["1 gym location", "Up to 200 members", "Attendance + payments", "Email support"]'::jsonb, 1),
  ('growth', 'Growth', 'For growing gyms that need marketing and AI tools.', 6999, 69990, 3, 1000, 20,
    '["Up to 3 gym locations", "Up to 1,000 members", "Marketing & CRM", "AI features", "Priority support"]'::jsonb, 2),
  ('enterprise', 'Enterprise', 'For multi-branch chains with custom needs.', 14999, 149990, null, null, null,
    '["Unlimited gym locations", "Unlimited members", "White-label branding", "Dedicated support", "Custom integrations"]'::jsonb, 3)
on conflict (code) do nothing;

-- ============================================================================
-- SEED: feature flag catalog
-- ============================================================================

insert into public.feature_flag_catalog (key, label, description, default_enabled, category) values
  ('ai_features', 'AI Features', 'AI workout/diet generation, chat assistant, risk analysis, revenue forecast.', true, 'ai'),
  ('marketing_campaigns', 'Marketing Campaigns', 'Email/WhatsApp campaigns, coupons, referrals, birthday/festival automation.', true, 'general'),
  ('multi_branch', 'Multi-Branch', 'Allow a tenant to operate more than one gym location.', false, 'general'),
  ('white_label', 'White-Label Branding', 'Custom domain, logo, and primary color instead of GymOS branding.', false, 'branding'),
  ('advanced_reports', 'Advanced Reports & Analytics', 'Profit & loss, growth, renewal-rate, and retention analytics.', true, 'general'),
  ('realtime_chat', 'Realtime Chat', 'Trainer/member/admin realtime chat with attachments.', true, 'general')
on conflict (key) do nothing;

-- ============================================================================
-- PERMISSION MATRIX — platform resources are implicitly super-admin-only via
-- has_permission()'s early `if v_role = 'super_admin' then return true`, so
-- no explicit rows are required for other roles (they simply have none,
-- which resolves to `false` via the coalesce in has_permission). Documented
-- here for clarity rather than adding no-op rows.
-- ============================================================================


-- ===========================================================================
-- FILE: 0020_multi_branch_chat.sql
-- ===========================================================================
-- ============================================================================
-- GymOS — Part 13: Multi-Branch + Realtime Chat
-- ============================================================================
-- DESIGN NOTE — Multi-branch:
-- Every Server Action and RLS policy written in Parts 1-12 scopes reads/writes
-- through the ACTING USER'S OWN `profiles.gym_id` (via the current_gym_id()
-- helper from Part 1). That is true of ~105 RLS policy references across 10
-- migration files, and of every Server Action that does
-- `const actor = await getCurrentProfile(); ... eq("gym_id", actor.gym_id)`.
--
-- Rather than rewrite that entire surface (high risk, no real benefit), Part
-- 13 makes the gym_owner's *own* `gym_id` switchable between branches they
-- own. Switching branches is just an authenticated self-update of
-- `profiles.gym_id` — already permitted by the Part 1 `profiles_update`
-- policy (`id = auth.uid()`). The moment the owner switches, every existing
-- table, view, RLS policy, and Server Action in the app automatically
-- operates on the newly-selected branch, with zero changes to Parts 1-12.
-- "Separate Data" (per branch) was already true by construction. What Part
-- 13 adds on top: (a) a Branches CRUD module (the `gyms` table's own RLS was
-- ALREADY tenant-scoped, not gym-scoped, for insert/update/delete — so gym
-- owners could already create multiple branches; there was just no UI for
-- it), (b) a branch switcher, and (c) "Combined Analytics" via new
-- SECURITY DEFINER functions that explicitly aggregate across every gym in
-- the caller's tenant (bypassing the normal single-branch RLS scoping on
-- purpose, and only for the tenant the caller actually owns).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BRANCHES: small additive columns to the existing `gyms` table
-- ----------------------------------------------------------------------------
alter table public.gyms
  add column if not exists manager_id uuid references public.profiles(id) on delete set null,
  add column if not exists monthly_revenue_target numeric(12,2);

create index if not exists idx_gyms_manager on public.gyms(manager_id);

-- ----------------------------------------------------------------------------
-- SWITCH ACTIVE BRANCH
-- Server-authoritative: verifies the target gym belongs to the caller's own
-- tenant and that the caller is that tenant's gym_owner before flipping
-- profiles.gym_id. (The Server Action also checks this, but the DB function
-- is the real authority — never trust a client-supplied gym_id alone.)
-- ----------------------------------------------------------------------------
create or replace function public.switch_active_branch(p_gym_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_role public.app_role;
  v_tenant_id uuid;
  v_gym_tenant_id uuid;
begin
  select role, tenant_id into v_role, v_tenant_id from public.profiles where id = auth.uid();

  if v_role is distinct from 'gym_owner' then
    raise exception 'Only a gym owner can switch branches.';
  end if;

  select tenant_id into v_gym_tenant_id from public.gyms where id = p_gym_id;

  if v_gym_tenant_id is null or v_gym_tenant_id <> v_tenant_id then
    raise exception 'That branch does not belong to your gym.';
  end if;

  update public.profiles set gym_id = p_gym_id where id = auth.uid();
end;
$$;

-- ----------------------------------------------------------------------------
-- COMBINED ANALYTICS ACROSS BRANCHES (gym_owner / super_admin only, scoped to
-- the caller's own tenant — never cross-tenant)
-- ----------------------------------------------------------------------------
create or replace function public.tenant_branch_comparison(p_start date, p_end date)
returns table (
  gym_id uuid,
  gym_name text,
  gym_code text,
  is_active boolean,
  member_count bigint,
  active_member_count bigint,
  staff_count bigint,
  revenue numeric,
  attendance_count bigint,
  new_members bigint
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.app_role;
  v_tenant_id uuid;
begin
  select role, tenant_id into v_role, v_tenant_id from public.profiles where id = auth.uid();
  if v_role not in ('gym_owner','super_admin') or v_tenant_id is null then
    raise exception 'Not authorized.';
  end if;

  return query
  select
    g.id,
    g.name,
    g.code,
    g.is_active,
    (select count(*) from public.member_details md where md.gym_id = g.id) as member_count,
    (select count(*) from public.member_details md where md.gym_id = g.id and md.status = 'active') as active_member_count,
    (select count(*) from public.profiles p where p.gym_id = g.id and p.role in ('receptionist','trainer')) as staff_count,
    coalesce((
      select sum(pay.total_amount) from public.payments pay
      where pay.gym_id = g.id and pay.created_at::date between p_start and p_end
    ), 0) - coalesce((
      select sum(r.amount) from public.refunds r
      where r.gym_id = g.id and r.created_at::date between p_start and p_end
    ), 0) as revenue,
    (select count(*) from public.attendance_records ar where ar.gym_id = g.id and ar.check_in_at::date between p_start and p_end) as attendance_count,
    (select count(*) from public.member_details md where md.gym_id = g.id and md.joining_date between p_start and p_end) as new_members
  from public.gyms g
  where g.tenant_id = v_tenant_id
  order by g.created_at asc;
end;
$$;

create or replace function public.tenant_combined_overview()
returns table (
  total_gyms bigint,
  active_gyms bigint,
  total_members bigint,
  active_members bigint,
  total_staff bigint,
  revenue_this_month numeric,
  revenue_last_month numeric
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_role public.app_role;
  v_tenant_id uuid;
begin
  select role, tenant_id into v_role, v_tenant_id from public.profiles where id = auth.uid();
  if v_role not in ('gym_owner','super_admin') or v_tenant_id is null then
    raise exception 'Not authorized.';
  end if;

  return query
  select
    (select count(*) from public.gyms g where g.tenant_id = v_tenant_id) as total_gyms,
    (select count(*) from public.gyms g where g.tenant_id = v_tenant_id and g.is_active) as active_gyms,
    (select count(*) from public.member_details md join public.gyms g on g.id = md.gym_id where g.tenant_id = v_tenant_id) as total_members,
    (select count(*) from public.member_details md join public.gyms g on g.id = md.gym_id where g.tenant_id = v_tenant_id and md.status = 'active') as active_members,
    (select count(*) from public.profiles p where p.tenant_id = v_tenant_id and p.role in ('receptionist','trainer')) as total_staff,
    coalesce((
      select sum(pay.total_amount) from public.payments pay join public.gyms g on g.id = pay.gym_id
      where g.tenant_id = v_tenant_id
        and date_trunc('month', pay.created_at) = date_trunc('month', now())
    ), 0) as revenue_this_month,
    coalesce((
      select sum(pay.total_amount) from public.payments pay join public.gyms g on g.id = pay.gym_id
      where g.tenant_id = v_tenant_id
        and date_trunc('month', pay.created_at) = date_trunc('month', now() - interval '1 month')
    ), 0) as revenue_last_month;
end;
$$;

-- ----------------------------------------------------------------------------
-- CHAT: channels, membership, messages
-- ----------------------------------------------------------------------------
create type public.chat_channel_type as enum ('direct', 'broadcast');
create type public.chat_broadcast_audience as enum ('all_members', 'all_staff', 'all_trainers', 'all_receptionists');

create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  gym_id uuid references public.gyms(id) on delete cascade,
  type public.chat_channel_type not null,
  name text,                     -- broadcast channels only
  broadcast_audience public.chat_broadcast_audience, -- broadcast channels only
  direct_key text unique,        -- deterministic "sortedId1_sortedId2", direct channels only
  created_by uuid not null references public.profiles(id),
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_chat_channels_tenant on public.chat_channels(tenant_id);
create index idx_chat_channels_gym on public.chat_channels(gym_id);

create table public.chat_channel_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  can_send boolean not null default true,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (channel_id, profile_id)
);

create index idx_chat_members_profile on public.chat_channel_members(profile_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text,
  attachment_url text,
  attachment_type text,          -- 'image' | 'voice' | 'pdf'
  attachment_public_id text,
  created_at timestamptz not null default now(),
  constraint chat_messages_has_content check (body is not null or attachment_url is not null)
);

create index idx_chat_messages_channel on public.chat_messages(channel_id, created_at);

-- Keep channel's last_message_at fresh so the channel list can sort/preview
-- without a join+aggregate on every render.
create or replace function public.touch_chat_channel_on_message()
returns trigger
language plpgsql
as $$
begin
  update public.chat_channels set last_message_at = new.created_at where id = new.channel_id;
  return new;
end;
$$;

create trigger trg_touch_chat_channel
  after insert on public.chat_messages
  for each row execute function public.touch_chat_channel_on_message();

-- ----------------------------------------------------------------------------
-- get_or_create_direct_channel
-- Server-authoritative pairing rules (per spec: Trainer<->Member, Admin<->Trainer):
--   - member <-> their own assigned_trainer_id
--   - gym_owner <-> any trainer or receptionist in a gym they currently manage
--   - super_admin <-> gym_owner of any tenant (support escalation)
-- ----------------------------------------------------------------------------
create or replace function public.get_or_create_direct_channel(p_other_profile_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles%rowtype;
  v_other public.profiles%rowtype;
  v_key text;
  v_channel_id uuid;
  v_allowed boolean := false;
begin
  select * into v_me from public.profiles where id = auth.uid();
  select * into v_other from public.profiles where id = p_other_profile_id;

  if v_me.id is null or v_other.id is null then
    raise exception 'Profile not found.';
  end if;
  if v_me.id = v_other.id then
    raise exception 'Cannot start a chat with yourself.';
  end if;

  if v_me.role = 'member' and v_other.role = 'trainer' then
    v_allowed := exists (select 1 from public.member_details md where md.profile_id = v_me.id and md.assigned_trainer_id = v_other.id);
  elsif v_me.role = 'trainer' and v_other.role = 'member' then
    v_allowed := exists (select 1 from public.member_details md where md.profile_id = v_other.id and md.assigned_trainer_id = v_me.id);
  elsif v_me.role = 'gym_owner' and v_other.role in ('trainer','receptionist') then
    v_allowed := v_other.tenant_id = v_me.tenant_id;
  elsif v_me.role in ('trainer','receptionist') and v_other.role = 'gym_owner' then
    v_allowed := v_me.tenant_id = v_other.tenant_id;
  elsif v_me.role = 'super_admin' or v_other.role = 'super_admin' then
    v_allowed := (v_me.role = 'super_admin' and v_other.role = 'gym_owner')
              or (v_other.role = 'super_admin' and v_me.role = 'gym_owner');
  end if;

  if not v_allowed then
    raise exception 'You are not allowed to message this person.';
  end if;

  v_key := (select string_agg(id::text, '_' order by id) from (values (v_me.id), (v_other.id)) as t(id));

  select id into v_channel_id from public.chat_channels where direct_key = v_key;

  if v_channel_id is null then
    insert into public.chat_channels (tenant_id, gym_id, type, direct_key, created_by)
    values (coalesce(v_me.tenant_id, v_other.tenant_id), coalesce(v_me.gym_id, v_other.gym_id), 'direct', v_key, v_me.id)
    returning id into v_channel_id;

    insert into public.chat_channel_members (channel_id, profile_id, can_send)
    values (v_channel_id, v_me.id, true), (v_channel_id, v_other.id, true);
  end if;

  return v_channel_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- create_broadcast_channel — gym_owner only, scoped to their active branch
-- ----------------------------------------------------------------------------
create or replace function public.create_broadcast_channel(p_name text, p_audience public.chat_broadcast_audience)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me public.profiles%rowtype;
  v_channel_id uuid;
begin
  select * into v_me from public.profiles where id = auth.uid();
  if v_me.role <> 'gym_owner' or v_me.gym_id is null then
    raise exception 'Only a gym owner can create a broadcast.';
  end if;

  insert into public.chat_channels (tenant_id, gym_id, type, name, broadcast_audience, created_by)
  values (v_me.tenant_id, v_me.gym_id, 'broadcast', p_name, p_audience, v_me.id)
  returning id into v_channel_id;

  insert into public.chat_channel_members (channel_id, profile_id, can_send)
  values (v_channel_id, v_me.id, true);

  insert into public.chat_channel_members (channel_id, profile_id, can_send)
  select v_channel_id, p.id, false
  from public.profiles p
  where p.gym_id = v_me.gym_id
    and p.id <> v_me.id
    and (
      (p_audience = 'all_members' and p.role = 'member')
      or (p_audience = 'all_staff' and p.role in ('trainer','receptionist'))
      or (p_audience = 'all_trainers' and p.role = 'trainer')
      or (p_audience = 'all_receptionists' and p.role = 'receptionist')
    );

  return v_channel_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.chat_channels enable row level security;
alter table public.chat_channel_members enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_channels_select" on public.chat_channels for select
  using (
    public.is_super_admin()
    or exists (select 1 from public.chat_channel_members m where m.channel_id = id and m.profile_id = auth.uid())
  );
-- No direct insert policy: channels are only ever created through the
-- SECURITY DEFINER functions above, which bypass RLS and enforce the real
-- pairing/audience rules server-side.
create policy "chat_channels_insert_super_admin" on public.chat_channels for insert
  with check (public.is_super_admin());

create policy "chat_members_select" on public.chat_channel_members for select
  using (
    public.is_super_admin()
    or profile_id = auth.uid()
    or exists (select 1 from public.chat_channel_members m2 where m2.channel_id = channel_id and m2.profile_id = auth.uid())
  );
create policy "chat_members_update_own" on public.chat_channel_members for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "chat_messages_select" on public.chat_messages for select
  using (
    public.is_super_admin()
    or exists (select 1 from public.chat_channel_members m where m.channel_id = channel_id and m.profile_id = auth.uid())
  );
create policy "chat_messages_insert" on public.chat_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_channel_members m
      where m.channel_id = channel_id and m.profile_id = auth.uid() and m.can_send = true
    )
  );

-- ----------------------------------------------------------------------------
-- REALTIME: broadcast Postgres changes on new messages to subscribed clients
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages;

-- ----------------------------------------------------------------------------
-- VIEW: chat channel list with computed unread counts + display info
-- ----------------------------------------------------------------------------
create or replace view public.chat_channels_overview as
select
  c.id as channel_id,
  c.tenant_id,
  c.gym_id,
  c.type,
  c.name,
  c.broadcast_audience,
  c.last_message_at,
  c.created_at,
  m.profile_id as viewer_id,
  m.can_send,
  m.last_read_at,
  (
    select count(*) from public.chat_messages msg
    where msg.channel_id = c.id
      and msg.created_at > coalesce(m.last_read_at, 'epoch'::timestamptz)
      and msg.sender_id <> m.profile_id
  ) as unread_count,
  (
    select msg.body from public.chat_messages msg
    where msg.channel_id = c.id order by msg.created_at desc limit 1
  ) as last_message_preview,
  (
    select jsonb_agg(jsonb_build_object('id', op.id, 'full_name', op.full_name, 'avatar_url', op.avatar_url, 'role', op.role))
    from public.chat_channel_members om
    join public.profiles op on op.id = om.profile_id
    where om.channel_id = c.id and om.profile_id <> m.profile_id
  ) as other_participants
from public.chat_channels c
join public.chat_channel_members m on m.channel_id = c.id
where m.profile_id = auth.uid();

alter view public.chat_channels_overview set (security_invoker = true);

-- ============================================================================
-- PERMISSION MATRIX — chat + branches
-- ============================================================================
insert into public.permissions (role, resource, action, allowed) values
  ('gym_owner','branches','create',true), ('gym_owner','branches','read',true),
  ('gym_owner','branches','update',true), ('gym_owner','branches','delete',true),
  ('gym_owner','chat','create',true), ('gym_owner','chat','read',true),
  ('trainer','chat','create',true), ('trainer','chat','read',true),
  ('member','chat','create',true), ('member','chat','read',true)
on conflict (role, resource, action) do nothing;

-- ===========================================================================
-- FILE: 0021_renewal_reminder_emails.sql
-- ===========================================================================
-- ============================================================================
-- Add 'on_expiry' to reminder_type -- the existing enum only has offsets of
-- 1/3/7/30 days after expiry, with no value for "the day it actually
-- expires". The new renewal reminder emails (7d/3d/1d before, immediately
-- on expiry) need that fourth window.
-- ============================================================================

alter type public.reminder_type add value if not exists 'on_expiry';

-- ============================================================================
-- Schedule the new email-only renewal reminders (7d/3d/1d before + on
-- expiry, sent via the app's Gmail SMTP transport) to run once a day.
-- This is separate from the existing renewal-reminders-daily job (which
-- still handles WhatsApp + its own best-effort Resend email on a wider
-- set of windows) -- this one calls the Next.js app directly instead of a
-- Supabase Edge Function, since nodemailer needs the Node runtime.
--
-- Replace <APP_URL> and <CRON_SECRET> with real values before running
-- (same CRON_SECRET as in your .env -- see app/api/cron/renewal-reminders).
-- ============================================================================

select cron.schedule(
  'renewal-reminder-emails-daily',
  '0 9 * * *', -- every day at 09:00 UTC
  $$
  select net.http_get(
    url := '<APP_URL>/api/cron/renewal-reminders',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  );
  $$
);