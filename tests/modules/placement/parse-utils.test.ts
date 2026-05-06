import { describe, it, expect } from "vitest";
import { parseUnitNumber, parseDateText, parseHour } from "@/modules/placement/parse-utils";

describe("parseUnitNumber", () => {
  it("纯数字直接 cast", () => {
    expect(parseUnitNumber("17622.88")).toBe(17622.88);
    expect(parseUnitNumber("0")).toBe(0);
  });
  it("带元 strip", () => {
    expect(parseUnitNumber("5746元")).toBe(5746);
    expect(parseUnitNumber("17,622.88元")).toBe(17622.88);
  });
  it("带百分号 strip", () => {
    expect(parseUnitNumber("4.08%")).toBe(4.08);
  });
  it("带分钟 strip", () => {
    expect(parseUnitNumber("2646.9分钟")).toBe(2646.9);
  });
  it("空字符串 / null / undefined → 0", () => {
    expect(parseUnitNumber("")).toBe(0);
    expect(parseUnitNumber(null)).toBe(0);
    expect(parseUnitNumber(undefined)).toBe(0);
  });
  it("纯空格 → 0", () => {
    expect(parseUnitNumber("   ")).toBe(0);
  });
});

describe("parseDateText", () => {
  it("中文格式 2026年05月06日", () => {
    expect(parseDateText("2026年05月06日")).toBe("2026-05-06");
  });
  it("中文格式带空格 2026年5月6日", () => {
    expect(parseDateText("2026年5月6日")).toBe("2026-05-06");
  });
  it("ISO 格式 2026-05-06", () => {
    expect(parseDateText("2026-05-06")).toBe("2026-05-06");
  });
  it("不可识别格式 → null", () => {
    expect(parseDateText("foo")).toBe(null);
    expect(parseDateText("")).toBe(null);
  });
});

describe("parseHour", () => {
  it("整数 19 → 19", () => {
    expect(parseHour(19)).toBe(19);
  });
  it("字符串 19 → 19", () => {
    expect(parseHour("19")).toBe(19);
    expect(parseHour("19 ")).toBe(19);
  });
  it("时间字符串 19:00 → 19", () => {
    expect(parseHour("19:00")).toBe(19);
    expect(parseHour("09:30")).toBe(9);
  });
  it("中文格式 19点 → 19", () => {
    expect(parseHour("19点")).toBe(19);
  });
  it("无效输入 → null", () => {
    expect(parseHour("foo")).toBe(null);
    expect(parseHour("25")).toBe(null);
    expect(parseHour("-1")).toBe(null);
  });
});
