import * as XLSX from "xlsx";
import { parseDateText, parseHour, parseUnitNumber } from "./parse-utils";

const COLUMN_ALIAS = {
  // 主播标签（= placement_label）："备注" 在百应导出里就是 anchorName，"主播" 兜底
  anchor_name: ["备注", "主播", "anchorName"],
  // 广告子账户（同主播下多包用此区分累计序列）
  subaccount_name: ["账户名称", "直播间", "广告账户"],
  cost_yuan: ["消耗", "花费", "成本"],
  activations: ["激活数", "激活"],
  payment_yuan: ["激活当日付费金额", "当日付费金额"],
  start_download: ["开始下载数"],
  finish_download: ["下载完成数"],
  date_text: ["日期", "日期【X年X月X日】"],
  hour_text: ["小时", "小时【X点】", "小时【x点】"],
  time_text: ["时间"],
} as const;

export interface ParsedRow {
  account_name: string; // 主播标签（= placement_label）
  subaccount_name: string; // 广告子账户名（同主播下多包做差分时区分）
  date: string; // ISO YYYY-MM-DD
  hour: number;
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { row?: unknown; reason: string }[];
  date_range_from: string | null;
  date_range_to: string | null;
}

/**
 * 从文件名里抓取 YYYY-MM-DD-YYYY-MM-DD 形式的日期范围。
 * 支持「蓝v-安卓2026-05-06-2026-05-06_xxx.xlsx」和「12400170319-2026-05-06-2026-05-06_xxx.xlsx」等命名。
 */
export function extractDateFromFilename(filename: string): { from: string; to: string } | null {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/);
  if (!m || !m[1] || !m[2]) return null;
  return { from: m[1], to: m[2] };
}

/** 在 row 对象里按 alias 列表找列；返回第一个 trim 后非空的值 */
function findValue(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const a of aliases) {
    if (a in row) {
      const v = row[a];
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

/**
 * 解析百应导出的 Excel（3 种格式：9列/19列/6列），返回标准化行列表。
 *
 * @param buffer  xlsx 文件的 Buffer 或 ArrayBuffer
 * @param filename 原始文件名（用于日期 fallback）
 */
export function parseXlsx(buffer: Buffer | ArrayBuffer, filename: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件无 sheet" }],
      date_range_from: null,
      date_range_to: null,
    };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件 sheet 读取失败" }],
      date_range_from: null,
      date_range_to: null,
    };
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const filenameDate = extractDateFromFilename(filename);
  const rows: ParsedRow[] = [];
  const errors: { row?: unknown; reason: string }[] = [];
  const dates = new Set<string>();

  for (const row of rawRows) {
    // 跳过完全空行（所有值为 null/undefined/空字符串）
    if (Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === "")) {
      continue;
    }

    // 主播标签（必须）：优先「备注」字段，兜底「账户名称」
    const anchorRaw = findValue(row, COLUMN_ALIAS.anchor_name);
    const subAccountRaw = findValue(row, COLUMN_ALIAS.subaccount_name);
    const anchorName = anchorRaw ?? subAccountRaw; // 备注缺失时退到账户名（旧格式兜底）
    if (!anchorName) {
      // 若日期也缺失（nulls row），这是合计/汇总行，静默跳过
      const dateCheck = findValue(row, COLUMN_ALIAS.date_text);
      const timeCheck =
        findValue(row, COLUMN_ALIAS.hour_text) ?? findValue(row, COLUMN_ALIAS.time_text);
      if (!dateCheck && !timeCheck) {
        continue; // 静默跳过合计行
      }
      errors.push({ row, reason: "缺少主播标签（备注列）/账户名称列" });
      continue;
    }

    // 跳过合计/汇总行（占位符）
    const anchorStr = String(anchorName).trim();
    if (anchorStr === "--" || anchorStr === "-" || anchorStr === "多主播(逐行提取)") {
      continue;
    }
    const subAccountStr = subAccountRaw ? String(subAccountRaw).trim() : anchorStr;

    // 日期解析：行内列 → 文件名 fallback → 报错
    let date: string | null = null;
    const dateText = findValue(row, COLUMN_ALIAS.date_text);
    if (dateText !== undefined) {
      const rawDateStr = String(dateText).trim();
      // 跳过合计行占位符（如 "--"）
      if (rawDateStr !== "--" && rawDateStr !== "-") {
        date = parseDateText(rawDateStr);
      }
    }
    if (!date && filenameDate) {
      if (filenameDate.from === filenameDate.to) {
        date = filenameDate.from;
      } else {
        errors.push({ row, reason: "文件包含跨日数据，请按天上传" });
        continue;
      }
    }
    if (!date) {
      errors.push({ row, reason: "无法识别日期（行内无日期列且文件名无日期）" });
      continue;
    }

    // 小时解析：优先 hour_text，其次 time_text（"时间" 列 "19:00"）
    // Excel 上传的"小时"列是终点编号（1=00~01, 24=23~24）；DB 存起点编号（0~23），所以 -1
    const hourText = findValue(row, COLUMN_ALIAS.hour_text);
    const timeText = findValue(row, COLUMN_ALIAS.time_text);
    const hourSource = hourText ?? timeText;
    const hourRaw = parseHour(hourSource);
    if (hourRaw === null || hourRaw < 1 || hourRaw > 24) {
      errors.push({ row, reason: `无法识别小时（应为 1~24）：${String(hourSource)}` });
      continue;
    }
    const hour = hourRaw - 1;

    rows.push({
      account_name: anchorStr,
      subaccount_name: subAccountStr,
      date,
      hour,
      cost_yuan: parseUnitNumber(findValue(row, COLUMN_ALIAS.cost_yuan)),
      activations: parseUnitNumber(findValue(row, COLUMN_ALIAS.activations)),
      payment_yuan: parseUnitNumber(findValue(row, COLUMN_ALIAS.payment_yuan)),
      start_download: parseUnitNumber(findValue(row, COLUMN_ALIAS.start_download)),
      finish_download: parseUnitNumber(findValue(row, COLUMN_ALIAS.finish_download)),
      raw: row,
    });
    dates.add(date);
  }

  const sortedDates = [...dates].sort();
  return {
    rows,
    errors,
    date_range_from: sortedDates[0] ?? null,
    date_range_to: sortedDates[sortedDates.length - 1] ?? null,
  };
}
