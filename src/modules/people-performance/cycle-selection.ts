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

function previousMonthStart(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 10);
}

function chooseByPriority<T extends SelectableCycle>(cycles: readonly T[]): T | null {
  return (
    [...cycles].sort(
      (a, b) => priority(b.stage) - priority(a.stage) || b.periodStart.localeCompare(a.periodStart),
    )[0] ?? null
  );
}

/**
 * Select the cycle shown in the people list.
 *
 * Keep unfinished previous-month reviews visible, then move to the current month.
 */
export function selectCurrentCycle<T extends SelectableCycle>(
  cycles: readonly T[],
  employmentStatus: PeopleEmploymentStatus | null,
  referenceDate?: string,
): T | null {
  const expectedKind =
    employmentStatus === "probation"
      ? "probation"
      : employmentStatus === "regular"
        ? "monthly"
        : null;
  if (!expectedKind) return null;

  const matching = cycles.filter((cycle) => cycle.kind === expectedKind);
  if (matching.length === 0) return null;

  if (expectedKind === "monthly" && referenceDate) {
    const previousStart = previousMonthStart(referenceDate);
    const previousMonth = previousStart
      ? matching.filter(
          (cycle) =>
            cycle.periodStart === previousStart &&
            cycle.stage !== "completed" &&
            cycle.stage !== "cancelled",
        )
      : [];
    if (previousMonth.length > 0) return chooseByPriority(previousMonth);
    const currentStart = `${referenceDate.slice(0, 7)}-01`;
    const currentMonth = matching.filter(
      (cycle) => cycle.periodStart === currentStart && cycle.stage !== "cancelled",
    );
    if (currentMonth.length > 0) return chooseByPriority(currentMonth);
  }

  return chooseByPriority(matching);
}
