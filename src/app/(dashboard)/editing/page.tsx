import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  listForBoard,
  buildEditingScopeWhere,
  queryFishCoverageToday,
} from "@/modules/editing-task/server";
import { listEditors } from "@/modules/editing-editor/server";
import { listProducts } from "@/modules/product-config/server";
import { Board } from "./_components/board";

export default async function EditingBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;

  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }

  const userId = ctx.dingtalkUserId;
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const productNames =
    typeof sp.products === "string" ? sp.products.split(",").filter(Boolean) : undefined;
  const editorUserIds =
    typeof sp.editors === "string" ? sp.editors.split(",").filter(Boolean) : undefined;

  const [cards, editors, products, fishCoverage] = await Promise.all([
    listForBoard({
      whereClause: where,
      dateFrom: sevenDaysAgo,
      dateTo: today,
      productNames,
      editorUserIds,
    }),
    listEditors(),
    listProducts(),
    queryFishCoverageToday(),
  ]);

  return (
    <Board
      initialCards={cards}
      editors={editors}
      products={products}
      permissions={{ canEdit: perm.can_edit, isAdmin: perm.can_admin }}
      fishCoverage={fishCoverage}
    />
  );
}
