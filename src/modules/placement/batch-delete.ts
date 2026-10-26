import "server-only";
import { db } from "@/db/client";
import {
  placement_import_batch,
  placement_row,
  placement_cumulative_raw,
} from "@/db/schema/placements";
import { and, eq, sql } from "drizzle-orm";
import { computeIncrements, type RawCumulativeRow } from "./incremental";

export interface DeleteBatchResult {
  batch_id: string;
  source: string;
  rows_deleted: number; // placement_row 实际净删除行数
  triples_recomputed: number; // 受影响的 (dataset, account, date) 数量
}

/**
 * 删除一个上传 batch，并清理派生数据。
 *
 * - excel-upload 小时批次：删除该 batch 在 cumulative_raw 的所有行 → 对每个受影响的
 *   (dataset, account, date) 重算 placement_row（如果还有其它 batch 的累计数据，
 *   重新差分；如果完全空了，清掉 placement_row 对应行）
 * - daily 日报批次不允许手动删除；新日报导入时按产品原子替换。
 * - pro3-migration：直接删 placement_row WHERE import_batch_id = batchId
 *
 * 不删 live_account stub（即使 stub 是这次 batch 创建的，也保留——可能被其它 batch 引用）。
 */
export async function deleteBatchAndRecompute(batchId: string): Promise<DeleteBatchResult> {
  const batchRows = await db
    .select()
    .from(placement_import_batch)
    .where(eq(placement_import_batch.id, batchId));
  const batch = batchRows.at(0);
  if (!batch) throw new Error(`batch ${batchId} not found`);
  if (batch.granularity === "daily") {
    throw new Error("日报汇总由新日报自动替换，不能手动删除日报批次；小时数据仍可单独删除。");
  }

  let rowsDeleted = 0;
  let triplesRecomputed = 0;

  await db.transaction(async (tx) => {
    if (batch.source === "excel-upload") {
      // 1. 收集本 batch 涉及的 (dataset, account, date) 三元组
      const triplesRaw = await tx
        .selectDistinct({
          dataset_id: placement_cumulative_raw.dataset_id,
          live_account_id: placement_cumulative_raw.live_account_id,
          date: placement_cumulative_raw.date,
        })
        .from(placement_cumulative_raw)
        .where(eq(placement_cumulative_raw.import_batch_id, batchId));
      triplesRecomputed = triplesRaw.length;

      // 2. 删 cumulative_raw 该 batch 的所有行
      await tx
        .delete(placement_cumulative_raw)
        .where(eq(placement_cumulative_raw.import_batch_id, batchId));

      // 3. 对每个 triple 重算 placement_row
      for (const t of triplesRaw) {
        // 拉剩余 cumulative_raw（其它 batch 留下的）
        const cumRowsRaw = await tx
          .select()
          .from(placement_cumulative_raw)
          .where(
            and(
              eq(placement_cumulative_raw.dataset_id, t.dataset_id),
              eq(placement_cumulative_raw.live_account_id, t.live_account_id),
              eq(placement_cumulative_raw.date, t.date),
            ),
          );

        // 先删 placement_row 该 triple 的所有 hour
        const deleteResult = await tx
          .delete(placement_row)
          .where(
            and(
              eq(placement_row.dataset_id, t.dataset_id),
              eq(placement_row.live_account_id, t.live_account_id),
              eq(placement_row.date, t.date),
            ),
          )
          .returning({ id: placement_row.id });
        rowsDeleted += deleteResult.length;

        if (cumRowsRaw.length === 0) continue; // 该 triple 已无累计数据，placement_row 也跟着空

        // 重新算增量 → 写回 placement_row
        const cumRows: RawCumulativeRow[] = cumRowsRaw
          .filter((c) => !c.raw?._source_sheet)
          .map((c) => ({
            date: c.date,
            hour: c.hour,
            dataset_id: c.dataset_id,
            account_key: c.live_account_id,
            subaccount_key: c.subaccount_name,
            cost_yuan: Number(c.cost_yuan),
            activations: c.activations,
            payment_yuan: Number(c.payment_yuan),
            start_download: c.start_download,
            finish_download: c.finish_download,
            raw: c.raw,
          }));
        const incRows = computeIncrements(cumRows);
        const hourlyMap = new Map<number, RawCumulativeRow>();
        for (const r of incRows) {
          const existing = hourlyMap.get(r.hour);
          if (!existing) {
            hourlyMap.set(r.hour, { ...r });
          } else {
            existing.cost_yuan += r.cost_yuan;
            existing.activations += r.activations;
            existing.payment_yuan += r.payment_yuan;
            existing.start_download += r.start_download;
            existing.finish_download += r.finish_download;
          }
        }
        for (const r of hourlyMap.values()) {
          await tx.insert(placement_row).values({
            date: r.date,
            hour: r.hour,
            dataset_id: r.dataset_id,
            live_account_id: r.account_key,
            cost_yuan: String(r.cost_yuan),
            activations: r.activations,
            payment_yuan: String(r.payment_yuan),
            start_download: r.start_download,
            finish_download: r.finish_download,
            attribution_dirty: true,
            raw: r.raw,
            // 这些行不再属于被删的 batch，import_batch_id 留空（它们归属其它存活 batch 但难精确定位）
            import_batch_id: null,
            updated_at: sql`now()`,
          });
          rowsDeleted--; // 这一行又重新写回去了，rowsDeleted 是 net delete
        }
      }
    } else {
      // pro3-migration：直接按 import_batch_id 删 placement_row
      const deleteResult = await tx
        .delete(placement_row)
        .where(eq(placement_row.import_batch_id, batchId))
        .returning({ id: placement_row.id });
      rowsDeleted = deleteResult.length;
    }

    // 最后删 batch
    await tx.delete(placement_import_batch).where(eq(placement_import_batch.id, batchId));
  });

  return {
    batch_id: batchId,
    source: batch.source,
    rows_deleted: rowsDeleted,
    triples_recomputed: triplesRecomputed,
  };
}
