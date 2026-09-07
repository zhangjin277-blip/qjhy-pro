import * as XLSX from "xlsx";

import type { RecruitmentPipelineImportIssue } from "./center-types";
import { derivePipelineStage, type RecruitmentPipelineStage } from "./center-workflow";

export interface RecruitmentPipelineImportRow {
  sourceRow: number;
  sourceKey: string;
  candidateName: string;
  invitedDate: string;
  channel: string;
  recruiterName: string | null;
  interviewDate: string | null;
  interviewTime: string | null;
  attendanceStatus: "pending" | "attended" | "no_show";
  initialResult: "pending" | "pass" | "fail";
  finalResult: "pending" | "pass" | "fail";
  offerStatus: "pending" | "sent" | "declined";
  expectedJoinDate: string | null;
  actualJoinDate: string | null;
  trialResult: "pending" | "pass" | "fail";
  project: string | null;
  mentorName: string | null;
  contractStatus: "pending" | "signed" | "declined";
  leaveDate: string | null;
  notes: string | null;
  stage: RecruitmentPipelineStage;
}

export interface RecruitmentPipelineParseResult {
  rows: RecruitmentPipelineImportRow[];
  issues: RecruitmentPipelineImportIssue[];
}

function normalized(value: unknown): string {
  return String(value ?? "").trim();
}

function headerKey(value: unknown): string {
  return normalized(value)
    .replace(/[\s_（）()·:+-]/g, "")
    .toLowerCase();
}

function parseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = normalized(value);
  const full = text.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  if (full) {
    const [, year, month, day] = full;
    return `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
  }
  return null;
}

function parseTime(value: unknown): string | null {
  const text = normalized(value).replace(/[：]/g, ":");
  const matched = text.match(/(\d{1,2}):(\d{2})/);
  if (!matched) return null;
  return `${matched[1]?.padStart(2, "0")}:${matched[2]}:00`;
}

function passResult(value: unknown): "pending" | "pass" | "fail" {
  const text = normalized(value);
  if (/通过|^是$|^1$/.test(text)) return "pass";
  if (/未通过|不通过|淘汰|^否$|^0$/.test(text)) return "fail";
  return "pending";
}

function attendance(value: unknown): "pending" | "attended" | "no_show" {
  const text = normalized(value);
  if (/^是$|到面|^1$/.test(text)) return "attended";
  if (/^否$|未到|爽约|^0$/.test(text)) return "no_show";
  return "pending";
}

function read(row: unknown[], indexes: Map<string, number>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const index = indexes.get(headerKey(alias));
    if (index !== undefined) return row[index];
  }
  return null;
}

export function parsePipelineWorkbook(
  buffer: Buffer | ArrayBuffer,
): RecruitmentPipelineParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => name.trim() === "面试邀约表") ?? workbook.SheetNames[0];
  if (!sheetName) return { rows: [], issues: [{ row: 0, message: "文件中没有工作表" }] };
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [], issues: [{ row: 0, message: "无法读取工作表" }] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
  const headerRowIndex = matrix.findIndex((row) => {
    const keys = new Set(row.map(headerKey));
    return keys.has(headerKey("邀约日期")) && keys.has(headerKey("面试者姓名"));
  });
  if (headerRowIndex < 0) {
    return { rows: [], issues: [{ row: 0, message: "未找到“邀约日期、面试者姓名”表头" }] };
  }
  const headers = matrix[headerRowIndex] ?? [];
  const indexes = new Map(headers.map((header, index) => [headerKey(header), index]));
  const rows: RecruitmentPipelineImportRow[] = [];
  const issues: RecruitmentPipelineImportIssue[] = [];

  const dataRows = matrix.slice(headerRowIndex + 1);
  const nonEmptyDataRows = dataRows.filter((row) => row.some((cell) => normalized(cell)));
  dataRows.slice(0, 1000).forEach((row, offset) => {
    const sourceRow = headerRowIndex + offset + 2;
    if (row.every((cell) => !normalized(cell))) return;
    const candidateName = normalized(read(row, indexes, ["面试者姓名", "候选人姓名"]));
    const invitedDate = parseDate(read(row, indexes, ["邀约日期"]));
    if (!candidateName || !invitedDate) {
      issues.push({
        row: sourceRow,
        message: `缺少或无法识别：${[!candidateName && "面试者姓名", !invitedDate && "邀约日期"].filter(Boolean).join("、")}`,
      });
      return;
    }
    const attendanceStatus = attendance(read(row, indexes, ["是否到面"]));
    const initialResult = passResult(read(row, indexes, ["初面"]));
    const finalResult = passResult(read(row, indexes, ["终面"]));
    const offerStatus =
      passResult(read(row, indexes, ["是否发送offer", "是否发送Offer"])) === "pass"
        ? "sent"
        : "pending";
    const expectedJoinDate = parseDate(read(row, indexes, ["预计到岗时间"]));
    const joined = passResult(read(row, indexes, ["是否到岗"])) === "pass";
    const trialResult = passResult(read(row, indexes, ["试播结果"]));
    const leaveDate = parseDate(read(row, indexes, ["离职日期", "离职"]));
    const state = {
      attendanceStatus,
      initialResult,
      finalResult,
      offerStatus,
      actualJoinDate: joined ? expectedJoinDate : null,
      trialResult,
      leaveDate,
      interviewDate: parseDate(read(row, indexes, ["到面日期", "面试日期"])),
    } as const;
    rows.push({
      sourceRow,
      sourceKey: `pipeline:${sheetName}:${sourceRow}`,
      candidateName,
      invitedDate,
      channel: normalized(read(row, indexes, ["招聘渠道"])) || "other",
      recruiterName: normalized(read(row, indexes, ["招聘邀约人", "招聘商务"])) || null,
      interviewDate: state.interviewDate,
      interviewTime: parseTime(read(row, indexes, ["到面时间", "面试时间"])),
      attendanceStatus,
      initialResult,
      finalResult,
      offerStatus,
      expectedJoinDate,
      actualJoinDate: state.actualJoinDate,
      trialResult,
      project: normalized(read(row, indexes, ["分配项目", "项目"])) || null,
      mentorName: normalized(read(row, indexes, ["带教运营"])) || null,
      contractStatus: /已签/.test(normalized(read(row, indexes, ["合同签订", "合同"])))
        ? "signed"
        : "pending",
      leaveDate,
      notes: normalized(read(row, indexes, ["备注"])) || null,
      stage: derivePipelineStage(state),
    });
  });
  if (nonEmptyDataRows.length > 1000) {
    issues.push({ row: 0, message: "单次最多导入 1000 行，其余行未处理" });
  }
  return { rows, issues };
}

/**
 * 将在线表格 table-get 返回的列和二维数据复用现有原表解析规则。
 * DWS 的空单元格可能返回 {}，这里统一转换为 null，避免被当成文本写入。
 */
export function parsePipelineTable(
  columns: unknown[],
  data: unknown[][],
  sheetName = "面试邀约表",
): RecruitmentPipelineParseResult {
  const normalizedRows = data.map((row) =>
    row.map((cell) => (cell && typeof cell === "object" ? null : cell)),
  );
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([columns, ...normalizedRows]);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return parsePipelineWorkbook(buffer);
}
