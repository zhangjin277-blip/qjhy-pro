import { NextRequest, NextResponse } from "next/server";
import { requireRecordingViewer } from "@/modules/recording/server";

export const runtime = "nodejs";

const ALLOWED_PREFIXES = ["/api/v1/builtin_recorder/proxy_image", "/covers/"];

export async function GET(req: NextRequest) {
  try {
    await requireRecordingViewer();
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status: 403 });
  }

  const src = req.nextUrl.searchParams.get("src") ?? "";
  if (src.includes("..")) return new NextResponse("Bad Request", { status: 400 });

  const base = process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080";
  // 先解析归一化(WHATWG URL 会折叠 "..");白名单必须比对归一化后的 pathname,不能比对原始 src——
  // 否则 "/covers/../../api/v1/xxx" 能骗过 startsWith 前缀校验,让 fetch 落到该内网主机任意路径。
  let resolved: URL;
  try {
    resolved = new URL(src, base);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }
  if (resolved.origin !== new URL(base).origin) {
    return new NextResponse("Bad Request", { status: 400 });
  }
  if (!ALLOWED_PREFIXES.some((p) => resolved.pathname.startsWith(p))) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(resolved.href, { signal: AbortSignal.timeout(5000) });
  } catch {
    return new NextResponse("Recorder Offline", { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new NextResponse("Not Found", { status: 404 });

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}
