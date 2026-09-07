import { NextRequest, NextResponse } from "next/server";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getCheckinRange, type CheckinDayResult } from "@/modules/checkin/queries";

export const runtime = "nodejs";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 93;

function parseLocalDate(value: string | null): Date | null {
  if (!value || !ISO_DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const normalized = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return normalized === value ? date : null;
}

function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(new Date(iso));
}

function buildCsv(data: CheckinDayResult): string {
  const rows: string[][] = [
    [
      "产品",
      "账号",
      "平台",
      "主播",
      "开始时间",
      "结束时间",
      "时长(min)",
      "礼物流水(元)",
      "消耗(元)",
      "激活",
      "激活单价",
      "付费(元)",
      "ARPU",
      "状态",
      "关闭方式",
    ],
  ];

  for (const account of data.accounts) {
    for (const session of account.sessions) {
      const cpa =
        session.cost_yuan != null && session.activations != null && session.activations > 0
          ? (session.cost_yuan / session.activations).toFixed(2)
          : "";
      const arpu =
        session.payment_yuan != null && session.activations != null && session.activations > 0
          ? (session.payment_yuan / session.activations).toFixed(2)
          : "";
      rows.push([
        account.product,
        account.account_name,
        account.platform,
        session.anchor_name,
        formatDateTime(session.start_at),
        session.end_at ? formatDateTime(session.end_at) : "",
        session.duration_seconds != null
          ? Math.round(session.duration_seconds / 60).toString()
          : "",
        session.income_cents != null ? (session.income_cents / 100).toFixed(2) : "",
        session.cost_yuan != null ? session.cost_yuan.toFixed(2) : "",
        session.activations != null ? Math.round(session.activations).toString() : "",
        cpa,
        session.payment_yuan != null ? session.payment_yuan.toFixed(2) : "",
        arpu,
        session.status,
        session.closed_by ?? "",
      ]);
    }
  }

  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const currentUser = await getCurrentDingtalkUser();
  if (currentUser.kind === "unauth") {
    return new NextResponse("登录已失效，请刷新后重试", { status: 401 });
  }
  if (currentUser.kind === "user_not_synced") {
    return new NextResponse("当前账号未同步，无法导出", { status: 403 });
  }

  const dateFromValue = req.nextUrl.searchParams.get("date_from");
  const dateToValue = req.nextUrl.searchParams.get("date_to");
  const dateFrom = parseLocalDate(dateFromValue);
  const dateTo = parseLocalDate(dateToValue);
  if (!dateFrom || !dateTo || !dateFromValue || !dateToValue) {
    return new NextResponse("请选择有效的开始和结束日期", { status: 400 });
  }

  const rangeDays = Math.floor((dateTo.getTime() - dateFrom.getTime()) / 86_400_000) + 1;
  if (rangeDays < 1) return new NextResponse("结束日期不能早于开始日期", { status: 400 });
  if (rangeDays > MAX_RANGE_DAYS) {
    return new NextResponse(`单次最多导出 ${MAX_RANGE_DAYS} 天`, { status: 400 });
  }

  const product = req.nextUrl.searchParams.get("product")?.trim() || undefined;
  const accountQuery = req.nextUrl.searchParams.get("account_query")?.trim() || undefined;
  let data: CheckinDayResult;
  try {
    data = await getCheckinRange(dateFromValue, dateToValue, { product, accountQuery });
  } catch (error) {
    console.error("[checkin-history-export]", error);
    return new NextResponse("导出失败，请稍后重试", { status: 500 });
  }
  const csv = buildCsv(data);
  const filename = `checkin-history-${dateFromValue}_${dateToValue}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
