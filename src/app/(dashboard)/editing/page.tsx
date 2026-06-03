import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import {
  listForBoard,
  buildEditingScopeWhere,
  queryFishCoverageToday,
  queryTodaySummary,
  queryTodayEditorLoad,
  queryTaskAccounts,
} from "@/modules/editing-task/server";
import { listEditors } from "@/modules/editing-editor/server";
import { listProducts } from "@/modules/product-config/server";
import { listAnchorOptions } from "@/modules/live-anchor/server";
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

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
  const range = typeof sp.range === "string" ? sp.range : "7d";
  const customFrom = typeof sp.from === "string" ? sp.from : null;
  const customTo = typeof sp.to === "string" ? sp.to : null;

  let dateFrom: string;
  let dateTo: string;
  if (range === "7d") {
    dateFrom = new Date(Date.now() - 7 * 86400000).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Shanghai",
    });
    dateTo = today;
  } else if (range === "30d") {
    dateFrom = new Date(Date.now() - 30 * 86400000).toLocaleDateString("sv-SE", {
      timeZone: "Asia/Shanghai",
    });
    dateTo = today;
  } else if (range === "custom" && customFrom && customTo) {
    dateFrom = customFrom;
    dateTo = customTo;
  } else {
    dateFrom = today;
    dateTo = today;
  }

  const productNames =
    typeof sp.products === "string" ? sp.products.split(",").filter(Boolean) : undefined;
  const editorUserIds =
    typeof sp.editors === "string" ? sp.editors.split(",").filter(Boolean) : undefined;
  const anchorIds =
    typeof sp.anchors === "string" ? sp.anchors.split(",").filter(Boolean) : undefined;
  const accountIds =
    typeof sp.accounts === "string" ? sp.accounts.split(",").filter(Boolean) : undefined;

  const [cards, editors, products, anchors, accountRows, fishCoverage, summary, editorLoad] =
    await Promise.all([
      listForBoard({
        whereClause: where,
        dateFrom,
        dateTo,
        productNames,
        accountIds,
        editorUserIds,
        anchorIds,
      }),
      listEditors(),
      listProducts(),
      listAnchorOptions(),
      queryTaskAccounts({ whereClause: where, dateFrom, dateTo }),
      queryFishCoverageToday(),
      queryTodaySummary({ whereClause: where }),
      queryTodayEditorLoad({ whereClause: where }),
    ]);

  const accounts = accountRows.map((a) => ({
    id: a.accountId,
    name: a.accountName,
    product: a.product,
  }));

  return (
    <Board
      initialCards={cards}
      editors={editors}
      products={products}
      anchors={anchors}
      accounts={accounts}
      permissions={{ canEdit: perm.can_edit, isAdmin: perm.can_admin }}
      fishCoverage={fishCoverage}
      todaySummary={summary}
      editorLoad={editorLoad}
    />
  );
}
