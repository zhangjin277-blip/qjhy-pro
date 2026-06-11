import { describe, it, expect } from "vitest";
import { resolveFilter } from "@/modules/placement/filter-utils";

// 2026-06-09T17:30:00Z = 北京 2026-06-10 01:30（北京凌晨，UTC 日期还在前一天）
const BJ_EARLY_MORNING = new Date("2026-06-09T17:30:00Z");
// 2026-06-10T06:00:00Z = 北京 2026-06-10 14:00（两个时区同一天）
const BJ_AFTERNOON = new Date("2026-06-10T06:00:00Z");

describe("resolveFilter — 预设按北京时区取日期", () => {
  it("北京凌晨 0-8 点 preset=today → 仍是北京当天（不回退到 UTC 前一天）", () => {
    const f = resolveFilter({ preset: "today" }, BJ_EARLY_MORNING);
    expect(f.date_from).toBe("2026-06-10");
    expect(f.date_to).toBe("2026-06-10");
  });

  it("北京下午 preset=today → 北京当天", () => {
    const f = resolveFilter({ preset: "today" }, BJ_AFTERNOON);
    expect(f.date_from).toBe("2026-06-10");
    expect(f.date_to).toBe("2026-06-10");
  });

  it("北京凌晨 preset=yesterday → 北京昨天", () => {
    const f = resolveFilter({ preset: "yesterday" }, BJ_EARLY_MORNING);
    expect(f.date_from).toBe("2026-06-09");
    expect(f.date_to).toBe("2026-06-09");
  });

  it("preset=last7 → [today-7, today]", () => {
    const f = resolveFilter({ preset: "last7" }, BJ_AFTERNOON);
    expect(f.date_from).toBe("2026-06-03");
    expect(f.date_to).toBe("2026-06-10");
  });

  it("未知 preset → 按 7 天兜底", () => {
    const f = resolveFilter({ preset: "bogus" }, BJ_AFTERNOON);
    expect(f.date_from).toBe("2026-06-03");
    expect(f.date_to).toBe("2026-06-10");
  });

  it("跨月边界：6 月 1 日北京凌晨 preset=yesterday → 5 月 31 日", () => {
    // 2026-05-31T17:00:00Z = 北京 2026-06-01 01:00
    const f = resolveFilter({ preset: "yesterday" }, new Date("2026-05-31T17:00:00Z"));
    expect(f.date_from).toBe("2026-05-31");
    expect(f.date_to).toBe("2026-05-31");
  });

  it("自定义 from/to 优先于 preset，且自动交换保证 from <= to", () => {
    const f = resolveFilter(
      { from: "2026-06-08", to: "2026-06-01", preset: "today" },
      BJ_AFTERNOON,
    );
    expect(f.date_from).toBe("2026-06-01");
    expect(f.date_to).toBe("2026-06-08");
  });
});
