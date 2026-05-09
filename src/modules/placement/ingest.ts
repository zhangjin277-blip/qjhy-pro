import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import {
  placement_import_batch,
  placement_row,
  placement_cumulative_raw,
} from "@/db/schema/placements";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
      // 默认快手：业务上 stub 多来自轮播主播（PRO3/Excel 上传），实际都是快手
      const stubId = crypto.randomUUID();
      await db.insert(live_account).values({
        id: stubId,
        account_name: r.account_name,
        platform: "快手",
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

  // 5+6. 增量计算 & upsert
  // 两条路径：
  //  - excel-upload：跨 batch 差分（用户每小时单独上传，单 batch 只有 1 行没法做差）
  //                  → 写 cumulative_raw（按 subaccount 维度保留全量累计），
  //                    然后对涉及的 (dataset, account, date) 重算 placement_row 全天增量
  //  - pro3-migration：旧逻辑（一次性 ingest 全量数据，computeIncrements 内部能正确差分）
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    if (input.source === "excel-upload") {
      // (a) UPSERT cumulative_raw（保留每次上传的累计原始值，按 subaccount 维度）
      for (const r of matched) {
        await tx
          .insert(placement_cumulative_raw)
          .values({
            date: r.date,
            hour: r.hour,
            dataset_id: r.dataset_id,
            live_account_id: r.account_key,
            subaccount_name: r.subaccount_key,
            cost_yuan: String(r.cost_yuan),
            activations: r.activations,
            payment_yuan: String(r.payment_yuan),
            start_download: r.start_download,
            finish_download: r.finish_download,
            raw: r.raw,
            import_batch_id: batch.id,
          })
          .onConflictDoUpdate({
            target: [
              placement_cumulative_raw.date,
              placement_cumulative_raw.hour,
              placement_cumulative_raw.dataset_id,
              placement_cumulative_raw.live_account_id,
              placement_cumulative_raw.subaccount_name,
            ],
            set: {
              cost_yuan: String(r.cost_yuan),
              activations: r.activations,
              payment_yuan: String(r.payment_yuan),
              start_download: r.start_download,
              finish_download: r.finish_download,
              raw: r.raw,
              import_batch_id: batch.id,
              updated_at: sql`now()`,
            },
          });
      }

      // (b) 收集涉及的 (dataset_id, account_key, date) 三元组
      const triples = new Set<string>();
      for (const r of matched) {
        triples.add(`${r.dataset_id}|${r.account_key}|${r.date}`);
      }

      // (c) 对每个三元组重算 placement_row
      for (const triple of triples) {
        const [tDataset, tAccount, tDate] = triple.split("|") as [string, string, string];

        // 拉该 (dataset, account, date) 在 cumulative_raw 的所有 subaccount × 小时
        const cumRowsRaw = await tx
          .select()
          .from(placement_cumulative_raw)
          .where(
            and(
              eq(placement_cumulative_raw.dataset_id, tDataset),
              eq(placement_cumulative_raw.live_account_id, tAccount),
              eq(placement_cumulative_raw.date, tDate),
            ),
          );

        const cumRows: RawCumulativeRow[] = cumRowsRaw.map((c) => ({
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

        // 按 subaccount 分组做差分
        const incRows = computeIncrements(cumRows);

        // SUM 各 subaccount 的增量到 (date, hour) 维度
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

        // DELETE 该 (dataset, account, date) 在 placement_row 的所有 hour
        await tx
          .delete(placement_row)
          .where(
            and(
              eq(placement_row.dataset_id, tDataset),
              eq(placement_row.live_account_id, tAccount),
              eq(placement_row.date, tDate),
            ),
          );

        // INSERT 重算后的增量
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
            import_batch_id: batch.id,
          });
          inserted++;
        }
      }
      void inArray; // 保持 import 不被 lint 抹掉（暂保留，后续如需 batch 删可用）
    } else {
      // pro3-migration: 旧逻辑——一次性 ingest 全量，computeIncrements 单 batch 内做差
      const incremented = computeIncrements(matched);
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
        }
      }
      for (const r of mergedMap.values()) {
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

        const isNew = result.at(0)?.xmax === "0";
        if (isNew) {
          inserted++;
        } else {
          updated++;
        }
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
