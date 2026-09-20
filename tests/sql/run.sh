#!/usr/bin/env bash
# ============================================================================
# Applies the real migration files to a throwaway local PostgreSQL database so
# the subscription-lifecycle SQL (migration 0025) can be exercised for real —
# atomic claim, retry backoff, timezone-aware expiry sweep — instead of being
# eyeballed.
#
# Usage:  PGPORT=5433 tests/sql/run.sh [extra .sql files to run at the end]
#
# Requires a local PostgreSQL. pg_cron / pg_net are stubbed by harness.sql, so
# the scheduling migrations (0006, 0012, 0015, 0017, 0026) are skipped.
# ============================================================================
set -euo pipefail

PGPORT="${PGPORT:-5433}"
PGHOST="${PGHOST:-/tmp}"
DB="${DB:-atptest}"
PSQL_BIN="${PSQL_BIN:-psql}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql_run() { "$PSQL_BIN" -h "$PGHOST" -p "$PGPORT" -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }

psql_run postgres -c "drop database if exists ${DB};" -c "create database ${DB};"
psql_run "$DB" -f "$ROOT/tests/sql/harness.sql"

# pg_cron isn't installable locally; strip that one line from the core schema.
TMP_CORE="$(mktemp /tmp/core_XXXX.sql)"
sed 's/^create extension if not exists "pg_cron";/-- pg_cron: provided by Supabase, stubbed in harness.sql/' \
  "$ROOT/supabase/migrations/0001_core_schema.sql" > "$TMP_CORE"
psql_run "$DB" -f "$TMP_CORE"

for f in \
  0002_marketing_leads \
  0003_members_module \
  0004_seed_default_plans \
  0005_payments_and_renewals \
  0007_permission_matrix_payments \
  0008_attendance \
  0009_permission_matrix_attendance \
  0010_trainer_module \
  0011_crm \
  0013_ai_features \
  0014_inventory_payroll \
  0016_marketing \
  0018_reports_analytics \
  0019_super_admin_console \
  0020_multi_branch_chat \
  0021_renewal_reminder_emails \
  0022_member_streaks \
  0023_nutrition_module \
  0024_marketing_smtp_dispatch \
  0025_subscription_lifecycle
do
  psql_run "$DB" -f "$ROOT/supabase/migrations/${f}.sql"
done

for extra in "$@"; do
  psql_run "$DB" -f "$extra"
done
