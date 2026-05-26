import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { getDownloadStream } from "@/modules/editing-storage/server";

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

    if (!taskId || !kind || (kind !== "source" && kind !== "edited")) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const [task] = await db
      .select({
        source_files: editing_task.source_files,
        source_file_names: editing_task.source_file_names,
        edited_files: editing_task.edited_files,
        edited_file_names: editing_task.edited_file_names,
      })
      .from(editing_task)
      .where(eq(editing_task.id, taskId));

    if (!task) return new NextResponse("Not Found", { status: 404 });

    const files = kind === "source" ? task.source_files : task.edited_files;
    const names = kind === "source" ? task.source_file_names : task.edited_file_names;
    if (!files?.[index]) return new NextResponse("file not found", { status: 404 });

    const NAS = process.env.EDITING_NAS_PATH;
    if (!NAS) return new NextResponse("NAS not configured", { status: 500 });

    const stream = getDownloadStream(NAS, files[index]);
    const filename = encodeURIComponent(names[index] ?? "file");

    // Convert Node Readable to Web ReadableStream
    const { Readable } = await import("node:stream");
    const webStream = Readable.toWeb(stream as never) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": "application/octet-stream",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(msg, { status: 500 });
  }
}
