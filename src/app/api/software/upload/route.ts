import { NextRequest, NextResponse } from "next/server";
import { parseUploadToTemp, removeTemp } from "@/modules/editing-storage/server";
import { ingestSoftware, requireSoftwarePoint } from "@/modules/software-library/server";
import { UploadFieldsInput } from "@/modules/software-library";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) {
    return NextResponse.json({ ok: false, error: "EDITING_NAS_PATH 未配置" }, { status: 500 });
  }

  // 先鉴权再落盘：未授权请求不允许往 NAS 写临时文件
  let userId: string;
  try {
    ({ userId } = await requireSoftwarePoint("item_edit"));
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // 流式落盘到临时文件（峰值 ~64KB，大安装包不会 OOM）
  let parsed;
  try {
    parsed = await parseUploadToTemp(req, NAS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `上传失败：${msg}` }, { status: 400 });
  }

  try {
    const fields = UploadFieldsInput.safeParse({
      name: parsed.fields.name ?? "",
      version: parsed.fields.version ?? "",
      note: parsed.fields.note ?? "",
    });
    if (!fields.success) {
      await removeTemp(NAS, parsed.tmpRelPath).catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: "字段超长（名称≤120 / 版本≤60 / 说明≤300）" },
        { status: 400 },
      );
    }
    const catRaw = parsed.fields.categoryId;
    const categoryId = catRaw && catRaw !== "" ? Number(catRaw) : null;
    const result = await ingestSoftware(NAS, {
      fileName: parsed.fileName,
      md5: parsed.md5,
      bytes: parsed.bytes,
      tmpRelPath: parsed.tmpRelPath,
      categoryId: categoryId && Number.isFinite(categoryId) ? categoryId : null,
      name: fields.data.name || null,
      version: fields.data.version || null,
      note: fields.data.note || null,
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
