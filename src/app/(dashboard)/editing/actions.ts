"use server";
import { getTask, listEvents, buildEditingScopeWhere } from "@/modules/editing-task/server";
import { db } from "@/db/client";
import { editing_task, live_account, live_session_log, dingtalk_user } from "@/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";

export async function loadTaskDetail(taskId: number) {
  // 登录 + scope 校验：scope 外的任务返回 null（与不存在不可区分，防 IDOR 探测详情）
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const scopeWhere = await buildEditingScopeWhere({ scope: perm.scope, userId });
  const [visible] = await db
    .select({ id: editing_task.id })
    .from(editing_task)
    .where(and(eq(editing_task.id, taskId), scopeWhere));
  if (!visible) return { task: null, events: [] };

  const [task, events] = await Promise.all([getTask(taskId), listEvents(taskId)]);
  return { task, events };
}

export interface AccountSearchResult {
  id: string;
  name: string;
  product: string;
  defaultAnchors: { anchorId: string; name: string }[];
}

export async function searchLiveAccounts(query: string): Promise<AccountSearchResult[]> {
  await requireUser(); // 登录校验：账号名/主播排班属内部数据，不能匿名搜
  if (!query || query.length < 1) return [];

  const accounts = await db
    .select({
      id: live_account.id,
      name: live_account.account_name,
      product: live_account.product,
    })
    .from(live_account)
    .where(sql`${live_account.account_name} ILIKE ${`%${query}%`}`)
    .orderBy(asc(live_account.account_name))
    .limit(20);

  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);

  // 主播候选 = 最近 3 天该账号开播记录里出现过的主播
  // 注：anchor_profile.dingtalk_user_id 全为 NULL（爬虫数据未绑），直接走 dingtalk_user
  // editing_task.anchor_id 字段现存 dingtalk_user_id（FK 已 drop）
  const recentRows = await db
    .selectDistinct({
      account_id: live_session_log.live_account_id,
      anchor_id: live_session_log.anchor_dingtalk_user_id,
      anchor_name: dingtalk_user.name,
    })
    .from(live_session_log)
    .innerJoin(dingtalk_user, eq(dingtalk_user.user_id, live_session_log.anchor_dingtalk_user_id))
    .where(
      and(
        inArray(live_session_log.live_account_id, accountIds),
        gte(live_session_log.start_at, sql`NOW() - INTERVAL '3 days'`),
        isNotNull(live_session_log.anchor_dingtalk_user_id),
      ),
    );

  const byAccount = new Map<string, { anchorId: string; name: string }[]>();
  for (const r of recentRows) {
    const arr = byAccount.get(r.account_id) ?? [];
    arr.push({ anchorId: r.anchor_id, name: r.anchor_name ?? "(未命名)" });
    byAccount.set(r.account_id, arr);
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    product: a.product ?? "未分类",
    defaultAnchors: byAccount.get(a.id) ?? [],
  }));
}
