import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { getDownloadStream, statFile } from "@/modules/editing-storage/server";
import { getItemFile, requireSoftwareViewer } from "@/modules/software-library/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSoftwareViewer();
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || !Number.isFinite(id)) return new NextResponse("Bad Request", { status: 400 });

  const item = await getItemFile(id);
  if (!item) return new NextResponse("Not Found", { status: 404 });

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) return new NextResponse("NAS 未配置", { status: 500 });

  let size: number;
  try {
    ({ size } = await statFile(NAS, item.nasPath));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  const disposition = `attachment; filename="${encodeURIComponent(item.fileName)}"`;

  // Range 请求（浏览器断点续传）不重复计数
  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    await db
      .update(software_item)
      .set({ download_count: sql`${software_item.download_count} + 1` })
      .where(eq(software_item.id, id))
      .catch(() => undefined);
  }

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
    const webStream = nodeStreamToWeb(getDownloadStream(NAS, item.nasPath, { start, end }));
    return new NextResponse(webStream, {
      status: 206,
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const webStream = nodeStreamToWeb(getDownloadStream(NAS, item.nasPath));
  return new NextResponse(webStream, {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}

/**
 * Node fs 流 → Web ReadableStream 健壮桥接（与 materials/download 同款）：
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
