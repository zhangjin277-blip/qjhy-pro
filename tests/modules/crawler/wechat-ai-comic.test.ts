import { describe, expect, it } from "vitest";
import { getWechatDailyRange } from "@/modules/crawler/adapters/wechat-ai-comic";

describe("getWechatDailyRange", () => {
  it("returns seven completed Shanghai calendar days at midnight", () => {
    const range = getWechatDailyRange(Date.parse("2026-09-22T14:30:00+08:00"));

    expect(new Date(range.startTs * 1000).toISOString()).toBe("2026-09-14T16:00:00.000Z");
    expect(new Date(range.endTs * 1000).toISOString()).toBe("2026-09-20T16:00:00.000Z");
  });

  it("uses the previous day immediately after Shanghai midnight", () => {
    const range = getWechatDailyRange(Date.parse("2026-09-22T00:01:00+08:00"));

    expect(new Date(range.endTs * 1000).toISOString()).toBe("2026-09-20T16:00:00.000Z");
  });
});
