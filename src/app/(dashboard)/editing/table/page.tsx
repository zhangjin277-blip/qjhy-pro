import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { listForTable, buildEditingScopeWhere } from "@/modules/editing-task/server";
import { TableView } from "../_components/table-view";

export default async function EditingTablePage() {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });

  // 北京时间口径（与看板 page.tsx 一致）：toISOString 是 UTC，北京凌晨 0-8 点会把
  // dateTo 算成昨天，当天新建的任务在默认视图直接看不到
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const monthAgo = new Date(Date.now() - 30 * 86400000).toLocaleDateString("sv-SE", {
    timeZone: "Asia/Shanghai",
  });

  const rows = await listForTable({
    whereClause: where,
    dateFrom: monthAgo,
    dateTo: today,
  });

  return <TableView rows={rows} />;
}
