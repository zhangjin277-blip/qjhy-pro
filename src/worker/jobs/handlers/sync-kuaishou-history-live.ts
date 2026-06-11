import { db } from "@/db/client";
import { kuaishou_live_session } from "@/db/schema";
import { sql } from "drizzle-orm";
import { openKuaishouPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchKuaishouHistoryLiveSessions,
  parseLiveAmt,
  type KuaishouHistoryLiveRaw,
} from "@/modules/crawler/server";

interface SyncResult {
  fromDate: string;
  toDate: string;
  total: number;
  inserted: number;
  updated: number;
}

interface RowFailure {
  id: unknown;
  error: string;
}

/**
 * 逐行容错后的失败汇总：
 * - 部分失败 → notifyCrawlerError 告警，不中断（其余行已入库）
 * - 全部失败 → 抛错，由外层 catch 统一告警 + rethrow，让 pg-boss 标记任务失败并重试
 */
async function reportRowFailures(
  job: string,
  failures: RowFailure[],
  total: number,
): Promise<void> {
  const sample = failures
    .slice(0, 3)
    .map((f) => `${String(f.id)}: ${f.error}`)
    .join("; ");
  const detail = `${job}: ${failures.length}/${total} 条写入失败，其余已入库。样本: ${sample}`;
  if (total > 0 && failures.length === total) {
    throw new Error(detail);
  }
  await notifyCrawlerError({ type: "job_failed", detail });
}

interface Options {
  /** ISO date "YYYY-MM-DD"。默认昨天 - 1 天（覆盖 D-2 ~ D-1）*/
  fromDate?: string;
  toDate?: string;
}

function dateToStartMs(d: string): number {
  return new Date(`${d}T00:00:00+08:00`).getTime();
}
function dateToEndMs(d: string): number {
  return new Date(`${d}T23:59:59.999+08:00`).getTime();
}

/** 把 [from, to] 按自然月切成多段（避免 API 单响应 ~1000 条 cap） */
function splitByMonth(from: string, to: string): [string, string][] {
  const segments: [string, string][] = [];
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(`${to}T00:00:00+08:00`);
  let cur = new Date(start);
  while (cur <= end) {
    // 当月最后一天
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const segEnd = monthEnd > end ? end : monthEnd;
    const fromIso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const toIso = `${segEnd.getFullYear()}-${String(segEnd.getMonth() + 1).padStart(2, "0")}-${String(segEnd.getDate()).padStart(2, "0")}`;
    segments.push([fromIso, toIso]);
    // 下个月 1 号
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return segments;
}

/**
 * 同步 history/list 到 kuaishou_live_session（data_source='history'，权威数据）。
 * 默认每日凌晨跑：覆盖 D-2 ~ D-1（容错重叠）。
 * 全年回填：fromDate='2026-01-01' toDate=今天。
 *
 * UPSERT 策略：history 数据是权威，会覆盖之前的 today 数据，但保留 today_extra（推广 / 画像）。
 */
export async function syncKuaishouHistoryLiveSessionsHandler(
  opts: Options = {},
): Promise<SyncResult> {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // CST today
  const yesterday = new Date(Date.now() - 86400_000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const dayBeforeYesterday = new Date(Date.now() - 2 * 86400_000 + 8 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);

  const fromDate = opts.fromDate ?? dayBeforeYesterday;
  const toDate = opts.toDate ?? yesterday;
  void today;

  const cookies = await getActiveCookies("kuaishou");
  const page = await openKuaishouPage(cookies);

  try {
    console.log(`[history-live] window ${fromDate} ~ ${toDate}`);

    // API 单次响应有 ~1000 条 cap，跨月会截断。按月分段拉。
    const segments = splitByMonth(fromDate, toDate);
    console.log(`[history-live] split into ${segments.length} monthly segments`);

    const list: Awaited<ReturnType<typeof fetchKuaishouHistoryLiveSessions>> = [];
    for (const [segFrom, segTo] of segments) {
      console.log(`[history-live] segment ${segFrom} ~ ${segTo}`);
      const segList = await fetchKuaishouHistoryLiveSessions(
        page,
        dateToStartMs(segFrom),
        dateToEndMs(segTo),
      );
      list.push(...segList);
    }
    console.log(`[history-live] fetched ${list.length} sessions total`);

    let inserted = 0;
    let updated = 0;
    const failures: RowFailure[] = [];

    for (const r of list) {
      try {
        const values = mapRowToValues(r);
        const result = await db
          .insert(kuaishou_live_session)
          .values(values)
          .onConflictDoUpdate({
            target: kuaishou_live_session.live_stream_id,
            set: {
              // 全部 73 字段覆盖，但保留 today_extra（推广 / 画像，今日 sync 时填的）
              member_name: values.member_name,
              head_img: values.head_img,
              broker_id: values.broker_id,
              broker_name: values.broker_name,
              fans_cnt: values.fans_cnt,
              live_type: values.live_type,
              title: values.title,
              cover_url: values.cover_url,
              live_detail: values.live_detail,
              start_datetime: values.start_datetime,
              end_datetime: values.end_datetime,
              live_duration_text: values.live_duration_text,
              live_duration_ms: values.live_duration_ms,
              play_uv: values.play_uv,
              play_user_cnt: values.play_user_cnt,
              max_concurrent_user_num: values.max_concurrent_user_num,
              valid_acu: values.valid_acu,
              play_rate: values.play_rate,
              per_play_time_avg_text: values.per_play_time_avg_text,
              per_play_time_avg_ms: values.per_play_time_avg_ms,
              valid_play_duration_avg_text: values.valid_play_duration_avg_text,
              live_cover_ctr: values.live_cover_ctr,
              add_fans_cnt: values.add_fans_cnt,
              follow_author_num: values.follow_author_num,
              cancel_follow_author_num: values.cancel_follow_author_num,
              transfer_fans_rate: values.transfer_fans_rate,
              fans_club_cnt: values.fans_club_cnt,
              like_cnt: values.like_cnt,
              like_rate: values.like_rate,
              like_uv: values.like_uv,
              comment_cnt: values.comment_cnt,
              comment_rate: values.comment_rate,
              comment_uv: values.comment_uv,
              share_cnt: values.share_cnt,
              share_rate: values.share_rate,
              share_uv: values.share_uv,
              interact_num: values.interact_num,
              interact_rate: values.interact_rate,
              send_gift_uv: values.send_gift_uv,
              sent_gift_cnt: values.sent_gift_cnt,
              live_amt: values.live_amt,
              live_video_amt: values.live_video_amt,
              live_chat_room_amt: values.live_chat_room_amt,
              report_num: values.report_num,
              report_rate: values.report_rate,
              data_source: "history",
              raw: values.raw,
              synced_at: values.synced_at,
              updated_at: values.updated_at,
              // today_extra 不动（保留）
            },
          })
          .returning({
            live_stream_id: kuaishou_live_session.live_stream_id,
            created_at: kuaishou_live_session.created_at,
          });
        const row = result[0];
        if (row && Date.now() - row.created_at.getTime() < 5000) inserted++;
        else updated++;
      } catch (rowErr) {
        // 单条解析 / 写库失败（脏 liveStreamId、字段超长等）→ 记录后继续，不中断整批
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        failures.push({ id: r.liveStreamId, error: msg });
        console.error(`[history-live] row failed (liveStreamId=${String(r.liveStreamId)}): ${msg}`);
      }
    }

    // 有失败行：汇总告警；全部失败才视为任务失败（rethrow → pg-boss 重试）
    if (failures.length > 0) {
      await reportRowFailures("sync-kuaishou-history-live", failures, list.length);
    }

    const summary: SyncResult = {
      fromDate,
      toDate,
      total: list.length,
      inserted,
      updated,
    };
    console.log("[sync-kuaishou-history-live] done", summary);
    return summary;
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[kuaishou-history-live] ${e.message}`,
        action: "Admin 扫码续期快手机构后台",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-kuaishou-history-live failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}

/** 解析 "6分钟49秒" / "1小时23分钟45秒" → ms。无法解析返回 null。 */
function parseDurationText(text: string | null | undefined): number | null {
  if (!text) return null;
  let ms = 0;
  const h = /(\d+)小时/.exec(text);
  const m = /(\d+)分钟?/.exec(text);
  const s = /(\d+)秒/.exec(text);
  if (h?.[1]) ms += Number(h[1]) * 3600_000;
  if (m?.[1]) ms += Number(m[1]) * 60_000;
  if (s?.[1]) ms += Number(s[1]) * 1000;
  return ms > 0 ? ms : null;
}

/** 映射 history API 字段到 db schema 列 */
function mapRowToValues(r: KuaishouHistoryLiveRaw) {
  const startTs = new Date(r.startDatetime.replace(" ", "T"));
  const endTs = r.endDatetime ? new Date(r.endDatetime.replace(" ", "T")) : null;
  return {
    live_stream_id: BigInt(r.liveStreamId),
    member_id: String(r.memberId),
    member_name: r.memberName,
    head_img: r.headImg,
    broker_id: r.brokerId !== null ? BigInt(r.brokerId) : null,
    broker_name: r.brokerName,
    fans_cnt: r.fansCnt,
    live_type: r.liveType,
    title: r.title,
    cover_url: r.coverUrl,
    live_detail: r.liveDetail,
    start_datetime: startTs,
    end_datetime: endTs,
    live_duration_text: r.liveDuration,
    // history API 的 liveDurationMillis 经常返回 0，自算更稳（end - start）
    live_duration_ms: r.liveDurationMillis || (endTs ? endTs.getTime() - startTs.getTime() : null),
    play_uv: r.playUv,
    play_user_cnt: r.playUserCnt,
    max_concurrent_user_num: r.maxConcurrentUserNum,
    valid_acu: r.validAcu,
    play_rate: r.playRate,
    per_play_time_avg_text: r.perPalyTimeAvg,
    // history API 的 perPalyTimeAvgMillis 总是 0，真实数据在 perPalyTimeAvg 字符串里 ("6分钟49秒")
    per_play_time_avg_ms: r.perPalyTimeAvgMillis || parseDurationText(r.perPalyTimeAvg),
    valid_play_duration_avg_text: r.validPlayDurationAvg,
    live_cover_ctr: r.liveCoverCtr,
    add_fans_cnt: r.addFansCnt,
    follow_author_num: r.followAuthorNum,
    cancel_follow_author_num: r.cancelFollowAuthorNum,
    transfer_fans_rate: r.transferFansRate,
    fans_club_cnt: r.fansClubCnt,
    like_cnt: r.likeCnt,
    like_rate: r.likeRate,
    like_uv: r.likeUv,
    comment_cnt: r.commentCnt,
    comment_rate: r.commentRate,
    comment_uv: r.commentUv,
    share_cnt: r.shareCnt,
    share_rate: r.shareRate,
    share_uv: r.shareUv,
    interact_num: r.interactNum,
    interact_rate: r.interactRate,
    send_gift_uv: r.sendGiftUv,
    sent_gift_cnt: r.sentGiftCnt,
    live_amt: parseLiveAmt(r.liveAmt),
    live_video_amt: r.liveVideoAmt,
    live_chat_room_amt: r.liveChatRoomAmt,
    report_num: r.reportNum,
    report_rate: r.reportRate,
    data_source: "history" as const,
    raw: r as unknown as Record<string, unknown>,
    synced_at: new Date(),
    updated_at: new Date(),
  };
}

void sql; // suppress unused
