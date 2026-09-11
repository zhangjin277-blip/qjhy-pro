import { describe, expect, it } from "vitest";

import { isPerformanceActionAssignedToUser } from "@/modules/people-performance/action-assignment";

const cycle = {
  stage: "skip_manager_review" as const,
  userId: "employee",
  managerUserId: "manager",
  skipManagerUserId: "skip-manager",
};

describe("people performance action assignment", () => {
  it("assigns direct and skip-level reviews only to the configured reviewer", () => {
    expect(
      isPerformanceActionAssignedToUser({ userId: "skip-manager", calibrate: false }, cycle),
    ).toBe(true);
    expect(isPerformanceActionAssignedToUser({ userId: "other", calibrate: false }, cycle)).toBe(
      false,
    );
  });

  it("assigns HR calibration to users with calibration permission", () => {
    expect(
      isPerformanceActionAssignedToUser(
        { userId: "hr", calibrate: true },
        { ...cycle, stage: "hr_calibration" },
      ),
    ).toBe(true);
  });

  it("does not treat process-management permission as an assignment", () => {
    expect(
      isPerformanceActionAssignedToUser(
        { userId: "admin", calibrate: false },
        { ...cycle, stage: "in_progress" },
      ),
    ).toBe(false);
  });
});
