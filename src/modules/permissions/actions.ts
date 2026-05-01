"use server";

import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  role_default_permission,
  dingtalk_user,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import {
  RemoveDeptLeaderInput,
  SetDeptLeaderInput,
  UpsertOverrideInput,
  UpsertRoleDefaultInput,
} from "./schema";
import { resolvePermission } from "./resolve";

/**
 * 校验当前调用者是 admin（can_admin=true）。
 *
 * better-auth 的 user.id 是钉钉 unionid，但权限模型查的是 dingtalk_user.user_id。
 * 这里通过 unionid → dingtalk_user.user_id 转换后再 resolve。
 *
 * 应急后门用户（emergency-admin）拥有 admin 权限。
 */
async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  }

  // 应急后门
  if (session.user.email === "emergency@qjhy.local") {
    return { userId: session.user.id };
  }

  // 钉钉登录用户：通过 unionid 查 dingtalk_user 拿 user_id
  const [du] = await db
    .select({ user_id: dingtalk_user.user_id })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));
  if (!du) {
    throw new AppError(
      "AUTH_USER_NOT_SYNCED",
      "用户尚未同步到 dingtalk_user 表，无法计算权限",
      403,
    );
  }

  const perm = await resolvePermission(du.user_id);
  if (!perm.can_admin) {
    throw new AppError("AUTH_FORBIDDEN", "需要管理员权限", 403);
  }
  return { userId: du.user_id };
}

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
    .where(eq(auth_permission_override.user_id, data.user_id));

  await db
    .insert(auth_permission_override)
    .values({
      user_id: data.user_id,
      scope: data.scope ?? null,
      can_edit: data.can_edit ?? null,
      can_export: data.can_export ?? null,
      can_admin: data.can_admin ?? null,
      reason: data.reason,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
      created_by: opUser,
    })
    .onConflictDoUpdate({
      target: auth_permission_override.user_id,
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

export async function upsertRoleDefault(input: unknown): Promise<{ ok: true }> {
  const data = UpsertRoleDefaultInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  const [before] = await db
    .select()
    .from(role_default_permission)
    .where(eq(role_default_permission.position, data.position));

  await db
    .insert(role_default_permission)
    .values({
      position: data.position,
      scope: data.scope,
      can_edit: data.can_edit,
      can_export: data.can_export,
      can_admin: data.can_admin,
      description: data.description ?? null,
    })
    .onConflictDoUpdate({
      target: role_default_permission.position,
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
