"use server";
import { getTask, listEvents } from "@/modules/editing-task/server";
import { db } from "@/db/client";
import { live_account } from "@/db/schema";
import { asc, sql } from "drizzle-orm";

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

  // 主播候选 = 最近 3 天该账号开播记录里出现过的主播（去重）
  // 桥接：live_session_log.anchor_dingtalk_user_id → anchor_profile.dingtalk_user_id → anchor_id + nick_name
  const recentRows = await db.execute<{
    account_id: string;
    anchor_id: string;
    anchor_name: string | null;
  }>(sql`
    SELECT DISTINCT
      sl.live_account_id AS account_id,
      ap.anchor_id,
      ap.nick_name AS anchor_name
    FROM live_session_log sl
    JOIN anchor_profile ap ON ap.dingtalk_user_id = sl.anchor_dingtalk_user_id
    WHERE sl.live_account_id = ANY(${accountIds})
      AND sl.start_at >= NOW() - INTERVAL '3 days'
      AND sl.anchor_dingtalk_user_id IS NOT NULL
  `);

  const byAccount = new Map<string, { anchorId: string; name: string }[]>();
  for (const r of recentRows as unknown as Iterable<{
    account_id: string;
    anchor_id: string;
    anchor_name: string | null;
  }>) {
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
