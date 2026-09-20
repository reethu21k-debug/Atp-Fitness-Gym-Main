# Subscription Lifecycle + WhatsApp Notifications

How a subscription is activated, how it expires, and how the two WhatsApp
messages are guaranteed to be sent exactly once each.

---

## The lifecycle

```
Staff records payment (server action, permission-checked)
        |
        v
payments row inserted  ->  member_memberships.amount_paid > 0
        |
        v
notifyActivationIfPaid(membershipId)
        |  re-reads the subscription from the DB
        |  requires status='active' AND amount_paid > 0
        v
claim_subscription_notification(membership, 'activation')   <-- atomic
        |  zero rows => someone else has it, or it is already done => STOP
        v
WhatsApp "subscription confirmed"  ->  wamid recorded in the ledger
        |
        v
SUBSCRIPTION RUNS
        |
        v
end_date passes (evaluated in the gym's own timezone)
        |
        v
/api/cron/subscription-expiry  ->  expire_due_memberships()   <-- atomic
        |  status -> 'expired', expired_at stamped, is_current cleared
        v
claim_subscription_notification(membership, 'expiry')        <-- atomic
        v
WhatsApp "subscription ended"  ->  wamid recorded in the ledger
```

---

## Why duplicates are impossible

Idempotency lives in Postgres, never in application memory.

`subscription_notifications` has `UNIQUE (membership_id, kind, channel)`.
`claim_subscription_notification()` is a single
`INSERT ... ON CONFLICT DO UPDATE ... WHERE` statement that returns **at most
one row**, and refuses when the notification is already `sent`/`skipped`, when
the retry budget is exhausted, or when another sender holds an unexpired lease.

On conflict Postgres takes a row lock, so a concurrent claimer blocks and then
re-evaluates the `WHERE` against the winner's committed row. Verified with 20
parallel processes racing the same claim: exactly one won.

This covers every case in the brief:

| Scenario | Why it is safe |
|---|---|
| User refreshes the page | Notification keyed to the membership, not the request |
| Payment endpoint called twice | Second claim refused |
| Webhook delivered twice / provider retry | Second claim refused |
| Cron executes twice | Sweep is a single atomic UPDATE; claim refuses the second send |
| Multiple server instances | Arbiter is a unique index + row lock, not process state |
| Server restarts | Ledger is on disk |
| Expiry job run manually twice | Same as cron |
| Network retry | Same claim, refused |

No global variables, no in-memory flags, no browser state, no `setTimeout`.

---

## Timezone handling

Membership dates are Postgres `date` columns — calendar days with no zone.
"Ends 2026-03-31" means valid through 23:59:59 **in the gym's local time**.

`expire_due_memberships()` compares against
`(now() AT TIME ZONE gyms.timezone)::date`, per gym, defaulting to
`Asia/Kolkata`. On the TypeScript side `lib/utils/datetime.ts` resolves "today"
through `Intl.DateTimeFormat` in an explicit zone.

The previous code used UTC (`setUTCDate`, `toISOString().slice(0,10)`), so for
the first 5.5 hours of every IST day it evaluated against yesterday.

---

## Failure handling

A WhatsApp failure never affects the subscription. The money is taken, the
membership is active; only delivery is in question, and that is tracked
separately in the ledger.

| Failure | Classification | Behaviour |
|---|---|---|
| Invalid/expired token (401) | permanent | recorded, not retried |
| Template missing (404, 132001) | permanent | recorded, not retried |
| Outside 24h window (131047) | permanent | recorded, not retried |
| Invalid phone number | permanent | recorded, no API call made |
| Member has no phone | permanent | skipped, clear reason recorded |
| Rate limit (429, 130429, 613) | retryable | backoff |
| Meta 5xx | retryable | backoff |
| Network error / timeout | retryable | backoff |

Backoff is 5m, 10m, 20m, 40m, capped at 6h, bounded by `max_attempts` (5).
Permanent failures burn the budget immediately, so there is no infinite loop.

---

## Structured logging

One JSON object per line, filterable by `event`:

```
SUBSCRIPTION_CREATED            WHATSAPP_ACTIVATION_ATTEMPT
SUBSCRIPTION_ACTIVATED          WHATSAPP_ACTIVATION_SUCCESS
SUBSCRIPTION_EXPIRY_DETECTED    WHATSAPP_ACTIVATION_FAILED
SUBSCRIPTION_EXPIRED            WHATSAPP_EXPIRY_ATTEMPT
CRON_RUN_STARTED                WHATSAPP_EXPIRY_SUCCESS
CRON_RUN_FINISHED               WHATSAPP_EXPIRY_FAILED
WHATSAPP_WEBHOOK_RECEIVED       SUBSCRIPTION_NOTIFICATION_RETRY
```

Access tokens, JWTs and bearer headers are stripped; phone numbers are masked
to their last four digits.

---

## Operations

```bash
# Config check (sends nothing)
curl -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/test-whatsapp

# Live send to a number you control
curl -X POST -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' \
     -d '{"phone":"+91XXXXXXXXXX"}' $APP_URL/api/test-whatsapp

# Run the expiry + retry sweep by hand (idempotent)
curl -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/cron/subscription-expiry
```

Inspect delivery state:

```sql
select kind, status, attempts, provider_status, last_error_code, sent_at
from subscription_notifications
where membership_id = '<id>';

-- Anything stuck
select * from subscription_notifications
where status in ('failed','skipped') order by updated_at desc limit 50;
```

---

## Tests

```bash
npm test                                   # 144 tests
tests/sql/run.sh tests/sql/subscription_lifecycle_test.sql   # needs local psql
```

`tests/sql/` exercises the SQL against a real PostgreSQL instance: atomic
claim, lease refusal, bounded backoff, timezone-aware expiry, renewal
suppression. `tests/integration/` covers Tests A–F from the brief against a
faked Graph API.
