import { db } from "@/db/client";
import { kuaishou_live_session, kuaishou_member } from "@/db/schema";
import { eq } from "drizzle-orm";
import { openKuaishouPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  fetchKuaishouTodayLiveSessions,
  type KuaishouTodayLiveRaw,
} from "@/modules/crawler/server";

interface SyncResult {
  total: number;
  inserted: number;
  updated: number;
  skippedHistory: number; // 已经被 history 升级的不动
  newMembers: number; // today-live 出现但 kuaishou_member 表里没有 → 补 stub
}

/**
 * 同步 today/list 到 kuaishou_live_session（data_source='today'，实时数据）。
 * 每 30 分钟跑一次，只覆盖 data_source='today' 的 row（避免覆盖已升级为 history 的权威数据）。
 *
 * 字段映射：
 *   today.liveId            → live_stream_id
 *   today.acu               → valid_acu
 *   today.maxOnlineNum      → max_concurrent_user_num
 *   today.totalOnlineNum    → play_user_cnt
 *   today.avgOnlineDuration → per_play_time_avg_ms
 *   today.startTime(ms)     → start_datetime
 *   today.endTime(ms)       → end_datetime
 *   today.liveDuration(ms)  → live_duration_ms
 *   today.liveTitle         → title
 *   today.punishCnt         → report_num
 *   ...
 *
 * today 独有 17 字段（推广 / 画像 / 主播分级 / 状态）→ today_extra jsonb
 *
 * 注意：history 不提供有效观看率 / 涨粉等深度指标，today 同步时这些列保持 null。
 */
export async function syncKuaishouTodayLiveSessionsHandler(): Promise<SyncResult> {
  const cookies = await getActiveCookies("kuaishou");
  const page = await openKuaishouPage(cookies);

  try {
    const list = await fetchKuaishouTodayLiveSessions(page);
    console.log(`[today-live] fetched ${list.length} sessions`);

    // today-live 可能包含 kuaishou_member 表里没有的主播（未签约 / 新加入的）
    // 02:30 cron 只 sync 公会签约成员，跟 today-live 的"全部开播主播"有差集。
    // 必须先 ensure FK 目标存在，否则 INSERT live_session 会违反外键约束。
    const newMembers = await ensureMembersExist(list);
    if (newMembers > 0) {
      console.log(`[today-live] upserted ${newMembers} stub members`);
    }

    let inserted = 0;
    let updated = 0;
    let skippedHistory = 0;

    for (const r of list) {
      // 先看现有 row 是否已被 history 升级
      const existing = await db
        .select({
          data_source: kuaishou_live_session.data_source,
        })
        .from(kuaishou_live_session)
        .where(eq(kuaishou_live_session.live_stream_id, BigInt(r.liveId)))
        .limit(1);
      if (existing[0]?.data_source === "history") {
        skippedHistory++;
        continue;
      }

      const values = mapRowToValues(r);
      const result = await db
        .insert(kuaishou_live_session)
        .values(values)
        .onConflictDoUpdate({
          target: kuaishou_live_session.live_stream_id,
          set: {
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
            live_duration_ms: values.live_duration_ms,
            play_user_cnt: values.play_user_cnt,
            max_concurrent_user_num: values.max_concurrent_user_num,
            valid_acu: values.valid_acu,
            per_play_time_avg_ms: values.per_play_time_avg_ms,
            like_cnt: values.like_cnt,
            comment_cnt: values.comment_cnt,
            share_cnt: values.share_cnt,
            send_gift_uv: values.send_gift_uv,
            live_amt: values.live_amt,
            report_num: values.report_num,
            today_extra: values.today_extra,
            data_source: "today",
            raw: values.raw,
            synced_at: values.synced_at,
            updated_at: values.updated_at,
          },
        })
        .returning({
          live_stream_id: kuaishou_live_session.live_stream_id,
          created_at: kuaishou_live_session.created_at,
        });
      const row = result[0];
      if (row && Date.now() - row.created_at.getTime() < 5000) inserted++;
      else updated++;
    }

    const summary: SyncResult = {
      total: list.length,
      inserted,
      updated,
      skippedHistory,
      newMembers,
    };
    console.log("[sync-kuaishou-today-live] done", summary);
    return summary;
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired("kuaishou");
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: `[kuaishou-today-live] ${e.message}`,
        action: "Admin 扫码续期快手机构后台",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `sync-kuaishou-today-live failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}

/**
 * today-live 返回的主播可能不在 kuaishou_member 表（未签约 / 新加入）。
 * INSERT live_session 前先 upsert 一条 stub 进 kuaishou_member 满足 FK 约束，
 * 等下次 02:30 sync-kuaishou-members 会用机构后台权威字段覆盖（onConflictDoUpdate）。
 * 返回新插入的成员数（仅 stat 用）。
 */
async function ensureMembersExist(list: KuaishouTodayLiveRaw[]): Promise<number> {
  // 同一 today-live 批次里同一 memberId 可能多次出现（每场直播一行），去重
  const seen = new Map<string, KuaishouTodayLiveRaw>();
  for (const r of list) seen.set(String(r.memberId), r);
  if (seen.size === 0) return 0;

  const now = new Date();
  const values = [...seen.entries()].map(([userId, r]) => ({
    user_id: userId,
    member_name: r.memberName,
    avatar: r.headImg,
    raw: {} as Record<string, unknown>,
    synced_at: now,
    updated_at: now,
  }));

  // member 已存在的不动其他字段（02:30 sync 跑过的字段权威），仅 stub 缺失行
  const result = await db
    .insert(kuaishou_member)
    .values(values)
    .onConflictDoNothing({ target: kuaishou_member.user_id })
    .returning({ user_id: kuaishou_member.user_id });
  return result.length;
}

function mapRowToValues(r: KuaishouTodayLiveRaw) {
  return {
    live_stream_id: BigInt(r.liveId),
    member_id: String(r.memberId),
    member_name: r.memberName,
    head_img: r.headImg,
    broker_id: r.brokerId !== null ? BigInt(r.brokerId) : null,
    broker_name: r.brokerName,
    fans_cnt: r.fansCnt,
    live_type: r.liveType,
    title: r.liveTitle,
    cover_url: r.coverUrl,
    live_detail: r.liveDetail,
    start_datetime: new Date(r.startTime),
    end_datetime: r.endTime ? new Date(r.endTime) : null,
    live_duration_ms: r.liveDuration,
    play_user_cnt: r.totalOnlineNum,
    max_concurrent_user_num: r.maxOnlineNum,
    valid_acu: r.acu,
    per_play_time_avg_ms: r.avgOnlineDuration,
    like_cnt: r.likeCnt,
    comment_cnt: r.commentCnt,
    share_cnt: r.shareCnt,
    send_gift_uv: r.sendGiftUv,
    live_amt: r.liveAmt,
    report_num: r.punishCnt,
    today_extra: {
      // 推广字段已删（业务不需要）。如需补回，从 today raw 字段抽取
      fansMostAge: r.fansMostAge,
      fansRate: r.fansRate,
      fansMaleRate: r.fansMaleRate,
      fansMostProvince: r.fansMostProvince,
      authorTypeEnum: r.authorTypeEnum,
      authorType: r.authorType,
      ratio: r.ratio,
      hasPromote: r.hasPromote,
      hasPunish: r.hasPunish,
      settleInTime: r.settleInTime,
      settleProvince: r.settleProvince,
    },
    data_source: "today" as const,
    raw: r as unknown as Record<string, unknown>,
    synced_at: new Date(),
    updated_at: new Date(),
  };
}
