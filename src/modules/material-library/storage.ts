import "server-only";
import { basename, join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset, type MaterialType } from "@/db/schema/material";
import { moveTemp, removeTemp } from "@/modules/editing-storage/server";

const MATERIAL_ROOT = "素材库";

function safeFilename(name: string): string {
  return basename(name).replace(/^\.+/, "") || "unnamed";
}

/**
 * 物理路径与逻辑目录解耦：素材库/{type}/{yyyymm}/{md5前12}-{安全文件名}。
 * 用 md5 前缀做物理唯一，移动/改名逻辑目录不动文件。
 */
export function buildMaterialPath(
  type: MaterialType,
  md5: string,
  originalName: string,
  now: Date,
): string {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return join(MATERIAL_ROOT, type, yyyymm, `${md5.slice(0, 12)}-${safeFilename(originalName)}`);
}

/** 按文件名/MIME 推断素材类型；未知（PSD/工程文件/压缩包等）归为 other，不拒收。 */
export function detectMaterialType(fileName: string, mimeType: string): MaterialType {
  const lower = fileName.toLowerCase();
  // 设计/工程源文件：浏览器无法预览，归 other。PSD 的 MIME 是 image/*，必须先按扩展名拦下。
  if (/\.(psd|psb|ai|eps|indd|sketch|fig|xd|aep|prproj|drp|c4d|blend|zip|rar|7z)$/.test(lower))
    return "other";
  if (mimeType.startsWith("video/") || /\.(mp4|mov|webm|m4v|avi|mkv|flv|wmv)$/.test(lower))
    return "video";
  if (mimeType.startsWith("audio/") || /\.(mp3|wav|aac|m4a|flac|ogg)$/.test(lower)) return "audio";
  if (mimeType.startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|svg|heic|tiff?)$/.test(lower))
    return "image";
  return "other";
}

export function detectFormat(fileName: string): string {
  const m = fileName.toLowerCase().match(/\.([^.]+)$/);
  return m?.[1] ?? "";
}

export interface IngestInput {
  fileName: string;
  mimeType: string;
  md5: string;
  bytes: number;
  tmpRelPath: string;
  folderId: number | null;
  tags: string[];
  name: string | null; // 自定义名，空则用文件名
  durationSec: number | null;
  width: number | null;
  height: number | null;
  uploadedByUserId: string;
}

export interface IngestResult {
  ok: true;
  assetId: number;
  deduped: boolean;
}

/**
 * 把已落临时盘的上传文件入库。
 *  - MD5 去重：库里已有同 hash 且未删 → 删临时文件，返回已有素材（deduped=true）。
 *  - 未命中 → moveTemp 到正式路径 → insert material_asset。
 */
export async function ingestMaterial(nasRoot: string, input: IngestInput): Promise<IngestResult> {
  const type = detectMaterialType(input.fileName, input.mimeType);

  // 去重：同 hash 未删素材已存在 → 复用（必须排除软删行，否则删后重传匹配到已删行但文件已没）
  const [existing] = await db
    .select({ id: material_asset.id })
    .from(material_asset)
    .where(and(eq(material_asset.file_hash, input.md5), isNull(material_asset.deleted_at)));
  if (existing) {
    await removeTemp(nasRoot, input.tmpRelPath).catch(() => undefined);
    return { ok: true, assetId: existing.id, deduped: true };
  }

  const relPath = buildMaterialPath(type, input.md5, input.fileName, new Date());
  await moveTemp(nasRoot, input.tmpRelPath, relPath);

  try {
    const [row] = await db
      .insert(material_asset)
      .values({
        folder_id: input.folderId,
        name: (input.name && input.name.trim()) || input.fileName,
        type,
        nas_path: relPath,
        file_name: input.fileName,
        file_hash: input.md5,
        file_size: input.bytes,
        format: detectFormat(input.fileName),
        duration_sec: input.durationSec,
        width: input.width,
        height: input.height,
        tags: input.tags,
        uploaded_by_user_id: input.uploadedByUserId,
      })
      .returning({ id: material_asset.id });
    if (!row) throw new Error("素材入库失败");
    return { ok: true, assetId: row.id, deduped: false };
  } catch (err) {
    // DB 写失败补偿：删掉刚落盘的正式文件，避免 NAS 孤儿
    const { removeFile } = await import("@/modules/editing-storage/server");
    await removeFile(nasRoot, relPath).catch(() => undefined);
    throw err;
  }
}
