import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  queryStatusCounts,
  queryEditorMonthlyStats,
  queryAnchorMonthlyCoverage,
  buildEditingScopeWhere,
} from "@/modules/editing-task/server";
import { StatsView } from "../_components/stats-view";

function getMonthRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1 + offset; // may overflow/underflow
  const realYear = year + Math.floor((month - 1) / 12);
  const realMonth = ((month - 1 + 1200) % 12) + 1; // 保证正数模
  const lastDay = new Date(realYear, realMonth, 0).getDate();
  const start = `${realYear}-${String(realMonth).padStart(2, "0")}-01`;
  const end = `${realYear}-${String(realMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end, label: `${realYear}-${String(realMonth).padStart(2, "0")}` };
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const sp = await searchParams;
  const offset = Number(sp.m ?? "0");
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });
  const m = getMonthRange(offset);

  const [statusCounts, editorStats, anchorCoverage] = await Promise.all([
    queryStatusCounts({ whereClause: where }),
    queryEditorMonthlyStats({ monthStart: m.start, monthEnd: m.end, whereClause: where }),
    // 主播覆盖度基于开播记录、只算捕鱼系，全局（与看板捕鱼覆盖度面板一致）
    queryAnchorMonthlyCoverage({ monthStart: m.start, monthEnd: m.end }),
  ]);

  return (
    <StatsView
      monthOffset={offset}
      monthLabel={m.label}
      statusCounts={statusCounts}
      editorStats={editorStats}
      anchorCoverage={anchorCoverage}
    />
  );
}
