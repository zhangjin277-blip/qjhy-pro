/**
 * 数据就绪检测：取前 N 条按日数据，
 * 若 totalFanTicket > 0 占比 < 30%（即 >70% 是 0）→ 视为未就绪。
 */
export function isDailyReady(rows: { totalFanTicket?: unknown }[]): boolean {
  if (rows.length === 0) return false;
  const sample = rows.slice(0, 50);
  const positive = sample.filter((r) => {
    const v = r.totalFanTicket;
    if (v === null || v === undefined || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }).length;
  return positive / sample.length >= 0.3;
}

export const READINESS_THRESHOLD = 0.3;
export const MAX_READINESS_ATTEMPTS = 8;
export const READINESS_RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 min
