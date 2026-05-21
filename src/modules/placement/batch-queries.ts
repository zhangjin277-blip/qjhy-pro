import "server-only";
import { db } from "@/db/client";
import { placement_import_batch, placement_cumulative_raw } from "@/db/schema/placements";
import { live_account } from "@/db/schema/live-account";
import { auth_user } from "@/db/schema/auth";
import { asc, desc, eq } from "drizzle-orm";

export async function listBatches(opts?: { limit?: number; offset?: number }) {
  return db
    .select({
      id: placement_import_batch.id,
      source: placement_import_batch.source,
      file_name: placement_import_batch.file_name,
      dataset_id: placement_import_batch.dataset_id,
      date_range_from: placement_import_batch.date_range_from,
      date_range_to: placement_import_batch.date_range_to,
      row_count: placement_import_batch.row_count,
      rows_inserted: placement_import_batch.rows_inserted,
      rows_updated: placement_import_batch.rows_updated,
      rows_skipped: placement_import_batch.rows_skipped,
      status: placement_import_batch.status,
      uploaded_by: placement_import_batch.uploaded_by,
      uploaded_by_name: auth_user.name,
      uploaded_at: placement_import_batch.uploaded_at,
    })
    .from(placement_import_batch)
    .leftJoin(auth_user, eq(placement_import_batch.uploaded_by, auth_user.id))
    .orderBy(desc(placement_import_batch.uploaded_at))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getBatchDetail(id: string) {
  const [batch] = await db
    .select()
    .from(placement_import_batch)
    .where(eq(placement_import_batch.id, id));
  return batch ?? null;
}

/**
 * 拿一个 batch 包含的所有累计快照行（placement_cumulative_raw）。
 * Excel/Omni 上传 → 写 cumulative_raw（每行 = 一次推送时刻一个 placement_label 的累计值）。
 * UI 上展示这些原始累计，方便用户核对 / 删错单个 batch。
 */
export interface BatchRow {
  /** 复合 key（date|hour|dataset|live_account_id|subaccount）— 表无单独 id 列 */
  key: string;
  placement_label: string | null;
  account_name: string;
  product: string;
  date: string;
  hour: number;
  cost_yuan: string;
  activations: number;
  payment_yuan: string;
}

export async function getBatchRows(batchId: string): Promise<BatchRow[]> {
  const rows = await db
    .select({
      date: placement_cumulative_raw.date,
      hour: placement_cumulative_raw.hour,
      dataset_id: placement_cumulative_raw.dataset_id,
      live_account_id: placement_cumulative_raw.live_account_id,
      subaccount_name: placement_cumulative_raw.subaccount_name,
      placement_label: live_account.placement_label,
      account_name: live_account.account_name,
      product: live_account.product,
      cost_yuan: placement_cumulative_raw.cost_yuan,
      activations: placement_cumulative_raw.activations,
      payment_yuan: placement_cumulative_raw.payment_yuan,
    })
    .from(placement_cumulative_raw)
    .innerJoin(live_account, eq(live_account.id, placement_cumulative_raw.live_account_id))
    .where(eq(placement_cumulative_raw.import_batch_id, batchId))
    .orderBy(asc(placement_cumulative_raw.hour), asc(live_account.placement_label));
  return rows.map((r) => ({
    key: `${r.date}|${r.hour}|${r.dataset_id}|${r.live_account_id}|${r.subaccount_name}`,
    placement_label: r.placement_label,
    account_name: r.account_name,
    product: r.product,
    date: r.date,
    hour: r.hour,
    cost_yuan: String(r.cost_yuan),
    activations: r.activations ?? 0,
    payment_yuan: String(r.payment_yuan),
  }));
}
