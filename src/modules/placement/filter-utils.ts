import type { BoardFilter } from "./queries";

const PRESET_DAYS: Record<string, number> = {
  today: 0,
  yesterday: 1,
  last7: 7,
  last30: 30,
};

// placement_row.date 存的是北京日历日，而生产容器/Node 跑 UTC：
// 预设必须按 Asia/Shanghai 取「今天」，否则北京 0:00-8:00 之间 toISOString() 会错位到前一天。
const SHANGHAI_DATE_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });

/** now 时刻对应的北京日历日（YYYY-MM-DD；en-CA locale 恰好输出 ISO 格式） */
function shanghaiDate(now: Date): string {
  return SHANGHAI_DATE_FMT.format(now);
}

/** 对 YYYY-MM-DD 做整日加减（纯日历运算，与时区无关） */
function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface TimeRangeSelection {
  start_hour: number;
  end_hour: number;
  account_id?: string;
  page: number;
}

function integerParam(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * 解析「时段查询」的小时条件。投放源数据只有小时粒度，因此 UI/查询都使用整点。
 * end_hour 小于 start_hour 时表示跨午夜；两者相同表示全天。
 */
export function resolveTimeRangeSelection(
  searchParams: Record<string, string | string[] | undefined>,
): TimeRangeSelection {
  const rawStart = integerParam(searchParams.startHour);
  const rawEnd = integerParam(searchParams.endHour);
  const start_hour = rawStart != null && rawStart >= 0 && rawStart <= 23 ? rawStart : 0;
  const end_hour = rawEnd != null && rawEnd >= 1 && rawEnd <= 24 ? rawEnd : 24;
  const account = typeof searchParams.accountId === "string" ? searchParams.accountId.trim() : "";
  const rawPage = integerParam(searchParams.page);

  return {
    start_hour,
    end_hour,
    account_id: account || undefined,
    page: rawPage != null && rawPage >= 1 ? rawPage : 1,
  };
}

export function resolveFilter(
  searchParams: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
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
    const preset = (searchParams.preset as string) ?? "today";
    const days = PRESET_DAYS[preset] ?? 7;
    const today = shanghaiDate(now);
    if (preset === "today") {
      dateFrom = today;
      dateTo = today;
    } else if (preset === "yesterday") {
      dateFrom = addDays(today, -1);
      dateTo = dateFrom;
    } else {
      dateFrom = addDays(today, -days);
      dateTo = today;
    }
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
