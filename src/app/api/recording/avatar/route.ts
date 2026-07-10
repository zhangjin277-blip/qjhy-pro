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
  if (!ALLOWED_PREFIXES.some((p) => src.startsWith(p))) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const base = process.env.RECORDER_API_URL ?? "http://172.16.39.61:8080";
  let upstream: Response;
  try {
    upstream = await fetch(`${base}${src}`, { signal: AbortSignal.timeout(5000) });
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
