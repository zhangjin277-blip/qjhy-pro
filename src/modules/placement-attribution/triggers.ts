import "server-only";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { and, eq, isNull, or } from "drizzle-orm";

/** 标某 (account, date) 的所有 placement_row dirty=TRUE */
export async function markDirtyByAccountDate(account_id: string, date: string) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(and(eq(placement_row.live_account_id, account_id), eq(placement_row.date, date)));
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
