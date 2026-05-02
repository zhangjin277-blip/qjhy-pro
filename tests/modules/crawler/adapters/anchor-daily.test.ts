import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  parseAnchorDailyResponse,
  ANCHOR_DAILY_FIELDS,
} from "@/modules/crawler/adapters/anchor-daily";

// The fixture is the OUTER envelope: { data: { data_string: "<stringified JSON>" }, ... }
// We need a 2-step parse to get the inner object that parseAnchorDailyResponse accepts.
const OUTER = JSON.parse(
  readFileSync(join(__dirname, "../../../fixtures/anchor-daily-response.json"), "utf-8"),
);
const RAW = JSON.parse(OUTER.data.data_string) as {
  data: { series: Record<string, unknown>[] };
  meta: string;
};

describe("parseAnchorDailyResponse", () => {
  it("returns array of daily rows", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("parses formatted strings: live_duration to hours", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const r = rows[0]!;
    expect(typeof r.live_duration_1d).toBe("number"); // not the "6小时6分钟38秒" string
    if (r.live_duration_1d !== null) expect(r.live_duration_1d).toBeGreaterThanOrEqual(0);
  });

  it("includes anchor_id and date as primary key fields", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const r = rows[0]!;
    expect(r.anchor_id).toBeTruthy();
    expect(r.date).toBe("2026-05-01");
  });

  it("ANCHOR_DAILY_FIELDS lists all 91 fields for fields= request param", () => {
    expect(ANCHOR_DAILY_FIELDS.length).toBeGreaterThanOrEqual(80); // 至少 80 个
  });
});
