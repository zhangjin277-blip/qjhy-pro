export interface RecruitmentStatisticsCandidate {
  id: string;
  recruiterUserId: string;
  recruiterName: string;
  anchorName: string;
  accountId: string;
  joinDate: string | null;
  firstLiveDate?: string | null;
  anchorId: string | null;
}

export interface RecruitmentStatisticsDay {
  anchorId: string;
  date: string;
  hours: string | number | null;
}

export interface RecruitmentStatisticsDetail extends RecruitmentStatisticsCandidate {
  liveDays: number;
  liveHours: number;
  qualifiedDate: string | null;
  historyIncomplete: boolean;
  joined: boolean;
  qualified: boolean;
  active: boolean;
}

export interface RecruitmentStatisticsSummary {
  recruiterUserId: string;
  recruiterName: string;
  joined: number;
  qualified: number;
  active: number;
}

export interface RecruitmentStatisticsData {
  month: string;
  canViewAll: boolean;
  canViewTeam: boolean;
  recruiters: { userId: string; name: string }[];
  summaries: RecruitmentStatisticsSummary[];
  details: RecruitmentStatisticsDetail[];
  lastDataDate: string | null;
  unmatched: number;
}

export function shanghaiMonth(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

/** Both thresholds are inclusive. Count distinct broadcast dates, not sessions. */
export function calculateRecruitmentStatistics(
  month: string,
  candidates: RecruitmentStatisticsCandidate[],
  days: RecruitmentStatisticsDay[],
): Pick<RecruitmentStatisticsData, "summaries" | "details" | "unmatched" | "lastDataDate"> {
  const byAnchor = new Map<string, Map<string, number>>();
  for (const day of days) {
    const hours = Number(day.hours);
    if (!Number.isFinite(hours) || hours < 0 || day.date.slice(0, 7) > month) continue;
    const dates = byAnchor.get(day.anchorId) ?? new Map<string, number>();
    // Daily data has one row per anchor/date; defensively do not double-count it.
    dates.set(day.date, Math.max(dates.get(day.date) ?? 0, Math.round(hours * 100)));
    byAnchor.set(day.anchorId, dates);
  }
  const summaries = new Map<string, RecruitmentStatisticsSummary>();
  const details = candidates.map((candidate): RecruitmentStatisticsDetail => {
    let lifetimeDays = 0;
    let lifetimeHundredths = 0;
    let liveDays = 0;
    let monthlyHundredths = 0;
    let qualifiedDate: string | null = null;
    const dates = [...(byAnchor.get(candidate.anchorId ?? "") ?? [])].sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const firstKnownLive = candidate.firstLiveDate;
    const historyIncomplete = Boolean(
      candidate.anchorId &&
      candidate.joinDate &&
      firstKnownLive &&
      firstKnownLive >= candidate.joinDate &&
      firstKnownLive.slice(0, 7) <= month &&
      (!dates[0] || dates[0][0] > firstKnownLive),
    );
    for (const [date, hundredths] of dates) {
      // Unknown join date must never turn old history into recruitment achievements.
      if ((candidate.joinDate && date < candidate.joinDate) || hundredths <= 0) continue;
      if (candidate.joinDate) {
        lifetimeDays++;
        lifetimeHundredths += hundredths;
        if (!qualifiedDate && lifetimeDays >= 7 && lifetimeHundredths >= 1400) qualifiedDate = date;
      }
      if (date.startsWith(month + "-")) {
        liveDays++;
        monthlyHundredths += hundredths;
      }
    }
    // An observed late threshold cannot prove the first threshold if early facts are missing.
    if (historyIncomplete) qualifiedDate = null;
    const detail = {
      ...candidate,
      liveDays,
      liveHours: monthlyHundredths / 100,
      qualifiedDate,
      historyIncomplete,
      joined: candidate.joinDate?.startsWith(month + "-") ?? false,
      qualified: qualifiedDate?.startsWith(month + "-") ?? false,
      active: liveDays >= 20 && monthlyHundredths >= 6000,
    };
    const summary = summaries.get(candidate.recruiterUserId) ?? {
      recruiterUserId: candidate.recruiterUserId,
      recruiterName: candidate.recruiterName,
      joined: 0,
      qualified: 0,
      active: 0,
    };
    if (detail.joined) summary.joined++;
    if (detail.qualified) summary.qualified++;
    if (detail.active) summary.active++;
    summaries.set(candidate.recruiterUserId, summary);
    return detail;
  });
  const observedDates = days.filter((day) => day.date.slice(0, 7) <= month).map((day) => day.date);
  return {
    summaries: [...summaries.values()].sort((a, b) =>
      a.recruiterName.localeCompare(b.recruiterName, "zh-CN"),
    ),
    details,
    unmatched: candidates.filter((candidate) => !candidate.anchorId).length,
    lastDataDate: observedDates.sort().at(-1) ?? null,
  };
}
