import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import { placement_import_batch, placement_row } from "@/db/schema/placements";
import { eq, isNotNull, sql } from "drizzle-orm";
import { computeIncrements, type RawCumulativeRow } from "./incremental";
import { notifyDingtalk } from "@/lib/notify";

export interface IngestRow {
  account_name: string;
  date: string;
  hour: number;
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export interface IngestInput {
  source: "excel-upload" | "pro3-migration";
  dataset_id: string;
  file_name: string | null;
  file_size_bytes?: number | null;
  uploaded_by: string | null;
  rows: IngestRow[];
  parse_errors: { row?: unknown; reason: string }[];
}

export async function ingestRows(input: IngestInput) {
  // 1. 收集日期范围
  const dates = new Set<string>(input.rows.map((r) => r.date));
  const sortedDates = [...dates].sort();
  const dateFrom = sortedDates.at(0) ?? null;
  const dateTo = sortedDates.at(-1) ?? null;

  // 2. 查 placement_label → live_account_id 映射（仅有 label 的账号）
  const accounts = await db
    .select({ id: live_account.id, label: live_account.placement_label })
    .from(live_account)
    .where(isNotNull(live_account.placement_label));
  const labelToId = new Map<string, string>(accounts.map((a) => [a.label as string, a.id]));

  // 3. 创建 batch（status='parsing'）
  const batchRows = await db
    .insert(placement_import_batch)
    .values({
      source: input.source,
      file_name: input.file_name,
      file_size_bytes: input.file_size_bytes ?? null,
      dataset_id: input.dataset_id,
      date_range_from: dateFrom,
      date_range_to: dateTo,
      row_count: input.rows.length,
      rows_inserted: 0,
      rows_updated: 0,
      rows_skipped: input.parse_errors.length,
      status: "parsing",
      error_log: input.parse_errors.length > 0 ? input.parse_errors : null,
      uploaded_by: input.uploaded_by,
    })
    .returning();

  const batch = batchRows.at(0);
  if (!batch) {
    throw new Error("ingestRows: failed to create import batch");
  }

  const errorLog: { row?: unknown; reason: string }[] = [...input.parse_errors];

  // 4. 匹配账号 + 转 RawCumulativeRow
  const matched: RawCumulativeRow[] = [];
  for (const r of input.rows) {
    const accId = labelToId.get(r.account_name);
    if (!accId) {
      errorLog.push({
        row: r,
        reason: `未找到 placement_label='${r.account_name}' 对应的直播账号`,
      });
      continue;
    }
    matched.push({
      date: r.date,
      hour: r.hour,
      dataset_id: input.dataset_id,
      account_key: accId, // 用 live_account_id 做分组 key
      cost_yuan: r.cost_yuan,
      activations: r.activations,
      payment_yuan: r.payment_yuan,
      start_download: r.start_download,
      finish_download: r.finish_download,
      raw: r.raw,
    });
  }

  // 5. 算增量（累计值 → 小时级增量）
  const incremented = computeIncrements(matched);

  // 6. 事务内批量 upsert
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const r of incremented) {
      const result = await tx
        .insert(placement_row)
        .values({
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
          import_batch_id: batch.id,
        })
        .onConflictDoUpdate({
          target: [
            placement_row.date,
            placement_row.hour,
            placement_row.dataset_id,
            placement_row.live_account_id,
          ],
          set: {
            cost_yuan: String(r.cost_yuan),
            activations: r.activations,
            payment_yuan: String(r.payment_yuan),
            start_download: r.start_download,
            finish_download: r.finish_download,
            attribution_dirty: true,
            raw: r.raw,
            import_batch_id: batch.id,
            updated_at: sql`now()`,
          },
        })
        .returning({ id: placement_row.id, xmax: sql<string>`xmax::text` });

      // postgres: xmax = '0' 表示新插入（无旧版本），否则是 UPDATE
      const isNew = result.at(0)?.xmax === "0";
      if (isNew) {
        inserted++;
      } else {
        updated++;
      }
    }
  });

  // 7. 判定最终状态
  const finalSkipped = input.rows.length - matched.length + input.parse_errors.length;
  const status: "completed" | "partial" | "failed" =
    errorLog.length === 0 ? "completed" : matched.length === 0 ? "failed" : "partial";

  // 8. 更新 batch 统计
  const finalRows = await db
    .update(placement_import_batch)
    .set({
      rows_inserted: inserted,
      rows_updated: updated,
      rows_skipped: finalSkipped,
      status,
      error_log: errorLog.length > 0 ? errorLog : null,
    })
    .where(eq(placement_import_batch.id, batch.id))
    .returning();

  const final = finalRows.at(0);
  if (!final) {
    throw new Error("ingestRows: failed to update import batch");
  }

  if (status === "failed") {
    await notifyDingtalk({
      title: "投放上传 batch 报错",
      detail: `batch=${final.id} file=${input.file_name ?? "(无)"} dataset=${input.dataset_id}`,
      context: { error_count: errorLog.length, first_error: errorLog.at(0)?.reason },
    }).catch((notifyErr: unknown) => {
      console.error("[ingest] notify failed:", notifyErr);
    });
  }

  return final;
}
