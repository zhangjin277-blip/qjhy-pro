import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const LIST_ENDPOINT = "/api/galaxy/creator/datacenter/note/analyze/list";
const DETAIL_ENDPOINT = "/api/galaxy/creator/datacenter/note/base";

export interface XiaohongshuAiComicVideo {
  item_id: string;
  publish_time: Date;
  description: string | null;
  cover_url: string | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  danmaku_count: number | null;
  subscribe_count: number | null;
  avg_view_second: number | null;
  completion_rate: number | null;
  completion_rate_5s: number | null;
  bounce_rate_2s: number | null;
  cover_click_rate: number | null;
  raw: Record<string, unknown>;
}

interface RawNote {
  id?: string;
  title?: string;
  cover_url?: string;
  post_time?: number;
  read_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  fav_count?: number;
  danmaku_count?: number;
  increase_fans_count?: number;
  view_time_avg?: number;
  coverClickRate?: number;
  detail?: RawDetail;
  [key: string]: unknown;
}

interface RawDetail {
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  collect_count?: number;
  danmaku_count?: number;
  rise_fans_count?: number;
  view_time_avg?: number;
  view_time_avg_with_double?: number;
  full_view_rate?: number;
  finish5s_rate?: number;
  exit_view2s_rate?: number;
  cover_click_rate?: number;
  [key: string]: unknown;
}

interface BrowserResult {
  status: number;
  code: number;
  success: boolean;
  message: string;
  rows: RawNote[];
}

export async function fetchXiaohongshuAiComicVideos(
  page: Page,
): Promise<XiaohongshuAiComicVideo[]> {
  const result = await page.evaluate(
    async ({ listEndpoint, detailEndpoint }) => {
      const rows: RawNote[] = [];
      const pageSize = 20;
      let status = 200;
      let code = 0;
      let success = true;
      let message = "";

      for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
        const url = `${listEndpoint}?${new URLSearchParams({
          type: "0",
          page_size: String(pageSize),
          page_num: String(pageNumber),
        })}`;
        const signer = (
          window as unknown as {
            _webmsxyw?: (value: string) => { "X-s"?: string; "X-t"?: string };
          }
        )._webmsxyw;
        if (typeof signer !== "function") {
          return { status: 0, code: -1, success: false, message: "signer unavailable", rows };
        }
        const signed = signer(url);
        const response = await fetch(url, {
          credentials: "include",
          headers: { "X-s": signed["X-s"] ?? "", "X-t": signed["X-t"] ?? "" },
        });
        status = response.status;
        const body = (await response.json()) as {
          success?: boolean;
          code?: number;
          msg?: string;
          message?: string;
          data?: { total?: number; note_infos?: RawNote[] };
        };
        code = body.code ?? 0;
        success = body.success !== false && code === 0;
        message = body.msg ?? body.message ?? "";
        if (!response.ok || !success) break;
        const pageRows = body.data?.note_infos ?? [];
        rows.push(...pageRows);
        const total = body.data?.total ?? rows.length;
        if (pageRows.length < pageSize || rows.length >= total) break;
      }

      if (success) {
        for (let index = 0; index < rows.length; index += 5) {
          await Promise.all(
            rows.slice(index, index + 5).map(async (row) => {
              if (!row.id) return;
              try {
                const url = `${detailEndpoint}?${new URLSearchParams({ note_id: row.id })}`;
                const signer = (
                  window as unknown as {
                    _webmsxyw?: (value: string) => { "X-s"?: string; "X-t"?: string };
                  }
                )._webmsxyw;
                if (typeof signer !== "function") return;
                const signed = signer(url);
                const response = await fetch(url, {
                  credentials: "include",
                  headers: { "X-s": signed["X-s"] ?? "", "X-t": signed["X-t"] ?? "" },
                });
                const body = (await response.json()) as {
                  success?: boolean;
                  code?: number;
                  data?: RawDetail;
                };
                if (response.ok && body.success !== false && (body.code ?? 0) === 0 && body.data) {
                  const { day: _day, hour: _hour, ...detail } = body.data;
                  row.detail = detail;
                }
              } catch {
                // A single detail request must not discard the complete works list.
              }
            }),
          );
        }
      }
      return { status, code, success, message, rows } satisfies BrowserResult;
    },
    { listEndpoint: LIST_ENDPOINT, detailEndpoint: DETAIL_ENDPOINT },
  );

  if (result.status === 401 || result.status === 403 || result.status === 406) {
    throw new CookieExpiredError(
      `Xiaohongshu creator auth failed (${result.status}/${result.code})`,
    );
  }
  if (!result.success) {
    throw new Error(`Xiaohongshu works API failed: ${result.message || result.code}`);
  }
  return result.rows.map(parseVideo).filter((row): row is XiaohongshuAiComicVideo => row !== null);
}

function parseVideo(row: RawNote): XiaohongshuAiComicVideo | null {
  if (!row.id || !row.post_time) return null;
  const publishTime = new Date(row.post_time);
  if (Number.isNaN(publishTime.getTime())) return null;
  const detail = row.detail;
  return {
    item_id: row.id,
    publish_time: publishTime,
    description: row.title ?? null,
    cover_url: row.cover_url?.replace(/^http:\/\//, "https://") ?? null,
    view_count: numberOrNull(detail?.view_count ?? row.read_count),
    like_count: numberOrNull(detail?.like_count ?? row.like_count),
    comment_count: numberOrNull(detail?.comment_count ?? row.comment_count),
    share_count: numberOrNull(detail?.share_count ?? row.share_count),
    favorite_count: numberOrNull(detail?.collect_count ?? row.fav_count),
    danmaku_count: numberOrNull(detail?.danmaku_count ?? row.danmaku_count),
    subscribe_count: numberOrNull(detail?.rise_fans_count ?? row.increase_fans_count),
    avg_view_second: numberOrNull(
      detail?.view_time_avg_with_double ?? detail?.view_time_avg ?? row.view_time_avg,
    ),
    completion_rate: rateOrNull(detail?.full_view_rate),
    completion_rate_5s: rateOrNull(detail?.finish5s_rate),
    bounce_rate_2s: rateOrNull(detail?.exit_view2s_rate),
    cover_click_rate: rateOrNull(detail?.cover_click_rate ?? row.coverClickRate),
    raw: row,
  };
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rateOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  if (number === null) return null;
  return number > 1 ? number / 100 : number;
}
