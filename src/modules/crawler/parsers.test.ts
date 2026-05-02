import { describe, it, expect } from "vitest";
import { parseDuration, parseRelativeTime, parsePercent, parseChineseNumber } from "./parsers";

describe("parseDuration", () => {
  it("parses '6小时6分钟38秒' to 6.11 hours", () => {
    expect(parseDuration("6小时6分钟38秒")).toBeCloseTo(6.11, 2);
  });
  it("parses '0小时0分钟0秒' to 0", () => {
    expect(parseDuration("0小时0分钟0秒")).toBe(0);
  });
  it("parses '30分钟' to 0.5 hours", () => {
    expect(parseDuration("30分钟")).toBeCloseTo(0.5, 2);
  });
  it("parses '1小时' to 1", () => {
    expect(parseDuration("1小时")).toBe(1);
  });
  it("parses empty/null to null", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
  it("parses non-string fallback to null", () => {
    expect(parseDuration("乱码")).toBeNull();
  });
});

describe("parseRelativeTime", () => {
  it("parses '17小时前' relative to now", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("17小时前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 17 * 3600);
  });
  it("parses '3天前'", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("3天前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 3 * 86400);
  });
  it("parses '5分钟前'", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("5分钟前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 5 * 60);
  });
  it("returns null on unparseable", () => {
    expect(parseRelativeTime("一会儿前")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("parses '50%' to 0.5", () => {
    expect(parsePercent("50%")).toBe(0.5);
  });
  it("parses '0%' to 0", () => {
    expect(parsePercent("0%")).toBe(0);
  });
  it("parses '100%' to 1", () => {
    expect(parsePercent("100%")).toBe(1);
  });
  it("parses '12.5%' to 0.125", () => {
    expect(parsePercent("12.5%")).toBeCloseTo(0.125, 4);
  });
  it("returns null on bad input", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc%")).toBeNull();
  });
});

describe("parseChineseNumber", () => {
  it("parses '3.8万' to 38000", () => {
    expect(parseChineseNumber("3.8万")).toBe(38000);
  });
  it("parses '1万' to 10000", () => {
    expect(parseChineseNumber("1万")).toBe(10000);
  });
  it("parses '1.2亿' to 120000000", () => {
    expect(parseChineseNumber("1.2亿")).toBe(120000000);
  });
  it("parses plain '1234' to 1234", () => {
    expect(parseChineseNumber("1234")).toBe(1234);
  });
  it("parses numeric value as-is", () => {
    expect(parseChineseNumber(1234)).toBe(1234);
  });
  it("returns null on bad input", () => {
    expect(parseChineseNumber("")).toBeNull();
    expect(parseChineseNumber("abc")).toBeNull();
  });
});
