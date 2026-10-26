import "server-only";
import type { Page } from "puppeteer-core";
import { CookieExpiredError } from "@/lib/puppeteer";

const ARCHIVES = "/x/web/archives";
const OVERVIEW = "/x/web/data/archive_diagnose/overview";

export interface BilibiliAiComicVideo {
  item_id: string;
  publish_time: Date;
  description: string | null;
  cover_url: string | null;
  duration_ms: number | null;
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
  favorite_count: number | null;
  danmaku_count: number | null;
  coin_count: number | null;
  subscribe_count: number | null;
  unsubscribe_count: number | null;
  raw: Record<string, unknown>;
}

interface ArchiveRow {
  Archive?: {
    aid?: number;
    bvid?: string;
    title?: string;
    desc?: string;
    cover?: string;
    duration?: number;
    ptime?: number;
    ctime?: number;
  };
  stat?: {
    view?: number;
    vv?: number;
    like?: number;
    reply?: number;
    share?: number;
    favorite?: number;
    danmaku?: number;
    coin?: number;
  };
  detailStat?: {
    fan?: number;
    unfollow?: number;
    play_avg_duration?: number;
  } | null;
}

interface BrowserResult {
  status: number;
  code: number;
  message?: string;
  rows: ArchiveRow[];
}

export async function fetchBilibiliAiComicVideos(page: Page): Promise<BilibiliAiComicVideo[]> {
  const result = await page.evaluate(
    async ({ archivesEndpoint, overviewEndpoint }) => {
      const rows: ArchiveRow[] = [];
      let status = 200;
      let responseCode = 0;
      let message = "";
      const pageSize = 50;

      for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
        const params = new URLSearchParams({
          status: "is_pubing,pubed,not_pubed",
          pn: String(pageNumber),
          ps: String(pageSize),
          coop: "1",
          interactive: "1",
        });
        const response = await fetch(`${archivesEndpoint}?${params}`, { credentials: "include" });
        status = response.status;
        const body = (await response.json()) as {
          code?: number;
          message?: string;
          data?: {
            arc_audits?: ArchiveRow[];
            page?: { count?: number };
          };
        };
        responseCode = body.code ?? -1;
        message = body.message ?? "";
        if (!response.ok || responseCode !== 0) break;
        const pageRows = body.data?.arc_audits ?? [];
        rows.push(...pageRows);
        const total = body.data?.page?.count ?? rows.length;
        if (pageRows.length < pageSize || rows.length >= total) break;
      }

      if (status >= 400 || responseCode !== 0) {
        return { status, code: responseCode, message, rows: [] } satisfies BrowserResult;
      }

      for (let index = 0; index < rows.length; index += 5) {
        const chunk = rows.slice(index, index + 5);
        await Promise.all(
          chunk.map(async (row) => {
            const bvid = row.Archive?.bvid;
            if (!bvid) return;
            try {
              const response = await fetch(`${overviewEndpoint}?${new URLSearchParams({ bvid })}`, {
                credentials: "include",
              });
              const body = (await response.json()) as {
                code?: number;
                data?: { stat?: ArchiveRow["detailStat"] };
              };
              if (response.ok && body.code === 0) row.detailStat = body.data?.stat ?? null;
            } catch {
              // Core work metrics still remain usable when one detail request fails.
            }
          }),
        );
      }

      return { status, code: responseCode, message, rows } satisfies BrowserResult;
    },
    { archivesEndpoint: ARCHIVES, overviewEndpoint: OVERVIEW },
  );

  if (result.status === 401 || result.status === 403 || result.code === -101) {
    throw new CookieExpiredError(`Bilibili creator auth failed (${result.status}/${result.code})`);
  }
  if (result.code !== 0) {
    throw new Error(`Bilibili archives API failed: ${result.message || result.code}`);
  }

  return result.rows
    .map(parseVideo)
    .filter((row): row is BilibiliAiComicVideo => row !== null)
    .filter((row) => hasEpisodeMarker(row.description));
}

function hasEpisodeMarker(description: string | null): boolean {
  return /\bep\s*\.?\s*\d+/i.test(description ?? "");
}

function parseVideo(row: ArchiveRow): BilibiliAiComicVideo | null {
  const archive = row.Archive;
  if (!archive?.bvid) return null;
  const publishedSeconds = numberOrNull(archive.ptime) ?? numberOrNull(archive.ctime);
  if (!publishedSeconds) return null;
  const publishTime = new Date(publishedSeconds * 1000);
  if (Number.isNaN(publishTime.getTime())) return null;
  const stat = row.stat ?? {};
  return {
    item_id: archive.bvid,
    publish_time: publishTime,
    description: archive.title ?? archive.desc ?? null,
    cover_url: archive.cover?.replace(/^http:\/\//, "https://") ?? null,
    duration_ms: numberOrNull(archive.duration) === null ? null : Number(archive.duration) * 1000,
    view_count: numberOrNull(stat.view ?? stat.vv),
    like_count: numberOrNull(stat.like),
    comment_count: numberOrNull(stat.reply),
    share_count: numberOrNull(stat.share),
    favorite_count: numberOrNull(stat.favorite),
    danmaku_count: numberOrNull(stat.danmaku),
    coin_count: numberOrNull(stat.coin),
    subscribe_count: numberOrNull(row.detailStat?.fan),
    unsubscribe_count: numberOrNull(row.detailStat?.unfollow),
    raw: {
      archive,
      stat,
      detailStat: row.detailStat ?? null,
    },
  };
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
