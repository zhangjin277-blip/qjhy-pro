import "server-only";
import { db } from "@/db/client";
import { live_room } from "@/db/schema";
import { eq } from "drizzle-orm";
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

export async function getRoomById(id: string, userId?: string, emergencyMode = false) {
  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_room");
    if (perm.scope === "none") return null;
  }
  const rows = await db.select().from(live_room).where(eq(live_room.id, id)).limit(1);
  return rows[0] ?? null;
}
