import type { BoardFilter } from "./queries";

const PRESET_DAYS: Record<string, number> = {
  today: 0,
  yesterday: 1,
  last7: 7,
  last30: 30,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveFilter(
  searchParams: Record<string, string | string[] | undefined>,
): BoardFilter {
  const fromQ = searchParams.from as string | undefined;
  const toQ = searchParams.to as string | undefined;
  let dateFrom: string;
  let dateTo: string;

  if (fromQ && toQ && ISO_DATE_RE.test(fromQ) && ISO_DATE_RE.test(toQ)) {
    // 自定义日期范围（保证 from <= to）
    dateFrom = fromQ <= toQ ? fromQ : toQ;
    dateTo = fromQ <= toQ ? toQ : fromQ;
  } else {
    const preset = (searchParams.preset as string) ?? "last7";
    const days = PRESET_DAYS[preset] ?? 7;
    const today = new Date();
    const to = new Date(today);
    const from = new Date(today);
    if (preset === "today") {
      // both = today
    } else if (preset === "yesterday") {
      from.setDate(from.getDate() - 1);
      to.setDate(to.getDate() - 1);
    } else {
      from.setDate(from.getDate() - days);
    }
    dateFrom = isoDate(from);
    dateTo = isoDate(to);
  }

  const dsParam = searchParams.ds as string | undefined;
  // 默认只看捕鱼；ds=all 表示全部产品（不过滤）
  let dataset_ids: string[] | undefined;
  if (!dsParam) {
    dataset_ids = ["product_buyu"];
  } else if (dsParam === "all") {
    dataset_ids = undefined;
  } else {
    dataset_ids = dsParam.split(",").filter(Boolean);
  }
  const search = (searchParams.q as string) || undefined;
  const anchor_label = (searchParams.anchor as string) || undefined;
  const rawView = searchParams.view as string | undefined;
  const view: "summary" | "schedule" = rawView === "schedule" ? "schedule" : "summary";

  return {
    date_from: dateFrom,
    date_to: dateTo,
    dataset_ids,
    search,
    anchor_label,
    view,
  };
}
