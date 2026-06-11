import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { buildEditingScopeWhere } from "@/modules/editing-task/server";
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

    // scope 过滤直接进查询：scope 外的任务返回 404（与不存在不可区分，防 IDOR 遍历探测）
    const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });
    const [task] = await db
      .select({
        source_files: editing_task.source_files,
        source_file_names: editing_task.source_file_names,
        edited_files: editing_task.edited_files,
        edited_file_names: editing_task.edited_file_names,
        cover_image: editing_task.cover_image,
      })
      .from(editing_task)
      .where(and(eq(editing_task.id, taskId), scopeWhere));

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
      const webStream = nodeStreamToWeb(stream);
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
    const webStream = nodeStreamToWeb(stream);

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

/**
 * Node fs 流 → Web ReadableStream 的健壮桥接。
 *
 * 取代 `Readable.toWeb`：后者在客户端中断（视频预览关闭 / 拖动进度条触发新 Range
 * 请求取消旧请求）时，Web 流的 controller 已关闭，但底层 fs 流仍在 push data →
 * `controller.enqueue` 抛 "Invalid state: Controller is already closed" →
 * uncaughtException（线上单次运行累计 7.8 万次，fd/内存泄漏）。
 *
 * 本实现：① cancel() 时销毁底层 fs 流；② enqueue 包 try/catch 兜底竞态；
 * ③ 用 desiredSize + pause/resume 做背压，避免大文件全读进内存。
 */
function nodeStreamToWeb(node: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  const nodeReadable = node as Readable;
  let canceled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeReadable.on("data", (chunk: Buffer) => {
        if (canceled) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          // controller 已关闭：停止并销毁底层流，避免 enqueue-after-close
          canceled = true;
          nodeReadable.destroy();
          return;
        }
        if ((controller.desiredSize ?? 1) <= 0) nodeReadable.pause();
      });
      nodeReadable.on("end", () => {
        if (canceled) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      nodeReadable.on("error", (err) => {
        if (canceled) return;
        try {
          controller.error(err);
        } catch {
          /* already errored */
        }
      });
    },
    pull() {
      nodeReadable.resume();
    },
    cancel() {
      canceled = true;
      nodeReadable.destroy();
    },
  });
}

function guessVideoMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  return "application/octet-stream";
}
