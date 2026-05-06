import { describe, it, expect } from "vitest";
import { coversHour, parseSlotHour } from "@/modules/placement/time-slot-utils";

describe("parseSlotHour", () => {
  it("'09:00' → 9", () => {
    expect(parseSlotHour("09:00")).toBe(9);
  });
  it("'14:30' → 14（向下取）", () => {
    expect(parseSlotHour("14:30")).toBe(14);
  });
  it("'00:00' → 0", () => {
    expect(parseSlotHour("00:00")).toBe(0);
  });
});

describe("coversHour", () => {
  it("普通时段 09-13 覆盖 9, 10, 11, 12", () => {
    expect(coversHour(["09:00", "13:00"], 9)).toBe(true);
    expect(coversHour(["09:00", "13:00"], 12)).toBe(true);
    expect(coversHour(["09:00", "13:00"], 13)).toBe(false);
    expect(coversHour(["09:00", "13:00"], 8)).toBe(false);
  });

  it("跨天时段 22-04 覆盖 22, 23, 0, 1, 2, 3", () => {
    expect(coversHour(["22:00", "04:00"], 22)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 23)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 0)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 3)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 4)).toBe(false);
    expect(coversHour(["22:00", "04:00"], 21)).toBe(false);
  });

  it("退化 sh==eh → 不覆盖任何 hour", () => {
    expect(coversHour(["12:00", "12:00"], 12)).toBe(false);
  });
});
