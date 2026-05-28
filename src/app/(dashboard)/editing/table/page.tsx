import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import { listForTable, buildEditingScopeWhere } from "@/modules/editing-task/server";
import { TableView } from "../_components/table-view";

export default async function EditingTablePage() {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const rows = await listForTable({
    whereClause: where,
    dateFrom: monthAgo,
    dateTo: today,
  });

  return <TableView rows={rows} />;
}
