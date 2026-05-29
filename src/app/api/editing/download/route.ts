import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { getDownloadStream, statFile } from "@/modules/editing-storage/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const perm = await resolvePermission(userId, "editing_workflow");
    if (perm.scope === "none") {
      return new NextResponse("Forbidden", { status: 403 });
    }

    const taskId = Number(req.nextUrl.searchParams.get("taskId"));
    const kind = req.nextUrl.searchParams.get("kind");
    const index = Number(req.nextUrl.searchParams.get("index") ?? "0");

    if (!taskId || !kind || (kind !== "source" && kind !== "edited" && kind !== "cover")) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const [task] = await db
      .select({
        source_files: editing_task.source_files,
        source_file_names: editing_task.source_file_names,
        edited_files: editing_task.edited_files,
        edited_file_names: editing_task.edited_file_names,
        cover_image: editing_task.cover_image,
      })
      .from(editing_task)
      .where(eq(editing_task.id, taskId));

    if (!task) return new NextResponse("Not Found", { status: 404 });

    let relPath: string | undefined;
    let filename: string;

    if (kind === "cover") {
      relPath = task.cover_image ?? undefined;
      filename = encodeURIComponent(
        task.cover_image ? (task.cover_image.split("/").pop() ?? "cover") : "cover",
      );
    } else {
      const files = kind === "source" ? task.source_files : task.edited_files;
      const names = kind === "source" ? task.source_file_names : task.edited_file_names;
      relPath = files?.[index];
      filename = encodeURIComponent(names[index] ?? "file");
    }

    if (!relPath) return new NextResponse("file not found", { status: 404 });

    const NAS = process.env.EDITING_NAS_PATH;
    if (!NAS) return new NextResponse("NAS not configured", { status: 500 });

    const inline = req.nextUrl.searchParams.get("inline") === "1";
    const disposition = inline
      ? `inline; filename="${filename}"`
      : `attachment; filename="${filename}"`;
    const contentType = inline ? guessVideoMime(filename) : "application/octet-stream";

    const { size } = await statFile(NAS, relPath);
    const { Readable } = await import("node:stream");

    // 解析 Range 请求头 —— inline 预览（视频拖动）必需，否则浏览器无法 seek
    const rangeHeader = req.headers.get("range");
    const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
    if (rangeMatch) {
      const hasStart = rangeMatch[1] !== "";
      const hasEnd = rangeMatch[2] !== "";
      let start: number;
      let end: number;
      if (!hasStart && !hasEnd) {
        // "bytes=-" 无意义
        start = NaN;
        end = NaN;
      } else if (!hasStart) {
        // 后缀范围 "bytes=-N" → 最后 N 个字节
        start = size - Number(rangeMatch[2]);
        end = size - 1;
      } else {
        start = Number(rangeMatch[1]);
        end = hasEnd ? Number(rangeMatch[2]) : size - 1;
      }
      start = Math.max(0, start);
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        return new NextResponse("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      end = Math.min(end, size - 1);
      const stream = getDownloadStream(NAS, relPath, { start, end });
      const webStream = Readable.toWeb(stream as never) as ReadableStream;
      return new NextResponse(webStream, {
        status: 206,
        headers: {
          "Content-Disposition": disposition,
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }

    const stream = getDownloadStream(NAS, relPath);
    const webStream = Readable.toWeb(stream as never) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(size),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(msg, { status: 500 });
  }
}

function guessVideoMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "application/octet-stream";
}
