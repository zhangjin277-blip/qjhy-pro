import { NextRequest, NextResponse } from "next/server";
import { uploadSource } from "@/modules/editing-task";
import { parseUploadToTemp, removeTemp } from "@/modules/editing-storage/server";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 600;

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
    const { userId } = await requireUser();
    const perm = await resolvePermission(userId, "editing_workflow");
    if (!perm.can_edit) {
      return NextResponse.json({ ok: false, error: "无剪辑工作流编辑权限" }, { status: 403 });
    }
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
