// ============================================================================
// Architecture guard: WhatsApp must go DIRECTLY to Meta's Cloud API.
//
// The project previously relayed WhatsApp through Twilio. That is now fully
// removed, and this test fails the build if any of it comes back — a dependency
// re-added, an api.twilio.com call, or a stray TWILIO_* env read.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["lib", "app", "components", "supabase/functions"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(full))) out.push(full);
  }
  return out;
}

/** Source with `//` and `/* *​/` comments stripped, so historical notes explaining
 *  the migration don't trip the guard — only real code counts. */
function codeOnly(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const sourceFiles = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

describe("WhatsApp integrates directly with Meta, with no Twilio relay", () => {
  it("scans a meaningful number of source files", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it("has no twilio package dependency", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("twilio");
    expect(Object.keys(pkg.devDependencies ?? {})).not.toContain("twilio");
  });

  it("never imports the twilio SDK", () => {
    const offenders = sourceFiles.filter((f) => /from\s+["']twilio["']|require\(["']twilio["']\)/.test(codeOnly(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("never calls api.twilio.com", () => {
    const offenders = sourceFiles.filter((f) => codeOnly(f).includes("api.twilio.com"));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("never reads a TWILIO_* environment variable", () => {
    const offenders = sourceFiles.filter((f) => /TWILIO_[A-Z_]+/.test(codeOnly(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("documents no TWILIO_* variable in .env.example", () => {
    const env = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    expect(env).not.toMatch(/^TWILIO_/m);
    // And the Cloud API credentials are documented instead.
    expect(env).toMatch(/^WHATSAPP_CLOUD_API_TOKEN=/m);
    expect(env).toMatch(/^WHATSAPP_CLOUD_PHONE_NUMBER_ID=/m);
  });

  it("routes every outbound WhatsApp request to graph.facebook.com", () => {
    const senders = sourceFiles.filter((f) => /https:\/\/graph\.facebook\.com/.test(codeOnly(f)));
    // The shared client, plus the standalone Deno edge function.
    expect(senders.map((f) => path.relative(ROOT, f)).sort()).toEqual([
      "lib/services/whatsapp-cloud.ts",
      "supabase/functions/renewal-reminders/index.ts",
    ]);
  });

  it("funnels every in-app WhatsApp send through the single Cloud API client", () => {
    // whatsapp.ts (welcome) and marketing-dispatch.ts (campaigns) must delegate
    // rather than re-implement a transport.
    for (const rel of ["lib/services/whatsapp.ts", "lib/services/marketing-dispatch.ts"]) {
      const code = codeOnly(path.join(ROOT, rel));
      expect(code).toMatch(/from\s+["']@\/lib\/services\/whatsapp-cloud["']/);
    }
  });
});
