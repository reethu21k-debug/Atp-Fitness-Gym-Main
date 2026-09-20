// ============================================================================
// Date/time helpers for the subscription lifecycle.
//
// THE BUG THESE EXIST TO PREVENT
//   Membership `start_date` / `end_date` are Postgres `date` columns — calendar
//   days with no time and no zone. "Ends 2026-03-31" means the member is
//   entitled through 23:59:59 on 31 March *in the gym's local time*.
//
//   The code this replaces derived "today" with `new Date().toISOString()
//   .slice(0, 10)` and `setUTCDate(...)`, i.e. today in UTC. India is UTC+5:30,
//   so every day between 00:00 and 05:30 IST, UTC still reports yesterday —
//   and the daily sweep would consider a membership live for an extra day.
//   Run the job at 09:00 IST (03:30 UTC) and it silently looks at the wrong
//   calendar day, every single day.
//
//   So: anything that compares against a `date` column resolves "today" in an
//   explicit IANA zone, never in UTC and never in the server's local zone
//   (which on Vercel is UTC, and on a developer laptop is whatever they have).
//
//   Postgres does the same comparison server-side inside
//   `expire_due_memberships()` using each gym's own `gyms.timezone`. These
//   helpers exist for the TypeScript side (display formatting, plan end-date
//   arithmetic) so both halves agree.
// ============================================================================

/** Fallback when a gym has no timezone set. The product is India-first. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today's calendar date in an IANA timezone, as `YYYY-MM-DD`.
 *
 * Uses `en-CA` because it formats as ISO-style `YYYY-MM-DD`, which sidesteps
 * hand-rolled zero-padding.
 */
export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  return formatDateInTimeZone(now, timeZone);
}

/** An arbitrary instant's calendar date in an IANA timezone, as `YYYY-MM-DD`. */
export function formatDateInTimeZone(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    // Unknown/garbage timezone string on a gym row — fall back rather than
    // throwing inside a cron sweep.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  }
}

/**
 * Calendar arithmetic on a `YYYY-MM-DD` string, returning `YYYY-MM-DD`.
 *
 * Deliberately anchored at UTC noon. Parsing `"2026-03-31"` with `new Date()`
 * yields UTC midnight; calling the *local* `setDate()` on it and reformatting
 * with `toISOString()` (what the previous helpers did) shifts the day whenever
 * the server runs west of UTC. Noon anchoring keeps the result stable no matter
 * what `TZ` the process has.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const base = toUtcNoon(dateStr);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetweenDateStrings(from: string, to: string): number {
  const ms = toUtcNoon(to).getTime() - toUtcNoon(from).getTime();
  return Math.round(ms / 86_400_000);
}

/** True when `endDate` (a `YYYY-MM-DD` day) is strictly before today in `timeZone`. */
export function isPastInTimeZone(endDate: string, timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): boolean {
  return endDate < todayInTimeZone(timeZone, now);
}

/**
 * Human-readable date for message bodies: "31 Mar 2026".
 *
 * Accepts either a date-only string or a full timestamp. The previous
 * implementation did `new Date(dateStr).toLocaleDateString("en-IN", ...)`
 * without a `timeZone`, so a date-only string was parsed as UTC midnight and
 * then rendered in the *server's* zone — printing the day before on any host
 * west of UTC.
 */
export function formatDateForDisplay(dateStr: string, timeZone: string = DEFAULT_TIMEZONE): string {
  const instant = DATE_ONLY.test(dateStr) ? toUtcNoon(dateStr) : new Date(dateStr);
  if (Number.isNaN(instant.getTime())) return dateStr;

  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(instant);
  } catch {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: DEFAULT_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(instant);
  }
}

function toUtcNoon(dateStr: string): Date {
  const datePart = dateStr.slice(0, 10);
  return new Date(`${datePart}T12:00:00.000Z`);
}
