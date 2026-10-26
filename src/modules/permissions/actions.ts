"use server";

import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  role_default_permission,
  user_position_override,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requirePoint } from "@/lib/admin-guard";
import { eq, and } from "drizzle-orm";
import {
  AssignUserPositionInput,
  RemoveDeptLeaderInput,
  SetDeptLeaderInput,
  UpsertOverrideBatchInput,
  UpsertOverrideInput,
  UpsertRoleDefaultInput,
} from "./schema";

export async function setDeptLeader(input: unknown): Promise<{ ok: true }> {
  const data = SetDeptLeaderInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_dept_leaders");

  await db
    .insert(dept_leader)
    .values({ dept_id: data.dept_id, user_id: data.user_id })
    .onConflictDoNothing();

  await writeAuditLog({
    user_id: opUser,
    action: "DEPT_LEADER_ADDED",
    target_type: "user",
    target_id: data.user_id,
    after: { dept_id: data.dept_id, user_id: data.user_id },
  });
  return { ok: true };
}

export async function removeDeptLeader(input: unknown): Promise<{ ok: true }> {
  const data = RemoveDeptLeaderInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_dept_leaders");

  await db
    .delete(dept_leader)
    .where(and(eq(dept_leader.dept_id, data.dept_id), eq(dept_leader.user_id, data.user_id)));

  await writeAuditLog({
    user_id: opUser,
    action: "DEPT_LEADER_REMOVED",
    target_type: "user",
    target_id: data.user_id,
    after: { dept_id: data.dept_id, user_id: data.user_id },
  });
  return { ok: true };
}

export async function upsertOverride(input: unknown): Promise<{ ok: true }> {
  const data = UpsertOverrideInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_overrides");

  const [before] = await db
    .select()
    .from(auth_permission_override)
    .where(
      and(
        eq(auth_permission_override.user_id, data.user_id),
        eq(auth_permission_override.module, data.module),
      ),
    );

  await db
    .insert(auth_permission_override)
    .values({
      user_id: data.user_id,
      module: data.module,
      scope: data.scope ?? null,
      points: data.points ?? null,
      reason: data.reason,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
      created_by: opUser,
    })
    .onConflictDoUpdate({
      target: [auth_permission_override.user_id, auth_permission_override.module],
      // 仅 update 调用方实际传了的字段——未传的 points/scope 保留旧值，
      // 避免"只想改 scope"的请求把点集清空。
      set: {
        reason: data.reason,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
        created_by: opUser,
        ...(data.scope !== undefined && { scope: data.scope }),
        ...(data.points !== undefined && { points: data.points }),
      },
    });

  await writeAuditLog({
    user_id: opUser,
    action: "PERMISSION_OVERRIDE_UPSERT",
    target_type: "user",
    target_id: data.user_id,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

/**
 * 批量保存一个用户在多个 module 上的 override（抽屉「保存配置」一次写所有板块）。
 *
 * - entries 中 scope=null 的项视为「该 module 无覆盖，移除 override 行」（沿用 role default）
 * - scope!=null 的项 upsert 到 (user_id, module)
 */
export async function upsertOverrideBatch(input: unknown): Promise<{ ok: true; count: number }> {
  const data = UpsertOverrideBatchInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_overrides");

  const before = await db
    .select()
    .from(auth_permission_override)
    .where(eq(auth_permission_override.user_id, data.user_id));

  // 委托视图：调用方传了显式值（含 null/空数组 = 清除）才参与 write set
  const delegatedExplicit = data.delegated_user_ids !== undefined;
  const delegatedValue =
    Array.isArray(data.delegated_user_ids) && data.delegated_user_ids.length > 0
      ? data.delegated_user_ids
      : null;

  let count = 0;
  for (const entry of data.entries) {
    // scope=null（数据范围用默认）且点集也是 null（用默认）且无委托 → 该 module
    // 无任何覆盖内容，删除 override 行。
    // 注意不能只看 scope：scope 用默认但单独覆盖了点集是合法配置
    // （schema scope 列可空，resolve 对 null scope 不抬范围、null points 回落岗位默认）。
    const hasPointsOverride = entry.points !== null && entry.points !== undefined;
    const hasDelegated = delegatedExplicit && delegatedValue !== null;
    if (entry.scope === null && !hasPointsOverride && !hasDelegated) {
      await db
        .delete(auth_permission_override)
        .where(
          and(
            eq(auth_permission_override.user_id, data.user_id),
            eq(auth_permission_override.module, entry.module),
          ),
        );
      continue;
    }

    await db
      .insert(auth_permission_override)
      .values({
        user_id: data.user_id,
        module: entry.module,
        scope: entry.scope,
        points: entry.points ?? null,
        reason: data.reason,
        expires_at: null,
        delegated_user_ids: delegatedExplicit ? delegatedValue : null,
        created_by: opUser,
      })
      .onConflictDoUpdate({
        target: [auth_permission_override.user_id, auth_permission_override.module],
        // points undefined = 不动；null = 显式恢复岗位默认；数组 = 整体替换。
        set: {
          scope: entry.scope,
          reason: data.reason,
          created_by: opUser,
          ...(entry.points !== undefined && { points: entry.points }),
          ...(delegatedExplicit && { delegated_user_ids: delegatedValue }),
        },
      });
    count++;
  }

  await writeAuditLog({
    user_id: opUser,
    action: "PERMISSION_OVERRIDE_BATCH_UPSERT",
    target_type: "user",
    target_id: data.user_id,
    before: { rows: before } as unknown as Record<string, unknown>,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true, count };
}

/**
 * 给员工分配项目岗位（业务岗位）。
 * - position=null 视为清除分配（回落到钉钉 title）
 * - 否则 upsert 到 user_position_override
 */
export async function assignUserPosition(input: unknown): Promise<{ ok: true }> {
  const data = AssignUserPositionInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_roles");

  const [before] = await db
    .select()
    .from(user_position_override)
    .where(eq(user_position_override.user_id, data.user_id));

  if (data.position === null) {
    await db.delete(user_position_override).where(eq(user_position_override.user_id, data.user_id));
  } else {
    await db
      .insert(user_position_override)
      .values({
        user_id: data.user_id,
        position: data.position,
        reason: data.reason,
        assigned_by: opUser,
      })
      .onConflictDoUpdate({
        target: user_position_override.user_id,
        set: {
          position: data.position,
          reason: data.reason,
          assigned_by: opUser,
          assigned_at: new Date(),
        },
      });
  }

  await writeAuditLog({
    user_id: opUser,
    action: "USER_POSITION_ASSIGN",
    target_type: "user",
    target_id: data.user_id,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

export async function upsertRoleDefault(input: unknown): Promise<{ ok: true }> {
  const data = UpsertRoleDefaultInput.parse(input);
  const { userId: opUser } = await requirePoint("permissions", "manage_roles");

  const [before] = await db
    .select()
    .from(role_default_permission)
    .where(
      and(
        eq(role_default_permission.position, data.position),
        eq(role_default_permission.module, data.module),
      ),
    );

  await db
    .insert(role_default_permission)
    .values({
      position: data.position,
      module: data.module,
      scope: data.scope,
      points: data.points,
      description: data.description ?? null,
    })
    .onConflictDoUpdate({
      target: [role_default_permission.position, role_default_permission.module],
      set: {
        scope: data.scope,
        points: data.points,
        description: data.description ?? null,
        updated_at: new Date(),
      },
    });

  await writeAuditLog({
    user_id: opUser,
    action: "ROLE_DEFAULT_UPSERT",
    target_type: "role",
    target_id: data.position,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
