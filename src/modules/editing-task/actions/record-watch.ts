"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
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
  await requireUser();

  const [row] = await db
    .update(editing_task)
    .set({
      review_watch_seconds: sql`${editing_task.review_watch_seconds} + ${seconds}`,
    })
    .where(eq(editing_task.id, taskId))
    .returning({ total: editing_task.review_watch_seconds });

  return { ok: true, total: row?.total ?? 0 };
}
