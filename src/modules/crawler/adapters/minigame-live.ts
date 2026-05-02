import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/simple/faction/micro_game/live_anchor_list";

export interface MinigameRow {
  anchor_id: string;
  date: string;
  scene: "live" | "video";
  live_room_cnt: number | null;
  live_duration: number | null;
  watch_ucnt: number | null;
  gm_click_ucnt: number | null;
  gm_active_ucnt: number | null;
  gm_pay_ucnt: number | null;
  before_divided_income: number | null;
  after_divided_author_income: number | null;
  after_divided_trade_union_income: number | null;
  cps_bind_uv: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchMinigameLiveForAnchor(
  page: Page,
  anchorId: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const fields = [
    "liveRoomCnt",
    "liveDuration",
    "watchUcnt",
    "likeUcnt",
    "followUcnt",
    "commentUcnt",
    "gmClickUcnt",
    "gmActiveUcnt",
    "gmPayUcnt",
    "beforeDividedIncome",
    "afterDividedAuthorIncome",
    "afterDividedTradeUnionIncome",
    "cpsBindUv",
  ].join(",");
  const url =
    `${ENDPOINT}?anchorID=${anchorId}&begin_date=${date}&end_date=${date}` +
    `&os=all&flow_type=all&page=1&size=100&fields=${fields}`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseMinigameLiveResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
): MinigameRow[] {
  // 同一主播同一天 live scene 应该只一行
  return series.slice(0, 1).map((r) => ({
    anchor_id: anchorId,
    date,
    scene: "live" as const,
    live_room_cnt: numOrNull(r.liveRoomCnt),
    live_duration: parseDurationSec(r.liveDuration),
    watch_ucnt: numOrNull(r.watchUcnt),
    gm_click_ucnt: numOrNull(r.gmClickUcnt),
    gm_active_ucnt: numOrNull(r.gmActiveUcnt),
    gm_pay_ucnt: numOrNull(r.gmPayUcnt),
    before_divided_income: numOrNull(r.beforeDividedIncome),
    after_divided_author_income: numOrNull(r.afterDividedAuthorIncome),
    after_divided_trade_union_income: numOrNull(r.afterDividedTradeUnionIncome),
    cps_bind_uv: numOrNull(r.cpsBindUv),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDurationSec(v: unknown): number | null {
  // 小游戏 API 返回时长单位是秒（数字），转小时
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 3600) * 100) / 100;
}
