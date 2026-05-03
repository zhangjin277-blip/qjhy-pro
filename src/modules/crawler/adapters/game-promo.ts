import "server-only";
import type { Page } from "puppeteer-core";
import { pugnaJsonFetch } from "../download-helper";

/**
 * 推广游戏数据（JSON 模式 — pugna_component/data/v2/faction/game/game_anchor_detail_list）。
 * 4 个 task：
 *   live + cps        → 流水分成（基础+看播+互动+转化+付费+分账）
 *   live + cps_all    → 下载/活跃激励额外分账
 *   video + cps       → 短视频流水分成
 *   video + cps_all   → 短视频下载/活跃激励
 *
 * cid 跟原 CSV download 模式一致，bytedance_export 老系统实测使用。
 * 对比 CSV 模式：
 *   - 单 task 0.7s 返完（CSV 60-90s）
 *   - 字段更全：JSON sample 50+ key vs CSV 26 列
 *   - 平台 fields 数组用驼峰命名，JSON 返回 key 也是驼峰（无需中文映射）
 */

const ENDPOINT = "/ark/api/data/pugna_component/data/v2/faction/game/game_anchor_detail_list";

export type PromoteScene = "live" | "video";
export type BizMode = "cps" | "cps_all";

interface TaskSpec {
  scene: PromoteScene;
  bizMode: BizMode;
  cid: string;
  fields: string[];
}

const TASKS: TaskSpec[] = [
  {
    scene: "live",
    bizMode: "cps",
    cid: "chebn0jc77u1tkdqtf80",
    fields: [
      "anchorName",
      "gameName",
      "promoteLiveCnt1d",
      "promoteLiveDuration1d",
      "promoteLiveDurationAvg",
      "promoteLiveWatchUcnt1d",
      "acu",
      "promoteLiveLikeUcnt1d",
      "promoteLiveLikeUAvg1d",
      "promoteClickDownloadUcnt1d",
      "promoteInstallFinishUcnt1d",
      "promoteActiveUcnt1d",
      "promoteAnchorIncome1d",
      "propsAnchorPayAmount1d",
      "promoteFactionIncome1d",
      "promotePayUcnt1d",
      "propsFactionPayAmount1d",
      "propsPayAmount1d",
      "promotePayAmount1d",
      "promoteDownloadFinishUcnt1d",
      "promoteStartDownloadUcnt1d",
      "promoteLiveFollowUAvg1d",
      "promoteLiveCommentUAvg1d",
      "promoteLiveCommentUcnt1d",
      "promoteLiveFollowUcnt1d",
      "pcu",
      "promoteLiveWatchDuration1d",
      "promoteLiveWatchDurationUAvg1d",
    ],
  },
  {
    scene: "live",
    bizMode: "cps_all",
    cid: "cm58eh3c77udnv3lumm0",
    fields: [
      "anchorName",
      "gameName",
      "promoteFactionDownloadPayAmount1d",
      "promoteAnchorDownloadPayAmount1d",
      "promoteFactionActivePayAmount1d",
      "promoteAnchorActivePayAmount1d",
      "promoteDownloadPayAmount1d",
      "promoteActivePayUcnt1d",
      "promoteDownloadPayUcnt1d",
    ],
  },
  {
    scene: "video",
    bizMode: "cps",
    cid: "cie2gobc77u3qq5m43gg",
    fields: [
      "anchorName",
      "gameName",
      "promotePayAmount1d",
      "promoteAnchorIncome1d",
      "promoteFactionIncome1d",
      "promoteVideoPublishCnt1d",
      "promoteItemVV1d",
      "promoteItemUV1d",
      "promoteClickDownloadUcnt1d",
      "promoteActiveUcnt1d",
      "promoteChargePayUcnt1d",
      "promoteItemVVUAvg",
      "promoteVideoFinishUV1d",
      "promoteVideoLikeUcnt1d",
      "promoteVideoFollowUcnt1d",
      "promoteVideoCommentUcnt1d",
      "promoteVideoFinishUAvg1d",
      "promoteVideoLikeUAvg1d",
      "promoteVideoFollowUAvg1d",
      "promoteVideoCommentUAvg1d",
      "promoteStartDownloadUcnt1d",
      "promoteDownloadFinishUcnt1d",
      "promoteInstallFinishUcnt1d",
    ],
  },
  {
    scene: "video",
    bizMode: "cps_all",
    cid: "cm58etbc77udnv3lummg",
    fields: [
      "anchorName",
      "gameName",
      "promoteFactionDownloadPayAmount1d",
      "promoteAnchorDownloadPayAmount1d",
      "promoteFactionActivePayAmount1d",
      "promoteAnchorActivePayAmount1d",
      "promoteDownloadPayUcnt1d",
      "promoteDownloadPayAmount1d",
      "promoteActivePayUcnt1d",
    ],
  },
];

export interface GamePromoTaskResult {
  scene: PromoteScene;
  bizMode: BizMode;
  rows: Record<string, unknown>[];
}

export async function fetchAllGamePromo(page: Page, date: string): Promise<GamePromoTaskResult[]> {
  const results: GamePromoTaskResult[] = [];
  for (const task of TASKS) {
    try {
      const { series, total } = await pugnaJsonFetch(page, ENDPOINT, {
        os: "all",
        trafficType: "all",
        contractType: "all",
        bizMode: task.bizMode,
        promoteScene: task.scene,
        beginDate: date,
        endDate: date,
        page: 1,
        size: 2000, // 一次拉完
        orderField: "anchorName",
        orderType: "desc",
        fields: task.fields,
        cid: task.cid,
      });
      console.log(`[game-promo] ${task.scene}+${task.bizMode}: ${series.length}/${total} rows`);
      results.push({ scene: task.scene, bizMode: task.bizMode, rows: series });
    } catch (e) {
      console.warn(
        `[game-promo] ${task.scene}+${task.bizMode} failed: ${(e as Error).message}, skip`,
      );
      results.push({ scene: task.scene, bizMode: task.bizMode, rows: [] });
    }
  }
  return results;
}

export interface GamePromoRow {
  anchor_id: string;
  date: string;
  promote_scene: PromoteScene;
  biz_mode: BizMode;
  game_name: string;
  anchor_name_snapshot: string | null;

  promote_live_cnt_1d: number | null;
  promote_live_duration_1d: number | null;
  promote_live_duration_avg: number | null;
  promote_live_watch_ucnt_1d: number | null;
  promote_live_watch_duration_1d: number | null;
  promote_live_watch_duration_uavg_1d: number | null;
  acu: number | null;
  pcu: number | null;
  promote_live_like_ucnt_1d: number | null;
  promote_live_comment_ucnt_1d: number | null;
  promote_live_follow_ucnt_1d: number | null;
  promote_live_like_uavg_1d: number | null;
  promote_live_comment_uavg_1d: number | null;
  promote_live_follow_uavg_1d: number | null;

  promote_video_publish_cnt_1d: number | null;
  promote_item_vv_1d: number | null;
  promote_item_uv_1d: number | null;
  promote_item_uavg_1d: number | null;
  promote_finish_play_ucnt_1d: number | null;
  promote_finish_play_ratio_1d: number | null;

  promote_click_download_ucnt_1d: number | null;
  promote_start_download_ucnt_1d: number | null;
  promote_download_finish_ucnt_1d: number | null;
  promote_install_finish_ucnt_1d: number | null;
  promote_active_ucnt_1d: number | null;

  promote_pay_ucnt_1d: number | null;
  promote_pay_amount_1d: number | null;
  promote_charge_pay_ucnt_1d: number | null;

  props_pay_amount_1d: number | null;
  props_anchor_pay_amount_1d: number | null;
  props_faction_pay_amount_1d: number | null;

  promote_anchor_income_1d: number | null;
  promote_faction_income_1d: number | null;

  promote_download_pay_ucnt_1d: number | null;
  promote_download_pay_amount_1d: number | null;
  promote_anchor_download_pay_amount_1d: number | null;
  promote_faction_download_pay_amount_1d: number | null;

  promote_active_pay_ucnt_1d: number | null;
  promote_anchor_active_pay_amount_1d: number | null;
  promote_faction_active_pay_amount_1d: number | null;

  raw: Record<string, unknown>;
}

/**
 * JSON 行 → GamePromoRow（不含 anchor_id，由 handler 通过抖音号 JOIN anchor_profile 反查）。
 *
 * JSON key 都是驼峰，且数值是 string（"0", "1213", "5.67"），无 万/亿/% 后缀。
 * cps 与 cps_all 的字段不同 task 返不同 key，缺失即 undefined → null。
 */
export function parseGamePromoRow(
  r: Record<string, unknown>,
  scene: PromoteScene,
  bizMode: BizMode,
  date: string,
): Omit<GamePromoRow, "anchor_id"> & { _aweme_id: string | null } {
  const get = (key: string): string | null => {
    const v = r[key];
    if (v === null || v === undefined || v === "") return null;
    return typeof v === "string" ? v : String(v);
  };

  return {
    _aweme_id: get("shortID") ?? get("awemeID"),
    date,
    promote_scene: scene,
    biz_mode: bizMode,
    game_name: get("gameName") ?? "未知",
    anchor_name_snapshot: get("nickname") ?? get("anchorName"),

    // 开播（duration 字段 JSON 返回分钟，schema 是小时，/60 转换）
    promote_live_cnt_1d: numOrNull(get("promoteLiveCnt1d")),
    promote_live_duration_1d: minToHour(numOrNull(get("promoteLiveDuration1d"))),
    promote_live_duration_avg: minToHour(numOrNull(get("promoteLiveDurationAvg"))),

    // 流量
    promote_live_watch_ucnt_1d: numOrNull(get("promoteLiveWatchUcnt1d")),
    promote_live_watch_duration_1d: minToHour(numOrNull(get("promoteLiveWatchDuration1d"))),
    promote_live_watch_duration_uavg_1d: minToHour(
      numOrNull(get("promoteLiveWatchDurationUAvg1d")),
    ),
    acu: numOrNull(get("acu")),
    pcu: numOrNull(get("pcu")),

    // 互动（live 专属）
    promote_live_like_ucnt_1d: numOrNull(get("promoteLiveLikeUcnt1d")),
    promote_live_comment_ucnt_1d: numOrNull(get("promoteLiveCommentUcnt1d")),
    promote_live_follow_ucnt_1d: numOrNull(get("promoteLiveFollowUcnt1d")),
    promote_live_like_uavg_1d: pctOrNull(get("promoteLiveLikeUAvg1d")),
    promote_live_comment_uavg_1d: pctOrNull(get("promoteLiveCommentUAvg1d")),
    promote_live_follow_uavg_1d: pctOrNull(get("promoteLiveFollowUAvg1d")),

    // 视频专属（video scene）
    promote_video_publish_cnt_1d: numOrNull(get("promoteVideoPublishCnt1d")),
    promote_item_vv_1d: numOrNull(get("promoteItemVV1d")),
    promote_item_uv_1d: numOrNull(get("promoteItemUV1d")),
    promote_item_uavg_1d: numOrNull(get("promoteItemVVUAvg")),
    promote_finish_play_ucnt_1d: numOrNull(get("promoteVideoFinishUV1d")),
    promote_finish_play_ratio_1d: pctOrNull(get("promoteVideoFinishUAvg1d")),

    // 转化漏斗（live + video 共用）
    promote_click_download_ucnt_1d: numOrNull(get("promoteClickDownloadUcnt1d")),
    promote_start_download_ucnt_1d: numOrNull(get("promoteStartDownloadUcnt1d")),
    promote_download_finish_ucnt_1d: numOrNull(get("promoteDownloadFinishUcnt1d")),
    promote_install_finish_ucnt_1d: numOrNull(get("promoteInstallFinishUcnt1d")),
    promote_active_ucnt_1d: numOrNull(get("promoteActiveUcnt1d")),

    // 收益
    promote_pay_ucnt_1d: numOrNull(get("promotePayUcnt1d")),
    promote_pay_amount_1d: numOrNull(get("promotePayAmount1d")),
    promote_charge_pay_ucnt_1d: numOrNull(get("promoteChargePayUcnt1d")),
    promote_anchor_income_1d: numOrNull(get("promoteAnchorIncome1d")),
    promote_faction_income_1d: numOrNull(get("promoteFactionIncome1d")),

    // 道具（live 专属）
    props_pay_amount_1d: numOrNull(get("propsPayAmount1d")),
    props_anchor_pay_amount_1d: numOrNull(get("propsAnchorPayAmount1d")),
    props_faction_pay_amount_1d: numOrNull(get("propsFactionPayAmount1d")),

    // cps_all（下载/活跃激励）
    promote_download_pay_ucnt_1d: numOrNull(get("promoteDownloadPayUcnt1d")),
    promote_download_pay_amount_1d: numOrNull(get("promoteDownloadPayAmount1d")),
    promote_anchor_download_pay_amount_1d: numOrNull(get("promoteAnchorDownloadPayAmount1d")),
    promote_faction_download_pay_amount_1d: numOrNull(get("promoteFactionDownloadPayAmount1d")),
    promote_active_pay_ucnt_1d: numOrNull(get("promoteActivePayUcnt1d")),
    promote_anchor_active_pay_amount_1d: numOrNull(get("promoteAnchorActivePayAmount1d")),
    promote_faction_active_pay_amount_1d: numOrNull(get("promoteFactionActivePayAmount1d")),

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
  // JSON 返回的 ratio 已是百分比数值（如 "2.97" = 2.97%），转 0-1 小数
  const cleaned = v.replace(/%/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
