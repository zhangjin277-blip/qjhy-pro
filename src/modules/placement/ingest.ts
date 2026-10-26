import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import {
  placement_import_batch,
  placement_row,
  placement_cumulative_raw,
} from "@/db/schema/placements";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { computeIncrements, type RawCumulativeRow } from "./incremental";
import { notifyDingtalk } from "@/lib/notify";

export interface IngestRow {
  account_name: string;
  /**
   * 同一个 anchor 下的不同广告账户名。
   * 不传时默认与 account_name 相同（每行就是一个独立累计序列）。
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
  source: "excel-upload";
  dataset_id: string;
  granularity?: "hourly" | "daily";
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
    .select({
      id: live_account.id,
      label: live_account.placement_label,
      accountName: live_account.account_name,
      product: live_account.product,
    })
    .from(live_account)
    .where(isNotNull(live_account.account_name));
  const labelToId = new Map<string, string>();
  const accountNameToId = new Map<string, string>();
  for (const account of accounts) {
    if (account.label) labelToId.set(account.label, account.id);
    if (account.accountName) accountNameToId.set(account.accountName, account.id);
  }
  const normalizeAccount = (value: string): string =>
    value.toLowerCase().replace(/[\s\-_—－()（）]/g, "");

  // 3. 创建 batch（status='parsing'）
  const batchRows = await db
    .insert(placement_import_batch)
    .values({
      source: input.source,
      file_name: input.file_name,
      file_size_bytes: input.file_size_bytes ?? null,
      dataset_id: input.dataset_id,
      granularity: input.granularity ?? "hourly",
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
  let autoStubbed = 0;
  const productByDataset: Record<string, string> = {
    product_buyu: "捕鱼大作战",
    product_ue4: "途游休闲捕鱼",
    product_urp: "电玩捕鱼",
  };
  for (const r of input.rows) {
    const isWorkbookReport = Boolean(r.raw._source_sheet);
    // 兼容大小写差异：Excel "蓝v" 与 DB "蓝V" 视为同一主播
    // 完整账号名优先精确匹配；只有没有同名账号时，才把短名称当作日报简称。
    let accId = accountNameToId.get(r.account_name);
    if (!accId && !(isWorkbookReport && r.account_name.length <= 4)) {
      accId = labelToId.get(r.account_name);
    }
    if (!accId && !(isWorkbookReport && r.account_name.length <= 4)) {
      const lower = r.account_name.toLowerCase();
      for (const [label, id] of accountNameToId.entries()) {
        if (label.toLowerCase() === lower) {
          accId = id;
          break;
        }
      }
    }
    if (!accId) {
      // 日报 Sheet 常用简称（如“二师兄”），而直播账号名称带产品后缀。
      // 在同产品账号中做包含匹配，避免为同一个账号创建重复 stub。
      const product = productByDataset[input.dataset_id] ?? "捕鱼大作战";
      const source = normalizeAccount(r.account_name);
      const candidates = accounts
        .filter((account) => account.product === product)
        .map((account) => ({
          id: account.id,
          names: [account.label, account.accountName]
            .filter(Boolean)
            .map((name) => normalizeAccount(String(name))),
        }))
        .filter((candidate) =>
          candidate.names.some((name) =>
            // 日报 sheet 名可能是账号简称，但不能把更长的新账号
            // 反向归并到已有短账号（例如“电玩捕鱼美少女”不能归到“美少女”）。
            isWorkbookReport
              ? name.includes(source)
              : name.includes(source) || source.includes(name),
          ),
        )
        .sort((left, right) => {
          const leftLength = Math.max(...left.names.map((name) => name.length));
          const rightLength = Math.max(...right.names.map((name) => name.length));
          return isWorkbookReport && r.account_name.length <= 4
            ? rightLength - leftLength
            : leftLength - rightLength;
        });
      accId = candidates.at(0)?.id;
    }
    if (!accId && isWorkbookReport) {
      // 跨产品历史账号也可能已有同名 placement_label；优先复用，
      // 避免唯一约束冲突和重复 stub。
      accId = accountNameToId.get(r.account_name) ?? labelToId.get(r.account_name);
    }
    if (!accId) {
      // 自动建 stub —— Excel 上传遇到未匹配账号时兜底，避免数据全跳
      // 默认快手：业务上 stub 多来自轮播主播，实际都是快手
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
  // excel-upload：跨 batch 差分（用户每小时单独上传，单 batch 只有 1 行没法做差）
  //   → 写 cumulative_raw（按 subaccount 维度保留全量累计），
  //     然后对涉及的 (dataset, account, date) 重算 placement_row 全天增量
  let inserted = 0;
  await db
    .transaction(async (tx) => {
      // 日报文件是“截至当前日期的完整累计快照”，不是小时增量。
      // 在同一事务内替换该产品旧日报，避免新文件覆盖旧行后再删除批次时
      // 把历史日期一并删掉；小时累计原始行和批次完全不受影响。
      if (input.granularity === "daily") {
        await tx
          .delete(placement_cumulative_raw)
          .where(
            and(
              eq(placement_cumulative_raw.dataset_id, input.dataset_id),
              sql`${placement_cumulative_raw.raw} ? '_source_sheet'`,
            ),
          );
        await tx
          .delete(placement_import_batch)
          .where(
            and(
              eq(placement_import_batch.dataset_id, input.dataset_id),
              eq(placement_import_batch.granularity, "daily"),
              sql`${placement_import_batch.id} <> ${batch.id}`,
            ),
          );
      }

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
            // Omni 累计快照单调递增：用 GREATEST 取最大值，避免乱序上传倒退。
            // 比如先上传 17:00 推送（hour=16，累计 X1），再上传 16:40 推送（同 hour=16，
            // 累计 X2 < X1），如果直接覆盖会让 hour=16 累计变小 → 差分错乱。
            // GREATEST 保留更新更"晚时刻"的累计（同 hour 多次推送以最大累计为准）。
            set: {
              cost_yuan: sql`GREATEST(${placement_cumulative_raw.cost_yuan}, ${String(r.cost_yuan)}::numeric)`,
              activations: sql`GREATEST(${placement_cumulative_raw.activations}, ${r.activations})`,
              payment_yuan: sql`GREATEST(${placement_cumulative_raw.payment_yuan}, ${String(r.payment_yuan)}::numeric)`,
              start_download: sql`GREATEST(${placement_cumulative_raw.start_download}, ${r.start_download})`,
              finish_download: sql`GREATEST(${placement_cumulative_raw.finish_download}, ${r.finish_download})`,
              raw: r.raw,
              import_batch_id: batch.id,
              updated_at: sql`now()`,
            },
          });
      }

      // 日报不生成 placement_row 小时明细；其成功数按累计日报原始行统计。
      if (input.granularity === "daily") inserted += matched.length;

      // 日报 workbook 是按天的累计快照，解析时使用 23 作为占位小时，
      // 只能保留在 cumulative_raw 供日报/项目总览使用，不能生成小时明细。
      // 小时明细只从真正的小时/20 分钟推送行重算。
      const hourlyMatched = matched.filter((r) => !r.raw._source_sheet);

      // (b) 收集涉及的 (dataset_id, account_key, date) 三元组
      const triples = new Set<string>();
      for (const r of hourlyMatched) {
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

        const cumRows: RawCumulativeRow[] = cumRowsRaw
          // 日报累计快照不能参与小时差分，否则会被伪装成 23:00 小时数据。
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
    })
    .catch(async (txErr: unknown) => {
      // 事务失败（如并发上传同 (dataset, account, date) 撞 placement_row unique）时
      // 必须把 batch 收尾成 failed，否则永远卡在 'parsing'
      const reason = txErr instanceof Error ? txErr.message : String(txErr);
      errorLog.push({ reason: `ingest 事务失败：${reason}` });
      try {
        await db
          .update(placement_import_batch)
          .set({
            status: "failed",
            rows_skipped: input.rows.length + input.parse_errors.length,
            error_log: errorLog,
          })
          .where(eq(placement_import_batch.id, batch.id));
      } catch (updateErr) {
        console.error("[ingest] failed to mark batch as failed:", updateErr);
      }
      await notifyDingtalk({
        title: "投放上传 batch 报错",
        detail: `batch=${batch.id} file=${input.file_name ?? "(无)"} dataset=${input.dataset_id}\n${reason}`,
        context: { error_count: errorLog.length },
      }).catch((notifyErr: unknown) => {
        console.error("[ingest] notify failed:", notifyErr);
      });
      throw txErr;
    });

  // 7. 判定最终状态
  const finalSkipped = input.rows.length - matched.length + input.parse_errors.length;
  const status: "completed" | "partial" | "failed" =
    errorLog.length === 0 ? "completed" : matched.length === 0 ? "failed" : "partial";
  if (autoStubbed > 0) {
    console.log(`[ingest] auto-stubbed ${autoStubbed} live_account rows`);
  }

  // 8. 更新 batch 统计
  const finalRows = await db
    .update(placement_import_batch)
    .set({
      rows_inserted: inserted,
      rows_updated: 0,
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
