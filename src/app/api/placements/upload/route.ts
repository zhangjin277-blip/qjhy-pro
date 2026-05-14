import { auth } from "@/lib/auth";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import {
  ingestRows,
  parseXlsx,
  detectDatasetFromRows,
  type DetectResult,
} from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "user_not_synced") {
    return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const datasetIdInput = formData.get("dataset_id") as string | null;

  if (!file || !datasetIdInput) {
    return NextResponse.json({ error: "缺少 file 或 dataset_id" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "文件过大（> 10MB），请拆分" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseXlsx(buf, file.name);

  // dataset_id="auto" 时按主播标签投票推断
  let datasetId = datasetIdInput;
  let detect: DetectResult | null = null;
  if (datasetIdInput === "auto") {
    detect = await detectDatasetFromRows(parsed.rows);
    if (!detect.datasetId) {
      return NextResponse.json(
        {
          error: "自动识别失败：未能匹配主播标签到任何产品。请手动选择产品后重试。",
          detect,
        },
        { status: 400 },
      );
    }
    datasetId = detect.datasetId;
  }

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

  return NextResponse.json({ batch, detect, datasetId });
}
