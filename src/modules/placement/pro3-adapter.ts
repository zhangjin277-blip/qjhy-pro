import "server-only";
// Node 22 内置 sqlite 模块；零 native build 依赖，跨容器环境最稳。
// API 与 better-sqlite3 类似：DatabaseSync(path, { readOnly }) + prepare().all(...args)。
import { DatabaseSync } from "node:sqlite";
import { parseDateText, parseHour, parseUnitNumber } from "./parse-utils";
import type { IngestRow } from "./ingest";

export type Pro3Dataset = "product_buyu" | "product_ue4" | "product_urp";

interface Pro3Row {
  type: string;
  data_date: string | null;
  content: string;
}

export function readPro3Placements(
  sqlitePath: string,
  dataset: Pro3Dataset,
  opts: { limit?: number; date_from?: string; date_to?: string } = {},
): IngestRow[] {
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    let query = `SELECT type, data_date, content FROM business_data WHERE type = ?`;
    const params: (string | number)[] = [`custom-ds-${dataset}`];
    if (opts.date_from) {
      query += ` AND data_date >= ?`;
      params.push(opts.date_from);
    }
    if (opts.date_to) {
      query += ` AND data_date <= ?`;
      params.push(opts.date_to);
    }
    if (opts.limit) {
      query += ` LIMIT ?`;
      params.push(opts.limit);
    }
    const rows = sqlite.prepare(query).all(...params) as unknown as Pro3Row[];

    const result: IngestRow[] = [];
    for (const r of rows) {
      try {
        const c = JSON.parse(r.content) as Record<string, unknown>;

        // 日期：先从 content 中的 dataDate / data_date 读，再从列读
        const dataDateRaw = c["dataDate"] ?? c["data_date"];
        const dateFromContent = parseDateText(dataDateRaw == null ? "" : String(dataDateRaw));
        const dateFromColumn =
          r.data_date && /^\d{4}-\d{2}-\d{2}$/.test(r.data_date) ? r.data_date : null;
        const date = dateFromContent ?? dateFromColumn ?? parseDateText(r.data_date ?? "");
        if (!date) continue;

        // 小时：dataHour / 时间
        // PRO3 SQLite 里 dataHour 用终点编号（1=[00,01)..24=[23,24)），跟巨量后台一致；
        // 系统统一存起点编号（0~23），所以 -1。dataHour=0 是 PRO3 脏数据（不存在 [-1,0)），skip。
        const hourRaw = c["dataHour"] ?? c["时间"] ?? "";
        const hourEndpoint = parseHour(hourRaw);
        if (hourEndpoint === null || hourEndpoint < 1 || hourEndpoint > 24) continue;
        const hour = hourEndpoint - 1;

        // 归因 key 用 anchorName（主播标签如"蓝V"），1:N 对应多个广告账户名
        // 「账户名称」是广告账户名（"ldl-直播-蓝V" / "ldl-直播-蓝V-3"），同主播下多包必须按它做差分
        const anchorName = c["anchorName"];
        if (!anchorName || typeof anchorName !== "string" || anchorName.trim() === "") continue;
        const accountName = anchorName.trim();
        if (accountName === "多主播(逐行提取)") continue; // PRO3 兜底标签，跳过

        const subAccountRaw = c["账户名称"] ?? c["直播间"] ?? "";
        const subAccountName =
          typeof subAccountRaw === "string" && subAccountRaw.trim() !== ""
            ? subAccountRaw.trim()
            : accountName; // 兜底用 anchorName 自己做 subaccount key

        result.push({
          account_name: accountName.trim(),
          subaccount_name: subAccountName,
          date,
          hour,
          cost_yuan: parseUnitNumber(c["消耗"] ?? c["花费"]),
          activations: parseUnitNumber(c["激活数"] ?? c["激活"]),
          payment_yuan: parseUnitNumber(c["激活当日付费金额"] ?? c["当日付费金额"]),
          start_download: parseUnitNumber(c["开始下载数"]),
          finish_download: parseUnitNumber(c["下载完成数"]),
          raw: c,
        });
      } catch {
        // skip 解析失败行
      }
    }
    return result;
  } finally {
    sqlite.close();
  }
}
