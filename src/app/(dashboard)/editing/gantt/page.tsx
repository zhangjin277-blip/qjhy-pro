import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  queryWeeklyGantt,
  queryMonthlyProductShare,
  buildEditingScopeWhere,
} from "@/modules/editing-task/server";
import { GanttView } from "../_components/gantt-view";

function getWeekRange(weekOffset: number): { start: string; end: string; label: string } {
  // 使用上海时区计算本周起止日期
  const nowShanghai = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const dow = nowShanghai.getDay() === 0 ? 7 : nowShanghai.getDay(); // 周日=0 → 7
  const monday = new Date(nowShanghai);
  monday.setDate(nowShanghai.getDate() - dow + 1 + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const short = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return { start: fmt(monday), end: fmt(sunday), label: `${short(monday)} - ${short(sunday)}` };
}

function getMonthRange(): { start: string; end: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default async function GanttPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const sp = await searchParams;
  const weekOffset = Number(sp.week ?? "0");
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const week = getWeekRange(weekOffset);
  const month = getMonthRange();

  const [rows, share] = await Promise.all([
    queryWeeklyGantt({ weekStart: week.start, weekEnd: week.end, whereClause: where }),
    queryMonthlyProductShare({ monthStart: month.start, monthEnd: month.end, whereClause: where }),
  ]);

  return (
    <GanttView
      weekStart={week.start}
      weekEnd={week.end}
      weekLabel={week.label}
      weekOffset={weekOffset}
      rows={rows}
      monthlyShare={share}
    />
  );
}
