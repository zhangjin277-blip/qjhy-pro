import { describe, it, expect } from "vitest";
import {
  mergeWithOverride,
  type DefaultSchedule,
  type OverrideSchedule,
} from "@/modules/schedule-override/effective";

describe("mergeWithOverride", () => {
  it("无 override → 全部走 default", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
      { user: "u2", slots: [["13:00", "18:00"]], rest_days: [] },
    ];
    const out = mergeWithOverride(defaults, []);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.source === "default")).toBe(true);
  });

  it("override 增加新主播 → effective 是 default ∪ 新增", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [{ user: "u2", slots: [["12:00", "14:00"]] }];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    const u2 = out.find((s) => s.user === "u2");
    expect(u1?.source).toBe("default");
    expect(u2?.source).toBe("override");
  });

  it("override 同主播 → 替换 default 该主播 slots", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
      { user: "u2", slots: [["13:00", "18:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [{ user: "u1", slots: [["10:00", "12:00"]] }];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    const u2 = out.find((s) => s.user === "u2");
    expect(u1?.slots).toEqual([["10:00", "12:00"]]);
    expect(u1?.source).toBe("override");
    expect(u2?.slots).toEqual([["13:00", "18:00"]]);
    expect(u2?.source).toBe("default");
  });

  it("override slots=[] → 该主播请假（slots 空）", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [{ user: "u1", slots: [] }];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    expect(u1?.slots).toEqual([]);
    expect(u1?.source).toBe("override");
  });
});
