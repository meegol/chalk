import { describe, expect, it } from "vitest";
import { addDays, dayKey, weekdayOfKey, zonedToUtc } from "@/lib/time";

describe("time", () => {
  it("converts gym wall-clock time to UTC", () => {
    expect(zonedToUtc("2026-07-01", "06:00", "America/New_York").toISOString()).toBe("2026-07-01T10:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "06:00", "America/New_York").toISOString()).toBe("2026-12-01T11:00:00.000Z");
    expect(zonedToUtc("2026-10-28", "18:30", "Asia/Manila").toISOString()).toBe("2026-10-28T10:30:00.000Z");
  });

  it("handles the day DST ends", () => {
    // 2026-11-01 is the US fall-back day; 06:00 is after the switch.
    expect(zonedToUtc("2026-11-01", "06:00", "America/New_York").toISOString()).toBe("2026-11-01T11:00:00.000Z");
  });

  it("finds the local day and weekday", () => {
    const d = new Date("2026-10-28T23:30:00Z");
    expect(dayKey(d, "Asia/Manila")).toBe("2026-10-29");
    expect(dayKey(d, "America/Los_Angeles")).toBe("2026-10-28");
    expect(weekdayOfKey("2026-10-28")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
