import { describe, expect, it } from "vitest";
import { businessDate, legacyCalendarDate } from "../../src/lib/business-date";

describe("procurement calendar dates", () => {
  it("preserves PRO3 slash dates and local timestamps without a UTC day shift", () => {
    expect(legacyCalendarDate("2026/10/8")).toBe("2026-10-08");
    expect(legacyCalendarDate("2026/9/30")).toBe("2026-09-30");
    expect(legacyCalendarDate("2026-10-08 00:03:00")).toBe("2026-10-08");
    expect(legacyCalendarDate("2026-02-01")).toBe("2026-02-01");
  });
  it("rejects impossible dates instead of rolling them into another month", () => {
    expect(legacyCalendarDate("2026/2/30")).toBeNull();
    expect(legacyCalendarDate(null)).toBeNull();
  });
  it("uses Beijing's day across the UTC midnight boundary", () => {
    expect(businessDate(new Date("2026-10-07T16:00:00Z"))).toBe("2026-10-08");
    expect(businessDate(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01");
    expect(businessDate(new Date("2026-10-07T15:59:59Z"))).toBe("2026-10-07");
  });
});
