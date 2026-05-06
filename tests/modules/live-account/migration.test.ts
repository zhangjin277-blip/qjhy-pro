// tests/modules/live-account/migration.test.ts
import { describe, it, expect } from "vitest";
import { parseScheduleString, parseRestDay } from "@/modules/live-account/migration";

describe("parseScheduleString", () => {
  it("解析 '12:00-18:00'", () => {
    expect(parseScheduleString("12:00-18:00")).toEqual(["12:00", "18:00"]);
  });

  it("解析含空格的 ' 9:00 - 18:00 '", () => {
    expect(parseScheduleString(" 9:00 - 18:00 ")).toEqual(["09:00", "18:00"]);
  });

  it("解析跨日 '22:00-03:00'", () => {
    expect(parseScheduleString("22:00-03:00")).toEqual(["22:00", "03:00"]);
  });

  it("无效格式返回 null", () => {
    expect(parseScheduleString("12:00")).toBeNull();
    expect(parseScheduleString("")).toBeNull();
    expect(parseScheduleString(undefined)).toBeNull();
  });
});

describe("parseRestDay", () => {
  it("数字字符串 '1'-'7' → 数字", () => {
    expect(parseRestDay("1")).toBe(1);
    expect(parseRestDay("7")).toBe(7);
  });

  it("中文 '周一'-'周日' → ISO weekday", () => {
    expect(parseRestDay("周一")).toBe(1);
    expect(parseRestDay("周日")).toBe(7);
  });

  it("空 / 0 / 无效 → null", () => {
    expect(parseRestDay("0")).toBeNull();
    expect(parseRestDay("")).toBeNull();
    expect(parseRestDay("无")).toBeNull();
    expect(parseRestDay(undefined)).toBeNull();
  });
});
