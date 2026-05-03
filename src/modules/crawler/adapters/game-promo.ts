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
    // 5/03 DevTools 实测平台真实导出 query (21 数据 + 2 metadata)
    // 关键：互动是 promoteVideo* 命名（不是 promoteLive*），完播是 promoteVideoFinishUV/UAvg，
    // 人均VV 是 promoteItemVVUAvg（注意大小写 + 无 1d 后缀）
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
    filename: "游戏数据-创作者详情数据-流水分成",
  },
  {
    scene: "video",
    bizMode: "cps_all",
    cid: "cm58etbc77udnv3lummg",
    taskScene: "tinker_cijsa9rc77u482q9pu40",
    // fields 顺序敏感：promoteDownloadPayAmount1d 必须紧跟 promoteDownloadPayUcnt1d
    // (5/03 DevTools 实测真实导出 query；之前顺序错导致 status=20001)
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
 * 中文 CSV 行 → GamePromoRow（不含 anchor_id，由 handler 通过抖音号 JOIN anchor_profile 反查）。
 */
export function parseGamePromoRow(
  r: Record<string, string>,
  scene: PromoteScene,
  bizMode: BizMode,
  date: string,
): Omit<GamePromoRow, "anchor_id"> & { _aweme_id: string | null } {
  // 严格按 CSV 中文 header 匹配（实测 4/30 + 5/01）：
  //   live+cps:    游戏开播场次/游戏看播人数/直播-主播游戏收入(分成后) ...
  //   live+cps_all: 下载充值玩家/主播促进玩家下载分成收入 ...
  //   video+cps:   游戏视频投稿数/短视频-创作者游戏收入(分成后) ...
  //   video+cps_all: 创作者促进玩家... （task 当前 cid 失效，未实测）
  // 不用 contains 兜底，避免"活跃"匹配到"活跃用户数"等错配。
  const get = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== "") return v;
    }
    return null;
  };

  return {
    _aweme_id: get("抖音号", "抖音id", "awemeID", "awemeId"),
    date,
    promote_scene: scene,
    biz_mode: bizMode,
    game_name: get("游戏名称", "游戏") ?? "未知",
    anchor_name_snapshot: get("昵称", "主播昵称", "创作者"),

    // 开播
    promote_live_cnt_1d: numOrNull(get("游戏开播场次")),
    promote_live_duration_1d: parseDuration(get("游戏开播时长") ?? ""),
    promote_live_duration_avg: parseDuration(get("场均游戏开播时长") ?? ""),

    // 流量
    promote_live_watch_ucnt_1d: numOrNull(get("游戏看播人数")),
    promote_live_watch_duration_1d: parseDuration(get("游戏看播时长") ?? ""),
    promote_live_watch_duration_uavg_1d: parseDuration(get("人均游戏看播时长") ?? ""),
    acu: numOrNull(get("ACU")),
    pcu: numOrNull(get("PCU")),

    // 互动
    promote_live_like_ucnt_1d: numOrNull(get("点赞人数")),
    promote_live_comment_ucnt_1d: numOrNull(get("评论人数")),
    promote_live_follow_ucnt_1d: numOrNull(get("关注人数")),
    promote_live_like_uavg_1d: pctOrNull(get("点赞率")),
    promote_live_comment_uavg_1d: pctOrNull(get("评论率")),
    promote_live_follow_uavg_1d: pctOrNull(get("关注率")),

    // 视频专属（video scene；live scene CSV 不返回这些）
    promote_video_publish_cnt_1d: numOrNull(get("游戏视频投稿数")),
    promote_item_vv_1d: numOrNull(get("游戏视频播放数")),
    promote_item_uv_1d: numOrNull(get("游戏视频播放人数")),
    promote_item_uavg_1d: numOrNull(get("人均游戏视频播放数")),
    promote_finish_play_ucnt_1d: numOrNull(get("完播人数")),
    promote_finish_play_ratio_1d: pctOrNull(get("完播率")),

    // 转化漏斗（live + video 共用）
    promote_click_download_ucnt_1d: numOrNull(get("游戏下载点击人数")),
    promote_start_download_ucnt_1d: numOrNull(get("安卓游戏下载开始人数")),
    promote_download_finish_ucnt_1d: numOrNull(get("安卓游戏下载完成人数")),
    promote_install_finish_ucnt_1d: numOrNull(get("安卓游戏安装完成人数")),

    // 收益（live + video 共用同一字段，按 promote_scene 区分）
    promote_active_ucnt_1d: numOrNull(get("游戏活跃用户数")),
    promote_pay_ucnt_1d: numOrNull(get("游戏内购付费用户数")),
    promote_charge_pay_ucnt_1d: numOrNull(get("游戏内购付费用户数")),
    promote_pay_amount_1d: numOrNull(get("直播-游戏流水(分成前)", "短视频-游戏流水(分成前)")),
    promote_anchor_income_1d: numOrNull(
      get("直播-主播游戏收入(分成后)", "短视频-创作者游戏收入(分成后)"),
    ),
    promote_faction_income_1d: numOrNull(
      get("直播-机构游戏收入(分成后)", "短视频-机构游戏收入(分成后)"),
    ),

    // 道具（live 专属）
    props_pay_amount_1d: numOrNull(get("道具推广流水(分成前)")),
    props_anchor_pay_amount_1d: numOrNull(get("主播道具推广收入(分成后)")),
    props_faction_pay_amount_1d: numOrNull(get("机构道具推广收入(分成后)")),

    // cps_all（下载+活跃激励），主播/创作者两种命名
    promote_download_pay_ucnt_1d: numOrNull(get("下载充值玩家")),
    promote_download_pay_amount_1d: numOrNull(get("下载充值流水")),
    promote_anchor_download_pay_amount_1d: numOrNull(
      get("主播促进玩家下载分成收入", "创作者促进玩家下载分成收入"),
    ),
    promote_faction_download_pay_amount_1d: numOrNull(get("机构促进玩家下载分成收入")),

    promote_active_pay_ucnt_1d: numOrNull(get("活跃充值玩家")),
    promote_anchor_active_pay_amount_1d: numOrNull(
      get("主播促进玩家活跃分成收入", "创作者促进玩家活跃分成收入"),
    ),
    promote_faction_active_pay_amount_1d: numOrNull(get("机构促进玩家活跃分成收入")),

    raw: r as Record<string, unknown>,
  };
}

function numOrNull(v: string | null): number | null {
  if (v === null || v === "") return null;
  // strip 千位分隔符 + 常见中文后缀（元/个/人/次/分钟/小时）
  let cleaned = v
    .replace(/,/g, "")
    .replace(/(元|个|人|次|分钟|小时)$/g, "")
    .trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "—") return null;
  // 处理 万/亿 倍率（"1.5万"→15000，"2.3亿"→230_000_000）
  let multiplier = 1;
  if (cleaned.endsWith("万")) {
    multiplier = 10_000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("亿")) {
    multiplier = 100_000_000;
    cleaned = cleaned.slice(0, -1);
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n * multiplier : null;
}

function pctOrNull(v: string | null): number | null {
  if (v === null || v === "") return null;
  const cleaned = v.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "—") return null;
  if (cleaned.endsWith("%")) {
    const n = Number(cleaned.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}
