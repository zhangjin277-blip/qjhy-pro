import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  queryStatusCounts,
  queryEditorMonthlyStats,
  queryAnchorMonthlyStats,
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

  const [statusCounts, editorStats, anchorStats] = await Promise.all([
    queryStatusCounts({ whereClause: where }),
    queryEditorMonthlyStats({ monthStart: m.start, monthEnd: m.end, whereClause: where }),
    queryAnchorMonthlyStats({ monthStart: m.start, monthEnd: m.end, whereClause: where }),
  ]);

  return (
    <StatsView
      monthOffset={offset}
      monthLabel={m.label}
      statusCounts={statusCounts}
      editorStats={editorStats}
      anchorStats={anchorStats}
    />
  );
}
