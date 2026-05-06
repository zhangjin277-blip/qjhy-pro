import "server-only";
import Database from "better-sqlite3";
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
  const sqlite = new Database(sqlitePath, { readonly: true });
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
    const rows = sqlite.prepare(query).all(...params) as Pro3Row[];

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
        const hourRaw = c["dataHour"] ?? c["时间"] ?? "";
        const hour = parseHour(hourRaw);
        if (hour === null) continue;

        // 账户名称（product_urp 用 "直播间" 字段）
        const accountName = c["账户名称"] ?? c["直播间"];
        if (!accountName || typeof accountName !== "string") continue;

        result.push({
          account_name: accountName.trim(),
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
