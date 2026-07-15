"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { requireEditingPoint } from "../authz";
import { buildEditingScopeWhere } from "../scope";
import { z } from "zod";

const Input = z.object({
  taskId: z.number().int().positive(),
  seconds: z.number().int().positive(),
});

/**
 * 增量累加审核观看时长到 review_watch_seconds。
 * 设计用途：preview modal 关闭时即时 flush，避免审核员关抽屉就丢统计。
 */
export async function recordReviewWatch(input: unknown): Promise<{ ok: true; total: number }> {
  const { taskId, seconds } = Input.parse(input);
  const { userId, perm } = await requireEditingPoint("task_claim");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });

  // scope 条件直接进 UPDATE WHERE：scope 外 / 已软删 0 行 → 按不存在处理
  const [row] = await db
    .update(editing_task)
    .set({
      review_watch_seconds: sql`${editing_task.review_watch_seconds} + ${seconds}`,
    })
    .where(and(eq(editing_task.id, taskId), isNull(editing_task.deleted_at), scopeWhere))
    .returning({ total: editing_task.review_watch_seconds });
  if (!row) throw new Error("task not found");

  return { ok: true, total: row.total };
}
