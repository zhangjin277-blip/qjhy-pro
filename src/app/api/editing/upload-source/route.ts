import { NextRequest, NextResponse } from "next/server";
import { uploadSource } from "@/modules/editing-task";
import {
  appendUploadChunk,
  finishChunkedUpload,
  parseUploadToTemp,
  removeChunkedUpload,
  removeTemp,
} from "@/modules/editing-storage/server";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { AppError, isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 600;

async function requireUploadPermission() {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  if (!perm.points.has("source_upload")) {
    throw new AppError("FORBIDDEN", "无剪辑工作流编辑权限", 403);
  }
}

function errorResponse(e: unknown, fallbackStatus = 400) {
  const status = isAppError(e) ? e.httpStatus : fallbackStatus;
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ ok: false, error: msg }, { status });
}

export async function PUT(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS)
    return NextResponse.json(
      { ok: false, error: "EDITING_NAS_PATH not configured" },
      { status: 500 },
    );
  try {
    await requireUploadPermission();
    const uploadId = req.headers.get("x-upload-id") ?? "";
    const offset = Number(req.headers.get("x-upload-offset"));
    const chunkBytes = Number(req.headers.get("x-upload-chunk-bytes"));
    const nextOffset = await appendUploadChunk(req, NAS, uploadId, offset, chunkBytes);
    return NextResponse.json({ ok: true, nextOffset });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS)
    return NextResponse.json(
      { ok: false, error: "EDITING_NAS_PATH not configured" },
      { status: 500 },
    );
  let uploadId = "";
  try {
    await requireUploadPermission();
    const body = (await req.json()) as Record<string, unknown>;
    uploadId = String(body.uploadId ?? "");
    const finished = await finishChunkedUpload(NAS, uploadId, Number(body.fileBytes));
    await uploadSource({
      taskId: Number(body.taskId),
      fileName: String(body.fileName ?? ""),
      md5: finished.md5,
      tmpRelPath: finished.tmpRelPath,
      durationSec: body.durationSec == null ? null : Number(body.durationSec),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (uploadId) await removeChunkedUpload(NAS, uploadId).catch(() => undefined);
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS)
    return NextResponse.json(
      { ok: false, error: "EDITING_NAS_PATH not configured" },
      { status: 500 },
    );
  try {
    await requireUploadPermission();
    await removeChunkedUpload(NAS, req.nextUrl.searchParams.get("uploadId") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) {
    return NextResponse.json(
      { ok: false, error: "EDITING_NAS_PATH not configured" },
      { status: 500 },
    );
  }

  // 先鉴权再落盘：未授权请求不允许往 NAS 写临时文件（占磁盘 / 当免费存储滥用）
  try {
    await requireUploadPermission();
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 401;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // 流式落盘到 NAS 临时文件（峰值内存 ~64KB，不随文件大小增长，避免大文件 OOM）
  let parsed;
  try {
    parsed = await parseUploadToTemp(req, NAS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `上传失败：${msg}` }, { status: 400 });
  }

  try {
    const durationRaw = parsed.fields.durationSec;
    const durationSec =
      durationRaw != null && Number.isFinite(Number(durationRaw)) && Number(durationRaw) > 0
        ? Math.round(Number(durationRaw))
        : null;
    await uploadSource({
      taskId: Number(parsed.fields.taskId),
      fileName: parsed.fileName,
      md5: parsed.md5,
      tmpRelPath: parsed.tmpRelPath,
      durationSec,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // action 失败（状态不对 / task 不存在等）：清理已落盘的临时文件
    //（move 之后的失败由 action 自己补偿删除正式文件，这里删临时路径是幂等空操作）
    await removeTemp(NAS, parsed.tmpRelPath).catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
