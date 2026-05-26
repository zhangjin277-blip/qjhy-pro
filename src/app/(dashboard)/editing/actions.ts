"use server";
import { getTask, listEvents } from "@/modules/editing-task/server";
import { db } from "@/db/client";
import { live_account, live_session_log, anchor_profile } from "@/db/schema";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

export async function loadTaskDetail(taskId: number) {
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
  const recentRows = await db
    .selectDistinct({
      account_id: live_session_log.live_account_id,
      anchor_id: anchor_profile.anchor_id,
      anchor_name: anchor_profile.nick_name,
    })
    .from(live_session_log)
    .innerJoin(
      anchor_profile,
      eq(anchor_profile.dingtalk_user_id, live_session_log.anchor_dingtalk_user_id),
    )
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
