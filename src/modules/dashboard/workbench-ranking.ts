import "server-only";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { AppError } from "@/lib/errors";
import { resolveDashboardScope } from "./scope";
import { queryWorkbenchRanking } from "./queries";
import { WorkbenchRankingFilters } from "./workbench-ranking-types";

export async function getWorkbenchRanking(input: unknown) {
  const actor = await getCurrentDingtalkUser();
  if (actor.kind !== "ok")
    throw new AppError("AUTH_REQUIRED", "请先登录有效账号", actor.kind === "unauth" ? 401 : 403);
  const parsed = WorkbenchRankingFilters.safeParse(input);
  if (!parsed.success)
    throw new AppError("INVALID_FILTERS", parsed.error.issues[0]?.message ?? "筛选条件无效", 400);
  const scope = actor.isEmergency
    ? { kind: "all" as const }
    : await resolveDashboardScope(actor.dingtalkUserId);
  if (scope.kind === "reject") throw new AppError("FORBIDDEN", "暂无直播业务数据查看权限", 403);
  return queryWorkbenchRanking(parsed.data, scope);
}
