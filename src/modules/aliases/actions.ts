"use server";

import { db } from "@/db/client";
import { entity_alias } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { and, eq } from "drizzle-orm";
import { DeleteAliasInput, UpsertAliasInput } from "./schema";

export async function upsertAlias(input: unknown): Promise<{ ok: true }> {
  const data = UpsertAliasInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  const [before] = await db
    .select()
    .from(entity_alias)
    .where(
      and(
        eq(entity_alias.entity_type, data.entity_type),
        eq(entity_alias.entity_id, data.entity_id),
      ),
    );

  await db
    .insert(entity_alias)
    .values({
      entity_type: data.entity_type,
      entity_id: data.entity_id,
      alias: data.alias,
      note: data.note ?? null,
      updated_by: opUser,
    })
    .onConflictDoUpdate({
      target: [entity_alias.entity_type, entity_alias.entity_id],
      set: {
        alias: data.alias,
        note: data.note ?? null,
        updated_by: opUser,
        updated_at: new Date(),
      },
    });

  await writeAuditLog({
    user_id: opUser,
    action: "ENTITY_ALIAS_UPSERT",
    target_type: data.entity_type,
    target_id: data.entity_id,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });

  return { ok: true };
}

export async function deleteAlias(input: unknown): Promise<{ ok: true }> {
  const data = DeleteAliasInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  const [before] = await db
    .select()
    .from(entity_alias)
    .where(
      and(
        eq(entity_alias.entity_type, data.entity_type),
        eq(entity_alias.entity_id, data.entity_id),
      ),
    );

  await db
    .delete(entity_alias)
    .where(
      and(
        eq(entity_alias.entity_type, data.entity_type),
        eq(entity_alias.entity_id, data.entity_id),
      ),
    );

  await writeAuditLog({
    user_id: opUser,
    action: "ENTITY_ALIAS_DELETE",
    target_type: data.entity_type,
    target_id: data.entity_id,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: null,
  });

  return { ok: true };
}
