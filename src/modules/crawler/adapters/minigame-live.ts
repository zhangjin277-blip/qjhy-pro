import "server-only";
import type { Page } from "puppeteer-core";
import { runExport, type DownloadTask } from "../download-helper";
import { parseDuration } from "../parsers";

/**
 * 小游戏数据（download 模式）。
 * cid: cnt6sd3c77u3h6jjtt40
 * scene: tinker_cnomtkrc77u66b1th8vg
 * filename: 小游戏数据-主播详情数据
 *
 * 这个 endpoint 一次返回所有主播 × 所有小游戏的数据。video scene 暂只复用此接口（如不区分），
 * 后续如有专属 video creator endpoint 再扩。
 */

const ENDPOINT = "/ark/api/data/download/common/task";

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

  gm_click_ucnt: number | null;
  gm_active_ucnt: number | null;
  gm_pay_ucnt: number | null;

  before_divided_income: number | null;
  after_divided_author_income: number | null;
  after_divided_trade_union_income: number | null;
  cps_bind_uv: number | null;

  play_cnt: number | null;
  play_uv: number | null;
  play_cnt_avg: number | null;
  finish_play_uv: number | null;
  finish_play_ratio: number | null;

  raw: Record<string, unknown>;
}

export async function fetchMinigameLive(
  page: Page,
  date: string,
): Promise<Record<string, string>[]> {
  const task: DownloadTask = {
    endpoint: ENDPOINT,
    filename: "小游戏数据-主播详情数据",
    params: {
      os: "all",
      trafficType: "all",
      beginDate: date,
      endDate: date,
      page: 1,
      size: 10,
      orderField: "watchUcnt",
      orderType: "desc",
      fields: FIELDS,
      cid: "cnt6sd3c77u3h6jjtt40",
      anchorID: "",
      scene: "tinker_cnomtkrc77u66b1th8vg",
    },
  };
  return runExport(page, task);
}

export function parseMinigameRow(
  r: Record<string, string>,
  scene: MinigameScene,
  date: string,
): Omit<MinigameRow, "anchor_id"> & { _aweme_id: string | null } {
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== "") return v;
    }
    const headerKeys = Object.keys(r);
    for (const k of keys) {
      const found = headerKeys.find((h) => h.includes(k));
      if (found) {
        const v = r[found];
        if (v !== undefined && v !== "") return v;
      }
    }
    return null;
  };

  return {
    _aweme_id: get("抖音号", "awemeID"),
    date,
    scene,
    mp_name: get("小游戏名称", "游戏名称") ?? "",
    anchor_name_snapshot: get("主播昵称", "昵称", "anchorNickname"),

    live_room_cnt: numOrNull(get("小游戏开播场次", "开播场次", "投稿数")),
    live_duration: parseDuration(get("小游戏开播时长", "开播时长") ?? ""),
    avg_room_live_duration: parseDuration(get("场均开播时长") ?? ""),
    avg_user_watch_duration: parseDuration(get("人均观看时长") ?? ""),
    watch_ucnt: numOrNull(get("看播人数", "小游戏看播人数")),
    watch_duration: parseDuration(get("看播时长") ?? ""),
    acu: numOrNull(get("ACU", "平均在线")),
    pcu: numOrNull(get("PCU", "最高在线")),

    like_ucnt: numOrNull(get("点赞人数")),
    follow_ucnt: numOrNull(get("涨粉数", "关注人数")),
    comment_ucnt: numOrNull(get("评论人数")),

    gm_click_ucnt: numOrNull(get("小游戏点击人数", "点击人数")),
    gm_active_ucnt: numOrNull(get("小游戏激活人数", "激活人数")),
    gm_pay_ucnt: numOrNull(get("小游戏付费人数", "付费人数")),

    before_divided_income: numOrNull(get("直播-小游戏流水(分成前)", "分成前流水", "小游戏流水")),
    after_divided_author_income: numOrNull(
      get("直播-小游戏收入主播分成(分成后)", "主播分成", "主播分账"),
    ),
    after_divided_trade_union_income: numOrNull(
      get("直播-小游戏收入公会分成(分成后)", "公会分成", "机构分账"),
    ),
    cps_bind_uv: numOrNull(get("小游戏cps绑定人数", "cps绑定人数", "cps绑定UV")),

    play_cnt: numOrNull(get("视频播放数")),
    play_uv: numOrNull(get("视频播放人数")),
    play_cnt_avg: numOrNull(get("人均视频播放数")),
    finish_play_uv: numOrNull(get("完播人数")),
    finish_play_ratio: pctOrNull(get("完播率")),

    raw: r as Record<string, unknown>,
  };
}

function numOrNull(v: string | null): number | null {
  if (v === null || v === "") return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "—") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v: string | null): number | null {
  if (v === null || v === "") return null;
  if (v.endsWith("%")) {
    const n = Number(v.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
