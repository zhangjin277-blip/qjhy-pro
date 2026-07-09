import "server-only";
import { basename, join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { moveTemp, removeTemp } from "@/modules/editing-storage/server";

const SOFTWARE_ROOT = "软件库";

function safeFilename(name: string): string {
  return basename(name).replace(/^\.+/, "") || "unnamed";
}

/**
 * 物理路径与逻辑分类解耦：软件库/{yyyymm}/{md5前12}-{安全文件名}。
 * 改分类/改名只改 DB，不动 NAS 文件。
 */
export function buildSoftwarePath(md5: string, originalName: string, now: Date): string {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return join(SOFTWARE_ROOT, yyyymm, `${md5.slice(0, 12)}-${safeFilename(originalName)}`);
}

export interface IngestSoftwareInput {
  fileName: string;
  md5: string;
  bytes: number;
  tmpRelPath: string;
  categoryId: number | null;
  name: string | null; // 自定义名，空则用文件名
  version: string | null;
  note: string | null;
  uploadedByUserId: string;
}

export interface IngestSoftwareResult {
  ok: true;
  itemId: number;
  deduped: boolean;
}

/**
 * 把已落临时盘的上传文件入库。
 *  - MD5 去重：库里已有同 hash 且未删 → 删临时文件，返回已有条目（deduped=true）。
 *  - 未命中 → moveTemp 到正式路径 → insert software_item。
 */
export async function ingestSoftware(
  nasRoot: string,
  input: IngestSoftwareInput,
): Promise<IngestSoftwareResult> {
  const [existing] = await db
    .select({ id: software_item.id })
    .from(software_item)
    .where(and(eq(software_item.file_hash, input.md5), isNull(software_item.deleted_at)));
  if (existing) {
    await removeTemp(nasRoot, input.tmpRelPath).catch(() => undefined);
    return { ok: true, itemId: existing.id, deduped: true };
  }

  const relPath = buildSoftwarePath(input.md5, input.fileName, new Date());
  await moveTemp(nasRoot, input.tmpRelPath, relPath);

  try {
    const [row] = await db
      .insert(software_item)
      .values({
        category_id: input.categoryId,
        name: (input.name && input.name.trim()) || input.fileName,
        version: input.version?.trim() || null,
        note: input.note?.trim() || null,
        nas_path: relPath,
        file_name: input.fileName,
        file_hash: input.md5,
        file_size: input.bytes,
        uploaded_by_user_id: input.uploadedByUserId,
      })
      .returning({ id: software_item.id });
    if (!row) throw new Error("软件入库失败");
    return { ok: true, itemId: row.id, deduped: false };
  } catch (err) {
    // DB 写失败补偿：删掉刚落盘的正式文件，避免 NAS 孤儿
    const { removeFile } = await import("@/modules/editing-storage/server");
    await removeFile(nasRoot, relPath).catch(() => undefined);
    throw err;
  }
}
