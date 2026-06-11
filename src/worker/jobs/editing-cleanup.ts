import "server-only";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

const RETENTION_DAYS = 30;
const TMP_MAX_AGE_MS = 24 * 3600 * 1000; // .tmp/ 残留（崩溃中断的上传）保留 24h 后清

export async function runEditingCleanup(): Promise<{
  tasksRemoved: number;
  filesRemoved: number;
  tmpRemoved: number;
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

  // 秒传共用防护：MD5 判重会让多个任务的 source_files 引用同一物理文件。
  // unlink 前先收集所有存活（未软删）任务引用的路径，命中则跳过 ——
  // 否则会把还在用的任务（甚至已发布的）素材连根删掉（P0 数据丢失）。
  // 注意不能靠 unlink 报错兜底：文件存在时 unlink 会成功，共享文件照删不误。
  let alivePaths: Set<string> | null = null;
  if (NAS && candidates.length > 0) {
    const aliveRows = await db
      .select({
        source_files: editing_task.source_files,
        edited_files: editing_task.edited_files,
        cover_image: editing_task.cover_image,
      })
      .from(editing_task)
      .where(isNull(editing_task.deleted_at));
    alivePaths = new Set<string>();
    for (const r of aliveRows) {
      for (const f of r.source_files ?? []) alivePaths.add(f);
      for (const f of r.edited_files ?? []) alivePaths.add(f);
      if (r.cover_image) alivePaths.add(r.cover_image);
    }
  }

  for (const t of candidates) {
    if (NAS) {
      const allFiles = [
        ...(t.source_files ?? []),
        ...(t.edited_files ?? []),
        ...(t.cover_image ? [t.cover_image] : []),
      ];
      for (const f of allFiles) {
        if (alivePaths?.has(f)) continue; // 仍被存活任务引用（秒传共用），跳过物理删除
        try {
          await unlink(join(NAS, f));
          filesRemoved++;
        } catch {
          // 文件已不存在，忽略
        }
      }
    }

    // 物理删除 task 行（event cascade 删）
    await db.delete(editing_task).where(eq(editing_task.id, t.id));
  }

  // .tmp/ 残留清扫：进程崩溃 / 容器重启会留下没人删的 up-* 临时文件
  const tmpRemoved = NAS ? await sweepTmpDir(NAS) : 0;

  return { tasksRemoved: candidates.length, filesRemoved, tmpRemoved };
}

/** 清理 .tmp/ 下超过 24h 的残留文件（正在进行的上传 mtime 是新的，不会误删）。 */
async function sweepTmpDir(nasRoot: string): Promise<number> {
  const tmpDir = join(nasRoot, ".tmp");
  let entries: string[];
  try {
    entries = await readdir(tmpDir);
  } catch {
    return 0; // 目录不存在（还没有任何上传）
  }

  let removed = 0;
  for (const name of entries) {
    const full = join(tmpDir, name);
    try {
      const s = await stat(full);
      if (s.isFile() && Date.now() - s.mtimeMs > TMP_MAX_AGE_MS) {
        await unlink(full);
        removed++;
      }
    } catch {
      // 已被并发清理 / 权限问题，忽略
    }
  }
  return removed;
}
