import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";
import { dedupeOfficialWorks } from "@/modules/ai-comic/video-dedupe";

const WORK_LIST = "https://creator.douyin.com/janus/douyin/creator/pc/work_list";
const DASHBOARD = "https://creator.douyin.com/janus/douyin/creator/data/overview/dashboard";
const ITEM_OPTION = "https://creator.douyin.com/web/api/creator/data/item/option/";

export const OFFICIAL_VIDEO_METRIC_TYPES = [1, 3, 4, 5, 7, 8, 9, 52] as const;

export interface OfficialVideoRow {
  item_id: string;
  aweme_id: string;
  publish_time: Date;
  description: string | null;
  cover_url: string | null;
  duration_ms: number | null;
  visibility: string | null;
  metrics: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface OfficialDailyRow {
  metric_date: string;
  values: Record<string, number | null>;
  raw: Record<string, unknown>;
}

export interface OfficialVideoHourlyPoint {
  item_id: string;
  metric_type: number;
  point_at: Date;
  value: number;
  raw: Record<string, unknown>;
}

export async function fetchOfficialVideoWorks(
  page: Page,
  options: { beginDate?: string; endDate?: string } = {},
): Promise<OfficialVideoRow[]> {
  const rows: OfficialVideoRow[] = [];
  let cursor = 0;
  for (let pageNo = 0; pageNo < 20; pageNo++) {
    const query = new URLSearchParams({
      status: "0",
      count: "12",
      max_cursor: String(cursor),
      scene: "star_atlas",
      device_platform: "android",
    });
    const response = await pageFetch<WorkListResponse>(page, `${WORK_LIST}?${query}`, {
      preserveLargeIntegers: true,
    });
    if (response.status_code !== 0)
      throw new Error(`creator work_list failed: ${response.status_msg ?? response.status_code}`);
    for (const item of response.items ?? []) {
      const published = new Date(Number(item.create_time) * 1000);
      if (Number.isNaN(published.getTime())) continue;
      const localDate = published.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      if (options.beginDate && localDate < options.beginDate) continue;
      if (options.endDate && localDate > options.endDate) continue;
      rows.push({
        item_id: String(item.id),
        aweme_id: String(item.aweme_id ?? item.id),
        publish_time: published,
        description: stringOrNull(item.description),
        cover_url: item.cover?.url_list?.[0] ?? null,
        duration_ms: numberOrNull(item.video_info?.duration),
        visibility: stringOrNull(item.visibility),
        metrics: item.metrics ?? {},
        raw: item as unknown as Record<string, unknown>,
      });
    }
    if (!response.has_more || response.items?.length === 0) break;
    const next = Number(response.max_cursor);
    if (!Number.isFinite(next) || next === cursor) break;
    cursor = next;
  }
  return dedupeOfficialWorks(rows);
}

export async function fetchOfficialDailyMetrics(
  page: Page,
  recentDays = 30,
): Promise<OfficialDailyRow[]> {
  const response = await pageFetch<DashboardResponse>(page, DASHBOARD, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recent_days: recentDays }),
  });
  if (response.status_code !== 0)
    throw new Error(`creator dashboard failed: ${response.status_msg ?? response.status_code}`);
  const byDate = new Map<string, Record<string, number | null>>();
  const rawByDate = new Map<string, Record<string, unknown>>();
  for (const metric of response.metrics ?? []) {
    const key = metric.english_metric_name;
    for (const trend of metric.trends ?? []) {
      const date =
        trend.date_time.slice(0, 4) +
        "-" +
        trend.date_time.slice(4, 6) +
        "-" +
        trend.date_time.slice(6, 8);
      const values = byDate.get(date) ?? {};
      values[key] = numberOrNull(trend.value);
      byDate.set(date, values);
      const raw = rawByDate.get(date) ?? {};
      raw[key] = trend as unknown as Record<string, unknown>;
      rawByDate.set(date, raw);
    }
  }
  return [...byDate.entries()].map(([metric_date, values]) => ({
    metric_date,
    values,
    raw: rawByDate.get(metric_date) ?? {},
  }));
}

/** 作品详情页“每小时”趋势。接口返回的是各时点累计值，详情页再按相邻点计算新增。 */
export async function fetchOfficialVideoHourlyMetrics(
  page: Page,
  works: OfficialVideoRow[],
  indexDataWindow = 1,
): Promise<OfficialVideoHourlyPoint[]> {
  const output: OfficialVideoHourlyPoint[] = [];
  const queue = works.flatMap((work) =>
    OFFICIAL_VIDEO_METRIC_TYPES.map((metricType) => ({ work, metricType })),
  );
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      if (!entry) continue;
      const { work, metricType } = entry;
      const query = new URLSearchParams({
        item_id: work.aweme_id,
        publish_time: String(Math.floor(work.publish_time.getTime() / 1000)),
        index_type: String(metricType),
        index_data_window: String(indexDataWindow),
        talent_id: "",
        mcn_type: "0",
      });
      const response = await pageFetch<VideoOptionResponse>(page, `${ITEM_OPTION}?${query}`);
      if (response.status_code != null && response.status_code !== 0) continue;
      for (const point of response.trend_data ?? []) {
        const pointAt = parseTrendTime(point.key, work.publish_time);
        const value = Number(point.value);
        if (!pointAt || !Number.isFinite(value)) continue;
        output.push({
          item_id: work.item_id,
          metric_type: metricType,
          point_at: pointAt,
          value,
          raw: point as unknown as Record<string, unknown>,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return output;
}

interface WorkListItem {
  id: string | number;
  aweme_id?: string | number;
  create_time: number;
  description?: string;
  cover?: { url_list?: string[] };
  video_info?: { duration?: number };
  visibility?: string | number;
  metrics?: Record<string, unknown>;
}
interface WorkListResponse {
  status_code: number;
  status_msg?: string;
  items?: WorkListItem[];
  has_more?: boolean;
  max_cursor?: number;
}
interface DashboardResponse {
  status_code: number;
  status_msg?: string;
  metrics?: {
    english_metric_name: string;
    trends?: { date_time: string; value?: number }[];
  }[];
}

interface VideoOptionResponse {
  status_code?: number;
  trend_data?: { key?: string | number; value?: number | string }[];
}

function parseTrendTime(value: string | number | undefined, publishTime: Date): Date | null {
  if (value == null) return null;
  const text = String(value);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric > 1_000_000_000) {
    const date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fullMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (fullMatch) {
    const [, fullYear, fullMonth, fullDay, fullHour, fullMinute, fullSecond = "00"] = fullMatch;
    const fullDate = new Date(
      `${fullYear}-${fullMonth}-${fullDay}T${fullHour}:${fullMinute}:${fullSecond}+08:00`,
    );
    return Number.isNaN(fullDate.getTime()) ? null : fullDate;
  }
  const year = publishTime.toLocaleString("en-US", { timeZone: "Asia/Shanghai", year: "numeric" });
  const match = /^(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [, month, day, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}
function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
