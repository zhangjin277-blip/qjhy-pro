import { describe, expect, it } from "vitest";
import { visiblePerformanceRating } from "@/modules/people-performance/rating";

const cycle = {
  kind: "probation",
  stage: "hr_calibration",
  final_grade: "超越预期",
  hr_user_id: "hr",
};

describe("probation rating visibility", () => {
  it("withholds employee ratings until HR finishes calibration", () => {
    expect(visiblePerformanceRating(cycle, true)).toBeNull();
    expect(visiblePerformanceRating({ ...cycle, stage: "employee_confirm" }, true)).toBe(
      "超越预期",
    );
    expect(visiblePerformanceRating({ ...cycle, stage: "completed" }, true)).toBe("超越预期");
    expect(
      visiblePerformanceRating({ ...cycle, stage: "completed", hr_user_id: null }, true),
    ).toBeNull();
    expect(visiblePerformanceRating({ ...cycle, stage: "manager_review" }, true)).toBeNull();
  });

  it("allows reviewers to see ratings but never converts legacy S-D grades", () => {
    expect(visiblePerformanceRating(cycle, false)).toBe("超越预期");
    for (const final_grade of ["S", "A", "B", "C", "D"]) {
      expect(visiblePerformanceRating({ ...cycle, final_grade }, false)).toBeNull();
    }
  });

  it("preserves formal-employee grades", () => {
    expect(visiblePerformanceRating({ ...cycle, kind: "monthly", final_grade: "B" }, true)).toBe(
      "B",
    );
  });
});
