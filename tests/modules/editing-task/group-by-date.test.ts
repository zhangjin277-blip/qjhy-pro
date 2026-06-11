import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { groupByDate, shanghaiDateStr } from "@/app/(dashboard)/editing/_lib/group-by-date";
import type { BoardCard } from "@/modules/editing-task";

function makeCard(partial: Partial<BoardCard> & { id: number }): BoardCard {
  return {
    status: "published",
    liveAccountId: "acc-1",
    liveAccountName: "账号",
    product: "捕鱼大作战",
    productShort: "捕鱼",
    productAccentColor: "#000",
    anchorName: null,
    editorUserId: null,
    editorName: null,
    materialDate: "2026-06-01",
    enteredStatusAt: "2026-06-01T00:00:00.000Z",
    publishedAt: null,
    sourceDurationSec: null,
    hasSource: true,
    hasEdited: true,
    isDisqualified: false,
    disqualifiedReason: null,
    priority: "normal",
    isDuplicate: false,
    ...partial,
  };
}

describe("shanghaiDateStr", () => {
  it("converts UTC instants to Beijing calendar dates", () => {
    // UTC 06-09 17:00 = 北京 06-10 01:00 —— toISOString 口径会错回 06-09
    expect(shanghaiDateStr(new Date("2026-06-09T17:00:00Z"))).toBe("2026-06-10");
    expect(shanghaiDateStr(new Date("2026-06-09T15:59:59Z"))).toBe("2026-06-09");
    // 纯日期串（UTC 零点）= 北京同日 08:00，不跨天
    expect(shanghaiDateStr(new Date("2026-06-10"))).toBe("2026-06-10");
  });
});

describe("groupByDate (北京时间分组)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 北京时间 2026-06-10 01:30（UTC 还在 06-09）—— 历史 bug 高发窗口
    vi.setSystemTime(new Date("2026-06-09T17:30:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("今天组按北京日期生成，跨 UTC 午夜不错位", () => {
    const cards = [
      // materialDate = 北京今天
      makeCard({ id: 1, materialDate: "2026-06-10" }),
      // 北京 06-10 01:00 发布（UTC 仍是 06-09）→ 也应进「今天」组
      makeCard({ id: 2, materialDate: "2026-06-09" }),
    ];
    const groups = groupByDate(cards, "materialDate");
    const today = groups.find((g) => g.label.startsWith("今天"));
    const yesterday = groups.find((g) => g.label.startsWith("昨天"));
    expect(today?.label).toBe("今天 · 06-10");
    expect(today?.cards.map((c) => c.id)).toEqual([1]);
    expect(yesterday?.label).toBe("昨天 · 06-09");
    expect(yesterday?.cards.map((c) => c.id)).toEqual([2]);
  });

  it("时间戳字段按北京时间切日", () => {
    const cards = [
      // UTC 06-09 17:00 = 北京 06-10 → 今天
      makeCard({ id: 1, publishedAt: "2026-06-09T17:00:00.000Z" }),
      // UTC 06-09 15:00 = 北京 06-09 23:00 → 昨天
      makeCard({ id: 2, publishedAt: "2026-06-09T15:00:00.000Z" }),
    ];
    const groups = groupByDate(cards, "publishedAt");
    expect(groups.find((g) => g.label.startsWith("今天"))?.cards.map((c) => c.id)).toEqual([1]);
    expect(groups.find((g) => g.label.startsWith("昨天"))?.cards.map((c) => c.id)).toEqual([2]);
  });

  it("7 天前的卡片归入「更早」", () => {
    const cards = [makeCard({ id: 1, materialDate: "2026-05-01" })];
    const groups = groupByDate(cards, "materialDate");
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("更早");
  });

  it("周 X 标签按日历日期计算（与本机时区无关）", () => {
    // 2026-06-07 是周日（北京 06-10 往前 3 天）
    const cards = [makeCard({ id: 1, materialDate: "2026-06-07" })];
    const groups = groupByDate(cards, "materialDate");
    expect(groups[0]?.label).toBe("周日 · 06-07");
  });
});
