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

const REPORT_METRIC_HEADERS = ["日期", "消耗", "新增", "实时净ROI"];

function normalizedHeader(value: unknown): string {
  return String(value ?? "")
    .replace(/[\s\r\n\t]/g, "")
    .trim();
}

function isDailyReportSheet(sheet: XLSX.WorkSheet): number | null {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  for (let index = 0; index < Math.min(rows.length, 8); index++) {
    const headers = (rows[index] ?? []).map(normalizedHeader);
    if (REPORT_METRIC_HEADERS.every((header) => headers.includes(header))) return index;
  }
  return null;
}

function parseDailyReportWorkbook(wb: XLSX.WorkBook, filename: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: { row?: unknown; reason: string }[] = [];
  const dates = new Set<string>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const headerRow = isDailyReportSheet(sheet);
    if (headerRow == null) continue;
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      range: headerRow,
      defval: null,
    });
    const yearSummary = rawRows.find((row) =>
      /^\d{4}年总计$/.test(String(findValueByNormalizedHeader(row, "日期") ?? "").trim()),
    );
    const monthSummaries: Record<string, Record<string, unknown>> = {};
    for (const row of rawRows) {
      const summaryDate = String(findValueByNormalizedHeader(row, "日期") ?? "").trim();
      const match = summaryDate.match(/^(\d{4})年(\d{1,2})月$/);
      if (match) {
        monthSummaries[`${match[1]}-${String(Number(match[2])).padStart(2, "0")}`] = row;
      }
    }
    const accountName = sheetName
      .replace(/^(3D|UE4|URP)[-_]/i, "")
      .replace(/[-_]安卓端$/i, "")
      .trim();
    for (const row of rawRows) {
      const dateRaw = findValueByNormalizedHeader(row, "日期");
      const date = parseDateText(String(dateRaw ?? "").trim());
      // 汇总行（2026年总计、2026年9月）不属于日数据，不导入。
      if (!date) continue;
      rows.push({
        account_name: accountName,
        subaccount_name: accountName,
        date,
        // 日报是按天累计快照，不属于 23 点小时数据；使用 24 作为占位，
        // 避免与同一天真实的小时 23 点快照共用 cumulative_raw 唯一键。
        hour: 24,
        cost_yuan: parseUnitNumber(findValueByNormalizedHeader(row, "消耗")),
        activations: Math.round(parseUnitNumber(findValueByNormalizedHeader(row, "新增"))),
        payment_yuan: parseUnitNumber(findValueByNormalizedHeader(row, "最新累计付费")),
        start_download: 0,
        finish_download: 0,
        raw: {
          ...row,
          _source_filename: filename,
          _source_sheet: sheetName,
          _summary_year: yearSummary ?? null,
          // 每份日报包含多个月的累计行；按月份保存，避免8月/9月沿用最新月的汇总。
          _summary_months: monthSummaries,
        },
      });
      dates.add(date);
    }
  }

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [{ reason: "未识别到包含日期、消耗、新增、实时净ROI表头的日报 sheet" }],
      date_range_from: null,
      date_range_to: null,
    };
  }
  const sortedDates = [...dates].sort();
  return {
    rows,
    errors,
    date_range_from: sortedDates[0] ?? null,
    date_range_to: sortedDates.at(-1) ?? null,
    granularity: "daily",
  };
}

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
  granularity?: "hourly" | "daily";
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

function findValueByNormalizedHeader(row: Record<string, unknown>, header: string): unknown {
  const wanted = normalizedHeader(header);
  const entry = Object.entries(row).find(([key, value]) => {
    return (
      normalizedHeader(key) === wanted &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
    );
  });
  return entry?.[1];
}

/**
 * 解析百应导出的 Excel（3 种格式：9列/19列/6列），返回标准化行列表。
 *
 * @param buffer  xlsx 文件的 Buffer 或 ArrayBuffer
 * @param filename 原始文件名（用于日期 fallback）
 */
export function parseXlsx(buffer: Buffer | ArrayBuffer, filename: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  if (wb.SheetNames.some((name) => wb.Sheets[name] && isDailyReportSheet(wb.Sheets[name]))) {
    return parseDailyReportWorkbook(wb, filename);
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件无 sheet" }],
      date_range_from: null,
      date_range_to: null,
      granularity: "hourly",
    };
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return {
      rows: [],
      errors: [{ reason: "Excel 文件 sheet 读取失败" }],
      date_range_from: null,
      date_range_to: null,
      granularity: "hourly",
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
    granularity: "hourly",
  };
}
