import "server-only";
import { db } from "@/db/client";
import {
  account_anchor_default,
  daily_schedule_segment,
  dingtalk_user,
  kuaishou_live_trend,
  live_account,
  live_room,
  live_session_log,
  schedule_override,
} from "@/db/schema";
import { and, eq, gt, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { resolvePermission } from "@/modules/permissions/server";

/**
 * live_room 是物理直播间（B17/A20 等公共资源），没有用户/部门关联字段，
 * 行级过滤无意义。改为 module 级 gate：scope=none 返回空，其他全量返回。
 */
export async function listRooms(userId?: string, emergencyMode = false) {
  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_room");
    if (perm.scope === "none") return [];
  }
  return db.select().from(live_room).orderBy(live_room.room_no);
}

/** trend 快照多久内算「爬虫在播」；job 5min 一跑，15min 容 2 次空窗 */
const TREND_ACTIVE_WINDOW_MINUTES = 15;

export interface FloorPlanRawData {
  rooms: { id: string; room_no: string }[];
  accounts: {
    id: string;
    room_id: string;
    product: string;
    platform: string;
    platform_account_id: string | null;
  }[];
  /** in_progress 打卡（每账号至多一条） */
  checkins: { live_account_id: string; anchor_name: string; start_at: Date }[];
  /** 最近 15 分钟有 trend 快照的 member_id（= 快手爬虫「当前在播」） */
  trendActiveMemberIds: string[];
  /** 今天生效的默认排班绑定（抖音房卡排班显示 + 休判定） */
  bindings: {
    account_id: string;
    dingtalk_user_id: string;
    anchor_name: string;
    time_slots: [string, string][];
    rest_days: number[];
  }[];
  /** 今天的排班 override（覆盖同主播的默认班） */
  overrides: {
    account_id: string;
    dingtalk_user_id: string;
    anchor_name: string;
    time_slots: [string, string][];
  }[];
  /** 今天的每日排班 segment（存在时整体取代 default+override，同归因口径） */
  dailySegments: {
    account_id: string;
    dingtalk_user_id: string;
    anchor_name: string;
    start_hour: number;
    end_hour: number;
    is_rest: boolean;
  }[];
}

/**
 * 平面图数据一把抓。全楼视图不做经纪人 scope 行级过滤，
 * module 级 gate 同 listRooms：live_account scope=none 的人返回 null（页面显示无权限）。
 */
export async function getFloorPlanData(
  userId?: string,
  emergencyMode = false,
): Promise<FloorPlanRawData | null> {
  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_account");
    if (perm.scope === "none") return null;
  }

  // 「今天」按 Asia/Shanghai（服务器 TZ 可能是 UTC）
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });

  const [rooms, accounts, checkins, trendRows, bindings, overrides, dailySegments] =
    await Promise.all([
      db.select({ id: live_room.id, room_no: live_room.room_no }).from(live_room),
      db
        .select({
          id: live_account.id,
          room_id: sql<string>`${live_account.room_id}`,
          product: live_account.product,
          platform: live_account.platform,
          platform_account_id: live_account.platform_account_id,
        })
        .from(live_account)
        .where(isNotNull(live_account.room_id)),
      db
        .select({
          live_account_id: live_session_log.live_account_id,
          anchor_name: dingtalk_user.name,
          start_at: live_session_log.start_at,
        })
        .from(live_session_log)
        .innerJoin(
          dingtalk_user,
          eq(live_session_log.anchor_dingtalk_user_id, dingtalk_user.user_id),
        )
        .where(eq(live_session_log.status, "in_progress")),
      db
        .selectDistinct({ member_id: kuaishou_live_trend.member_id })
        .from(kuaishou_live_trend)
        .where(
          gt(
            kuaishou_live_trend.ts,
            sql`now() - make_interval(mins => ${TREND_ACTIVE_WINDOW_MINUTES})`,
          ),
        ),
      db
        .select({
          account_id: account_anchor_default.account_id,
          dingtalk_user_id: account_anchor_default.dingtalk_user_id,
          anchor_name: dingtalk_user.name,
          time_slots: account_anchor_default.time_slots,
          rest_days: account_anchor_default.rest_days,
        })
        .from(account_anchor_default)
        .innerJoin(
          dingtalk_user,
          eq(account_anchor_default.dingtalk_user_id, dingtalk_user.user_id),
        )
        .where(
          and(
            lte(account_anchor_default.effective_from, today),
            or(
              isNull(account_anchor_default.effective_to),
              gte(account_anchor_default.effective_to, today),
            ),
          ),
        ),
      db
        .select({
          account_id: schedule_override.account_id,
          dingtalk_user_id: schedule_override.dingtalk_user_id,
          anchor_name: dingtalk_user.name,
          time_slots: schedule_override.time_slots,
        })
        .from(schedule_override)
        .innerJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
        .where(eq(schedule_override.date, today)),
      db
        .select({
          account_id: daily_schedule_segment.account_id,
          dingtalk_user_id: daily_schedule_segment.dingtalk_user_id,
          anchor_name: dingtalk_user.name,
          start_hour: daily_schedule_segment.start_hour,
          end_hour: daily_schedule_segment.end_hour,
          is_rest: daily_schedule_segment.is_rest,
        })
        .from(daily_schedule_segment)
        .innerJoin(
          dingtalk_user,
          eq(daily_schedule_segment.dingtalk_user_id, dingtalk_user.user_id),
        )
        .where(eq(daily_schedule_segment.date, today)),
    ]);

  return {
    rooms,
    accounts,
    checkins,
    trendActiveMemberIds: trendRows.map((r) => r.member_id),
    bindings: bindings.map((b) => ({
      ...b,
      time_slots: (b.time_slots ?? []) as [string, string][],
      rest_days: (b.rest_days ?? []) as number[],
    })),
    overrides: overrides.map((o) => ({
      ...o,
      time_slots: (o.time_slots ?? []) as [string, string][],
    })),
    dailySegments,
  };
}

export async function getRoomById(id: string, userId?: string, emergencyMode = false) {
  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_room");
    if (perm.scope === "none") return null;
  }
  const rows = await db.select().from(live_room).where(eq(live_room.id, id)).limit(1);
  return rows[0] ?? null;
}
