import { describe, it, expect } from "vitest";
import { attributeRow, type AttributionInput } from "@/modules/placement-attribution/attribute";
import type { DefaultSchedule, OverrideSchedule } from "@/modules/schedule-override/effective";

const baseInput = (
  hour: number,
  defaults: DefaultSchedule[] = [],
  overrides: OverrideSchedule[] = [],
  date = "2026-05-06",
): AttributionInput => ({ date, hour, defaults, overrides });

describe("attributeRow", () => {
  it("override 命中 → source='override'", () => {
    const r = attributeRow(
      baseInput(
        15,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }],
        [{ user: "u1", slots: [["14:00", "18:00"]] }],
      ),
    );
    expect(r.source).toBe("override");
    expect(r.user).toBe("u1");
  });

  it("override 没命中、default 命中 → source='default'", () => {
    const r = attributeRow(
      baseInput(11, [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }], []),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u1");
  });

  it("跨天时段 22-04 + hour=2 → 命中", () => {
    const r = attributeRow(
      baseInput(2, [{ user: "u1", slots: [["22:00", "04:00"]], rest_days: [] }], []),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u1");
  });

  it("rest_days 包含当天 ISO weekday → 不命中（unmatched）", () => {
    // 2026-05-06 is Wednesday = ISO weekday 3
    const r = attributeRow(
      baseInput(11, [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [3] }], []),
    );
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });

  it("两个 default 重叠覆盖 → conflict", () => {
    const r = attributeRow(
      baseInput(
        15,
        [
          { user: "u1", slots: [["14:00", "18:00"]], rest_days: [] },
          { user: "u2", slots: [["14:00", "18:00"]], rest_days: [] },
        ],
        [],
      ),
    );
    expect(r.source).toBe("conflict");
    expect(r.user).toBe(null);
  });

  it("override 替换 default 后唯一 → 不算 conflict", () => {
    const r = attributeRow(
      baseInput(
        15,
        [
          { user: "u1", slots: [["14:00", "18:00"]], rest_days: [] },
          { user: "u2", slots: [["14:00", "18:00"]], rest_days: [] },
        ],
        [{ user: "u1", slots: [] }],
      ),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u2");
  });

  it("空 default + 空 override → unmatched", () => {
    const r = attributeRow(baseInput(15, [], []));
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });

  it("override slots=[] 让该 user 当天没排班（请假）", () => {
    const r = attributeRow(
      baseInput(
        11,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }],
        [{ user: "u1", slots: [] }],
      ),
    );
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });
});
