import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const ENDPOINT = "/rest/cp/creator/analysis/pc/photo/list";

export interface KuaishouAiComicVideo {
  item_id: string;
  publish_time: Date;
  description: string | null;
  cover_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  subscribe_count: number | null;
  raw: Record<string, unknown>;
}

interface PhotoListResponse {
  result: number;
  message?: string;
  data?: { photoList?: { photoItems?: RawPhoto[]; totalCount?: number } };
}

interface RawPhoto {
  photoId?: string;
  title?: string;
  cover?: string;
  publishTime?: number;
  playCount?: number;
  likeCount?: number;
  commentCount?: number;
  collectCount?: number;
  followCount?: number;
  shareCount?: number;
  [key: string]: unknown;
}

export async function fetchKuaishouAiComicVideos(
  page: Page,
  options: { from?: string; to?: string } = {},
): Promise<KuaishouAiComicVideo[]> {
  const raw = await page.evaluate(async (endpoint) => {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderType: 2,
        sortType: 1,
        type: 0,
        count: 100,
        page: 0,
      }),
    });
    return { status: response.status, text: await response.text() };
  }, ENDPOINT);
  if (raw.status === 401 || raw.status === 403 || !raw.text.startsWith("{")) {
    throw new CookieExpiredError(`Kuaishou works API auth failed (${raw.status})`);
  }
  const response = JSON.parse(raw.text) as PhotoListResponse;
  if (response.result !== 1) {
    throw new Error(`Kuaishou works API failed: ${response.message ?? response.result}`);
  }
  return (response.data?.photoList?.photoItems ?? [])
    .map(parseVideo)
    .filter((item): item is KuaishouAiComicVideo => {
      if (!item) return false;
      const date = item.publish_time.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
      return (!options.from || date >= options.from) && (!options.to || date <= options.to);
    });
}

function parseVideo(row: RawPhoto): KuaishouAiComicVideo | null {
  if (!row.photoId || !row.publishTime) return null;
  const publishTime = new Date(row.publishTime);
  if (Number.isNaN(publishTime.getTime())) return null;
  return {
    item_id: row.photoId,
    publish_time: publishTime,
    description: row.title ?? null,
    cover_url: row.cover ?? null,
    view_count: numberOrNull(row.playCount),
    like_count: numberOrNull(row.likeCount),
    comment_count: numberOrNull(row.commentCount),
    share_count: numberOrNull(row.shareCount),
    favorite_count: numberOrNull(row.collectCount),
    subscribe_count: numberOrNull(row.followCount),
    raw: row as Record<string, unknown>,
  };
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
