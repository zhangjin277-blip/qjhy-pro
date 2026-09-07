export interface CyclePeriod {
  label: string;
  start: string;
  end: string;
  sequence: number;
}

/** Convert a DingTalk timestamp to the Beijing calendar date. */
export function dingtalkHireDate(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const numeric = typeof value === "number" ? value : Number(value);
  const date = new Date(Number.isFinite(numeric) ? numeric : value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addMonths(value: string, months: number): string {
  const source = parseDate(value);
  const day = source.getUTCDate();
  const result = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return formatDate(result);
}

export function addDays(value: string, days: number): string {
  const result = parseDate(value);
  result.setUTCDate(result.getUTCDate() + days);
  return formatDate(result);
}

export function buildProbationPeriods(hireDate: string, months: 2 | 6): CyclePeriod[] {
  const offsets = months === 2 ? [0] : [0, 2, 4];
  return offsets.map((offset, index) => {
    const start = addMonths(hireDate, offset);
    const end = addDays(addMonths(start, 2), -1);
    const nodeMonth = offset + 1;
    return {
      label: months === 2 ? "2个月试用期考核" : `6个月试用期·第${nodeMonth}月节点`,
      start,
      end,
      sequence: index + 1,
    };
  });
}

export function getQuarterPeriod(value: string): CyclePeriod {
  const date = parseDate(value);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(date.getUTCFullYear(), startMonth, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), startMonth + 3, 0));
  return {
    label: `${date.getUTCFullYear()}年Q${quarter}季度绩效`,
    start: formatDate(start),
    end: formatDate(end),
    sequence: quarter,
  };
}

export function buildQuarterMonths(value: string): CyclePeriod[] {
  const quarter = getQuarterPeriod(value);
  return [0, 1, 2].map((offset, index) => {
    const start = addMonths(quarter.start, offset);
    const end = addDays(addMonths(start, 1), -1);
    const month = parseDate(start).getUTCMonth() + 1;
    return {
      label: `${start.slice(0, 4)}年${month}月绩效`,
      start,
      end,
      sequence: index + 1,
    };
  });
}

export function gradeForScore(score: number): "S" | "A" | "B" | "C" | "D" {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export function calculateWeightedScore(
  goals: { weight: number; managerScore: number | null }[],
): number | null {
  if (goals.length === 0 || goals.some((goal) => goal.managerScore === null)) return null;
  // Scores are entered as each goal's contribution to the 100-point total.
  // Goal weight is a planning constraint and must not be applied again here.
  const total = goals.reduce((sum, goal) => sum + (goal.managerScore ?? 0), 0);
  return Math.round(total * 100) / 100;
}

export function calculateCombinedManagerScore(
  directScore: number | null,
  skipLevelScore: number | null,
): number | null {
  if (directScore === null || skipLevelScore === null) return null;
  return Math.round((directScore * 0.4 + skipLevelScore * 0.6) * 100) / 100;
}

export function calculateReviewScore(
  kind: "probation" | "quarterly" | "monthly",
  directScore: number | null,
  skipLevelScore: number | null,
): number | null {
  return kind === "probation" || skipLevelScore === null
    ? directScore
    : calculateCombinedManagerScore(directScore, skipLevelScore);
}
