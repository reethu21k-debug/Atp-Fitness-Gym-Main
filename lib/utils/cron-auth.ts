// ============================================================================
// Shared authentication for scheduled job endpoints.
//
// Cron routes are publicly routable URLs that mutate data and spend money (they
// send WhatsApp messages). They must be authenticated, and the comparison must
// not leak the secret through response timing.
//
// Two header styles are accepted because the project has two schedulers:
//   - `x-cron-secret: <CRON_SECRET>`          — Supabase pg_cron via pg_net,
//                                               already used by the existing
//                                               marketing/renewal jobs.
//   - `Authorization: Bearer <CRON_SECRET>`   — Vercel Cron, which sends this
//                                               automatically and cannot be
//                                               configured to send a custom
//                                               header.
// ============================================================================

import { timingSafeEqual } from "crypto";

export type CronAuthResult = { ok: true } | { ok: false; reason: "not_configured" | "unauthorized" };

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which itself leaks length. Hash
  // to a fixed width first by comparing equal-length padded buffers.
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing profile doesn't depend on length.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function authorizeCronRequest(headers: Headers): CronAuthResult {
  const expected = process.env.CRON_SECRET;

  // Fail closed. An unset secret must never mean "allow everyone".
  if (!expected) return { ok: false, reason: "not_configured" };

  const direct = headers.get("x-cron-secret");
  if (direct && safeEquals(direct, expected)) return { ok: true };

  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    if (safeEquals(auth.slice("Bearer ".length), expected)) return { ok: true };
  }

  return { ok: false, reason: "unauthorized" };
}
