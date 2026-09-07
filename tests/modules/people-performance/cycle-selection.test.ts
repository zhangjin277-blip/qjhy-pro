import { describe, expect, it } from "vitest";

import { selectCurrentCycle } from "@/modules/people-performance/cycle-selection";

const cycle = (
  id: string,
  kind: "probation" | "monthly",
  stage: "goal_setting" | "in_progress" | "scheduled" | "completed",
  periodStart: string,
) => ({ id, kind, stage, periodStart });

describe("people performance current cycle selection", () => {
  it("ignores obsolete probation cycles after a person becomes regular", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("old-probation", "probation", "goal_setting", "2026-04-19"),
          cycle("august", "monthly", "in_progress", "2026-08-01"),
        ],
        "regular",
      )?.id,
    ).toBe("august");
  });

  it("only selects probation cycles for probation staff", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("probation", "probation", "goal_setting", "2026-08-01"),
          cycle("monthly", "monthly", "in_progress", "2026-08-01"),
        ],
        "probation",
      )?.id,
    ).toBe("probation");
  });

  it("prefers the latest active period over scheduled and older active periods", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("september", "monthly", "scheduled", "2026-09-01"),
          cycle("july", "monthly", "goal_setting", "2026-07-01"),
          cycle("august", "monthly", "in_progress", "2026-08-01"),
        ],
        "regular",
      )?.id,
    ).toBe("august");
  });
});
