import "server-only";
import type { Page } from "puppeteer-core";
import { pugnaJsonFetch } from "../download-helper";

/**
 * 小游戏数据（JSON 模式 — pugna_component/data/simple/faction/micro_game/live_anchor_list）。
 * cid: cnt6sd3c77u3h6jjtt40
 *
 * 这个 endpoint 一次返所有主播 × 所有小游戏的数据。比 CSV download 快 100×，
 * 字段更全（含 beforeDividedIncome / gmUndividedIncome 等 CSV 没有的字段）。
 */

const ENDPOINT = "/ark/api/data/pugna_component/data/simple/faction/micro_game/live_anchor_list";

const FIELDS = [
  "anchorNickname",
  "awemeID",
  "mpName",
  "liveRoomCnt",
  "liveDuration",
  "avgRoomLiveDuration",
  "watchUcnt",
  "acu",
  "pcu",
  "watchDuration",
  "avgUserWatchDuration",
  "gmClickUcnt",
  "gmActiveUcnt",
  "gmPayUcnt",
  "likeUcnt",
  "followUcnt",
  "commentUcnt",
  "likeUcntRatio",
  "followUcntRatio",
  "commentUcntRatio",
  "cpsBindUv",
  "afterDividedAuthorIncome",
  "afterDividedTradeUnionIncome",
  "beforeDividedIncome", // CSV 拿不到
];

export type MinigameScene = "live" | "video";

export interface MinigameRow {
  anchor_id: string;
  date: string;
  scene: MinigameScene;
  mp_name: string;
  anchor_name_snapshot: string | null;

  live_room_cnt: number | null;
  live_duration: number | null;
  avg_room_live_duration: number | null;
  avg_user_watch_duration: number | null;
  watch_ucnt: number | null;
  watch_duration: number | null;
  acu: number | null;
  pcu: number | null;

  like_ucnt: number | null;
  follow_ucnt: number | null;
  comment_ucnt: number | null;
  like_ucnt_ratio: number | null;
  follow_ucnt_ratio: number | null;
  comment_ucnt_ratio: number | null;

  gm_click_ucnt: number | null;
  gm_active_ucnt: number | null;
  gm_pay_ucnt: number | null;

  before_divided_income: number | null;
  after_divided_author_income: number | null;
  after_divided_trade_union_income: number | null;
  cps_bind_uv: number | null;

  raw: Record<string, unknown>;
}

export async function fetchMinigameLive(
  page: Page,
  date: string,
): Promise<Record<string, unknown>[]> {
  const { series, total } = await pugnaJsonFetch(page, ENDPOINT, {
    beginDate: date,
    endDate: date,
    os: "all",
    trafficType: "all",
    page: 1,
    size: 2000,
    orderField: "watchUcnt",
    orderType: "desc",
    fields: FIELDS,
    cid: "cnt6sd3c77u3h6jjtt40",
    anchorID: "",
  });
  console.log(`[minigame-live] ${series.length}/${total} rows`);
  return series;
}

export function parseMinigameRow(
  r: Record<string, unknown>,
  scene: MinigameScene,
  date: string,
): Omit<MinigameRow, "anchor_id"> & { _aweme_id: string | null } {
  const get = (key: string): string | null => {
    const v = r[key];
    if (v === null || v === undefined || v === "") return null;
    return typeof v === "string" ? v : String(v);
  };

  return {
    _aweme_id: get("shortID") ?? get("awemeID"),
    date,
    scene,
    mp_name: get("mpName") ?? "",
    anchor_name_snapshot: get("anchorNickname"),

    // duration 单位混合：total 字段（liveDuration / watchDuration）API 直接返小时；
    // avg 字段（avgRoomLiveDuration / avgUserWatchDuration）API 返分钟需 /60。
    live_room_cnt: numOrNull(get("liveRoomCnt")),
    live_duration: numOrNull(get("liveDuration")),
    avg_room_live_duration: minToHour(numOrNull(get("avgRoomLiveDuration"))),
    avg_user_watch_duration: minToHour(numOrNull(get("avgUserWatchDuration"))),
    watch_ucnt: numOrNull(get("watchUcnt")),
    watch_duration: numOrNull(get("watchDuration")),
    acu: numOrNull(get("acu")),
    pcu: numOrNull(get("pcu")),

    like_ucnt: numOrNull(get("likeUcnt")),
    follow_ucnt: numOrNull(get("followUcnt")),
    comment_ucnt: numOrNull(get("commentUcnt")),
    like_ucnt_ratio: pctOrNull(get("likeUcntRatio")),
    follow_ucnt_ratio: pctOrNull(get("followUcntRatio")),
    comment_ucnt_ratio: pctOrNull(get("commentUcntRatio")),

    gm_click_ucnt: numOrNull(get("gmClickUcnt")),
    gm_active_ucnt: numOrNull(get("gmActiveUcnt")),
    gm_pay_ucnt: numOrNull(get("gmPayUcnt")),

    before_divided_income: numOrNull(get("beforeDividedIncome")),
    after_divided_author_income: numOrNull(get("afterDividedAuthorIncome")),
    after_divided_trade_union_income: numOrNull(get("afterDividedTradeUnionIncome")),
    cps_bind_uv: numOrNull(get("cpsBindUv")),

    raw: r,
  };
}

function minToHour(v: number | null): number | null {
  if (v === null) return null;
  return Math.round((v / 60) * 100) / 100;
}

function numOrNull(v: string | null): number | null {
  if (v === null || v === "" || v === "-" || v === "—") return null;
  const cleaned = v.replace(/,/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v: string | null): number | null {
  if (v === null || v === "" || v === "-" || v === "—") return null;
  const cleaned = v.replace(/%/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
