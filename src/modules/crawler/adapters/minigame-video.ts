import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";
import type { MinigameRow } from "./minigame-live";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/simple/micro_game/video/creator_list";

interface RawResp {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchMinigameVideoForAnchor(
  page: Page,
  anchorId: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const url =
    `${ENDPOINT}?anchorID=${anchorId}&begin_date=${date}&end_date=${date}` +
    `&os=all&flow_type=all&page=1&size=100`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseMinigameVideoResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
): MinigameRow[] {
  return series.slice(0, 1).map((r) => ({
    anchor_id: anchorId,
    date,
    scene: "video" as const,
    live_room_cnt: numOrNull(r.publish_item_cnt), // video: 投稿数
    live_duration: null, // video 无时长
    watch_ucnt: numOrNull(r.play_uv),
    gm_click_ucnt: numOrNull(r.mg_click_uv),
    gm_active_ucnt: numOrNull(r.mg_active_uv),
    gm_pay_ucnt: numOrNull(r.mg_pay_uv),
    before_divided_income: numOrNull(r.mg_income_before),
    after_divided_author_income: numOrNull(r.anchor_income_after),
    after_divided_trade_union_income: numOrNull(r.faction_income_after),
    cps_bind_uv: numOrNull(r.cps_bind_uv),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
