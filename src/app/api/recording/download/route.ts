import { NextRequest, NextResponse } from "next/server";
import {
  getRecordingStream,
  requireRecordingViewer,
  statRecording,
} from "@/modules/recording/server";
import { nodeStreamToWeb } from "@/lib/http/node-stream";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRecordingViewer();
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status: 403 });
  }

  const anchor = req.nextUrl.searchParams.get("anchor") ?? "";
  const file = req.nextUrl.searchParams.get("file") ?? "";
  if (!anchor || !file) return new NextResponse("Bad Request", { status: 400 });

  let size: number;
  let fullPath: string;
  try {
    ({ size, fullPath } = await statRecording(anchor, file));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  // RFC 6266:filename* 让非 Chromium 浏览器正确还原中文文件名
  const enc = encodeURIComponent(file);
  const disposition = `attachment; filename="${enc}"; filename*=UTF-8''${enc}`;

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
    return new NextResponse(nodeStreamToWeb(getRecordingStream(fullPath, { start, end })), {
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

  return new NextResponse(nodeStreamToWeb(getRecordingStream(fullPath)), {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": "video/mp2t",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}
