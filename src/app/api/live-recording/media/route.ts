import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireUser } from "@/lib/auth/page-auth";
import { getReadStream, statRecording } from "@/modules/live-recording/server";

export const runtime = "nodejs";

/**
 * 录像流式接口,下载与在线预览共用。
 *   GET /api/live-recording/media?streamer=<主播>&file=<xxx.ts>[&download=1]
 * download=1 → 附件下载(Content-Disposition: attachment);否则 inline(供 mpegts.js 预览)。
 * 支持 Range(断点续传 / 播放器 seek)。任何登录用户可访问(不分权限)。
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status: 403 });
  }

  const streamer = req.nextUrl.searchParams.get("streamer") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!streamer || !file) return new NextResponse("Bad Request", { status: 400 });

  let size: number;
  let fullPath: string;
  try {
    ({ size, fullPath } = await statRecording(streamer, file));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  const asDownload = req.nextUrl.searchParams.get("download") === "1";
  const enc = encodeURIComponent(file);
  // RFC 6266:filename* 让非 Chromium 浏览器正确还原中文文件名
  const disposition = asDownload
    ? `attachment; filename="${enc}"; filename*=UTF-8''${enc}`
    : `inline; filename="${enc}"; filename*=UTF-8''${enc}`;

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
    const webStream = nodeStreamToWeb(getReadStream(fullPath, { start, end }));
    return new NextResponse(webStream, {
      status: 206,
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": "video/mp2t",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const webStream = nodeStreamToWeb(getReadStream(fullPath));
  return new NextResponse(webStream, {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": "video/mp2t",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}

/**
 * Node fs 流 → Web ReadableStream 健壮桥接(与 software/materials download 同款):
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
