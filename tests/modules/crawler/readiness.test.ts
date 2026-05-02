import { describe, it, expect } from "vitest";
import { isDailyReady } from "@/modules/crawler/readiness";

describe("isDailyReady", () => {
  it("returns false when >70% rows have totalFanTicket=0", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      totalFanTicket: i < 40 ? 0 : 100,
    }));
    expect(isDailyReady(rows)).toBe(false);
  });

  it("returns true when >30% rows have totalFanTicket>0", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      totalFanTicket: i < 20 ? 0 : 100,
    }));
    expect(isDailyReady(rows)).toBe(true);
  });

  it("returns false on empty input", () => {
    expect(isDailyReady([])).toBe(false);
  });

  it("handles string totalFanTicket", () => {
    const rows = [{ totalFanTicket: "100" }, { totalFanTicket: "0" }, { totalFanTicket: "50" }];
    expect(isDailyReady(rows)).toBe(true);
  });
});
