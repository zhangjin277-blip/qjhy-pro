import "server-only";
import { db } from "@/db/client";
import { user_column_preset } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { UserColumnPreset } from "./types";

type ProjectFilter = "all" | "ddz" | "three";

function toRow(r: {
  id: number;
  name: string;
  columns: string[];
  project: string;
  created_at: Date;
  updated_at: Date;
}): UserColumnPreset {
  return {
    id: r.id,
    name: r.name,
    columns: r.columns,
    project: (r.project as ProjectFilter) ?? "all",
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),
  };
}

export async function listUserPresets(userId: string): Promise<UserColumnPreset[]> {
  const rows = await db
    .select()
    .from(user_column_preset)
    .where(eq(user_column_preset.dingtalk_user_id, userId))
    .orderBy(user_column_preset.created_at);
  return rows.map(toRow);
}

export async function createUserPreset(
  userId: string,
  name: string,
  columns: string[],
  project: ProjectFilter = "all",
): Promise<UserColumnPreset> {
  const inserted = await db
    .insert(user_column_preset)
    .values({ dingtalk_user_id: userId, name, columns, project })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error("insert returned no row");
  return toRow(row);
}

export async function updateUserPreset(
  userId: string,
  id: number,
  patch: { name?: string; columns?: string[]; project?: ProjectFilter },
): Promise<UserColumnPreset | null> {
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.columns !== undefined) set.columns = patch.columns;
  if (patch.project !== undefined) set.project = patch.project;
  const [row] = await db
    .update(user_column_preset)
    .set(set)
    .where(and(eq(user_column_preset.id, id), eq(user_column_preset.dingtalk_user_id, userId)))
    .returning();
  if (!row) return null;
  return toRow(row);
}

export async function deleteUserPreset(userId: string, id: number): Promise<boolean> {
  const rows = await db
    .delete(user_column_preset)
    .where(and(eq(user_column_preset.id, id), eq(user_column_preset.dingtalk_user_id, userId)))
    .returning({ id: user_column_preset.id });
  return rows.length > 0;
}
