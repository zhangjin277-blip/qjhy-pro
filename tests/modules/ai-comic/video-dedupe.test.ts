import { describe, expect, it } from "vitest";
import { dedupeOfficialWorks } from "@/modules/ai-comic/video-dedupe";

describe("dedupeOfficialWorks", () => {
  it("keeps the precise Douyin ID when a legacy rounded row exists", () => {
    const publishTime = new Date("2026-07-11T11:58:20+08:00");
    const rows = [
      {
        item_id: "7661114816240618000",
        publish_time: publishTime,
        description: "same work",
        views: 76_575,
      },
      {
        item_id: "7661114816240618752",
        publish_time: publishTime,
        description: "same work",
        views: 76_627,
      },
    ];

    expect(dedupeOfficialWorks(rows)).toEqual([rows[1]]);
  });

  it("does not merge different works with the same title", () => {
    const rows = [
      {
        item_id: "7661114816240618752",
        publish_time: new Date("2026-07-11T11:58:20+08:00"),
        description: "reused title",
      },
      {
        item_id: "7661116322796866816",
        publish_time: new Date("2026-07-12T11:02:00+08:00"),
        description: "reused title",
      },
    ];

    expect(dedupeOfficialWorks(rows)).toEqual(rows);
  });
});
