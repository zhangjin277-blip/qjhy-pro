import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { join, resolve } from "node:path";
import { requireCourseViewer } from "@/modules/course-center/authz";

export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  try {
    await requireCourseViewer();
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const root = process.env.COURSE_NAS_PATH;
  const raw = req.nextUrl.searchParams.get("path") ?? "";
  if (!root || !raw.startsWith("/uploads/courses/"))
    return new NextResponse("Not Found", { status: 404 });
  const full = resolve(join(root, raw.replace(/^\/uploads\/courses\//, "")));
  if (!full.startsWith(resolve(root) + "/")) return new NextResponse("Forbidden", { status: 403 });
  let size: number;
  try {
    size = (await stat(full)).size;
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }
  const range = req.headers.get("range");
  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0;
  let end = size - 1;
  if (m) {
    if (m[1]) start = Number(m[1]);
    if (m[2]) end = Number(m[2]);
    end = Math.min(end, size - 1);
    if (start > end || start >= size)
      return new NextResponse("Range Not Satisfiable", { status: 416 });
  }
  const stream = createReadStream(full, { start, end });
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    status: m ? 206 : 200,
    headers: {
      "Content-Type": mime(full),
      "Accept-Ranges": "bytes",
      "Content-Length": String(end - start + 1),
      ...(m ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}
function mime(path: string) {
  const x = path.toLowerCase();
  if (x.endsWith(".mp4")) return "video/mp4";
  if (x.endsWith(".webm")) return "video/webm";
  if (x.endsWith(".mov")) return "video/quicktime";
  if (x.endsWith(".png")) return "image/png";
  if (x.endsWith(".jpg") || x.endsWith(".jpeg")) return "image/jpeg";
  if (x.endsWith(".gif")) return "image/gif";
  if (x.endsWith(".webp")) return "image/webp";
  if (x.endsWith(".avi")) return "video/x-msvideo";
  if (x.endsWith(".mkv")) return "video/x-matroska";
  return "application/octet-stream";
}
