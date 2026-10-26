import { describe, expect, it } from "vitest";

import type { PerformanceStage } from "@/db/schema";
import { selectCurrentCycle } from "@/modules/people-performance/cycle-selection";

const cycle = (
  id: string,
  kind: "probation" | "monthly",
  stage: PerformanceStage,
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

  it("shows the previous month's monthly cycle in the current-month overview", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("september", "monthly", "goal_setting", "2026-09-01"),
          cycle("august", "monthly", "manager_review", "2026-08-01"),
        ],
        "regular",
        "2026-09-07",
      )?.id,
    ).toBe("august");
  });

  it("moves to September after August is completed", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("september", "monthly", "goal_setting", "2026-09-01"),
          cycle("august", "monthly", "completed", "2026-08-01"),
          cycle("july", "monthly", "manager_review", "2026-07-01"),
        ],
        "regular",
        "2026-09-29",
      )?.id,
    ).toBe("september");
  });

  it("ignores a cancelled previous month", () => {
    expect(
      selectCurrentCycle(
        [
          cycle("september", "monthly", "goal_setting", "2026-09-01"),
          cycle("august", "monthly", "cancelled", "2026-08-01"),
        ],
        "regular",
        "2026-09-29",
      )?.id,
    ).toBe("september");
  });
});
