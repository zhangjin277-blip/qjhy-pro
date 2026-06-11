import "server-only";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";

/** 标某 (account, date) 的所有 placement_row dirty=TRUE */
export async function markDirtyByAccountDate(account_id: string, date: string) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(and(eq(placement_row.live_account_id, account_id), eq(placement_row.date, date)));
}

/**
 * 标某 account 在 [date_from, date_to] 区间内的所有 placement_row dirty=TRUE。
 * date_to=null 表示不设上限（对应排班绑定 effective_to 为空 = 持续生效）。
 * 默认排班（account_anchor_default）增删改后用，让历史归因跟着重算。
 */
export async function markDirtyByAccountDateRange(
  account_id: string,
  date_from: string,
  date_to: string | null,
) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(
      and(
        eq(placement_row.live_account_id, account_id),
        gte(placement_row.date, date_from),
        date_to ? lte(placement_row.date, date_to) : undefined,
      ),
    );
}

/** 标 unmatched / conflict / NULL 行 dirty（手动重算未归因按钮用） */
export async function markDirtyUnattributed() {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(
      or(
        isNull(placement_row.attributed_dingtalk_user_id),
        eq(placement_row.attribution_source, "conflict"),
        eq(placement_row.attribution_source, "unmatched"),
      ),
    );
}

/** 标 batch 全部行 dirty（重传后用） */
export async function markDirtyByBatch(batch_id: string) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(eq(placement_row.import_batch_id, batch_id));
}
