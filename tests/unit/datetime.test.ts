import { describe, it, expect } from "vitest";
import {
  todayInTimeZone,
  formatDateInTimeZone,
  addDaysToDateString,
  daysBetweenDateStrings,
  isPastInTimeZone,
  formatDateForDisplay,
  DEFAULT_TIMEZONE,
} from "@/lib/utils/datetime";

describe("todayInTimeZone", () => {
  it("returns the IST calendar day, not the UTC one, in the +5:30 overlap window", () => {
    // 2026-03-31T20:00:00Z is already 2026-04-01 01:30 in Asia/Kolkata.
    // The old UTC-based code reported 2026-03-31 here, which is exactly how a
    // subscription got an extra day of life.
    const instant = new Date("2026-03-31T20:00:00.000Z");
    expect(todayInTimeZone("Asia/Kolkata", instant)).toBe("2026-04-01");
    expect(todayInTimeZone("UTC", instant)).toBe("2026-03-31");
  });

  it("handles the other side of the boundary", () => {
    // 00:30 UTC is 06:00 IST the same day.
    const instant = new Date("2026-04-01T00:30:00.000Z");
    expect(todayInTimeZone("Asia/Kolkata", instant)).toBe("2026-04-01");
  });

  it("falls back to the default zone for a garbage timezone string", () => {
    const instant = new Date("2026-03-31T20:00:00.000Z");
    expect(formatDateInTimeZone(instant, "Not/AZone")).toBe(
      formatDateInTimeZone(instant, DEFAULT_TIMEZONE)
    );
  });

  it("defaults to Asia/Kolkata", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Kolkata");
  });
});

describe("addDaysToDateString", () => {
  it("adds days without drifting", () => {
    expect(addDaysToDateString("2026-01-01", 30)).toBe("2026-01-31");
    expect(addDaysToDateString("2026-01-01", 0)).toBe("2026-01-01");
    expect(addDaysToDateString("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("crosses month, year and leap-day boundaries", () => {
    expect(addDaysToDateString("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToDateString("2024-02-28", 1)).toBe("2024-02-29"); // leap year
    expect(addDaysToDateString("2025-02-28", 1)).toBe("2025-03-01"); // non-leap
  });

  it("subtracts with negative offsets", () => {
    expect(addDaysToDateString("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is stable regardless of the process timezone", () => {
    // The noon anchoring means a host running at UTC-11 still gets the same
    // answer; the old setDate()/toISOString() combination did not.
    const original = process.env.TZ;
    try {
      process.env.TZ = "Pacific/Midway"; // UTC-11
      expect(addDaysToDateString("2026-01-01", 1)).toBe("2026-01-02");
      process.env.TZ = "Pacific/Kiritimati"; // UTC+14
      expect(addDaysToDateString("2026-01-01", 1)).toBe("2026-01-02");
    } finally {
      process.env.TZ = original;
    }
  });

  it("tolerates a full timestamp as input", () => {
    expect(addDaysToDateString("2026-01-01T18:45:00.000Z", 1)).toBe("2026-01-02");
  });
});

describe("daysBetweenDateStrings", () => {
  it("counts whole calendar days in both directions", () => {
    expect(daysBetweenDateStrings("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetweenDateStrings("2026-01-31", "2026-01-01")).toBe(-30);
    expect(daysBetweenDateStrings("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("is unaffected by DST transitions in other zones", () => {
    // Spans the US DST change; noon anchoring keeps this exact.
    expect(daysBetweenDateStrings("2026-03-01", "2026-03-31")).toBe(30);
  });
});

describe("isPastInTimeZone", () => {
  const instant = new Date("2026-03-31T20:00:00.000Z"); // 2026-04-01 01:30 IST

  it("treats a membership ending today (IST) as still valid", () => {
    expect(isPastInTimeZone("2026-04-01", "Asia/Kolkata", instant)).toBe(false);
  });

  it("treats a membership that ended yesterday (IST) as past", () => {
    expect(isPastInTimeZone("2026-03-31", "Asia/Kolkata", instant)).toBe(true);
  });

  it("disagrees with a UTC evaluation at exactly the boundary", () => {
    // This divergence is the whole bug: under UTC the 31st is "today" and the
    // membership would be kept alive an extra day.
    expect(isPastInTimeZone("2026-03-31", "UTC", instant)).toBe(false);
    expect(isPastInTimeZone("2026-03-31", "Asia/Kolkata", instant)).toBe(true);
  });
});

describe("formatDateForDisplay", () => {
  it("renders a date-only string as the same calendar day", () => {
    // Parsed as UTC midnight and rendered in the server zone, this printed the
    // previous day on any host west of UTC.
    expect(formatDateForDisplay("2026-03-31", "Asia/Kolkata")).toMatch(/31 Mar 2026/);
  });

  it("does not shift the day for a host west of UTC", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "America/Los_Angeles";
      expect(formatDateForDisplay("2026-03-31", "Asia/Kolkata")).toMatch(/31 Mar 2026/);
    } finally {
      process.env.TZ = original;
    }
  });

  it("returns the input unchanged when it is not a parseable date", () => {
    expect(formatDateForDisplay("not-a-date")).toBe("not-a-date");
  });
});
