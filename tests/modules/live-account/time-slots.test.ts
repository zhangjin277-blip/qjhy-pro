import { describe, it, expect } from "vitest";
import { hourMatchesTimeSlots, isRestDay } from "@/modules/live-account/time-slots";

describe("hourMatchesTimeSlots", () => {
  it("匹配普通时段 12:00-18:00", () => {
    const slots: [string, string][] = [["12:00", "18:00"]];
    expect(hourMatchesTimeSlots(slots, 12)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 17)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 18)).toBe(false); // end exclusive
    expect(hourMatchesTimeSlots(slots, 11)).toBe(false);
  });

  it("匹配跨日时段 22:00-03:00", () => {
    const slots: [string, string][] = [["22:00", "03:00"]];
    expect(hourMatchesTimeSlots(slots, 22)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 23)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 0)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 2)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 3)).toBe(false);
    expect(hourMatchesTimeSlots(slots, 21)).toBe(false);
    expect(hourMatchesTimeSlots(slots, 5)).toBe(false);
  });

  it("匹配多段时段", () => {
    const slots: [string, string][] = [
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ];
    expect(hourMatchesTimeSlots(slots, 10)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 13)).toBe(false); // gap
    expect(hourMatchesTimeSlots(slots, 15)).toBe(true);
  });

  it("空时段不匹配任何小时", () => {
    expect(hourMatchesTimeSlots([], 12)).toBe(false);
  });
});

describe("isRestDay", () => {
  it("ISO weekday: 1=周一 ... 7=周日", () => {
    expect(isRestDay([1], new Date("2026-05-04"))).toBe(true); // 2026-05-04 是周一
    expect(isRestDay([1], new Date("2026-05-05"))).toBe(false); // 周二
    expect(isRestDay([7], new Date("2026-05-10"))).toBe(true); // 周日
  });

  it("rest_days 数组多日", () => {
    expect(isRestDay([1, 3], new Date("2026-05-06"))).toBe(true); // 周三
    expect(isRestDay([1, 3], new Date("2026-05-04"))).toBe(true); // 周一
    expect(isRestDay([1, 3], new Date("2026-05-05"))).toBe(false); // 周二
  });

  it("空 rest_days 总是 false", () => {
    expect(isRestDay([], new Date("2026-05-04"))).toBe(false);
  });
});
