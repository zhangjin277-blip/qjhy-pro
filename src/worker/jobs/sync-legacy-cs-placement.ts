/**
 * 旧中台（miracle-pro-cs，长沙基地 SQLite）→ QJHY-Pro postgres 的捕鱼投放增量同步。
 *
 * 策略：
 * - 每小时 cron `0 * * * *` 跑一次。
 * - 只同步捕鱼项目（type='custom-ds-product_buyu'），最近 7 天的所有行。
 * - 复用 dataset_id='product_buyu'（与 PRO3 历史迁移同 dataset，自动 upsert 合并）。
 * - 写入用现有 ingestRows({ source: 'pro3-migration' }) → 含自动建 stub live_account + ON CONFLICT upsert。
 * - 幂等：placement_row 上 UNIQUE(date, hour, dataset_id, live_account_id)，重复运行不重复入库。
 *
 * 假设：
 * - SQLite 文件挂载在 worker 容器内的 /app/legacy.sqlite（docker-compose volumes 配置）。
 * - 旧库 SQLite 使用 WAL 或 DELETE 模式，只读访问与活跃写入不冲突。
 *
 * 失败处理：
 * - 抛错 → 上层 scheduler 兜底捕获 + notifyError + audit。
 */
import { readPro3Placements, ingestRows } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { writeAuditLog } from "@/lib/audit";
import { notifyError } from "@/lib/notify";

const LEGACY_SQLITE_PATH = "/app/legacy.sqlite";
const SYNC_WINDOW_DAYS = 7;

export async function syncLegacyCsPlacement(): Promise<void> {
  const startTime = Date.now();
  let rowCount = 0;

  try {
    const today = new Date();
    const cutoff = new Date(today.getTime() - SYNC_WINDOW_DAYS * 86400_000);
    const dateFrom = cutoff.toISOString().slice(0, 10);
    // 旧库 business_data.data_date 是 datetime 文本（"2026-05-11 13:00:00"）。
    // 字符串比较时 "2026-05-11 13:00:00" > "2026-05-11" 会被 <= dateTo 过滤掉。
    // 用"明天"作 dateTo，覆盖到 "2026-05-11 24:00:00" 这种边界。
    const dateTo = new Date(today.getTime() + 86400_000).toISOString().slice(0, 10);

    const rows = readPro3Placements(LEGACY_SQLITE_PATH, "product_buyu", {
      date_from: dateFrom,
      date_to: dateTo,
    });
    rowCount = rows.length;
    console.log(
      `[sync-legacy-cs] parsed ${rowCount} rows from legacy SQLite (${dateFrom} ~ ${dateTo})`,
    );

    if (rows.length === 0) {
      console.log("[sync-legacy-cs] no rows to ingest, skip");
      return;
    }

    const ingestResult = await ingestRows({
      source: "pro3-migration",
      dataset_id: "product_buyu",
      file_name: `legacy-cs:${dateFrom}~${dateTo}`,
      uploaded_by: null,
      rows,
      parse_errors: [],
    });

    // 跟 Excel 上传一致：ingest 完立即触发归因，让 UI 立刻能按主播/运营看到数据。
    // 不 await，让 sync 主流程快速返回；归因失败只 log 不影响 sync。
    runAttributionJob({ batch_id: ingestResult.id }).catch((err) => {
      console.error("[sync-legacy-cs] attribution-job-failed:", err);
    });

    await writeAuditLog({
      user_id: null,
      action: "LEGACY_CS_PLACEMENT_SYNC_SUCCESS",
      target_type: "system",
      target_id: null,
      after: {
        rowCount,
        dateFrom,
        dateTo,
        durationMs: Date.now() - startTime,
        ingestResult: ingestResult as unknown as Record<string, unknown>,
      },
    });

    console.log(`[sync-legacy-cs] ✓ done: ${rowCount} rows in ${Date.now() - startTime}ms`);
  } catch (err) {
    console.error("[sync-legacy-cs] ✗ failed:", err);
    await notifyError(err, { context: "sync-legacy-cs-placement job", rowCount });
    await writeAuditLog({
      user_id: null,
      action: "LEGACY_CS_PLACEMENT_SYNC_FAILED",
      target_type: "system",
      target_id: null,
      after: { rowCount, error: String(err) },
    });
    throw err;
  }
}
