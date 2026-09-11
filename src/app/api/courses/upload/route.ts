import { basename, extname, join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { isAppError } from "@/lib/errors";
import { moveTemp, parseUploadToTemp, removeTemp } from "@/modules/editing-storage/server";
import { requireCoursePoint } from "@/modules/course-center/authz";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_BYTES = 500 * 1024 * 1024;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

function safeName(name: string) {
  const ext = extname(name).toLowerCase();
  const stem =
    basename(name, ext)
      .replace(/[^\p{L}\p{N}_-]+/gu, "_")
      .slice(0, 100) || "course";
  return `${stem}${ext}`;
}

export async function POST(req: NextRequest) {
  const root = process.env.COURSE_NAS_PATH;
  if (!root)
    return NextResponse.json({ ok: false, error: "COURSE_NAS_PATH 未配置" }, { status: 500 });
  let userId: string;
  try {
    ({ userId } = await requireCoursePoint("course_upload"));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "无上传权限" },
      { status: isAppError(error) ? error.httpStatus : 403 },
    );
  }
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "文件不能超过 500MB" }, { status: 413 });
  }
  let parsed;
  try {
    parsed = await parseUploadToTemp(req, root);
    const kind = parsed.fields.kind === "cover" ? "cover" : "video";
    const ext = extname(parsed.fileName).toLowerCase();
    const allowed = kind === "cover" ? IMAGE_EXT : VIDEO_EXT;
    if (!allowed.has(ext))
      throw new Error(
        kind === "cover" ? "封面仅支持 JPG、PNG、GIF、WebP" : "视频仅支持 MP4、WebM、MOV、AVI、MKV",
      );
    if (parsed.bytes > MAX_BYTES) throw new Error("文件不能超过 500MB");
    const now = new Date();
    const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const fileName = `${parsed.md5.slice(0, 12)}-${safeName(parsed.fileName)}`;
    const relative = join(dir, fileName);
    await moveTemp(root, parsed.tmpRelPath, relative);
    const url = `/uploads/courses/${relative.split("\\").join("/")}`;
    await writeAuditLog({
      user_id: userId,
      action: "COURSE_MEDIA_UPLOAD",
      target_type: "course_media",
      target_id: url,
      after: { kind, fileName: parsed.fileName, bytes: parsed.bytes, mimeType: parsed.mimeType },
    });
    return NextResponse.json({ ok: true, url, fileName: parsed.fileName, size: parsed.bytes });
  } catch (error) {
    if (parsed) await removeTemp(root, parsed.tmpRelPath).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "上传失败" },
      { status: 400 },
    );
  }
}
