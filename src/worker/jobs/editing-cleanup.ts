import "server-only";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

const RETENTION_DAYS = 30;

export async function runEditingCleanup(): Promise<{
  tasksRemoved: number;
  filesRemoved: number;
}> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000);

  // 找 30 天前软删的任务
  const candidates = await db
    .select({
      id: editing_task.id,
      source_files: editing_task.source_files,
      edited_files: editing_task.edited_files,
      cover_image: editing_task.cover_image,
    })
    .from(editing_task)
    .where(and(isNotNull(editing_task.deleted_at), lt(editing_task.deleted_at, cutoff)));

  const NAS = process.env.EDITING_NAS_PATH;
  let filesRemoved = 0;

  for (const t of candidates) {
    if (NAS) {
      const allFiles = [
        ...(t.source_files ?? []),
        ...(t.edited_files ?? []),
        ...(t.cover_image ? [t.cover_image] : []),
      ];
      for (const f of allFiles) {
        try {
          await unlink(join(NAS, f));
          filesRemoved++;
        } catch {
          // 文件已不存在或秒传共用，忽略
        }
      }
    }

    // 物理删除 task 行（event cascade 删）
    await db.delete(editing_task).where(eq(editing_task.id, t.id));
  }

  return { tasksRemoved: candidates.length, filesRemoved };
}
