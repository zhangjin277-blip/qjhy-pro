import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentDingtalkUser, requireUser } from "@/lib/auth/page-auth";
import { hasPoint } from "@/modules/permissions";
import { resolvePermission } from "@/modules/permissions/server";
import {
  createProjectSharedState,
  getProjectSharedState,
  listProjectSharedStatesByPrefix,
  updateProjectSharedState,
} from "@/modules/project-shared-state/server";

export async function GET() {
  await requireUser();
  const states = await listProjectSharedStatesByPrefix("zhaohua", "official_ad_hourly");
  return NextResponse.json({
    states: states
      .sort((a, b) => a.state_key.localeCompare(b.state_key))
      .map((state) => ({ stateKey: state.state_key, payload: state.payload })),
  });
}

export async function POST(request: Request) {
  const { userId } = await requireUser();
  const identity = await getCurrentDingtalkUser();
  const permission =
    identity.kind === "ok"
      ? await resolvePermission(identity.dingtalkUserId, "project_zhaohua")
      : null;
  if (
    identity.kind !== "ok" ||
    (!identity.isEmergency &&
      permission?.scope !== "all" &&
      !(permission && hasPoint(permission, "project_edit")))
  )
    return NextResponse.json({ error: "暂无造化仙府项目编辑权限" }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  const date = String(form.get("date") ?? "");
  if (!(file instanceof File) || !/\.(xlsx|xls)$/i.test(file.name))
    return NextResponse.json({ error: "请选择 .xlsx 或 .xls 文件" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: "Excel 文件不能超过 10MB" }, { status: 413 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "请选择数据日期" }, { status: 400 });
  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
  const sheetName =
    workbook.SheetNames.find((name) => name === "安卓_iOS合计") ??
    workbook.SheetNames.find((name) => /合计/.test(name));
  if (!sheetName) return NextResponse.json({ error: "未找到安卓_iOS合计工作表" }, { status: 400 });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return NextResponse.json({ error: "工作表读取失败" }, { status: 400 });
  const numeric = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const parsed = Number(
      String(value ?? "")
        .replaceAll(",", "")
        .replace("%", "")
        .trim(),
    );
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const values = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: 0 });
  const rows = values
    .map((row) => ({
      date,
      hour: Number(String(row["时间"] ?? "00:00").slice(0, 2)),
      cost: numeric(row["消耗"]),
      exposure: numeric(row["展示数"]),
      clicks: numeric(row["点击数"]),
      added: numeric(row["新增"]),
      firstDayPayment: numeric(row["首日充值金额"]),
    }))
    .filter((row) => Number.isFinite(row.hour) && row.hour >= 0 && row.hour < 24);
  if (rows.length !== 24 || new Set(rows.map((row) => row.hour)).size !== 24)
    return NextResponse.json(
      { error: "小时数据必须完整包含 00:00—23:00，且每小时仅一行" },
      { status: 400 },
    );
  const payload = { date, source: `Excel 导入：${file.name}`, rows };
  const stateKey = `official_ad_hourly_${date.replaceAll("-", "")}`;
  const current = await getProjectSharedState("zhaohua", stateKey);
  const saved = current
    ? await updateProjectSharedState("zhaohua", stateKey, payload, current.revision, userId)
    : await createProjectSharedState("zhaohua", stateKey, payload, userId);
  if (!saved) return NextResponse.json({ error: "数据保存失败，请重试" }, { status: 409 });
  return NextResponse.json({ date, rows: rows.length, stateKey });
}
