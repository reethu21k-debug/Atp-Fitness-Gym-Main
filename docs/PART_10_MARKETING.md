# Part 10 — Marketing

Campaigns, coupons, referrals, audience segmentation, and automated
birthday/festival offers for GymOS.

## What's included

| Area | Where |
|---|---|
| Schema, RLS, permission matrix, views | `supabase/migrations/0016_marketing.sql` |
| Cron scheduling (SMTP routes) | `supabase/migrations/0024_marketing_smtp_dispatch.sql` |
| Shared send logic (SMTP, not Resend) | `lib/services/marketing-dispatch.ts` |
| Daily birthday/festival automation | `app/api/cron/marketing-automation/route.ts` |
| Campaign sending (scheduled sweep) | `app/api/marketing/campaign-dispatch/route.ts` |
| Server Actions (incl. send-now) | `lib/actions/marketing.actions.ts` |
| Pure/testable business logic | `lib/utils/marketing-helpers.ts` |
| Types | `types/database.ts` (Part 10 section) |
| UI | `components/features/marketing/*` |
| Routes | `app/dashboard/owner/marketing`, `app/dashboard/reception/marketing` |
| Tracking routes | `app/api/marketing/track/open`, `app/api/marketing/track/click` |
| Tests | `tests/unit/marketing-helpers.test.ts` |

> **Email transport**: all Marketing email (campaigns, coupons, referrals,
> birthday wishes, festival offers) sends through the exact same Gmail SMTP
> transport as subscription and welcome emails — `sendEmail()` in
> `lib/services/email.ts`. Marketing does **not** call Resend and does not
> have its own email provider. The original design used two Resend-based
> Supabase Edge Functions (`campaign-dispatch`, `marketing-automation`);
> those have been deleted and replaced with Next.js API routes for the same
> reason `renewal-reminders` was moved off an Edge Function in Part 6 —
> nodemailer needs the Node runtime, which Deno Edge Functions don't provide.

## Setup

### 1. Run the migrations

```bash
supabase db push
```

This applies `0016_marketing.sql` and `0024_marketing_smtp_dispatch.sql` on
top of Parts 1–9. No Resend account or `RESEND_API_KEY` is needed — Marketing
reuses the `GMAIL_SMTP_USER` / `GMAIL_SMTP_APP_PASSWORD` / `EMAIL_FROM_NAME`
variables already configured for subscription/welcome emails, plus the
`WHATSAPP_CLOUD_API_TOKEN` / `WHATSAPP_CLOUD_PHONE_NUMBER_ID` variables
for the WhatsApp channel.

### 2. Replace the placeholders in migration 0024

Before running `0024_marketing_smtp_dispatch.sql`, replace `<APP_URL>` and
`<CRON_SECRET>` in both `cron.schedule(...)` calls — same `CRON_SECRET` as in
your `.env`, same pattern as `app/api/cron/renewal-reminders` (migration
`0021`). No Edge Function deploy step is needed; the two routes ship as part
of the normal Next.js app.

## How sending works

- **Manual, send-now campaigns**: `createCampaign({ sendNow: true })` in
  `marketing.actions.ts` calls `dispatchCampaignNow()`, which calls
  `dispatchCampaign()` from `lib/services/marketing-dispatch.ts` directly, in
  the same Node process — no HTTP round trip.
- **Scheduled campaigns**: saved with `status: "scheduled"` and a
  `scheduled_at` timestamp. A cron job hits
  `POST /api/marketing/campaign-dispatch` with an empty body every minute;
  the route sweeps for any campaign whose `scheduled_at` has passed and
  sends it.
- Either way, `dispatchCampaign()` resolves the audience, writes one
  `campaign_recipients` row per person (a unique index prevents the same
  person ever being inserted twice for the same campaign, so a re-run is
  always safe), sends email via `sendEmail()` (Gmail SMTP) and WhatsApp via
  the Meta WhatsApp Cloud API, and updates both the recipient row and the
  campaign's aggregate
  counters (`recipients_sent`, `recipients_failed`, `status`). Each
  recipient's `error_message` holds the actual SMTP failure reason when a
  send fails, and open/click tracking (`opens_count`, `clicks_count`, the
  `campaign_analytics` view's `open_rate`/`click_rate`) is unaffected —
  those come from the tracking pixel/redirect routes, not the transport.

## How automation works

`GET /api/cron/marketing-automation` runs once daily (07:30 UTC) and handles
two independent jobs:

1. **Birthday wishes** — for every gym with `birthday_campaign_config.is_enabled
   = true`, finds active members whose `date_of_birth` matches today's
   month/day (year is ignored) and sends the configured template.
2. **Festival offers** — for every active `festival_offers` row whose
   `occurs_on` matches today's month/day and hasn't already fired this
   calendar year (`last_sent_year`), sends the offer to every active member.

Both jobs insert a row into `automated_message_log` (unique on
`gym_id, member_id, automation_type, sent_on`) **before** sending. If that
insert fails with a unique-violation, the message was already sent today and
the loop skips ahead — this makes the whole route safe to re-run or
re-trigger without ever double-messaging someone. Email sends go through the
same `sendEmail()` SMTP transport as everything else in Marketing.

## Coupons

Coupon validation is intentionally centralized in a single SQL function,
`validate_coupon(p_gym_id, p_code, p_member_id, p_purchase_amount)`, so the
same rules apply everywhere a coupon might be checked (today: the
`validateCoupon` server action used from the payments/checkout flow):

1. Coupon exists and is active
2. Within its valid date window
3. Hasn't hit its total usage limit
4. Purchase meets the minimum amount
5. This member hasn't exceeded their per-member usage limit

`redeemCoupon` is called **after** a payment is actually recorded, inserting
a `coupon_redemptions` row; a database trigger keeps `coupons.times_used` in
sync automatically (the same "ledger drives the counter" pattern used for
inventory quantity in Part 9).

## Referral program

Every active member gets a stable referral code lazily, the first time it's
needed, via `get_or_create_referral_code()` — there's no separate "generate
my code" step for staff to remember. When a referred person becomes a paying
member, `completeReferral()` issues two real one-time coupons (one for the
referrer, one for the referee) based on the gym's configured reward types
and values, valid for 90 days.

## Permissions

Per the project's RBAC rules, receptionists can **view** marketing data but
cannot create or modify it — matching the spec's "receptionist cannot ...
change settings." This is enforced in two layers:

- **Database**: permission-matrix rows (`receptionist, marketing, create,
  false`) plus RLS policies that call `has_permission('marketing', 'create'
  | 'update' | 'delete')`.
- **UI**: the reception marketing page passes `canManage={false}` into
  `MarketingDashboard`, which hides every create/edit/delete control.

## Testing

Pure logic — discount calculation, message-template filling, month/day
matching for automation, referral-code generation, and coupon rule
ordering — is extracted into `lib/utils/marketing-helpers.ts` specifically so
it can be unit tested without a live Supabase instance:

```bash
npm run test        # runs the full suite once
npm run test:watch  # watch mode
```

24 tests currently cover this module. This is the project's first automated
test suite; the same pattern (extract pure logic, test it directly) is
recommended for future parts.

## Verification performed

- `npm install` — clean
- `npx tsc --noEmit` — clean
- `npx vitest run` — 24/24 passing
- `npm run build` — all 54 routes compile and prerender successfully
