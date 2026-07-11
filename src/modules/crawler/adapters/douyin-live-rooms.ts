import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

/**
 * 公会后台工作台「正在直播」模块的接口（2026-07-11 实测，登录态浏览器抓包确认）：
 * GET /ark/api/broker/follow/get_room_by_label?sort_field=create_time&sort_type=asc
 *     &cur_page=N&page_size=M&room_tag=0
 * 返回当前全公会在播房间：create_time=实际开播时间(unix 秒)、owner.user_id_str=抖音 UID
 * （= live_account.platform_uid）、ticket_count=流水、user_count=人气。
 * linking_count = 在播总数，用于分页终止。
 */
const ENDPOINT = "https://union.bytedance.com/ark/api/broker/follow/get_room_by_label";

const PAGE_SIZE = 20;
const MAX_PAGES = 30; // 兜底：公会同时在播不可能超过 600 间

export interface DouyinLiveRoomRow {
  room_id: string;
  platform_uid: string;
  nick_name: string | null;
  title: string | null;
  start_at: Date;
  ticket_count: number | null;
  user_count: number | null;
  raw: Record<string, unknown>;
}

interface RawRoom {
  id_str?: unknown;
  create_time?: unknown;
  ticket_count?: unknown;
  user_count?: unknown;
  title?: unknown;
  owner?: { user_id_str?: unknown; nick_name?: unknown };
}

interface RoomByLabelResp {
  status_code: number;
  message?: string;
  data?: { rooms?: RawRoom[]; linking_count?: number };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchDouyinLiveRooms(page: Page): Promise<DouyinLiveRoomRow[]> {
  const rows: DouyinLiveRoomRow[] = [];
  const seen = new Set<string>();
  let linkingCount = Infinity;

  for (let curPage = 1; curPage <= MAX_PAGES; curPage++) {
    const url =
      `${ENDPOINT}?sort_field=create_time&sort_type=asc` +
      `&cur_page=${curPage}&page_size=${PAGE_SIZE}&room_tag=0`;
    const res = await pageFetch<RoomByLabelResp>(page, url, {
      headers: { "X-Appid": "3000" },
    });
    if (res.status_code !== 0) {
      throw new Error(`get_room_by_label failed: code=${res.status_code} msg=${res.message}`);
    }
    const batch = res.data?.rooms ?? [];
    linkingCount = res.data?.linking_count ?? linkingCount;

    for (const r of batch) {
      const roomId = String(r.id_str ?? "");
      const uid = String(r.owner?.user_id_str ?? "");
      const createTime = numOrNull(r.create_time);
      if (!roomId || !uid || createTime === null || seen.has(roomId)) continue;
      seen.add(roomId);
      rows.push({
        room_id: roomId,
        platform_uid: uid,
        nick_name: r.owner?.nick_name != null ? String(r.owner.nick_name) : null,
        title: r.title != null ? String(r.title) : null,
        start_at: new Date(createTime * 1000),
        ticket_count: numOrNull(r.ticket_count),
        user_count: numOrNull(r.user_count),
        raw: r as Record<string, unknown>,
      });
    }

    if (batch.length < PAGE_SIZE || rows.length >= linkingCount) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return rows;
}
