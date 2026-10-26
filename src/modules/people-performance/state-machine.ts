import type { PerformanceStage } from "@/db/schema";

export const STAGE_LABEL: Record<PerformanceStage, string> = {
  scheduled: "未开始",
  goal_setting: "目标制定",
  goal_review: "目标审核",
  in_progress: "执行中",
  self_review: "员工自评",
  manager_review: "直接上级评估",
  skip_manager_review: "隔级上级评估",
  hr_calibration: "HR校准",
  employee_confirm: "结果确认",
  completed: "已完成",
  cancelled: "已取消",
};

const ALLOWED: Partial<Record<PerformanceStage, PerformanceStage[]>> = {
  scheduled: ["goal_setting", "cancelled"],
  goal_setting: ["goal_review", "cancelled"],
  goal_review: ["goal_setting", "in_progress", "self_review", "cancelled"],
  in_progress: ["self_review", "cancelled"],
  self_review: ["manager_review", "cancelled"],
  manager_review: [
    "self_review",
    "skip_manager_review",
    "hr_calibration",
    "completed",
    "cancelled",
  ],
  skip_manager_review: ["manager_review", "hr_calibration", "completed", "cancelled"],
  hr_calibration: [
    "completed",
    "self_review",
    "manager_review",
    "skip_manager_review",
    "employee_confirm",
    "cancelled",
  ],
  employee_confirm: ["completed", "hr_calibration", "cancelled"],
};

export function canTransition(from: PerformanceStage, to: PerformanceStage): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
