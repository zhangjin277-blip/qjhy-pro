import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

/**
 * video_list: 主播详情 → 视频作品列表（不带 factionID 版本，返回近期全量视频条目）。
 * API path 来自百应主播详情→视频作品 tab 实测：cagvd5rc77u5ih4edc6g
 *
 * 关键字段：
 * - itemID: 视频唯一 ID
 * - publishTime: 发布时间（"YYYY-MM-DD HH:mm:ss"）
 * - isSecret: "0"=公开 / "1"=私密（"有效视频" = isSecret=0）
 * - playCounter / recommendPlayCounter / likeCounter / commentCounter / shareCounter / newFollowCounter
 * - norm: "是否符合规范"，主播详情入口固定返回 "-"，仍保留
 *
 * 响应结构：data.data_string 是 JSON 字符串，parse 后 { code, data: [...], meta: { total } }
 */
const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/uanchor/pugna_component/data/union/video/video_list";
const API_PATH_CID = "cagvd5rc77u5ih4edc6g";

export interface VideoSnapshotRow {
  item_id: string;
  anchor_id: string;
  publish_time: Date;
  is_secret: number;
  title: string | null;
  cover_url: string | null;
  play_count: number | null;
  recommend_play_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  new_follow_count: number | null;
  norm: string | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  status_code: number;
  message?: string;
  data?: { data_string?: string };
}

interface ParsedInner {
  data?: Record<string, unknown>[];
  meta?: { total?: number };
}

export async function fetchVideoListForAnchor(
  page: Page,
  anchorId: string,
  beginDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
): Promise<VideoSnapshotRow[]> {
  const url =
    `${ENDPOINT_BASE}/${API_PATH_CID}` +
    `?anchorID=${anchorId}` +
    `&createBeginDate=${beginDate}&createEndDate=${endDate}` +
    `&orderType=&orderField=&statType=period_0&page=1&size=100`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  if (res.status_code !== 0 || !res.data?.data_string) return [];
  const inner = safeParseJson(res.data.data_string) as ParsedInner | null;
  if (!inner?.data) return [];
  return inner.data
    .map((row) => parseVideoRow(row, anchorId))
    .filter((r): r is VideoSnapshotRow => r !== null);
}

function parseVideoRow(row: Record<string, unknown>, anchorId: string): VideoSnapshotRow | null {
  const itemId = strOrNull(row.itemID);
  const publishTimeStr = strOrNull(row.publishTime);
  if (!itemId || !publishTimeStr) return null;
  // 平台时区是 Asia/Shanghai；publishTime 是 "YYYY-MM-DD HH:mm:ss" 字面值，无 TZ 后缀。
  // worker 容器 TZ=Asia/Shanghai（docker-compose），new Date(s) 按本地解析即正确。
  const publishTime = new Date(publishTimeStr.replace(" ", "T") + "+08:00");
  if (Number.isNaN(publishTime.getTime())) return null;
  return {
    item_id: itemId,
    anchor_id: anchorId,
    publish_time: publishTime,
    is_secret: row.isSecret === "1" || row.isSecret === 1 ? 1 : 0,
    title: strOrNull(row.title),
    cover_url: strOrNull(row.coverUrl),
    play_count: numOrNull(row.playCounter),
    recommend_play_count: numOrNull(row.recommendPlayCounter),
    like_count: numOrNull(row.likeCounter),
    comment_count: numOrNull(row.commentCounter),
    share_count: numOrNull(row.shareCounter),
    new_follow_count: numOrNull(row.newFollowCounter),
    norm: strOrNull(row.norm),
    raw: row,
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
