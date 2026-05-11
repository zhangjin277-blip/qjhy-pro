import "server-only";
import { db } from "@/db/client";
import { live_account, live_room, dingtalk_user } from "@/db/schema";
import { eq, and, inArray, sql, type SQL } from "drizzle-orm";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import type { AccountWithRelations } from "./types";

export interface ListAccountsParams {
  platform?: "抖音" | "快手" | "B站" | "视频号";
  product?: string;
}

/**
 * 按 live_account 模块的 scope 过滤直播账号列表。
 *
 * - all:  不过滤
 * - team: agent_dingtalk_user_id ∈ 团队成员（dept_leader 管的部门 ∪ 自己 dept_ids）
 * - self: agent_dingtalk_user_id = 自己
 * - none: 直接返回 []
 *
 * emergencyMode=true 时绕过权限。
 */
export async function listAccounts(
  params: ListAccountsParams = {},
  userId?: string,
  emergencyMode = false,
): Promise<AccountWithRelations[]> {
  const conditions: SQL[] = [];

  // ── 权限 scope 过滤 ──────────────────────────────────────────────────
  if (!emergencyMode && userId) {
    const perm = await resolvePermission(userId, "live_account");
    if (perm.scope === "none") return [];
    if (perm.scope === "self") {
      conditions.push(eq(live_account.agent_dingtalk_user_id, userId));
    } else if (perm.scope === "team") {
      const deptIds = await getManagedDeptIds(userId);
      if (deptIds.length === 0) return [];
      const teamUsers = await db
        .select({ user_id: dingtalk_user.user_id })
        .from(dingtalk_user)
        .where(
          sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
        );
      if (teamUsers.length === 0) return [];
      conditions.push(
        inArray(
          live_account.agent_dingtalk_user_id,
          teamUsers.map((u) => u.user_id),
        ),
      );
    }
    // perm.scope === "all" → 不加过滤
  }

  if (params.platform) conditions.push(eq(live_account.platform, params.platform));
  if (params.product) conditions.push(eq(live_account.product, params.product));

  const rows = await db
    .select({
      id: live_account.id,
      account_name: live_account.account_name,
      platform: live_account.platform,
      platform_account_id: live_account.platform_account_id,
      platform_uid: live_account.platform_uid,
      platform_real_name: live_account.platform_real_name,
      avatar: live_account.avatar,
      phone: live_account.phone,
      phone_index: live_account.phone_index,
      phone_real_name: live_account.phone_real_name,
      room_id: live_account.room_id,
      game_account_1: live_account.game_account_1,
      game_account_2: live_account.game_account_2,
      game_account_3: live_account.game_account_3,
      product: live_account.product,
      agent_dingtalk_user_id: live_account.agent_dingtalk_user_id,
      placement_label: live_account.placement_label,
      live_status: live_account.live_status,
      raw: live_account.raw,
      created_at: live_account.created_at,
      updated_at: live_account.updated_at,
      room_no: live_room.room_no,
      agent_name: dingtalk_user.name,
    })
    .from(live_account)
    .leftJoin(live_room, eq(live_account.room_id, live_room.id))
    .leftJoin(dingtalk_user, eq(live_account.agent_dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(live_account.product, live_account.account_name);

  return rows;
}

export async function getAccountById(
  id: string,
  userId?: string,
  emergencyMode = false,
): Promise<AccountWithRelations | null> {
  const all = await listAccounts({}, userId, emergencyMode);
  return all.find((a) => a.id === id) ?? null;
}
