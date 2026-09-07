import type {
  RecruitmentApplicationRow,
  RecruitmentDemandRow,
  RecruitmentFunnelStep,
  RecruitmentMonthlyTrend,
  RecruitmentRecruiterMetric,
} from "./center-types";

export type RecruitmentPipelineStage =
  | "invited"
  | "interview"
  | "initial_pass"
  | "final_pass"
  | "offer"
  | "joined"
  | "trial_pass"
  | "rejected"
  | "withdrawn"
  | "left";

export const PIPELINE_STAGE_LABEL: Record<RecruitmentPipelineStage, string> = {
  invited: "已邀约",
  interview: "待面试",
  initial_pass: "初面通过",
  final_pass: "终面通过",
  offer: "已发 Offer",
  joined: "已到岗",
  trial_pass: "试播通过",
  rejected: "未通过",
  withdrawn: "未到面 / 放弃",
  left: "已离职",
};

export interface PipelineStateInput {
  attendanceStatus: "pending" | "attended" | "no_show";
  initialResult: "pending" | "pass" | "fail";
  finalResult: "pending" | "pass" | "fail";
  offerStatus: "pending" | "sent" | "declined";
  actualJoinDate?: string | null;
  trialResult: "pending" | "pass" | "fail";
  leaveDate?: string | null;
  interviewDate?: string | null;
}

export function derivePipelineStage(input: PipelineStateInput): RecruitmentPipelineStage {
  if (input.leaveDate) return "left";
  if (input.trialResult === "pass") return "trial_pass";
  if (input.trialResult === "fail") return "rejected";
  if (input.actualJoinDate) return "joined";
  if (input.offerStatus === "declined") return "withdrawn";
  if (input.offerStatus === "sent") return "offer";
  if (input.finalResult === "fail" || input.initialResult === "fail") return "rejected";
  if (input.finalResult === "pass") return "final_pass";
  if (input.initialResult === "pass") return "initial_pass";
  if (input.attendanceStatus === "no_show") return "withdrawn";
  if (input.attendanceStatus === "attended" || input.interviewDate) return "interview";
  return "invited";
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.min(1, numerator / denominator) : 0;
}

export function buildRecruitmentFunnel(rows: RecruitmentApplicationRow[]): RecruitmentFunnelStep[] {
  const counts = [
    rows.length,
    rows.filter((row) => row.attendanceStatus === "attended").length,
    rows.filter((row) => row.initialResult === "pass").length,
    rows.filter((row) => row.finalResult === "pass").length,
    rows.filter((row) => row.offerStatus === "sent").length,
    rows.filter((row) => Boolean(row.actualJoinDate)).length,
    rows.filter((row) => row.trialResult === "pass").length,
  ];
  const labels = ["邀约", "到面", "初面通过", "终面通过", "Offer", "到岗", "试播通过"];
  return labels.map((label, index) => ({
    key: String(index),
    label,
    count: counts[index] ?? 0,
    conversionRate: index === 0 ? null : rate(counts[index] ?? 0, counts[index - 1] ?? 0),
  }));
}

export function buildRecruiterMetrics(
  rows: RecruitmentApplicationRow[],
): RecruitmentRecruiterMetric[] {
  const grouped = new Map<string, RecruitmentApplicationRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.recruiterName) ?? [];
    current.push(row);
    grouped.set(row.recruiterName, current);
  }
  return [...grouped.entries()]
    .map(([recruiterName, items]) => {
      const attended = items.filter((item) => item.attendanceStatus === "attended").length;
      const joined = items.filter((item) => Boolean(item.actualJoinDate)).length;
      const trialPassed = items.filter((item) => item.trialResult === "pass").length;
      return {
        recruiterName,
        invited: items.length,
        attended,
        joined,
        trialPassed,
        attendanceRate: rate(attended, items.length),
        trialPassRate: rate(trialPassed, joined),
      };
    })
    .sort((a, b) => b.trialPassed - a.trialPassed || b.joined - a.joined || b.invited - a.invited);
}

export function buildMonthlyTrend(rows: RecruitmentApplicationRow[]): RecruitmentMonthlyTrend[] {
  const months = new Map<string, RecruitmentMonthlyTrend>();
  const ensure = (month: string) => {
    const existing = months.get(month);
    if (existing) return existing;
    const created = { month, invited: 0, attended: 0, joined: 0, trialPassed: 0 };
    months.set(month, created);
    return created;
  };
  for (const row of rows) {
    const invited = ensure(row.invitedDate.slice(0, 7));
    invited.invited++;
    if (row.attendanceStatus === "attended") invited.attended++;
    if (row.actualJoinDate) ensure(row.actualJoinDate.slice(0, 7)).joined++;
    if (row.trialResult === "pass")
      ensure((row.trialDate ?? row.actualJoinDate ?? row.invitedDate).slice(0, 7)).trialPassed++;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
}

export function attachDemandProgress(
  demands: Omit<RecruitmentDemandRow, "joinedCount" | "trialPassedCount">[],
  rows: RecruitmentApplicationRow[],
): RecruitmentDemandRow[] {
  return demands.map((demand) => {
    const month = demand.month.slice(0, 7);
    const matching = rows.filter(
      (row) => row.project === demand.project && row.actualJoinDate?.startsWith(month),
    );
    return {
      ...demand,
      joinedCount: matching.length,
      trialPassedCount: matching.filter((row) => row.trialResult === "pass").length,
    };
  });
}
