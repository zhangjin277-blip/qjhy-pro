import "server-only";
import { db } from "@/db/client";
import { and, desc, eq, sql } from "drizzle-orm";
import { live_session_log, live_account, dingtalk_user } from "@/db/schema";

/**
 * 主播部门 ID 白名单（dingtalk_dept）。
 * 当前硬编码，后期可改 admin 配置。
 *   合作主播：
 *     728935814 = 合作主播
 *     928732653 = 合作主播 / 一组
 *     929188023 = 合作主播 / 三组
 *     932021044 = 合作主播 / 二组
 *   运营（含捕鱼运营，方便运营自己测打卡）：
 *     728909874 = 运营
 *     1071549417 = 运营 / 一组
 *     1072488184 = 运营 / 二组
 *     1072767044 = 运营 / 三组
 */
const ANCHOR_DEPT_IDS = [
  "728935814",
  "928732653",
  "929188023",
  "932021044",
  "728909874",
  "1071549417",
  "1072488184",
  "1072767044",
];

/** 个人白名单（非主播部门但允许扫码，admin / 业务负责人 / 测试） */
const ANCHOR_USER_IDS_ALLOW = [
  "0526301817793094", // 张锦
];

export interface CheckinAccount {
  id: string;
  account_name: string;
  platform: string;
  platform_account_id: string | null;
  avatar: string | null;
  placement_label: string | null;
}

export interface CheckinCurrent {
  session_id: string;
  anchor_dingtalk_user_id: string;
  anchor_name: string;
  start_at: string; // ISO
  duration_seconds: number;
}

export interface CheckinRecent {
  session_id: string;
  anchor_dingtalk_user_id: string;
  anchor_name: string;
  start_at: string;
  end_at: string | null;
  duration_seconds: number | null;
  status: string;
  closed_by: string | null;
}

export interface CheckinState {
  account: CheckinAccount;
  current: CheckinCurrent | null;
  recent: CheckinRecent[];
}

/** 检查 dingtalk_user 是否是主播（dept_ids 跟主播部门白名单有交集，或在个人白名单） */
export async function isAnchor(dingtalkUserId: string): Promise<boolean> {
  if (ANCHOR_USER_IDS_ALLOW.includes(dingtalkUserId)) return true;
  const [user] = await db
    .select({ dept_ids: dingtalk_user.dept_ids })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, dingtalkUserId));
  if (!user) return false;
  const depts = (user.dept_ids ?? []) as string[];
  return depts.some((d) => ANCHOR_DEPT_IDS.includes(d));
}

/** 拿账号当前打卡状态 */
export async function getCheckinState(liveAccountId: string): Promise<CheckinState | null> {
  const [account] = await db
    .select({
      id: live_account.id,
      account_name: live_account.account_name,
      platform: live_account.platform,
      platform_account_id: live_account.platform_account_id,
      avatar: live_account.avatar,
      placement_label: live_account.placement_label,
    })
    .from(live_account)
    .where(eq(live_account.id, liveAccountId));

  if (!account) return null;

  const [currentRow] = await db
    .select({
      session_id: live_session_log.id,
      anchor_dingtalk_user_id: live_session_log.anchor_dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      start_at: live_session_log.start_at,
    })
    .from(live_session_log)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, live_session_log.anchor_dingtalk_user_id))
    .where(
      and(
        eq(live_session_log.live_account_id, liveAccountId),
        eq(live_session_log.status, "in_progress"),
      ),
    )
    .limit(1);

  const current: CheckinCurrent | null = currentRow
    ? {
        session_id: currentRow.session_id,
        anchor_dingtalk_user_id: currentRow.anchor_dingtalk_user_id,
        anchor_name: currentRow.anchor_name ?? "（已离职）",
        start_at: currentRow.start_at.toISOString(),
        duration_seconds: Math.floor((Date.now() - currentRow.start_at.getTime()) / 1000),
      }
    : null;

  const recentRows = await db
    .select({
      session_id: live_session_log.id,
      anchor_dingtalk_user_id: live_session_log.anchor_dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      start_at: live_session_log.start_at,
      end_at: live_session_log.end_at,
      duration_seconds: live_session_log.duration_seconds,
      status: live_session_log.status,
      closed_by: live_session_log.closed_by,
    })
    .from(live_session_log)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, live_session_log.anchor_dingtalk_user_id))
    .where(
      and(
        eq(live_session_log.live_account_id, liveAccountId),
        sql`${live_session_log.status} <> 'in_progress'`,
      ),
    )
    .orderBy(desc(live_session_log.start_at))
    .limit(5);

  return {
    account,
    current,
    recent: recentRows.map((r) => ({
      session_id: r.session_id,
      anchor_dingtalk_user_id: r.anchor_dingtalk_user_id,
      anchor_name: r.anchor_name ?? "（已离职）",
      start_at: r.start_at.toISOString(),
      end_at: r.end_at?.toISOString() ?? null,
      duration_seconds: r.duration_seconds,
      status: r.status,
      closed_by: r.closed_by,
    })),
  };
}

export interface StartSessionResult {
  session_id: string;
  closed_previous: {
    session_id: string;
    previous_anchor_name: string;
    duration_seconds: number;
  } | null;
  /** 同一主播在其他账号的 in_progress 被自动关掉（换账号场景） */
  closed_self_on_other_accounts: { session_id: string; live_account_id: string }[];
}

/**
 * 主播扫码开播：
 * 1. 该账号当前 in_progress 处理：
 *    - 无 → 直接 INSERT
 *    - 当前主播 = 自己 → 抛错 ALREADY_LIVE
 *    - 当前主播 = 别人 → 旧 session auto_closed_by_next + 新 INSERT
 * 2. 该主播在其他账号的 in_progress → 全部 auto_closed_by_next
 *    （业务约束：一个主播同时只能在一个账号在播）
 *
 * partial unique (live_account_id, in_progress) 防并发。
 */
export async function startSession(
  liveAccountId: string,
  anchorDingtalkUserId: string,
): Promise<StartSessionResult> {
  return await db.transaction(async (tx) => {
    // 1. 该主播在其他账号的 in_progress → 自动关
    const myOtherInProgress = await tx
      .select({
        id: live_session_log.id,
        live_account_id: live_session_log.live_account_id,
        start_at: live_session_log.start_at,
      })
      .from(live_session_log)
      .where(
        and(
          eq(live_session_log.anchor_dingtalk_user_id, anchorDingtalkUserId),
          eq(live_session_log.status, "in_progress"),
          sql`${live_session_log.live_account_id} <> ${liveAccountId}`,
        ),
      );
    const closedSelfOnOthers: StartSessionResult["closed_self_on_other_accounts"] = [];
    if (myOtherInProgress.length > 0) {
      const now = new Date();
      for (const m of myOtherInProgress) {
        const duration = Math.floor((now.getTime() - m.start_at.getTime()) / 1000);
        await tx
          .update(live_session_log)
          .set({
            end_at: now,
            duration_seconds: duration,
            status: "auto_closed_by_next",
            closed_by: "self_switch_account",
            updated_at: now,
          })
          .where(eq(live_session_log.id, m.id));
        closedSelfOnOthers.push({ session_id: m.id, live_account_id: m.live_account_id });
      }
    }

    // 2. 该账号当前 in_progress
    const [existing] = await tx
      .select({
        id: live_session_log.id,
        anchor_dingtalk_user_id: live_session_log.anchor_dingtalk_user_id,
        start_at: live_session_log.start_at,
      })
      .from(live_session_log)
      .where(
        and(
          eq(live_session_log.live_account_id, liveAccountId),
          eq(live_session_log.status, "in_progress"),
        ),
      )
      .limit(1);

    let closedPrevious: StartSessionResult["closed_previous"] = null;
    if (existing) {
      if (existing.anchor_dingtalk_user_id === anchorDingtalkUserId) {
        throw new Error("ALREADY_LIVE");
      }
      const now = new Date();
      const duration = Math.floor((now.getTime() - existing.start_at.getTime()) / 1000);
      await tx
        .update(live_session_log)
        .set({
          end_at: now,
          duration_seconds: duration,
          status: "auto_closed_by_next",
          closed_by: "next_anchor",
          next_anchor_dingtalk_user_id: anchorDingtalkUserId,
          updated_at: now,
        })
        .where(eq(live_session_log.id, existing.id));
      const [prevAnchor] = await tx
        .select({ name: dingtalk_user.name })
        .from(dingtalk_user)
        .where(eq(dingtalk_user.user_id, existing.anchor_dingtalk_user_id));
      closedPrevious = {
        session_id: existing.id,
        previous_anchor_name: prevAnchor?.name ?? "（未知）",
        duration_seconds: duration,
      };
    }

    const [inserted] = await tx
      .insert(live_session_log)
      .values({
        live_account_id: liveAccountId,
        anchor_dingtalk_user_id: anchorDingtalkUserId,
        status: "in_progress",
      })
      .returning({ id: live_session_log.id });

    if (!inserted) throw new Error("INSERT_FAILED");
    return {
      session_id: inserted.id,
      closed_previous: closedPrevious,
      closed_self_on_other_accounts: closedSelfOnOthers,
    };
  });
}

export interface EndSessionResult {
  session_id: string;
  duration_seconds: number;
}

/** 主播主动下播 */
export async function endSession(
  sessionId: string,
  anchorDingtalkUserId: string,
): Promise<EndSessionResult> {
  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: live_session_log.id,
        anchor_dingtalk_user_id: live_session_log.anchor_dingtalk_user_id,
        status: live_session_log.status,
        start_at: live_session_log.start_at,
      })
      .from(live_session_log)
      .where(eq(live_session_log.id, sessionId));

    if (!existing) throw new Error("SESSION_NOT_FOUND");
    if (existing.status !== "in_progress") throw new Error("SESSION_NOT_IN_PROGRESS");
    if (existing.anchor_dingtalk_user_id !== anchorDingtalkUserId)
      throw new Error("NOT_YOUR_SESSION");

    const now = new Date();
    const duration = Math.floor((now.getTime() - existing.start_at.getTime()) / 1000);
    await tx
      .update(live_session_log)
      .set({
        end_at: now,
        duration_seconds: duration,
        status: "ended",
        closed_by: "self",
        updated_at: now,
      })
      .where(eq(live_session_log.id, sessionId));

    return { session_id: sessionId, duration_seconds: duration };
  });
}

/**
 * 自动下播兜底：跟 sync-kuaishou-today-live 的实时直播数据比对。
 * 调用时机：worker 跑完快手 today-live 同步后。
 *
 * @param livingPlatformAccountIds 当前在播的 platform_account_id 列表（来自 today-live）
 * @returns 被关闭的 session 数
 */
export async function autoCloseOfflineSessions(
  livingPlatformAccountIds: string[],
): Promise<number> {
  // 拿所有 in_progress sessions + 对应账号的 platform_account_id
  const inProgress = await db
    .select({
      session_id: live_session_log.id,
      live_account_id: live_session_log.live_account_id,
      platform_account_id: live_account.platform_account_id,
      start_at: live_session_log.start_at,
    })
    .from(live_session_log)
    .innerJoin(live_account, eq(live_account.id, live_session_log.live_account_id))
    .where(eq(live_session_log.status, "in_progress"));

  const livingSet = new Set(livingPlatformAccountIds);
  const toClose = inProgress.filter((s) => {
    // platform_account_id 缺失的账号 → 跳过（无法判断）
    if (!s.platform_account_id) return false;
    return !livingSet.has(s.platform_account_id);
  });
  if (toClose.length === 0) return 0;

  const now = new Date();
  for (const s of toClose) {
    const duration = Math.floor((now.getTime() - s.start_at.getTime()) / 1000);
    // 不太短：5 分钟内的 in_progress 不算（避免刚开播被误关）
    if (duration < 300) continue;
    await db
      .update(live_session_log)
      .set({
        end_at: now,
        duration_seconds: duration,
        status: "auto_closed_by_offline",
        closed_by: "system_offline",
        updated_at: now,
      })
      .where(eq(live_session_log.id, s.session_id));
  }
  return toClose.length;
}
