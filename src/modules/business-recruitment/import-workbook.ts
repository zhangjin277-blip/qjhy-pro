import * as XLSX from "xlsx";

import type { RecruitmentGrade } from "./workflow";

export type ImportPlatform = "douyin" | "kuaishou" | "other";

export interface RecruitmentImportRow {
  sourceRow: number;
  platform: ImportPlatform;
  gameProduct: string;
  anchorName: string;
  gender: "female" | "male" | "unspecified";
  phone: string;
  accountNickname: string;
  accountId: string;
  uid: string | null;
  followerCount: number;
  accountSummary: string | null;
  policy: string | null;
  recruiterName: string | null;
  equipmentStatus: "ready" | "partial" | "missing" | null;
  willingness: "strong" | "medium" | "weak" | null;
  appearancePass: boolean;
  appearanceNote: string | null;
  voicePass: boolean;
  voiceNote: string | null;
  expressionPass: boolean;
  expressionNote: string | null;
  internetSensePass: boolean;
  internetSenseNote: string | null;
  resiliencePass: boolean;
  resilienceNote: string | null;
  operationReviewCount: number | null;
  finalGrade: RecruitmentGrade | null;
  operatorName: string | null;
  operationFeedback: string | null;
  joinDate: string | null;
  firstLiveDate: string | null;
  signingStatus: "pending" | "signed" | "declined";
}

export interface RecruitmentImportIssue {
  row: number;
  message: string;
}

export interface RecruitmentWorkbookParseResult {
  rows: RecruitmentImportRow[];
  issues: RecruitmentImportIssue[];
}

const TEMPLATE_HEADERS = [
  "平台",
  "游戏产品",
  "主播姓名",
  "性别",
  "联系电话",
  "主播账号昵称",
  "主播账号ID",
  "UID",
  "账号粉丝数",
  "账号基础情况",
  "招募政策",
  "招募商务",
  "设备情况",
  "开播意愿",
  "外貌记忆（勾选）",
  "外貌记忆说明",
  "声色表现（勾选）",
  "声色表现说明",
  "口条表达（勾选）",
  "口条表达说明",
  "网感可塑（勾选）",
  "网感可塑说明",
  "心态抗压（勾选）",
  "心态抗压说明",
  "运营复评符合项数",
  "最终主播评级",
  "带教运营",
  "运营反馈",
  "入会日期",
  "开播日期",
  "签约状态",
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_/（）()·:+-]/g, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown): string | null {
  const valueText = text(value);
  return valueText ? valueText : null;
}

function headerIndex(headers: unknown[]): Map<string, number> {
  return new Map(headers.map((header, index) => [normalizeHeader(header), index]));
}

function readCell(row: unknown[], indexes: Map<string, number>, aliases: string[]): unknown {
  for (const alias of aliases) {
    const index = indexes.get(normalizeHeader(alias));
    if (index !== undefined) return row[index];
  }
  return null;
}

function parsePlatform(value: unknown, fallback: ImportPlatform): ImportPlatform | null {
  const valueText = text(value).toLowerCase();
  if (!valueText) return fallback;
  if (valueText.includes("抖音") || valueText === "douyin") return "douyin";
  if (valueText.includes("快手") || valueText === "kuaishou") return "kuaishou";
  if (valueText.includes("其他") || valueText === "other") return "other";
  return null;
}

function parseGender(value: unknown): "female" | "male" | "unspecified" {
  const valueText = text(value).toLowerCase();
  if (valueText === "女" || valueText === "female") return "female";
  if (valueText === "男" || valueText === "male") return "male";
  return "unspecified";
}

function parseFollowerCount(value: unknown): number {
  const valueText = text(value).replace(/,/g, "");
  if (!valueText) return 0;
  const matched = valueText.match(/([\d.]+)\s*万/);
  const raw = matched ? Number(matched[1]) * 10_000 : Number(valueText.replace(/[^\d.]/g, ""));
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}

function parsePass(value: unknown): boolean {
  const valueText = text(value).toLowerCase();
  return ["1", "true", "是", "通过", "达标", "符合", "√", "✓", "勾选", "有"].includes(valueText);
}

function parseCount(value: unknown): number | null {
  const valueText = text(value);
  if (!valueText) return null;
  const count = Number(valueText.replace(/[^\d]/g, ""));
  return Number.isInteger(count) && count >= 0 && count <= 5 ? count : null;
}

function parseGrade(value: unknown): RecruitmentGrade | null {
  const matched = text(value).toUpperCase().match(/[ABC]/);
  return matched ? (matched[0] as RecruitmentGrade) : null;
}

function parseDate(value: unknown): string | null {
  const valueText = text(value);
  if (!valueText) return null;
  const matched = valueText.match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);
  if (!matched) return null;
  const [, year, month, day] = matched;
  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseEquipment(value: unknown): "ready" | "partial" | "missing" | null {
  const valueText = text(value);
  if (!valueText) return null;
  if (/未达标|没有|无设备|缺少/.test(valueText)) return "missing";
  if (/部分|待补|不全/.test(valueText)) return "partial";
  return "ready";
}

function parseWillingness(value: unknown): "strong" | "medium" | "weak" | null {
  const valueText = text(value);
  if (!valueText) return null;
  if (/弱|低|不愿|拒绝/.test(valueText)) return "weak";
  if (/一般|中|沟通/.test(valueText)) return "medium";
  return "strong";
}

function parseSigningStatus(value: unknown): "pending" | "signed" | "declined" {
  const valueText = text(value);
  if (/不签|拒签|拒绝/.test(valueText)) return "declined";
  if (/已签|签约完成/.test(valueText)) return "signed";
  return "pending";
}

export function parseRecruitmentWorkbook(
  buffer: Buffer | ArrayBuffer,
  defaultPlatform: ImportPlatform,
): RecruitmentWorkbookParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return { rows: [], issues: [{ row: 0, message: "文件中没有工作表" }] };
  const firstSheet = workbook.Sheets[firstSheetName];
  if (!firstSheet) return { rows: [], issues: [{ row: 0, message: "文件中没有工作表" }] };
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  const headerRowIndex = matrix.findIndex((row) => {
    const headers = new Set(row.map(normalizeHeader));
    return headers.has(normalizeHeader("游戏产品")) && headers.has(normalizeHeader("主播姓名"));
  });
  if (headerRowIndex < 0) {
    return { rows: [], issues: [{ row: 0, message: "未找到包含“游戏产品、主播姓名”的表头" }] };
  }

  const headerRow = matrix[headerRowIndex];
  if (!headerRow) {
    return { rows: [], issues: [{ row: 0, message: "未找到有效表头" }] };
  }
  const indexes = headerIndex(headerRow);
  const rows: RecruitmentImportRow[] = [];
  const issues: RecruitmentImportIssue[] = [];
  const dataRows = matrix.slice(headerRowIndex + 1, headerRowIndex + 501);
  if (matrix.length - headerRowIndex - 1 > 500) {
    issues.push({ row: 0, message: "单次最多导入 500 行，其余行未处理" });
  }

  dataRows.forEach((row, offset) => {
    const sourceRow = headerRowIndex + offset + 2;
    if (row.every((cell) => !text(cell))) return;
    const gameProduct = text(readCell(row, indexes, ["游戏产品"]));
    const anchorName = text(readCell(row, indexes, ["主播姓名"]));
    const accountId = text(readCell(row, indexes, ["主播账号ID", "账号ID"]));
    const platform = parsePlatform(readCell(row, indexes, ["平台", "渠道"]), defaultPlatform);
    const missing = [
      !gameProduct && "游戏产品",
      !anchorName && "主播姓名",
      !accountId && "主播账号ID",
    ].filter(Boolean);
    if (!platform) missing.push("平台");
    if (missing.length > 0) {
      issues.push({ row: sourceRow, message: `缺少或无法识别：${missing.join("、")}` });
      return;
    }
    if (!platform) return;

    const phone = text(readCell(row, indexes, ["联系电话", "手机号"])) || "-";
    const accountNickname =
      text(readCell(row, indexes, ["主播账号昵称", "账号昵称"])) || anchorName;
    rows.push({
      sourceRow,
      platform,
      gameProduct,
      anchorName,
      gender: parseGender(readCell(row, indexes, ["性别"])),
      phone,
      accountNickname,
      accountId,
      uid: nullableText(readCell(row, indexes, ["UID"])),
      followerCount: parseFollowerCount(readCell(row, indexes, ["账号粉丝数", "粉丝数"])),
      accountSummary: nullableText(readCell(row, indexes, ["账号基础情况"])),
      policy: nullableText(readCell(row, indexes, ["招募政策", "政策"])),
      recruiterName: nullableText(readCell(row, indexes, ["招募商务"])),
      equipmentStatus: parseEquipment(
        readCell(row, indexes, ["设备情况", "设备情况（是否有声卡+电脑）"]),
      ),
      willingness: parseWillingness(readCell(row, indexes, ["开播意愿", "主观意愿"])),
      appearancePass: parsePass(
        readCell(row, indexes, ["外貌记忆（勾选）", "外貌记忆（商务初评）", "外貌记忆"]),
      ),
      appearanceNote: nullableText(readCell(row, indexes, ["外貌记忆说明"])),
      voicePass: parsePass(
        readCell(row, indexes, ["声色表现（勾选）", "声色表现（商务初评）", "声色表现"]),
      ),
      voiceNote: nullableText(readCell(row, indexes, ["声色表现说明"])),
      expressionPass: parsePass(
        readCell(row, indexes, ["口条表达（勾选）", "口条表达（商务初评）", "口条表达"]),
      ),
      expressionNote: nullableText(readCell(row, indexes, ["口条表达说明"])),
      internetSensePass: parsePass(
        readCell(row, indexes, ["网感可塑（勾选）", "网感可塑（商务初评）", "网感可塑"]),
      ),
      internetSenseNote: nullableText(readCell(row, indexes, ["网感可塑说明"])),
      resiliencePass: parsePass(
        readCell(row, indexes, ["心态抗压（勾选）", "心态抗压（商务初评）", "心态抗压"]),
      ),
      resilienceNote: nullableText(readCell(row, indexes, ["心态抗压说明"])),
      operationReviewCount: parseCount(readCell(row, indexes, ["运营复评符合项数"])),
      finalGrade: parseGrade(readCell(row, indexes, ["最终主播评级", "最终评级"])),
      operatorName: nullableText(readCell(row, indexes, ["带教运营"])),
      operationFeedback: nullableText(readCell(row, indexes, ["运营反馈"])),
      joinDate: parseDate(readCell(row, indexes, ["入会日期"])),
      firstLiveDate: parseDate(readCell(row, indexes, ["开播日期", "首次开播日期"])),
      signingStatus: parseSigningStatus(readCell(row, indexes, ["签约状态"])),
    });
  });

  return { rows, issues };
}

export function createRecruitmentImportTemplate(): Buffer {
  const example = [
    "抖音",
    "三国冰河时代",
    "示例主播",
    "女",
    "13800000000",
    "示例昵称",
    "douyin-123456",
    "",
    12000,
    "有直播经验",
    "示例政策",
    "商务姓名",
    "声卡 + 电脑，已达标",
    "强，愿意配合运营",
    "是",
    "形象有辨识度",
    "是",
    "声音清晰",
    "是",
    "表达流畅",
    "否",
    "",
    "是",
    "情绪稳定",
    4,
    "A",
    "运营姓名",
    "试播表现稳定",
    "2026-08-01",
    "2026-08-03",
    "已签约",
  ];
  const workbook = XLSX.utils.book_new();
  const inputSheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_HEADERS], example]);
  inputSheet["!cols"] = TEMPLATE_HEADERS.map((header) => ({
    wch: Math.max(12, header.length + 4),
  }));
  XLSX.utils.book_append_sheet(workbook, inputSheet, "批量导入");
  const helpSheet = XLSX.utils.aoa_to_sheet([
    ["字段", "填写说明"],
    ["平台", "抖音 / 快手 / 其他；留空时使用导入弹窗选择的默认平台"],
    ["必填字段", "游戏产品、主播姓名、主播账号ID"],
    ["五维勾选", "填写 是 / 否；说明列为选填，不参与评级数量计算"],
    ["日期", "建议使用 yyyy-mm-dd，例如 2026-08-18"],
    ["签约状态", "待签约 / 已签约 / 不签约"],
    ["去重规则", "同一平台 + 主播账号ID 已存在时跳过"],
  ]);
  helpSheet["!cols"] = [{ wch: 16 }, { wch: 72 }];
  XLSX.utils.book_append_sheet(workbook, helpSheet, "填写说明");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
