import type { PerformanceStage } from "@/db/schema";

interface ActionAssignmentAccess {
  userId: string;
  calibrate: boolean;
}

interface ActionAssignmentCycle {
  stage: PerformanceStage;
  userId: string;
  managerUserId: string | null;
  skipManagerUserId: string | null;
}

/** Whether the current workflow step is assigned to the signed-in person. */
export function isPerformanceActionAssignedToUser(
  access: ActionAssignmentAccess,
  cycle: ActionAssignmentCycle,
): boolean {
  if (cycle.stage === "self_review" || cycle.stage === "employee_confirm") {
    return cycle.userId === access.userId;
  }
  if (cycle.stage === "manager_review" || cycle.stage === "goal_review") {
    return cycle.managerUserId === access.userId;
  }
  if (cycle.stage === "skip_manager_review") {
    return cycle.skipManagerUserId === access.userId;
  }
  if (cycle.stage === "hr_calibration") return access.calibrate;
  return false;
}
