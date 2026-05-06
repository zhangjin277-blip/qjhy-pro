import { auth } from "@/lib/auth";
import { ingestRows, parseXlsx } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const datasetId = formData.get("dataset_id") as string | null;

  if (!file || !datasetId) {
    return NextResponse.json({ error: "缺少 file 或 dataset_id" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "文件过大（> 10MB），请拆分" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseXlsx(buf, file.name);

  const batch = await ingestRows({
    source: "excel-upload",
    dataset_id: datasetId,
    file_name: file.name,
    file_size_bytes: file.size,
    uploaded_by: session.user.id,
    rows: parsed.rows,
    parse_errors: parsed.errors,
  });

  // 异步触发归因
  runAttributionJob({ batch_id: batch.id }).catch((err) => {
    console.error("[attribution-job-failed]", err);
  });

  return NextResponse.json({ batch });
}
