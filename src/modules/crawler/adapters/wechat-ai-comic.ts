import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const POST_LIST = "/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/post_list";
const DAILY = "/micro/statistic/cgi-bin/mmfinderassistant-bin/statistic/new_post_total_data";
interface Metric {
  play: number | null;
  like: number | null;
  comment: number | null;
  share: number | null;
  fans: number | null;
}
export interface WechatAiComicVideo {
  item_id: string;
  publish_time: Date;
  description: string | null;
  cover_url: string | null;
  metrics: Metric;
  raw: Record<string, unknown>;
}
export interface WechatAiComicDaily {
  metric_date: string;
  values: Metric;
  raw: Record<string, unknown>;
}

export async function fetchWechatAiComic(
  page: Page,
): Promise<{ works: WechatAiComicVideo[]; daily: WechatAiComicDaily[] }> {
  const result = await page.evaluate(
    async ({ postList, daily }) => {
      const common = {
        timestamp: String(Date.now()),
        _log_finder_uin: "",
        _log_finder_id: "",
        rawKeyBuff: "",
        pluginSessionId: null,
        scene: 7,
        reqScene: 7,
      };
      const postTexts: string[] = [];
      let postStatus = 200;
      const now = Math.floor(Date.now() / 1000);
      // The statistics endpoint can lag for newly published posts when queried
      // with the all-time window. Fetch a recent window as well and merge by ID.
      for (const startTime of [0, now - 30 * 86400]) {
        for (let currentPage = 1; currentPage <= 100; currentPage++) {
          const post = await fetch(postList, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              pageSize: 100,
              currentPage,
              sort: 0,
              order: 0,
              startTime,
              endTime: now + 2 * 86400,
              ...common,
            }),
          });
          postStatus = post.status;
          const text = await post.text();
          postTexts.push(text);
          const parsed = JSON.parse(text) as { data?: { list?: unknown[]; totalCount?: number } };
          if (
            (parsed.data?.list?.length ?? 0) < 100 ||
            currentPage * 100 >= (parsed.data?.totalCount ?? 0)
          )
            break;
        }
      }
      const today = Math.floor(Date.now() / 1000);
      const startTs = today - 7 * 86400;
      const trend = await fetch(daily, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startTs: String(startTs),
          endTs: String(today + 86400),
          interval: 3,
          ...common,
        }),
      });
      return {
        postStatus,
        postTexts,
        dailyStatus: trend.status,
        dailyText: await trend.text(),
        dailyStartTs: startTs,
      };
    },
    { postList: POST_LIST, daily: DAILY },
  );
  if (
    result.postStatus === 401 ||
    result.postStatus === 403 ||
    result.dailyStatus === 401 ||
    result.dailyStatus === 403
  )
    throw new CookieExpiredError("Wechat creator statistics auth failed");
  const posts = result.postTexts.map((text) => JSON.parse(text) as PostResponse);
  const failedPost = posts.find((post) => post.errCode !== 0);
  if (failedPost)
    throw new Error(`Wechat post_list failed: ${failedPost.errMsg ?? failedPost.errCode}`);
  const works = [
    ...new Map(
      posts.flatMap((post) => post.data?.list ?? []).map((row) => [String(row.objectId), row]),
    ).values(),
  ]
    .map((row) => ({
      item_id: String(row.objectId),
      publish_time: new Date(Number(row.createTime) * 1000),
      description: row.desc?.description ?? null,
      cover_url: row.desc?.media?.[0]?.coverUrl ?? row.desc?.media?.[0]?.thumbUrl ?? null,
      metrics: {
        play: num(row.readCount),
        like: num(row.likeCount),
        comment: num(row.commentCount),
        share: num(row.forwardAggregationCount ?? row.forwardCount),
        fans: num(row.followCount),
      },
      raw: row as unknown as Record<string, unknown>,
    }))
    .filter((row) => !Number.isNaN(row.publish_time.getTime()));
  const trend = JSON.parse(result.dailyText) as DailyResponse;
  if (trend.errCode !== 0)
    throw new Error(`Wechat daily statistics failed: ${trend.errMsg ?? trend.errCode}`);
  const all = trend.data?.dataByFanstype?.[0]?.dataByTabtype?.find((x) => x.tabType === 999)?.data;
  const dates = all?.browse ?? [];
  const dailyRows = dates
    .map((_, i) => {
      const date = new Date((result.dailyStartTs + i * 86400) * 1000).toLocaleDateString("en-CA", {
        timeZone: "Asia/Shanghai",
      });
      return {
        metric_date: date,
        values: {
          play: num(all?.browse?.[i]),
          like: num(all?.like?.[i]),
          comment: num(all?.comment?.[i]),
          share: num(all?.forwardAggregation?.[i]),
          fans: num(all?.follow?.[i]),
        },
        raw: { index: i },
      };
    })
    .filter((x) => x.values.play !== null || x.values.like !== null);
  return { works, daily: dailyRows };
}
function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
interface PostRow {
  objectId: string | number;
  createTime: number;
  readCount?: number;
  likeCount?: number;
  commentCount?: number;
  forwardCount?: number;
  forwardAggregationCount?: number;
  followCount?: number;
  desc?: { description?: string; media?: { coverUrl?: string; thumbUrl?: string }[] };
  [key: string]: unknown;
}
interface PostResponse {
  errCode: number;
  errMsg?: string;
  data?: { list?: PostRow[] };
}
interface DailyResponse {
  errCode: number;
  errMsg?: string;
  data?: {
    dataByFanstype?: { dataByTabtype?: { tabType: number; data?: Record<string, string[]> }[] }[];
  };
}
