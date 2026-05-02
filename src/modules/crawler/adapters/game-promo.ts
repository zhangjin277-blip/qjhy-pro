import "server-only";
import type { Page } from "puppeteer-core";
import { runExport, type DownloadTask } from "../download-helper";
import { parseDuration } from "../parsers";

/**
 * 推广游戏数据（download 模式）。
 * 4 个 task：
 *   live + cps        → 流水分成（基础+看播+互动+转化+付费+分账）
 *   live + cps_all    → 下载/活跃激励额外分账
 *   video + cps       → 短视频流水分成
 *   video + cps_all   → 短视频下载/活跃激励
 *
 * cid + scene 来自 bytedance_export 实测。
 */

const ENDPOINT = "/ark/api/data/download/common/task";

export type PromoteScene = "live" | "video";
export type BizMode = "cps" | "cps_all";

interface TaskSpec {
  scene: PromoteScene;
  bizMode: BizMode;
  cid: string;
  taskScene: string;
  fields: string[];
  filename: string;
}

const TASKS: TaskSpec[] = [
  {
    scene: "live",
    bizMode: "cps",
    cid: "chebn0jc77u1tkdqtf80",
    taskScene: "tinker_che9qqjc77ud2pgefl5g",
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
    filename: "游戏数据-主播详情数据-流水分成",
  },
  {
    scene: "live",
    bizMode: "cps_all",
    cid: "cm58eh3c77udnv3lumm0",
    taskScene: "tinker_che9qqjc77ud2pgefl5g",
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
    filename: "游戏数据-主播详情数据-流水分成（下载+活跃激励）",
  },
  {
    scene: "video",
    bizMode: "cps",
    cid: "cie2gobc77u3qq5m43gg",
    taskScene: "tinker_cijsa9rc77u482q9pu40",
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
    ],
    filename: "游戏数据-创作者详情数据-流水分成",
  },
  {
    scene: "video",
    bizMode: "cps_all",
    cid: "cm58etbc77udnv3lummg",
    taskScene: "tinker_cijsa9rc77u482q9pu40",
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
    filename: "游戏数据-创作者详情数据-流水分成（下载+活跃激励）",
  },
];

export interface GamePromoTaskResult {
  scene: PromoteScene;
  bizMode: BizMode;
  rows: Record<string, string>[];
}

export async function fetchAllGamePromo(page: Page, date: string): Promise<GamePromoTaskResult[]> {
  const results: GamePromoTaskResult[] = [];
  for (const task of TASKS) {
    const downloadTask: DownloadTask = {
      endpoint: ENDPOINT,
      filename: task.filename,
      params: {
        os: "all",
        trafficType: "all",
        contractType: "all",
        bizMode: task.bizMode,
        promoteScene: task.scene,
        beginDate: date,
        endDate: date,
        page: 1,
        size: 10,
        orderField: "anchorName",
        orderType: "desc",
        fields: task.fields,
        cid: task.cid,
        scene: task.taskScene,
      },
    };
    try {
      const rows = await runExport(page, downloadTask);
      results.push({ scene: task.scene, bizMode: task.bizMode, rows });
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

  promote_video_publish_cnt_1d: number | null;
  promote_item_vv_1d: number | null;
  promote_item_uv_1d: number | null;

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
 * 中文 CSV 行 → GamePromoRow（不含 anchor_id，由 handler 通过抖音号 JOIN anchor_profile 反查）。
 */
export function parseGamePromoRow(
  r: Record<string, string>,
  scene: PromoteScene,
  bizMode: BizMode,
  date: string,
): Omit<GamePromoRow, "anchor_id"> & { _aweme_id: string | null } {
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
    _aweme_id: get("抖音号", "抖音id", "awemeID", "awemeId"),
    date,
    promote_scene: scene,
    biz_mode: bizMode,
    game_name: get("游戏名称", "游戏") ?? "未知",
    anchor_name_snapshot: get("主播昵称", "昵称", "创作者"),

    promote_live_cnt_1d: numOrNull(get("直播场次")),
    promote_live_duration_1d: parseDuration(get("直播时长") ?? ""),
    promote_live_duration_avg: parseDuration(get("平均场次时长", "平均场时长") ?? ""),
    promote_live_watch_ucnt_1d: numOrNull(get("游戏看播人数", "看播人数")),
    promote_live_watch_duration_1d: parseDuration(get("看播时长") ?? ""),
    promote_live_watch_duration_uavg_1d: parseDuration(get("人均看播时长", "人均观看时长") ?? ""),
    acu: numOrNull(get("ACU", "平均在线人数")),
    pcu: numOrNull(get("PCU", "最高在线人数")),
    promote_live_like_ucnt_1d: numOrNull(get("点赞人数")),
    promote_live_comment_ucnt_1d: numOrNull(get("评论人数")),
    promote_live_follow_ucnt_1d: numOrNull(get("关注人数")),

    promote_video_publish_cnt_1d: numOrNull(get("发布视频数", "发布场次", "投稿数")),
    promote_item_vv_1d: numOrNull(get("视频播放数", "VV", "游戏视频播放数")),
    promote_item_uv_1d: numOrNull(get("视频播放人数", "视频UV")),

    promote_click_download_ucnt_1d: numOrNull(get("点击下载人数")),
    promote_start_download_ucnt_1d: numOrNull(get("开始下载人数")),
    promote_download_finish_ucnt_1d: numOrNull(get("下载完成人数")),
    promote_install_finish_ucnt_1d: numOrNull(get("安装完成人数", "安卓游戏安装完成人数", "安装")),
    promote_active_ucnt_1d: numOrNull(get("激活人数", "活跃人数")),

    promote_pay_ucnt_1d: numOrNull(get("付费人数")),
    promote_pay_amount_1d: numOrNull(
      get("付费金额", "直播-游戏流水(分成前)", "短视频-游戏流水(分成前)", "流水"),
    ),
    promote_charge_pay_ucnt_1d: numOrNull(get("充值付费人数")),

    props_pay_amount_1d: numOrNull(get("道具付费金额", "道具流水")),
    props_anchor_pay_amount_1d: numOrNull(get("主播道具分成", "道具主播分成")),
    props_faction_pay_amount_1d: numOrNull(get("机构道具分成", "道具机构分成")),

    promote_anchor_income_1d: numOrNull(get("主播分账", "主播分成", "主播活跃")),
    promote_faction_income_1d: numOrNull(get("机构分账", "机构分成", "公会活跃")),

    promote_download_pay_ucnt_1d: numOrNull(get("下载激励付费人数", "下载激励-付费UV")),
    promote_download_pay_amount_1d: numOrNull(get("下载激励付费金额", "下载激励-付费金额")),
    promote_anchor_download_pay_amount_1d: numOrNull(
      get("主播下载激励分账", "下载激励-主播分账", "主播下载"),
    ),
    promote_faction_download_pay_amount_1d: numOrNull(
      get("机构下载激励分账", "下载激励-机构分账", "机构下载"),
    ),

    promote_active_pay_ucnt_1d: numOrNull(get("活跃激励付费人数", "活跃激励-付费UV")),
    promote_anchor_active_pay_amount_1d: numOrNull(get("主播活跃激励分账", "活跃激励-主播分账")),
    promote_faction_active_pay_amount_1d: numOrNull(
      get("机构活跃激励分账", "活跃激励-机构分账", "公会活跃"),
    ),

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
