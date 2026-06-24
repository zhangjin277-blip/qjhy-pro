import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { material_asset } from "@/db/schema/material";
import { getDownloadStream, statFile } from "@/modules/editing-storage/server";
import { requireMaterialViewer } from "@/modules/material-library/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireMaterialViewer();
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || !Number.isFinite(id)) return new NextResponse("Bad Request", { status: 400 });
  const inline = req.nextUrl.searchParams.get("inline") === "1";

  const [asset] = await db
    .select({ nasPath: material_asset.nas_path, fileName: material_asset.file_name })
    .from(material_asset)
    .where(and(eq(material_asset.id, id), isNull(material_asset.deleted_at)));
  if (!asset) return new NextResponse("Not Found", { status: 404 });

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) return new NextResponse("NAS 未配置", { status: 500 });

  let size: number;
  try {
    ({ size } = await statFile(NAS, asset.nasPath));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  const filename = encodeURIComponent(asset.fileName);
  const disposition = inline
    ? `inline; filename="${filename}"`
    : `attachment; filename="${filename}"`;
  const contentType = inline ? guessMime(asset.fileName) : "application/octet-stream";

  // 实际下载（非预览）才计数为「使用一次」
  if (!inline) {
    await db
      .update(material_asset)
      .set({ download_count: sql`${material_asset.download_count} + 1` })
      .where(eq(material_asset.id, id))
      .catch(() => undefined);
  }

  // Range —— 视频/音频拖动预览必需
  const rangeHeader = req.headers.get("range");
  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (rangeMatch) {
    const hasStart = rangeMatch[1] !== "";
    const hasEnd = rangeMatch[2] !== "";
    let start: number;
    let end: number;
    if (!hasStart && !hasEnd) {
      start = NaN;
      end = NaN;
    } else if (!hasStart) {
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
    const webStream = nodeStreamToWeb(getDownloadStream(NAS, asset.nasPath, { start, end }));
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

  const webStream = nodeStreamToWeb(getDownloadStream(NAS, asset.nasPath));
  return new NextResponse(webStream, {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}

/**
 * Node fs 流 → Web ReadableStream 健壮桥接（与 editing/download 同款）：
 * cancel 时销毁底层流、enqueue 包 try/catch 兜底竞态、背压避免大文件全进内存。
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

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".m4v")) return "video/x-m4v";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".aac")) return "audio/aac";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}
