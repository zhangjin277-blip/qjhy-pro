import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

/**
 * portrait/core_day_stats: per-anchor 同步 API + cid，返回 9 个曝光/进房/打赏/转化字段。
 * cid 从 bytedance_export 实测得来：
 *   API path: c80ehg3c77uelq3kif90
 *   query cid: cnukjgrc77u50ulb2bl0
 */
const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/uanchor/pugna_component/data/anchor/portrait/core_day_stats";
const API_PATH_CID = "c80ehg3c77uelq3kif90";
const QUERY_CID = "cnukjgrc77u50ulb2bl0";

export interface PortraitRow {
  anchor_id: string;
  date: string;
  show_uv: number | null;
  show_cnt: number | null;
  watch_uv: number | null;
  watch_cnt: number | null;
  enter_room_rate: number | null;
  avg_watch_duration: number | null;
  consume_uv: number | null;
  consume_cnt: number | null;
  consume_rate: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  status_code: number;
  data?: { data_string?: string };
}

interface ParsedInner {
  data?: Record<string, unknown>[] | { series?: Record<string, unknown>[] };
}

export async function fetchPortraitCoreForAnchor(
  page: Page,
  anchorId: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const url =
    `${ENDPOINT_BASE}/${API_PATH_CID}` +
    `?anchorID=${anchorId}&beginDate=${date}&endDate=${date}` +
    `&orderType=desc&orderField=date&page=1&size=50&cid=${QUERY_CID}`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  if (res.status_code !== 0 || !res.data?.data_string) return [];
  const inner = safeParseJson(res.data.data_string) as ParsedInner | null;
  if (!inner) return [];
  // 平台部分返回 inner.data 是数组，部分是 {series:[...]}, 兼容
  if (Array.isArray(inner.data)) return inner.data;
  return inner.data?.series ?? [];
}

export function parsePortraitCoreResponse(
  list: Record<string, unknown>[],
  anchorId: string,
  date: string,
): PortraitRow {
  const r = list[0] ?? {};
  return {
    anchor_id: anchorId,
    date,
    show_uv: numOrNull(r.showUv),
    show_cnt: numOrNull(r.showCnt),
    watch_uv: numOrNull(r.watchUv),
    watch_cnt: numOrNull(r.watchCnt),
    enter_room_rate: pctOrNull(r.enterRoomRate),
    avg_watch_duration: numOrNull(r.avgWatchDuration),
    consume_uv: numOrNull(r.consumeUv),
    consume_cnt: numOrNull(r.consumeCnt),
    consume_rate: pctOrNull(r.consumeRate),
    raw: r,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  // 平台返回可能是 0-1 也可能是 0-100，统一归一化到 0-1
  return n > 1 ? n / 100 : n;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
