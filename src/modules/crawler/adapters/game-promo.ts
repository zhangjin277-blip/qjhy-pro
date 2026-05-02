import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/faction/game";

export type BizMode = "cps_all" | "cpc" | "poi";
export type PromoteScene = "live" | "video";

export interface GamePromoRow {
  anchor_id: string;
  date: string;
  promote_scene: PromoteScene;
  biz_mode: BizMode;
  game_name: string;
  promote_live_cnt_1d: number | null;
  promote_live_duration_1d: number | null;
  acu: number | null;
  pcu: number | null;
  promote_anchor_income_1d: number | null;
  promote_faction_income_1d: number | null;
  promote_pay_amount_1d: number | null;
  promote_pay_ucnt_1d: number | null;
  raw: Record<string, unknown>;
}

interface RawGameResponse {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchGamePromoForAnchor(
  page: Page,
  anchorId: string,
  date: string,
  scene: PromoteScene,
  bizMode: BizMode,
): Promise<Record<string, unknown>[]> {
  const fields = [
    "anchorName",
    "gameName",
    "promoteLiveCnt1d",
    "promoteLiveDuration1d",
    "acu",
    "pcu",
    "promoteAnchorIncome1d",
    "promoteFactionIncome1d",
    "promotePayAmount1d",
    "promotePayUcnt1d",
    "promoteDownloadPayUcnt1d",
    "promoteDownloadPayAmount1d",
    "promoteFactionDownloadPayAmount1d",
    "promoteAnchorDownloadPayAmount1d",
    "promoteActivePayUcnt1d",
    "promoteFactionActivePayAmount1d",
    "promoteAnchorActivePayAmount1d",
  ].join(",");
  const url =
    `${ENDPOINT_BASE}/game_anchor_detail_list?anchorID=${anchorId}` +
    `&beginDate=${date}&endDate=${date}` +
    `&promoteScene=${scene}&bizMode=${bizMode}&os=all&trafficType=all` +
    `&page=1&size=100&fields=${fields}`;
  const res = await pageFetch<RawGameResponse>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseGamePromoResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
  scene: PromoteScene,
  bizMode: BizMode,
): GamePromoRow[] {
  return series.map((r) => ({
    anchor_id: anchorId,
    date,
    promote_scene: scene,
    biz_mode: bizMode,
    game_name: String(r.gameName ?? ""),
    promote_live_cnt_1d: numOrNull(r.promoteLiveCnt1d),
    promote_live_duration_1d: numOrNull(r.promoteLiveDuration1d),
    acu: numOrNull(r.acu),
    pcu: numOrNull(r.pcu),
    promote_anchor_income_1d: numOrNull(r.promoteAnchorIncome1d),
    promote_faction_income_1d: numOrNull(r.promoteFactionIncome1d),
    promote_pay_amount_1d: numOrNull(r.promotePayAmount1d),
    promote_pay_ucnt_1d: numOrNull(r.promotePayUcnt1d),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
