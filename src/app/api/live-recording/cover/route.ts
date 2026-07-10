import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { requireUser } from "@/lib/auth/page-auth";
import { statCover } from "@/modules/live-recording/server";

export const runtime = "nodejs";

/**
 * 封面图:GET /api/live-recording/cover?platform=Douyin&room=<房间号>
 * 由 go-recorder 生成于 COVERS_DIR/{平台}_{房间号}.jpg。任何登录用户可看。
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const platform = req.nextUrl.searchParams.get("platform") ?? "";
  const room = req.nextUrl.searchParams.get("room") ?? "";

  let fullPath: string;
  let size: number;
  try {
    ({ fullPath, size } = await statCover(platform, room));
  } catch {
    return new NextResponse("No Cover", { status: 404 });
  }

  const web = Readable.toWeb(createReadStream(fullPath)) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(web, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(size),
      "Cache-Control": "private, max-age=60",
    },
  });
}
