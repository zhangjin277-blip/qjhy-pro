"use server";

import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  role_default_permission,
  user_position_override,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
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
  const { userId: opUser } = await requireAdmin();

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
  const { userId: opUser } = await requireAdmin();

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
  const { userId: opUser } = await requireAdmin();

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
      can_edit: data.can_edit ?? null,
      can_export: data.can_export ?? null,
      can_admin: data.can_admin ?? null,
      reason: data.reason,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
      created_by: opUser,
    })
    .onConflictDoUpdate({
      target: [auth_permission_override.user_id, auth_permission_override.module],
      set: {
        scope: data.scope ?? null,
        can_edit: data.can_edit ?? null,
        can_export: data.can_export ?? null,
        can_admin: data.can_admin ?? null,
        reason: data.reason,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
        created_by: opUser,
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
  const { userId: opUser } = await requireAdmin();

  const before = await db
    .select()
    .from(auth_permission_override)
    .where(eq(auth_permission_override.user_id, data.user_id));

  let count = 0;
  for (const entry of data.entries) {
    if (entry.scope === null) {
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
        can_edit: entry.can_edit ?? null,
        can_export: entry.can_export ?? null,
        can_admin: entry.can_admin ?? null,
        reason: data.reason,
        expires_at: null,
        created_by: opUser,
      })
      .onConflictDoUpdate({
        target: [auth_permission_override.user_id, auth_permission_override.module],
        set: {
          scope: entry.scope,
          can_edit: entry.can_edit ?? null,
          can_export: entry.can_export ?? null,
          can_admin: entry.can_admin ?? null,
          reason: data.reason,
          created_by: opUser,
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
  const { userId: opUser } = await requireAdmin();

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
  const { userId: opUser } = await requireAdmin();

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
      can_edit: data.can_edit,
      can_export: data.can_export,
      can_admin: data.can_admin,
      description: data.description ?? null,
    })
    .onConflictDoUpdate({
      target: [role_default_permission.position, role_default_permission.module],
      set: {
        scope: data.scope,
        can_edit: data.can_edit,
        can_export: data.can_export,
        can_admin: data.can_admin,
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
