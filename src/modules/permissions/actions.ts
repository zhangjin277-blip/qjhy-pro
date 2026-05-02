"use server";

import { db } from "@/db/client";
import { auth_permission_override, dept_leader, role_default_permission } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { eq, and } from "drizzle-orm";
import {
  RemoveDeptLeaderInput,
  SetDeptLeaderInput,
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
