export interface BuyuDailyRow {
  product: string;
  datasetId: string;
  date: string;
  cost: number;
  additions: number;
  cpi: number | null;
  realtimeRoi: number | null;
  payment: number;
  accountId: string | null;
  accountName: string | null;
  reportMetrics: Record<string, number | null>;
  summaryMetrics?: {
    year?: Record<string, number | null>;
    month?: Record<string, number | null>;
  };
}

export const BUYU_PRODUCTS = ["3D", "UE4", "URP"] as const;
export const DEFAULT_TASK_ROI: Record<string, number> = { "3D": 0.12, UE4: 0.135, URP: 0.075 };
export const EXTERNAL_PLACEMENT_ACCOUNTS = new Set([
  "阿瓷",
  "财神",
  "高爆版",
  "捕鱼大作战3D版",
  "老丁（小粽子）",
  "途游休闲捕鱼超能爆",
  "旺财",
]);

export function latestBuyuRows(rows: BuyuDailyRow[]): BuyuDailyRow[] {
  const latest = new Map<string, BuyuDailyRow>();
  for (const row of rows) {
    const key = `${row.datasetId}|${row.accountId ?? row.accountName ?? "unbound"}`;
    const current = latest.get(key);
    if (!current || row.date > current.date) latest.set(key, row);
  }
  return [...latest.values()];
}

export function summarizeBuyuProduct(rows: BuyuDailyRow[], product: string, target: number) {
  const internal = rows.filter(
    (row) => row.product === product && !EXTERNAL_PLACEMENT_ACCOUNTS.has(row.accountName ?? ""),
  );
  const cost = internal.reduce((sum, row) => sum + row.cost, 0);
  const additions = internal.reduce((sum, row) => sum + row.additions, 0);
  // 捕鱼直播按账号的最新日报去重；达标依据月汇总 ROI，不能用日付费/消耗替代。
  const accountRois = [
    ...new Map(
      latestBuyuRows(internal).map((row) => [
        row.accountName ?? "未绑定账号",
        row.summaryMetrics?.month?.["实时净ROI"] ?? null,
      ]),
    ).values(),
  ];
  const known = accountRois.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  return {
    product,
    cost,
    additions,
    cpi: additions > 0 ? cost / additions : null,
    target,
    achievement: {
      target: known.filter((value) => value >= target).length,
      ninety: known.filter((value) => value >= target * 0.9 && value < target).length,
      eighty: known.filter((value) => value >= target * 0.8 && value < target * 0.9).length,
      below: known.filter((value) => value < target * 0.8).length,
      unknown: accountRois.length - known.length,
    },
  };
}

export function buyuAccountDetails(rows: BuyuDailyRow[], product: string, target: number | null) {
  const grouped = new Map<
    string,
    {
      name: string;
      cost: number;
      additions: number;
      payment: number;
      monthRoi: number | null;
      sevenDayRoi: number | null;
    }
  >();
  for (const row of latestBuyuRows(rows)) {
    if (row.product !== product) continue;
    const name = row.accountName ?? "未绑定账号";
    const current = grouped.get(name) ?? {
      name,
      cost: 0,
      additions: 0,
      payment: 0,
      monthRoi: null,
      sevenDayRoi: null,
    };
    current.cost += row.cost;
    current.additions += row.additions;
    current.payment += row.payment;
    const monthRoi = row.summaryMetrics?.month?.["实时净ROI"];
    if (monthRoi != null && Number.isFinite(monthRoi)) {
      current.monthRoi = monthRoi;
      current.sevenDayRoi = monthRoi;
    }
    grouped.set(name, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      ...row,
      cpi: row.additions > 0 ? row.cost / row.additions : null,
      roi: row.monthRoi ?? (row.cost > 0 ? row.payment / row.cost : null),
      achievementRate: target && row.sevenDayRoi != null ? row.sevenDayRoi / target : null,
      external: EXTERNAL_PLACEMENT_ACCOUNTS.has(row.name),
    }))
    .sort((left, right) => right.cost - left.cost);
}

export function resolveBuyuTaskRoi(dateTo: string, stored: string | null): Record<string, number> {
  try {
    const month: unknown = stored ? JSON.parse(stored)?.[dateTo.slice(0, 7)] : null;
    return Object.fromEntries(
      BUYU_PRODUCTS.map((product) => {
        const value =
          month && typeof month === "object" ? (month as Record<string, unknown>)[product] : null;
        return [
          product,
          typeof value === "number" && Number.isFinite(value) && value >= 0
            ? value
            : (DEFAULT_TASK_ROI[product] ?? 0),
        ];
      }),
    );
  } catch {
    return { ...DEFAULT_TASK_ROI };
  }
}
