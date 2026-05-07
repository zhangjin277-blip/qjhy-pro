export interface RawCumulativeRow {
  date: string;
  hour: number;
  dataset_id: string;
  account_key: string;
  /**
   * 同一个 anchor 下的不同广告账户名（e.g. "ldl-直播-蓝V" vs "ldl-直播-蓝V-3"）。
   * PRO3 每个广告账户各自一条累计序列，必须按 subaccount 维度做差分，不能合并。
   * Excel 上传若不区分 subaccount，传相同字符串（或 account_key）即可。
   */
  subaccount_key: string;
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export type IncrementalRow = RawCumulativeRow;

const RESET_THRESHOLD = 0.3;
const TRACKED_COLUMNS: (keyof RawCumulativeRow)[] = [
  "cost_yuan",
  "activations",
  "payment_yuan",
  "start_download",
  "finish_download",
];

export function computeIncrements(rows: RawCumulativeRow[]): IncrementalRow[] {
  if (rows.length === 0) return [];

  const groups = new Map<string, RawCumulativeRow[]>();
  for (const r of rows) {
    const key = `${r.account_key}|${r.subaccount_key}|${r.dataset_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(r);
  }

  const result: IncrementalRow[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.hour - b.hour;
    });

    result.push({ ...group[0] } as IncrementalRow);

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1] as RawCumulativeRow;
      const curr = group[i] as RawCumulativeRow;

      const isReset = TRACKED_COLUMNS.some((col) => {
        const pv = prev[col] as number;
        const cv = curr[col] as number;
        return pv > 0 && cv < pv * RESET_THRESHOLD;
      });

      if (isReset) {
        result.push({ ...curr });
        continue;
      }

      const diffRow: RawCumulativeRow = { ...curr };
      for (const col of TRACKED_COLUMNS) {
        const pv = prev[col] as number;
        const cv = curr[col] as number;
        // safe: col is always a numeric field on RawCumulativeRow
        Object.assign(diffRow, { [col]: Math.max(0, cv - pv) });
      }
      result.push(diffRow);
    }
  }

  return result;
}
