import { describe, expect, it } from "vitest";
import {
  FLOOR_SECTIONS,
  deriveRoomView,
  normalizeRoomNo,
  productShortName,
  slotCoversTime,
  type RoomAccountInput,
} from "@/modules/live-room/floorplan";

describe("normalizeRoomNo", () => {
  it("库里的紧凑格式（PRO3 迁移）", () => {
    expect(normalizeRoomNo("A1")).toBe("A-01");
    expect(normalizeRoomNo("A20")).toBe("A-20");
    expect(normalizeRoomNo("B17")).toBe("B-17");
    expect(normalizeRoomNo("C2")).toBe("C-02");
  });

  it("带区字的完整格式（配置/新维护）", () => {
    expect(normalizeRoomNo("A区-01")).toBe("A-01");
    expect(normalizeRoomNo("A区-1")).toBe("A-01");
    expect(normalizeRoomNo("B区-09")).toBe("B-09");
    expect(normalizeRoomNo("C区-19")).toBe("C-19");
  });

  it("大小写/空格/前导零容错", () => {
    expect(normalizeRoomNo(" a区-01 ")).toBe("A-01");
    expect(normalizeRoomNo("b 区 - 07")).toBe("B-07");
    expect(normalizeRoomNo("A007")).toBe("A-07");
  });

  it("认不出的格式返回 null（进未上图兜底）", () => {
    expect(normalizeRoomNo("大直播间1")).toBeNull();
    expect(normalizeRoomNo("")).toBeNull();
    expect(normalizeRoomNo("17")).toBeNull();
    expect(normalizeRoomNo("AB-01")).toBeNull();
  });

  it("同格子两种写法归一后相等", () => {
    expect(normalizeRoomNo("A1")).toBe(normalizeRoomNo("A区-01"));
    expect(normalizeRoomNo("B区-09")).toBe(normalizeRoomNo("B9"));
  });
});

describe("FLOOR_SECTIONS 布局配置自检", () => {
  it("room 房号全部可归一化且无重复", () => {
    const keys: string[] = [];
    for (const sec of FLOOR_SECTIONS) {
      for (const cell of sec.cells) {
        if (cell.kind !== "room") continue;
        const key = normalizeRoomNo(cell.roomNo);
        expect(key, `房号 ${cell.roomNo} 应可归一化`).not.toBeNull();
        keys.push(key as string);
      }
    }
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cell 不越界（col + w - 1 <= columns）", () => {
    for (const sec of FLOOR_SECTIONS) {
      for (const cell of sec.cells) {
        const label = cell.kind === "room" ? cell.roomNo : cell.label;
        expect(
          cell.col + cell.w - 1,
          `${sec.key}/${label} 超出 ${sec.columns} 列`,
        ).toBeLessThanOrEqual(sec.columns);
      }
    }
  });

  it("同一行内 cell 不重叠", () => {
    for (const sec of FLOOR_SECTIONS) {
      // 展开跨行 cell 到每一行，按行检查区间重叠
      const byRow = new Map<number, { start: number; end: number; label: string }[]>();
      for (const cell of sec.cells) {
        const label = cell.kind === "room" ? cell.roomNo : cell.label;
        for (let r = cell.row; r < cell.row + cell.h; r++) {
          const list = byRow.get(r) ?? [];
          list.push({ start: cell.col, end: cell.col + cell.w - 1, label });
          byRow.set(r, list);
        }
      }
      for (const [row, list] of byRow) {
        const sorted = [...list].sort((a, b) => a.start - b.start);
        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (!prev || !cur) continue;
          expect(
            cur.start,
            `${sec.key} 第 ${row} 行 ${prev.label} 与 ${cur.label} 重叠`,
          ).toBeGreaterThan(prev.end);
        }
      }
    }
  });
});

describe("productShortName", () => {
  it("已知产品映射老系统短名", () => {
    expect(productShortName("捕鱼大作战")).toBe("大作战");
    expect(productShortName("三国冰河时代")).toBe("三冰");
  });
  it("未知产品原样返回", () => {
    expect(productShortName("新产品X")).toBe("新产品X");
  });
});

describe("slotCoversTime", () => {
  it("普通时段：start <= t < end", () => {
    expect(slotCoversTime(["11:00", "14:00"], "11:00")).toBe(true);
    expect(slotCoversTime(["11:00", "14:00"], "13:59")).toBe(true);
    expect(slotCoversTime(["11:00", "14:00"], "14:00")).toBe(false);
    expect(slotCoversTime(["11:00", "14:00"], "10:59")).toBe(false);
  });

  it("跨天时段（end <= start）", () => {
    expect(slotCoversTime(["22:00", "02:00"], "23:30")).toBe(true);
    expect(slotCoversTime(["22:00", "02:00"], "01:00")).toBe(true);
    expect(slotCoversTime(["22:00", "02:00"], "12:00")).toBe(false);
  });
});

describe("deriveRoomView", () => {
  const NOW = "12:00";
  const acc = (over: Partial<RoomAccountInput> = {}): RoomAccountInput => ({
    product: "捕鱼大作战",
    checkin: null,
    trendActive: false,
    bindingRestDays: [],
    schedule: [],
    ...over,
  });

  it("无账号 → vacant", () => {
    expect(deriveRoomView([], 1, NOW).state).toBe("vacant");
  });

  it("有打卡 → living_checkin，优先于爬虫/休", () => {
    const view = deriveRoomView(
      [
        acc({
          checkin: { anchorName: "陈晓晓", startAtLabel: "09:00" },
          trendActive: true,
          bindingRestDays: [[1]],
        }),
      ],
      1,
      NOW,
    );
    expect(view.state).toBe("living_checkin");
    expect(view.checkins[0]?.anchorName).toBe("陈晓晓");
  });

  it("多账号多打卡按开播时间升序", () => {
    const view = deriveRoomView(
      [
        acc({ checkin: { anchorName: "乙", startAtLabel: "10:30" } }),
        acc({ checkin: { anchorName: "甲", startAtLabel: "09:00" } }),
      ],
      1,
      NOW,
    );
    expect(view.checkins.map((c) => c.anchorName)).toEqual(["甲", "乙"]);
  });

  it("仅 trend 活跃 → living_crawler", () => {
    expect(deriveRoomView([acc({ trendActive: true })], 1, NOW).state).toBe("living_crawler");
  });

  it("所有绑定今天都休 → rest", () => {
    const view = deriveRoomView([acc({ bindingRestDays: [[1, 3]] })], 3, NOW);
    expect(view.state).toBe("rest");
  });

  it("有一个绑定今天不休 → idle", () => {
    const view = deriveRoomView([acc({ bindingRestDays: [[3], [1]] })], 3, NOW);
    expect(view.state).toBe("idle");
  });

  it("某账号完全没绑定 → 不判休，idle（快手账号 restDays 恒空）", () => {
    const view = deriveRoomView([acc({ bindingRestDays: [[3]] }), acc()], 3, NOW);
    expect(view.state).toBe("idle");
  });

  it("产品短名去重", () => {
    const view = deriveRoomView([acc(), acc(), acc({ product: "途游斗地主" })], 1, NOW);
    expect(view.products).toEqual(["大作战", "斗地主"]);
  });

  it("idle + 当班时段 → scheduled.current=true", () => {
    const view = deriveRoomView(
      [
        acc({
          schedule: [
            {
              anchorName: "林诗源",
              slots: [
                ["11:00", "14:00"],
                ["16:00", "19:00"],
              ],
            },
          ],
        }),
      ],
      1,
      "12:30",
    );
    expect(view.state).toBe("idle");
    expect(view.scheduled).toEqual({
      anchorName: "林诗源",
      start: "11:00",
      end: "14:00",
      current: true,
    });
  });

  it("idle + 无当班 → 显示今天下一班（最早的）", () => {
    const view = deriveRoomView(
      [
        acc({ schedule: [{ anchorName: "乙", slots: [["18:00", "21:00"]] }] }),
        acc({ schedule: [{ anchorName: "甲", slots: [["16:00", "19:00"]] }] }),
      ],
      1,
      "15:00",
    );
    expect(view.scheduled).toEqual({
      anchorName: "甲",
      start: "16:00",
      end: "19:00",
      current: false,
    });
  });

  it("idle + 今天班次已全部结束 → scheduled=null", () => {
    const view = deriveRoomView(
      [acc({ schedule: [{ anchorName: "甲", slots: [["09:00", "12:00"]] }] })],
      1,
      "22:00",
    );
    expect(view.scheduled).toBeNull();
  });

  it("在播/休/空房不带 scheduled", () => {
    const schedule = [{ anchorName: "甲", slots: [["11:00", "14:00"]] as [string, string][] }];
    expect(
      deriveRoomView(
        [acc({ schedule, checkin: { anchorName: "甲", startAtLabel: "11:00" } })],
        1,
        "12:00",
      ).scheduled,
    ).toBeNull();
    expect(
      deriveRoomView([acc({ schedule, bindingRestDays: [[1]] })], 1, "12:00").scheduled,
    ).toBeNull();
    expect(deriveRoomView([], 1, "12:00").scheduled).toBeNull();
  });
});
