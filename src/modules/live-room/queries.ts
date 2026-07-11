import "server-only";
import { db } from "@/db/client";
import {
  account_anchor_default,
  dingtalk_user,
  kuaishou_live_trend,
  live_account,
  live_room,
  live_session_log,
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
    platform_account_id: string | null;
  }[];
  /** in_progress 打卡（每账号至多一条） */
  checkins: { live_account_id: string; anchor_name: string; start_at: Date }[];
  /** 最近 15 分钟有 trend 快照的 member_id（= 快手爬虫「当前在播」） */
  trendActiveMemberIds: string[];
  /** 今天生效的默认排班绑定（休判定用） */
  bindings: { account_id: string; rest_days: number[] }[];
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

  const [rooms, accounts, checkins, trendRows, bindings] = await Promise.all([
    db.select({ id: live_room.id, room_no: live_room.room_no }).from(live_room),
    db
      .select({
        id: live_account.id,
        room_id: sql<string>`${live_account.room_id}`,
        product: live_account.product,
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
      .innerJoin(dingtalk_user, eq(live_session_log.anchor_dingtalk_user_id, dingtalk_user.user_id))
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
        rest_days: account_anchor_default.rest_days,
      })
      .from(account_anchor_default)
      .where(
        and(
          lte(account_anchor_default.effective_from, sql`CURRENT_DATE`),
          or(
            isNull(account_anchor_default.effective_to),
            gte(account_anchor_default.effective_to, sql`CURRENT_DATE`),
          ),
        ),
      ),
  ]);

  return {
    rooms,
    accounts,
    checkins,
    trendActiveMemberIds: trendRows.map((r) => r.member_id),
    bindings,
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
