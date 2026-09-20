# GymOS

**The operating system for modern gyms.** Memberships, attendance, trainers,
payments, CRM, inventory, payroll, marketing, reports, AI features, and
realtime chat — for single gyms and multi-branch chains alike.

Built with Next.js 15 (App Router), TypeScript (strict), Supabase (Postgres +
Auth + Storage + Realtime + Edge Functions), Cloudinary, and Tailwind CSS.

---

## Contents

- [Quick start](#quick-start)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Roles](#roles)
- [Environment variables](#environment-variables)
- [Database & migrations](#database--migrations)
- [Demo data](#demo-data)
- [Testing](#testing)
- [Deployment](#deployment)
- [Build history](#build-history)

---

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and fill in your own values
cp .env.example .env.local
# see "Environment variables" below for what each one needs

# 3. Push the database schema (all 20 migrations, in order) to your Supabase project
npm run db:migrate

# 4. (Optional but recommended) Seed a realistic demo tenant so the app isn't empty
npm run db:seed

# 5. Run the dev server
npm run dev
```

Then open http://localhost:3000. If you ran the seed script, log in at
`/login` with the demo credentials it prints to the console (gym owner,
receptionist, trainer, and 25 members are all created).

For a full production deployment (Vercel + Supabase + Cloudinary + Edge
Function cron schedules), see **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend framework | Next.js 15, App Router, React 19, TypeScript (strict) |
| Styling | Tailwind CSS, CVA, Framer Motion |
| Forms & validation | React Hook Form + Zod |
| Data fetching / tables | TanStack Query, TanStack Table |
| Charts | Recharts |
| Backend | Supabase (Postgres, Auth, Row Level Security, Storage, Realtime, Edge Functions, `pg_cron`) |
| Image storage | Cloudinary (member/trainer photos, transformation photos, certificates) |
| Email | Resend |
| WhatsApp | Meta WhatsApp Cloud API (direct) |
| AI | Anthropic Claude (`lib/services/anthropic.ts`) |
| PDF / Excel export | jsPDF + jspdf-autotable, SheetJS (`xlsx`) |
| Testing | Vitest |

---

## Project structure

```
app/
  (auth)/                  Login, register-gym, forgot/reset password
  (marketing)/             Public landing site (home, pricing, blog, etc.)
  api/                     Route handlers (Cloudinary signing, OAuth callback,
                            QR token issuance, marketing tracking pixels)
  dashboard/
    owner/                 Gym owner — every module
    reception/             Receptionist — members, payments, CRM, attendance,
                            inventory, marketing (read-only where the spec
                            requires it)
    trainer/                Trainer — clients, workouts, diet, chat
    member/                 Member — membership, workout, diet, attendance,
                            AI assistant, fitness calculator, chat
    platform/               Super Admin — tenants, billing, tickets, settings
components/
  features/                One folder per feature/module
  shared/                   Cross-cutting UI (sidebar, topbar, theme, toasts)
  ui/                       Base primitives (Button, Card, Dialog, Input, Label)
hooks/                      Reusable hooks (e.g. realtime chat subscription)
lib/
  actions/                  Server Actions — one file per module, all
                            permission-checked at the top before touching data
  services/                 Cloudinary, Email (SMTP), WhatsApp (Meta Cloud API),
                            Anthropic, QR token signing
  supabase/                 Browser / server / admin Supabase clients
  utils/                    Pure, testable business logic (fitness formulas,
                            geo distance, permissions, marketing helpers,
                            report export)
  validations/               Zod schemas, one per module
supabase/
  migrations/               20 sequential SQL migrations — see below
  functions/                5 Deno Edge Functions (scheduled + on-demand)
  seed/                     Demo data seed script
tests/unit/                 Vitest unit tests for pure logic
types/database.ts           Hand-authored TypeScript types matching the schema
docs/                       Per-part build notes + deployment guide
```

---

## Roles

Five roles, enforced by both Postgres Row Level Security **and** a
`requirePermission`/`requireRole` guard at the top of every Server Action —
never just one or the other:

| Role | Can | Cannot |
|---|---|---|
| **Super Admin** | Manage all tenants, subscriptions, billing, feature flags, support tickets, platform settings | Access a tenant's own gym-floor data (members, payments) beyond what's needed for support |
| **Gym Owner** | Everything within their own tenant: members, staff, plans, payments, attendance, trainers, CRM, inventory, payroll, marketing, reports, AI insights, branches, chat, settings | Access other tenants' data |
| **Receptionist** | Add members, renew memberships, collect payments, mark attendance, manage leads, view (not edit) inventory/marketing | Delete members, view revenue reports/expenses, change settings |
| **Trainer** | Manage assigned clients' workout/diet plans and progress, chat | See members not assigned to them, access payments/settings |
| **Member** | View their own membership, workout, diet, attendance, use the AI assistant and fitness calculator, chat | See any other member's data |

The exact resource/action grants live in the `permissions` table (seeded in
migration `0001`) plus per-part additions — see each migration's
`permission_matrix` inserts for the authoritative list.

---

## Environment variables

See `.env.example` for the full template. Grouped by what they're for:

- **Supabase** — project URL, anon key, service-role key (server-only,
  never exposed to the client), project ID (for `db:types`), JWT secret
- **Cloudinary** — cloud name, API key/secret, unsigned upload preset name
- **Auth providers** — Google and Apple OAuth credentials (email/phone auth
  work with just Supabase, no extra config needed)
- **Resend** — API key + from-address for transactional email
- **Meta WhatsApp Cloud API** — access token, phone number ID, approved
  message template names
- **Anthropic** — API key for AI features (workout/diet generation, chat
  assistant, risk analysis, revenue forecast narratives)
- **Payments** — Razorpay/Stripe keys (present in the template for future
  online-payment integration; the current payment flow logs cash/UPI/card/
  bank/split payments recorded by staff, it does not yet call a payment
  gateway API directly)
- **`QR_SECRET`** — HMAC key for the rotating attendance QR code; **must** be
  a long random value in production, never reused from a dev environment
- **`CRON_SECRET`** — shared secret checked by every scheduled Edge Function
  so it can't be triggered by anyone who finds the URL
- **`NEXT_PUBLIC_APP_URL`** — used for OAuth redirect URLs, metadata, and
  marketing-email tracking links

---

## Database & migrations

Twenty sequential migrations under `supabase/migrations/`, one (or a small
group) per part of the build. Apply them in order with:

```bash
npm run db:migrate   # runs `supabase db push`
```

A few are paired with a second "schedule" migration that sets up a
`pg_cron` job to call a Deno Edge Function on a schedule (renewal reminders,
CRM follow-ups, inventory alerts, marketing automation). **Those scheduling
migrations contain placeholder values** (`<PROJECT_REF>`, `<CRON_SECRET>`)
that must be filled in with your real project ref and cron secret before
they'll actually reach your deployed functions — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#scheduled-edge-functions) for the
exact list and how to fill them in.

Regenerating `types/database.ts` from the live schema (instead of the
hand-authored version currently in the repo) once everything is deployed:

```bash
npm run db:types
```

---

## Demo data

```bash
npm run db:seed
```

Creates one realistic tenant ("Momentum Fitness", 2 branches) with a gym
owner, a receptionist, 3 trainers, 25 members spread across active/
expiring-soon/expired/frozen membership states, real payments (using the
same invoice/receipt numbering functions the app itself uses), 30 days of
attendance history, workout/diet plans + progress history for 10 members,
a 12-lead CRM pipeline, 10 inventory items with real stock transactions,
and a sample support ticket. See the script's console output for exact
login credentials — they're also listed at
`supabase/seed/run.ts` (search for `DEMO_PASSWORD`).

The script is idempotent-safe: it checks for an existing tenant with slug
`gymos-demo` first and exits without creating duplicates if one exists.

---

## Testing

```bash
npm run test        # run once
npm run test:watch  # watch mode
```

Unit tests cover pure business logic — the parts of the app where a subtle
bug would be silent and expensive: marketing discount/coupon rules, fitness
formulas (BMI/BMR/macros/goal timeline), the haversine GPS distance check
used for attendance verification, and the HMAC-based rotating QR token
scheme (freshness window, tamper resistance, gym isolation). Server Actions
and UI aren't unit-tested — they're verified via `tsc --noEmit` (strict
typecheck) and a full `next build` on every part, which catches the more
common classes of bugs (wrong prop types, broken imports, invalid routes)
faster than integration tests would for a project this size.

---

## Deployment

Full step-by-step guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

Short version: Supabase project (Postgres + migrations + Edge Functions +
cron schedules) → Cloudinary account (unsigned upload preset) → Resend +
Meta WhatsApp app → Vercel project pointed at this repo with the same env
vars as `.env.local`.

---

## Build history

This project was built incrementally, part by part, with a hard rule that
each part had to be independently `npm install` → `tsc --noEmit` → `next
build` verified (and `vitest run` once tests existed) before moving on —
see **[BUILD_STATUS.md](BUILD_STATUS.md)** for the full log of what was
built in each part, including the handful of real bugs that were caught
and fixed along the way (not just a list of features). Per-part design
write-ups with more detail than the summary log lives in `docs/PART_*.md`.
