import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseAnchorListResponse } from "@/modules/crawler/adapters/anchor-list";

const RAW = JSON.parse(
  readFileSync(join(__dirname, "../../../fixtures/anchor-list-response.json"), "utf-8"),
) as Parameters<typeof parseAnchorListResponse>[0];

describe("parseAnchorListResponse", () => {
  it("returns array of profile rows", () => {
    const rows = parseAnchorListResponse(RAW);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("first row has all key fields populated from base_info / faction_info / signing_info", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = parseAnchorListResponse(RAW)[0]!;
    expect(row.anchor_id).toBeTruthy();
    expect(row.nick_name).toBeTruthy();
    expect(row.broker_id).toBeTruthy();
    expect(row.recruit_broker_name).toBeTruthy();
    expect(row.join_time).toBeGreaterThan(0);
    expect(row.first_live_time_in_faction).toBeGreaterThan(0);
  });

  it("flags is_threekingdoms when recruit_broker_name === 三国项目", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = parseAnchorListResponse(RAW)[0]!;
    if (row.recruit_broker_name === "三国项目") {
      expect(row.is_threekingdoms).toBe(true);
    } else {
      expect(row.is_threekingdoms).toBe(false);
    }
  });

  it("includes raw payload", () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const row = parseAnchorListResponse(RAW)[0]!;
    expect(row.raw).toBeTruthy();
    expect(typeof row.raw).toBe("object");
  });
});
