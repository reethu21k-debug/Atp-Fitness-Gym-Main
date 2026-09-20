# GymOS — Deployment Guide

This walks through taking GymOS from a local checkout to a live, working
deployment: Supabase (database + auth + storage + edge functions), Cloudinary
(images), SMTP email + Meta WhatsApp Cloud API (notifications), and Vercel
(frontend).

---

## 1. Create the Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. From **Project Settings → API**, note down:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY` (**never** expose
     this to the client — it bypasses Row Level Security)
   - Project Reference ID (visible in the URL, e.g. `abcdefghijklmnop`) →
     `SUPABASE_PROJECT_ID`, and needed again below for the cron migrations
3. From **Project Settings → API → JWT Settings**, copy the JWT secret →
   `SUPABASE_JWT_SECRET`.

Install the Supabase CLI locally if you don't have it:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
```

### Apply the schema

```bash
npm run db:migrate
```

This runs `supabase db push`, applying all 20 migrations in
`supabase/migrations/` in order — core schema/RBAC, members, payments,
attendance, trainer module, CRM, AI features, inventory/payroll, marketing,
reports/analytics, super-admin console, and multi-branch/chat.

### Fill in the cron migration placeholders

Four migrations schedule a `pg_cron` job that calls a Deno Edge Function on
a timer. Each one contains two placeholders — `<PROJECT_REF>` and
`<CRON_SECRET>` — that **must** be replaced with real values before (or
after) applying, since Postgres migrations can't read your `.env` file:

| Migration | Function called | Schedule (UTC) |
|---|---|---|
| `0006_schedule_renewal_reminders.sql` | `renewal-reminders` | `0 9 * * *` — daily at 09:00 |
| `0012_schedule_crm_reminders.sql` | `crm-follow-up-reminders` | `30 8 * * *` — daily at 08:30 |
| `0015_schedule_inventory_alerts.sql` | `inventory-alerts` | `0 7 * * 1` — weekly, Monday 07:00 |
| `0017_schedule_marketing_automation.sql` | `marketing-automation` (daily) and `campaign-dispatch` (every minute, for scheduled campaign sends) | `30 7 * * *` and `* * * * *` |
| `0021_renewal_reminder_emails.sql` | Not an Edge Function -- calls the Next.js app's `/api/cron/renewal-reminders` route directly (needs the Node runtime for `nodemailer`). Placeholders are `<APP_URL>` and `<CRON_SECRET>` instead of `<PROJECT_REF>`/`<CRON_SECRET>`. | `0 9 * * *` — daily at 09:00 |

For each one, either:

- **Edit the file directly** before running `db:migrate` — replace
  `<PROJECT_REF>` with your project ref and `<CRON_SECRET>` with the same
  value you'll set as `CRON_SECRET` in the Edge Function's environment, or
- **Run it once as a one-off SQL statement** from the Supabase SQL editor
  after deploying, with the real values substituted in directly.

If you ever need to see or remove an existing schedule:

```sql
select * from cron.job;
select cron.unschedule('renewal-reminders-daily');
```

### Deploy the Edge Functions

```bash
supabase functions deploy renewal-reminders
supabase functions deploy crm-follow-up-reminders
supabase functions deploy inventory-alerts
supabase functions deploy marketing-automation
supabase functions deploy campaign-dispatch
```

Each function needs its own environment secrets set (these are **separate**
from your Next.js app's `.env` — Edge Functions run on Supabase's Deno
runtime, not on Vercel):

```bash
supabase secrets set CRON_SECRET=<same value used in the cron migrations above>
supabase secrets set RESEND_API_KEY=<your resend key>
supabase secrets set WHATSAPP_CLOUD_API_TOKEN=<...>
supabase secrets set WHATSAPP_CLOUD_PHONE_NUMBER_ID=<...>
supabase secrets set WHATSAPP_CLOUD_API_VERSION=v21.0
```

(`supabase secrets set` applies to all deployed functions in the project;
run it once, not once per function.)

---

## 2. Set up Cloudinary

1. Create an account at [cloudinary.com](https://cloudinary.com).
2. From the dashboard, note your **Cloud Name**, **API Key**, and **API
   Secret**.
3. Go to **Settings → Upload → Upload presets → Add upload preset**:
   - Signing mode: **Unsigned** is fine for the preset name itself (the app
     signs uploads server-side via `/api/cloudinary/sign` using your API
     secret — the preset just needs to exist and match
     `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, default `gymos_unsigned`)
   - Folder: optional, but useful for organizing member photos vs.
     transformation photos vs. certificates
4. Set the four Cloudinary env vars from `.env.example`.

---

## 3. Set up email (SMTP) and WhatsApp (Meta Cloud API)

- **Resend**: create an account at [resend.com](https://resend.com), verify
  a sending domain, create an API key → `RESEND_API_KEY`. Set `EMAIL_FROM`
  to an address on your verified domain.

  Email actually goes out through two separate pipelines, both of which
  need this same `RESEND_API_KEY`/`EMAIL_FROM` pair, on the same verified
  domain:
  - The Next.js app (`lib/services/email.ts`) — Resend-first with an
    optional Gmail SMTP fallback (`GMAIL_SMTP_USER` /
    `GMAIL_SMTP_APP_PASSWORD` / `EMAIL_FROM_NAME` in your app's `.env`,
    used only if Resend isn't configured or a send fails). This covers
    welcome emails, subscription confirmations, password resets, and the
    7d/3d/1d/on-expiry renewal reminders driven by migration `0021`.
  - The `renewal-reminders` Edge Function — Resend-only, no Gmail
    fallback, configured separately via `supabase secrets set
    RESEND_API_KEY=...` as shown above. This handles the wider set of
    post-expiry WhatsApp + email reminder windows.

  Set the env vars in **both** places (your app's `.env`/Vercel, and
  `supabase secrets`) — they're independent runtimes and don't share
  environment variables.
- **WhatsApp (Meta Cloud API)**: at developers.facebook.com create an app and
  add the "WhatsApp" product. From WhatsApp > API Setup copy the access token
  (use a permanent System User token from Business Settings for production, not
  the 24h test token) and the **Phone number ID** — not the phone number
  itself. Set `WHATSAPP_CLOUD_API_TOKEN` and `WHATSAPP_CLOUD_PHONE_NUMBER_ID`.

  Then create and get approval for your Message Templates in WhatsApp Manager
  and set `WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE`,
  `WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE` and (optionally)
  `WHATSAPP_MEMBER_WELCOME_TEMPLATE` / `WHATSAPP_STAFF_WELCOME_TEMPLATE`.
  Business-initiated messages outside the 24-hour session window are rejected
  without an approved template — see docs/WHATSAPP_SUBSCRIPTION_LIFECYCLE.md.

  There is no Twilio account or relay anywhere in this project; every WhatsApp
  message goes directly to graph.facebook.com.

---

## 4. Auth providers (optional)

Email and phone-OTP login work out of the box with just Supabase Auth
enabled (default). To also enable Google/Apple login:

- **Google**: create OAuth credentials in Google Cloud Console, add
  `https://<your-project-ref>.supabase.co/auth/v1/callback` as an
  authorized redirect URI, then enable the Google provider in **Supabase →
  Authentication → Providers** with your Client ID/Secret. Set
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in your app env too (used by
  the login page to know which providers to show).
- **Apple**: similar, via Apple's Sign in with Apple setup (needs a Team
  ID, Key ID, and private key) — set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_CLIENT_SECRET`.

The app's OAuth callback route (`app/api/auth/callback/route.ts`) handles
the redirect back from either provider.

---

## 5. Deploy the frontend to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. Import it into [Vercel](https://vercel.com).
3. Framework preset: Next.js (auto-detected).
4. Add every variable from `.env.example` to **Project Settings →
   Environment Variables** (Production, and Preview if you want preview
   deployments to work against a staging Supabase project).
5. Set `NEXT_PUBLIC_APP_URL` to your real production URL — it's used for
   OAuth redirects and marketing-email tracking links, so getting this
   wrong will silently break both.
6. Deploy.

Vercel will run `next build` automatically. If you want to sanity-check the
production build locally first:

```bash
npm run build
npm run start
```

---

## 6. Seed demo data (optional, recommended for a first look)

Once your Supabase project has the schema applied and your `.env.local` has
real Supabase credentials:

```bash
npm run db:seed
```

This is safe to run against a fresh project — see the main
[README](../README.md#demo-data) for what it creates. **Do not run this
against a production database you care about without reviewing the script
first** — it creates real auth users with a shared demo password.

---

## 7. Post-deploy checklist

- [ ] All 20 migrations applied (`supabase db push` completed with no errors)
- [ ] All 5 Edge Functions deployed and their secrets set
- [ ] The 4 cron-scheduling migrations have real `<PROJECT_REF>`/
      `<CRON_SECRET>` values (check with `select * from cron.job;`)
- [ ] Cloudinary upload preset name matches
      `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`
- [ ] Resend sending domain verified; test a real member-registration email
- [ ] WhatsApp message templates approved in WhatsApp Manager for your test
      numbers; test a real registration WhatsApp message
- [ ] `QR_SECRET` and `CRON_SECRET` are long random values, **not** copied
      from this repo's `.env.example` or any development environment
- [ ] `NEXT_PUBLIC_APP_URL` matches your real deployed URL
- [ ] Log in as each of the 5 roles at least once (seed data makes this
      easy) and confirm the sidebar/permissions look right for each
