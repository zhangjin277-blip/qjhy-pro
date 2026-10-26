import { PERFORMANCE_RATINGS } from "./date-utils";

/** Keep legacy score-derived grades out of probation results. */
export function visiblePerformanceRating(
  cycle: { kind: string; stage: string; final_grade: string | null; hr_user_id: string | null },
  isEmployee: boolean,
): string | null {
  if (cycle.kind !== "probation") return cycle.final_grade;
  if (!PERFORMANCE_RATINGS.some((rating) => rating.value === cycle.final_grade)) return null;
  if (
    isEmployee &&
    (!cycle.hr_user_id || !["employee_confirm", "completed"].includes(cycle.stage))
  ) {
    return null;
  }
  return cycle.final_grade;
}
