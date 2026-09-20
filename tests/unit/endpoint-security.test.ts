// ============================================================================
// Security tests for the self-authenticating endpoints.
//
// These routes sit outside the session-cookie auth wall (pg_cron, Vercel Cron
// and Meta have no browser session), so each one has to prove its own caller.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { authorizeCronRequest } from "@/lib/utils/cron-auth";
import { maskPhone, redactString } from "@/lib/services/logger";

const SECRET = "test-cron-secret-value";

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("cron authentication", () => {
  it("accepts the pg_cron x-cron-secret header", () => {
    expect(authorizeCronRequest(new Headers({ "x-cron-secret": SECRET })).ok).toBe(true);
  });

  it("accepts Vercel Cron's Authorization: Bearer form", () => {
    expect(authorizeCronRequest(new Headers({ authorization: `Bearer ${SECRET}` })).ok).toBe(true);
  });

  it("rejects a missing, wrong, or truncated secret", () => {
    expect(authorizeCronRequest(new Headers()).ok).toBe(false);
    expect(authorizeCronRequest(new Headers({ "x-cron-secret": "nope" })).ok).toBe(false);
    expect(authorizeCronRequest(new Headers({ "x-cron-secret": SECRET.slice(0, -1) })).ok).toBe(false);
    expect(authorizeCronRequest(new Headers({ authorization: `Bearer wrong` })).ok).toBe(false);
    expect(authorizeCronRequest(new Headers({ authorization: SECRET })).ok).toBe(false);
  });

  it("FAILS CLOSED when CRON_SECRET is not configured", () => {
    // An unset secret must never mean "allow everyone" — that would leave a
    // message-sending, data-mutating endpoint wide open on a fresh deploy.
    delete process.env.CRON_SECRET;
    const result = authorizeCronRequest(new Headers({ "x-cron-secret": "anything" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
  });
});

describe("Meta webhook signature verification", () => {
  // Mirrors the verification in app/api/webhooks/whatsapp/route.ts.
  const APP_SECRET = "meta-app-secret";
  const sign = (body: string, secret = APP_SECRET) =>
    "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");

  function verify(rawBody: string, header: string | null, appSecret: string): boolean {
    if (!header?.startsWith("sha256=")) return false;
    const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
    let received: Buffer;
    try {
      received = Buffer.from(header.slice(7), "hex");
    } catch {
      return false;
    }
    if (received.length !== expected.length) return false;
    return expected.equals(received);
  }

  const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.X", status: "delivered" }] } }] }] });

  it("accepts a correctly signed payload", () => {
    expect(verify(body, sign(body), APP_SECRET)).toBe(true);
  });

  it("rejects an unsigned payload", () => {
    expect(verify(body, null, APP_SECRET)).toBe(false);
  });

  it("rejects a payload signed with the wrong secret", () => {
    expect(verify(body, sign(body, "attacker-secret"), APP_SECRET)).toBe(false);
  });

  it("rejects a tampered body under a valid-looking signature", () => {
    const signature = sign(body);
    const tampered = body.replace("delivered", "failed");
    expect(verify(tampered, signature, APP_SECRET)).toBe(false);
  });

  it("rejects malformed signature headers", () => {
    expect(verify(body, "sha1=abcd", APP_SECRET)).toBe(false);
    expect(verify(body, "sha256=zzzz", APP_SECRET)).toBe(false);
    expect(verify(body, "sha256=", APP_SECRET)).toBe(false);
  });
});

describe("log redaction", () => {
  it("masks all but the last four digits of a phone number", () => {
    expect(maskPhone("919550192069")).toBe("********2069");
    expect(maskPhone("+91 95501 92069")).toBe("********2069");
    expect(maskPhone(null)).toBeNull();
  });

  it("strips Meta access tokens, bearer headers and JWTs from free text", () => {
    expect(redactString("token EAABsbCS1iHgBA" + "x".repeat(50))).toContain("[redacted]");
    expect(redactString("Authorization: Bearer abcdefghijklmnopqrstuvwxyz")).toContain("[redacted]");
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NX0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1";
    expect(redactString(`key=${jwt}`)).toContain("[redacted]");
  });

  it("leaves ordinary text alone", () => {
    expect(redactString("Template name does not exist in en")).toBe("Template name does not exist in en");
  });
});
