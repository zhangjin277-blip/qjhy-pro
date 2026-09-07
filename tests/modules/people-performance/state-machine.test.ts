import { describe, expect, it } from "vitest";

import { canTransition } from "@/modules/people-performance/state-machine";

describe("people performance state machine", () => {
  it("supports the confirmed fixed workflow", () => {
    expect(canTransition("goal_setting", "goal_review")).toBe(true);
    expect(canTransition("goal_review", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "self_review")).toBe(true);
    expect(canTransition("self_review", "manager_review")).toBe(true);
    expect(canTransition("manager_review", "skip_manager_review")).toBe(true);
    expect(canTransition("skip_manager_review", "hr_calibration")).toBe(true);
    expect(canTransition("hr_calibration", "employee_confirm")).toBe(true);
    expect(canTransition("employee_confirm", "completed")).toBe(true);
  });

  it("allows probation checkpoints to finish or enter HR after direct review", () => {
    expect(canTransition("manager_review", "completed")).toBe(true);
    expect(canTransition("manager_review", "hr_calibration")).toBe(true);
  });

  it("allows HR calibration to return to the applicable manager review", () => {
    expect(canTransition("hr_calibration", "manager_review")).toBe(true);
    expect(canTransition("hr_calibration", "skip_manager_review")).toBe(true);
    expect(canTransition("employee_confirm", "hr_calibration")).toBe(false);
  });

  it("rejects skipped stages", () => {
    expect(canTransition("goal_setting", "self_review")).toBe(false);
    expect(canTransition("self_review", "hr_calibration")).toBe(false);
  });
});
