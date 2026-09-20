import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  normalizePhone,
  sendWhatsAppCloudText,
  sendWhatsAppCloudTemplate,
  sendSubscriptionConfirmationWhatsApp,
  sendSubscriptionExpiredWhatsApp,
  isWhatsAppCloudConfigured,
  isTemplateModeConfigured,
} from "@/lib/services/whatsapp-cloud";

// A fake Graph API. Nothing here ever reaches Meta: no real WhatsApp message is
// sent, and no real credential is used.
interface Capture {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

let captured: Capture[] = [];

function mockGraph(status: number, payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      captured.push({
        url,
        method: init.method ?? "GET",
        headers: init.headers as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(payload),
      } as unknown as Response;
    })
  );
}

const OK_RESPONSE = {
  messaging_product: "whatsapp",
  contacts: [{ input: "919550192069", wa_id: "919550192069" }],
  messages: [{ id: "wamid.HBgMOTE5NTUwMTkyMDY5FQIAERgSMzk=" }],
};

function metaError(code: number, message: string, details?: string) {
  return { error: { message, code, ...(details ? { error_data: { details } } : {}) } };
}

beforeEach(() => {
  captured = [];
  process.env.WHATSAPP_CLOUD_API_TOKEN = "TEST_TOKEN_NOT_REAL";
  process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID = "111111111111111";
  process.env.WHATSAPP_CLOUD_API_VERSION = "v21.0";
  delete process.env.WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE;
  delete process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE;
  delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
describe("normalizePhone", () => {
  it("strips formatting and keeps a full E.164 number", () => {
    expect(normalizePhone("+91 95501 92069")).toBe("919550192069");
    expect(normalizePhone("+91-95501-92069")).toBe("919550192069");
    expect(normalizePhone("919550192069")).toBe("919550192069");
  });

  it("adds the default country code to a bare 10-digit Indian number", () => {
    // The previous implementation passed "9550192069" straight through, which
    // Meta cannot route.
    expect(normalizePhone("9550192069")).toBe("919550192069");
  });

  it("drops a national trunk prefix", () => {
    expect(normalizePhone("09550192069")).toBe("919550192069");
  });

  it("handles the Twilio-style whatsapp: prefix and 00 international prefix", () => {
    expect(normalizePhone("whatsapp:+919550192069")).toBe("919550192069");
    expect(normalizePhone("00919550192069")).toBe("919550192069");
  });

  it("honours a different default country code", () => {
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = "44";
    expect(normalizePhone("7700900123")).toBe("447700900123");
  });

  it("rejects anything outside the E.164 length range", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("1234567890123456789")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("request construction", () => {
  it("POSTs to the configured Graph version and phone number id with a bearer token", async () => {
    mockGraph(200, OK_RESPONSE);
    await sendWhatsAppCloudText("+919550192069", "hello");

    expect(captured).toHaveLength(1);
    const req = captured[0]!;
    expect(req.url).toBe("https://graph.facebook.com/v21.0/111111111111111/messages");
    expect(req.method).toBe("POST");
    expect(req.headers.Authorization).toBe("Bearer TEST_TOKEN_NOT_REAL");
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.body.messaging_product).toBe("whatsapp");
    expect(req.body.to).toBe("919550192069");
    expect(req.body.type).toBe("text");
  });

  it("builds a template payload with positional body parameters", async () => {
    mockGraph(200, OK_RESPONSE);
    await sendWhatsAppCloudTemplate("+919550192069", "subscription_expired", ["Rithik", "Gold", "ATP", "31 Mar 2026"]);

    const body = captured[0]!.body as {
      type: string;
      template: { name: string; language: { code: string }; components: { type: string; parameters: { text: string }[] }[] };
    };
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("subscription_expired");
    expect(body.template.language.code).toBe("en");
    expect(body.template.components[0]!.parameters.map((p) => p.text)).toEqual([
      "Rithik",
      "Gold",
      "ATP",
      "31 Mar 2026",
    ]);
  });

  it("uses a template when the env var is set, and plain text otherwise", async () => {
    mockGraph(200, OK_RESPONSE);
    await sendSubscriptionExpiredWhatsApp({
      phone: "+919550192069",
      memberName: "Rithik",
      gymName: "ATP",
      planName: "Gold",
      endDate: "2026-03-31",
    });
    expect(captured[0]!.body.type).toBe("text");

    captured = [];
    process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE = "subscription_expired";
    await sendSubscriptionExpiredWhatsApp({
      phone: "+919550192069",
      memberName: "Rithik",
      gymName: "ATP",
      planName: "Gold",
      endDate: "2026-03-31",
    });
    expect(captured[0]!.body.type).toBe("template");
  });

  it("renders dates in the gym timezone in the message body", async () => {
    mockGraph(200, OK_RESPONSE);
    await sendSubscriptionConfirmationWhatsApp({
      phone: "+919550192069",
      memberName: "Rithik",
      gymName: "ATP",
      planName: "Gold",
      durationDays: 30,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      timeZone: "Asia/Kolkata",
    });
    const text = (captured[0]!.body.text as { body: string }).body;
    expect(text).toContain("31 Mar 2026");
    expect(text).toContain("30 days");
  });
});

// ---------------------------------------------------------------------------
describe("response handling", () => {
  it("captures the wamid message id on success", async () => {
    mockGraph(200, OK_RESPONSE);
    const result = await sendWhatsAppCloudText("+919550192069", "hi");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.messageId).toBe("wamid.HBgMOTE5NTUwMTkyMDY5FQIAERgSMzk=");
      expect(result.recipient).toBe("919550192069");
    }
  });

  it("still succeeds when the body is unparseable, with a null message id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, text: async () => "<not json>" }) as unknown as Response)
    );
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(true);
    if (result.success) expect(result.messageId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("error classification", () => {
  it("treats an invalid/expired token (401) as permanent", async () => {
    mockGraph(401, metaError(190, "Error validating access token"));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe("190");
    }
  });

  it("treats a missing template (404) as permanent and surfaces the actionable detail", async () => {
    mockGraph(404, metaError(132001, "Template name does not exist", "template name (subscription_expired) does not exist in en"));
    const result = await sendWhatsAppCloudTemplate("+919550192069", "subscription_expired", []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.error).toContain("does not exist in en");
    }
  });

  it("treats the 24h-window rejection as permanent", async () => {
    mockGraph(400, metaError(131047, "Re-engagement message"));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    if (!result.success) expect(result.retryable).toBe(false);
  });

  it("treats rate limiting as retryable even when returned as a 400", async () => {
    mockGraph(400, metaError(130429, "Rate limit hit"));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe("130429");
    }
  });

  it("treats HTTP 429 and 5xx as retryable", async () => {
    for (const status of [429, 500, 502, 503]) {
      mockGraph(status, metaError(0, "upstream"));
      const result = await sendWhatsAppCloudText("+919550192069", "hi");
      expect(result.success).toBe(false);
      if (!result.success) expect(result.retryable).toBe(true);
    }
  });

  it("treats a network error as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe("NETWORK_ERROR");
    }
  });

  it("treats a timeout as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(true);
      expect(result.errorCode).toBe("TIMEOUT");
    }
  });

  it("never retries a malformed phone number, and never calls the API", async () => {
    mockGraph(200, OK_RESPONSE);
    const result = await sendWhatsAppCloudText("123", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe("INVALID_PHONE");
    }
    expect(captured).toHaveLength(0);
  });

  it("skips cleanly and makes no request when unconfigured", async () => {
    delete process.env.WHATSAPP_CLOUD_API_TOKEN;
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    mockGraph(200, OK_RESPONSE);

    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.skipped).toBe(true);
      expect(result.errorCode).toBe("NOT_CONFIGURED");
      expect(result.retryable).toBe(false);
    }
    expect(captured).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("secret hygiene", () => {
  it("never echoes a token back in an error message", async () => {
    // Meta occasionally reflects the request in an error body.
    mockGraph(401, metaError(190, "Invalid OAuth access token: EAABsbCS1iHgBA00000000000000000000000000000000000000"));
    const result = await sendWhatsAppCloudText("+919550192069", "hi");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("EAABsbCS1iHgBA");
      expect(result.error).toContain("[redacted]");
    }
  });

  it("reports configuration as booleans without exposing values", () => {
    expect(isWhatsAppCloudConfigured()).toBe(true);
    expect(isTemplateModeConfigured()).toBe(false);
    process.env.WHATSAPP_SUBSCRIPTION_CONFIRMED_TEMPLATE = "a";
    process.env.WHATSAPP_SUBSCRIPTION_EXPIRED_TEMPLATE = "b";
    expect(isTemplateModeConfigured()).toBe(true);
  });
});
