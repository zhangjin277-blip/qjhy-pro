import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import { placement_import_batch, placement_row } from "@/db/schema/placements";
import { eq, isNotNull, sql } from "drizzle-orm";
import { computeIncrements, type RawCumulativeRow } from "./incremental";
import { notifyDingtalk } from "@/lib/notify";

export interface IngestRow {
  account_name: string;
  /**
   * 同一个 anchor 下的不同广告账户名（PRO3 字段「账户名称」）。
   * 不传时默认与 account_name 相同（Excel 上传场景，每行就是一个独立累计序列）。
   */
  subaccount_name?: string;
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
  // pro3-migration 模式自动建 stub live_account（PRO3 anchorName 26 个，手工建太繁琐）
  const matched: RawCumulativeRow[] = [];
  let autoStubbed = 0;
  const productByDataset: Record<string, string> = {
    product_buyu: "捕鱼大作战",
    product_ue4: "途游休闲捕鱼",
    product_urp: "电玩捕鱼",
  };
  for (const r of input.rows) {
    // 兼容大小写差异：Excel "蓝v" 与 DB "蓝V" 视为同一主播
    let accId = labelToId.get(r.account_name);
    if (!accId) {
      const lower = r.account_name.toLowerCase();
      for (const [label, id] of labelToId.entries()) {
        if (label.toLowerCase() === lower) {
          accId = id;
          break;
        }
      }
    }
    if (!accId) {
      // 所有来源都自动建 stub —— excel/pro3 都需要，避免上传后数据全跳
      const stubId = crypto.randomUUID();
      await db.insert(live_account).values({
        id: stubId,
        account_name: r.account_name,
        platform: "抖音",
        product: productByDataset[input.dataset_id] ?? "捕鱼大作战",
        placement_label: r.account_name,
        live_status: "unknown",
        raw: {
          _stub: true,
          _source: input.source,
          _dataset_id: input.dataset_id,
        },
      });
      labelToId.set(r.account_name, stubId);
      accId = stubId;
      autoStubbed++;
    }
    matched.push({
      date: r.date,
      hour: r.hour,
      dataset_id: input.dataset_id,
      account_key: accId, // 用 live_account_id 做分组 key
      subaccount_key: r.subaccount_name ?? r.account_name, // 区分同一 anchor 下的不同广告账户累计序列
      cost_yuan: r.cost_yuan,
      activations: r.activations,
      payment_yuan: r.payment_yuan,
      start_download: r.start_download,
      finish_download: r.finish_download,
      raw: r.raw,
    });
  }

  // 5. 算增量（累计值 → 小时级增量），按 (account, subaccount, dataset) 分组分别做差分
  const incremented = computeIncrements(matched);

  // 5.5 多个 subaccount 的 (date, hour, dataset, account) 增量做 SUM 合并
  //     这一步是修复 PRO3 多广告账户主播 ingest 时互相 upsert 覆盖的根因
  const mergedMap = new Map<string, RawCumulativeRow>();
  for (const r of incremented) {
    const key = `${r.date}|${r.hour}|${r.dataset_id}|${r.account_key}`;
    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, { ...r });
    } else {
      existing.cost_yuan += r.cost_yuan;
      existing.activations += r.activations;
      existing.payment_yuan += r.payment_yuan;
      existing.start_download += r.start_download;
      existing.finish_download += r.finish_download;
      // raw 用第一条即可（仅供溯源）
    }
  }
  const merged = [...mergedMap.values()];

  // 6. 事务内批量 upsert
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const r of merged) {
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
  if (autoStubbed > 0) {
    console.log(`[ingest] auto-stubbed ${autoStubbed} live_account rows (PRO3 anchorName)`);
  }

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
