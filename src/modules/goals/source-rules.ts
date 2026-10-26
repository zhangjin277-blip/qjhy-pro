import { BUYU_TOTAL_PRODUCT, BUYU_SOURCE_PRODUCTS, buyuProductIds } from "./catalog";
import type { GoalBinding, GoalSourceResult, GoalAccountProgress } from "./types";
import { BUYU_PERCENT_COLUMNS, EXTERNAL_PLACEMENT_ACCOUNTS } from "@/modules/buyu";
export interface BuyuSourceRow {
  dataset_id?: string;
  subaccount_name?: string;
  account_id: string;
  account_name: string;
  date: string;
  cost: number | null;
  additions: number | null;
  payment: number | null;
  raw: Record<string, unknown>;
}
export interface SourceValue {
  product_details?: GoalSourceResult["product_details"];
  account_progress?: GoalAccountProgress[];
  account_values?: GoalSourceResult["account_values"];
  account_values_additive?: boolean;
  actual: number | null;
  as_of: string | null;
  note: string;
  unknown_accounts?: number;
  missing_account_ids?: string[];
  no_record_account_ids?: string[];
}
export function reportNumber(raw: unknown, label: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const normalize = (s: string) => s.replace(/\s/g, "");
  const pair = Object.entries(raw).find(([key]) => normalize(key) === normalize(label));
  if (!pair || pair[1] === null || pair[1] === undefined || String(pair[1]).trim() === "")
    return null;
  const result =
    typeof pair[1] === "number" ? pair[1] : Number(String(pair[1]).replace(/[元¥％%,\s]/g, ""));
  if (!Number.isFinite(result)) return null;
  // Excel percentage cells are stored as fractions (0.0776 = 7.76%).
  // Goal thresholds and actuals use percentage points; explicit percent text is already scaled.
  const explicitPercent = typeof pair[1] === "string" && /[%％]/.test(pair[1]);
  return BUYU_PERCENT_COLUMNS.has(label) && !explicitPercent ? result * 100 : result;
}
function summary(row: BuyuSourceRow, month: string): Record<string, unknown> | null {
  const months = row.raw._summary_months;
  if (months && typeof months === "object") {
    const value = (months as Record<string, unknown>)[month];
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  }
  return row.date.startsWith(month) &&
    row.raw._summary_month &&
    typeof row.raw._summary_month === "object"
    ? (row.raw._summary_month as Record<string, unknown>)
    : null;
}
function snapshotKey(row: BuyuSourceRow, binding: GoalBinding) {
  return (row.dataset_id ?? binding.product) + "|" + row.account_id + "|" + row.date.slice(0, 7);
}
/** Use the exact same snapshot and subaccount ambiguity rules for totals and account details. */
function buyuSnapshots(rows: BuyuSourceRow[], binding: GoalBinding) {
  const subaccounts = new Map<string, Set<string>>();
  const latest = new Map<string, BuyuSourceRow>();
  for (const row of rows) {
    const key = snapshotKey(row, binding);
    const names = subaccounts.get(key) ?? new Set<string>();
    names.add(row.subaccount_name ?? "");
    subaccounts.set(key, names);
    const previous = latest.get(key);
    if (!previous || row.date > previous.date) latest.set(key, row);
  }
  return {
    selected: [...latest.values()],
    ambiguous: new Set([...subaccounts].filter(([, names]) => names.size > 1).map(([key]) => key)),
  };
}
function qualificationFor(binding: GoalBinding, product: string) {
  return binding.product === BUYU_TOTAL_PRODUCT
    ? binding.qualification_by_product?.[product]
    : binding.qualification;
}

/** Authorized account roster includes accounts with no period logs; absent values remain unknown. */
export function buyuAccountProgress(
  rows: BuyuSourceRow[],
  binding: GoalBinding,
  period: string,
  accounts: { id: string; name: string; products?: string[] }[],
): GoalAccountProgress[] {
  if (binding.source !== "buyu" || binding.field !== "qualified_accounts" || period.includes("Q"))
    return [];
  const { selected, ambiguous } = buyuSnapshots(rows, binding);
  const products = buyuProductIds(binding.product);
  const byAccount = new Map<string, Map<string, BuyuSourceRow>>();
  for (const row of selected) {
    if (!row.date.startsWith(period)) continue;
    const product = row.dataset_id ?? binding.product;
    if (!products.includes(product)) continue;
    const entries = byAccount.get(row.account_id) ?? new Map<string, BuyuSourceRow>();
    entries.set(product, row);
    byAccount.set(row.account_id, entries);
  }
  return accounts.flatMap((account) => {
    const entries = byAccount.get(account.id);
    const accountProducts = [
      ...new Set([
        ...(entries?.keys() ?? []),
        ...(account.products ?? []).filter((product) => products.includes(product)),
      ]),
    ];
    if (!accountProducts.length)
      accountProducts.push(binding.product === BUYU_TOTAL_PRODUCT ? "" : binding.product);
    return accountProducts.map((product): GoalAccountProgress => {
      const row = entries?.get(product);
      const condition = qualificationFor(binding, product);
      const uncertain = row ? ambiguous.has(snapshotKey(row, binding)) : false;
      const values = row && !uncertain ? summary(row, period) : null;
      const roi = reportNumber(values, "实时净ROI");
      const cost = reportNumber(values, "消耗");
      const excluded =
        EXTERNAL_PLACEMENT_ACCOUNTS.has(account.name) ||
        (row && EXTERNAL_PLACEMENT_ACCOUNTS.has(row.account_name));
      const pending = !row || uncertain || !condition || roi === null || cost === null;
      const qualified =
        condition &&
        roi !== null &&
        cost !== null &&
        roi >= condition.roi &&
        cost >= condition.min_cost;
      return {
        id: account.id,
        name: account.name,
        product,
        product_name: BUYU_SOURCE_PRODUCTS.find((p) => p.id === product)?.name ?? "产品待确认",
        roi,
        cost,
        required_roi: condition?.roi ?? null,
        required_cost: condition?.min_cost ?? null,
        roi_gap: condition && roi !== null ? Math.max(0, condition.roi - roi) : null,
        cost_gap: condition && cost !== null ? Math.max(0, condition.min_cost - cost) : null,
        status: excluded
          ? "excluded"
          : pending
            ? "pending"
            : qualified
              ? "qualified"
              : "unqualified",
        as_of: row?.date ?? null,
        note: excluded
          ? "外部账号，不纳入达标统计"
          : !row
            ? "本期暂无投流日志"
            : uncertain
              ? "同账号存在多个广告子账号，月汇总口径待确认"
              : !condition
                ? "达标条件待配置"
                : roi === null || cost === null
                  ? "月汇总ROI或消耗缺失，待同步完整数据"
                  : qualified
                    ? "ROI和消耗均已达到要求"
                    : "尚未达到全部条件",
      };
    });
  });
}

/** Last imported snapshot per product/account/month, never add repeated cumulative snapshots. */
export function calculateBuyuMetric(
  rows: BuyuSourceRow[],
  binding: GoalBinding,
  period: string,
): SourceValue {
  const field = binding.field;
  const pending = (note: string): SourceValue => ({ actual: null, as_of: null, note });
  if (!rows.length) return pending("所选周期暂无投流日志数据");
  const { selected, ambiguous } = buyuSnapshots(rows, binding);
  if (ambiguous.size)
    return pending("同账号存在多个广告子账号，月汇总口径待确认；未忽略或重复累计子账号");
  const asOf =
    selected
      .map((r) => r.date)
      .sort()
      .at(-1) ?? null;
  const ratio = BUYU_PERCENT_COLUMNS.has(field);
  if (field === "qualified_accounts") {
    if (period.includes("Q")) return pending("账号达标沿用月汇总ROI，请建立月度目标");
    const total = binding.product === BUYU_TOTAL_PRODUCT;
    if (total ? !binding.qualification_by_product : !binding.qualification)
      return pending("账号达标条件待配置");
    const internal = selected.filter((r) => !EXTERNAL_PLACEMENT_ACCOUNTS.has(r.account_name));
    const qualifiedIds = new Set<string>(),
      unknownIds = new Set<string>();
    for (const row of internal) {
      const s = summary(row, period);
      const roi = reportNumber(s, "实时净ROI");
      const cost = reportNumber(s, "消耗");
      const condition = qualificationFor(binding, row.dataset_id ?? binding.product);
      if (roi === null || cost === null || !condition) {
        unknownIds.add(row.account_id);
        continue;
      }
      if (roi >= condition.roi && cost >= condition.min_cost) qualifiedIds.add(row.account_id);
    }
    if (!internal.length) return pending("所选范围暂无内部账号日志");
    const qualified = qualifiedIds.size;
    const unknown = [...unknownIds].filter((id) => !qualifiedIds.has(id)).length;
    // Unknown accounts cannot silently turn a count into a complete zero.
    if (unknown)
      return {
        actual: null,
        as_of: asOf,
        note: `${unknown}个账号的月汇总ROI或消耗缺失；已确认达标${qualified}个`,
        unknown_accounts: unknown,
      };
    return {
      actual: qualified,
      as_of: asOf,
      note: total
        ? "各产品按已配置的月汇总实时净ROI和最低消耗逐账号判断；达标账号跨产品去重，不含外部账号"
        : `月汇总实时净ROI ≥ ${binding.qualification?.roi}%、消耗 ≥ ${binding.qualification?.min_cost}元；账号去重，不含外部账号`,
      unknown_accounts: 0,
    };
  }
  // Net ROI uses the matched spend denominator, never an unweighted mean.
  // Other report percentages may use distinct cohorts; keep those single-account.
  if (["首日净ROI", "三日净ROI", "七日净ROI", "实时净ROI"].includes(field) && selected.length > 1) {
    let cost = 0,
      returned = 0;
    for (const row of selected) {
      const s = summary(row, row.date.slice(0, 7));
      const spend = reportNumber(s, "消耗"),
        roi = reportNumber(s, field);
      if (spend === null || roi === null) return pending("部分月汇总消耗或ROI缺失，无法加权计算");
      cost += spend;
      returned += spend * roi;
    }
    if (cost <= 0) return pending("月汇总消耗为零，ROI暂不可计算");
    return {
      actual: returned / cost,
      as_of: asOf,
      note: "投流日志月汇总ROI按对应消耗加权；未直接相加或平均百分比",
    };
  }
  // Non-additive report columns only use an exact matching month summary. They
  // cannot be averaged across accounts/months without their original denominators.
  const singleSummary = ratio || field === "首日付费成本";
  if (singleSummary && selected.length !== 1)
    return pending("此指标需选择单账号、单月；跨账号／跨月分子分母尚未配置");
  const additive = field === "消耗" || field === "新增" || field === "自然量新增";
  if (!additive && field !== "总CPI" && !singleSummary) return pending("统计口径待配置");
  const sums = { cost: 0, additions: 0, value: 0 };
  for (const row of selected) {
    const month = row.date.slice(0, 7);
    const s = summary(row, month);
    // Only import explicit period totals. Daily rows and latest snapshots are not
    // assumed to mean an entire month's achievement.
    if (!s) return pending("该月份缺少投流日志月汇总，请同步完整报表");
    if (field === "总CPI") {
      const cost = reportNumber(s, "消耗"),
        count = reportNumber(s, "新增");
      if (cost === null || count === null) return pending("月汇总消耗或新增缺失，无法加权计算CPI");
      sums.cost += cost;
      sums.additions += count;
    } else {
      const value = reportNumber(s, field);
      if (value === null) return pending("所选字段尚未同步完整的月汇总值");
      sums.value += value;
    }
  }
  if (field === "总CPI" && sums.additions <= 0) return pending("新增为零，CPI暂不可计算");
  return {
    actual: field === "总CPI" ? sums.cost / sums.additions : sums.value,
    as_of: asOf,
    note: singleSummary
      ? "投流日志同账号、同月报表汇总值"
      : field === "总CPI"
        ? "匹配月份消耗合计 ÷ 新增合计"
        : "投流日志各账号、各月汇总值相加（未重复累计每日快照）",
  };
}
