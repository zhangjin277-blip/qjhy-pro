"use server";
import { getTask, listEvents } from "@/modules/editing-task/server";
import { db } from "@/db/client";
import { live_account, account_anchor_default, anchor_profile } from "@/db/schema";
import { asc, eq, inArray, sql } from "drizzle-orm";

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

  // account_anchor_default uses account_id + dingtalk_user_id.
  // editing_task.anchor_id references anchor_profile.anchor_id (Douyin anchor ID).
  // Bridge: anchor_profile.dingtalk_user_id links the two.
  const defaults = await db
    .select({
      account_id: account_anchor_default.account_id,
      anchor_id: anchor_profile.anchor_id,
      anchor_name: anchor_profile.nick_name,
    })
    .from(account_anchor_default)
    .leftJoin(
      anchor_profile,
      eq(anchor_profile.dingtalk_user_id, account_anchor_default.dingtalk_user_id),
    )
    .where(inArray(account_anchor_default.account_id, accountIds));

  const byAccount = new Map<string, { anchorId: string; name: string }[]>();
  for (const d of defaults) {
    if (!d.anchor_id) continue;
    const arr = byAccount.get(d.account_id) ?? [];
    arr.push({ anchorId: d.anchor_id, name: d.anchor_name ?? "(未命名)" });
    byAccount.set(d.account_id, arr);
  }

  return accounts.map((a) => ({
    id: a.id,
    name: a.name,
    product: a.product ?? "未分类",
    defaultAnchors: byAccount.get(a.id) ?? [],
  }));
}
