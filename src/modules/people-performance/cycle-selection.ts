import type { PerformanceCycleKind, PerformanceStage, PeopleEmploymentStatus } from "@/db/schema";

interface SelectableCycle {
  kind: PerformanceCycleKind;
  stage: PerformanceStage;
  periodStart: string;
}

function priority(stage: PerformanceStage): number {
  if (stage !== "scheduled" && stage !== "completed" && stage !== "cancelled") return 3;
  if (stage === "scheduled") return 2;
  if (stage === "completed") return 1;
  return 0;
}

/** Select the latest relevant cycle without showing obsolete probation cycles for regular staff. */
export function selectCurrentCycle<T extends SelectableCycle>(
  cycles: readonly T[],
  employmentStatus: PeopleEmploymentStatus | null,
): T | null {
  const expectedKind =
    employmentStatus === "probation"
      ? "probation"
      : employmentStatus === "regular"
        ? "monthly"
        : null;
  if (!expectedKind) return null;

  return (
    cycles
      .filter((cycle) => cycle.kind === expectedKind)
      .sort(
        (a, b) =>
          priority(b.stage) - priority(a.stage) || b.periodStart.localeCompare(a.periodStart),
      )[0] ?? null
  );
}
