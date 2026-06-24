import { NextRequest, NextResponse } from "next/server";
import { parseUploadToTemp, removeTemp } from "@/modules/editing-storage/server";
import { ingestMaterial, requireMaterialWriter } from "@/modules/material-library/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 600;

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export async function POST(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) {
    return NextResponse.json({ ok: false, error: "EDITING_NAS_PATH 未配置" }, { status: 500 });
  }

  // 先鉴权再落盘：未授权请求不允许往 NAS 写临时文件
  let userId: string;
  try {
    ({ userId } = await requireMaterialWriter());
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // 流式落盘到临时文件（峰值 ~64KB，避免大文件 OOM）
  let parsed;
  try {
    parsed = await parseUploadToTemp(req, NAS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `上传失败：${msg}` }, { status: 400 });
  }

  try {
    const folderRaw = parsed.fields.folderId;
    const folderId = folderRaw && folderRaw !== "" ? Number(folderRaw) : null;
    let tags: string[] = [];
    if (parsed.fields.tags) {
      try {
        const arr = JSON.parse(parsed.fields.tags);
        if (Array.isArray(arr)) tags = arr.filter((t) => typeof t === "string").slice(0, 30);
      } catch {
        /* ignore malformed tags */
      }
    }
    const result = await ingestMaterial(NAS, {
      fileName: parsed.fileName,
      mimeType: parsed.mimeType,
      md5: parsed.md5,
      bytes: parsed.bytes,
      tmpRelPath: parsed.tmpRelPath,
      folderId: folderId && Number.isFinite(folderId) ? folderId : null,
      tags,
      name: parsed.fields.name ?? null,
      durationSec: num(parsed.fields.durationSec),
      width: num(parsed.fields.width),
      height: num(parsed.fields.height),
      uploadedByUserId: userId,
    });
    return NextResponse.json(result);
  } catch (e) {
    // ingest 内部已对自身失败做补偿删除；这里兜底删临时文件（幂等）
    await removeTemp(NAS, parsed.tmpRelPath).catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
