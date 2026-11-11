import "server-only";

import * as XLSX from "xlsx";

import { AppError } from "@/lib/errors";

import { bulkConfigurePeopleProfiles } from "./actions";
import { resolvePerformanceAccess } from "./authz";
import { listPeoplePerformance, listPerformanceManagerOptions } from "./server";

interface ImportedGoal {
  title: string;
  description: string;
  metric: string;
  targetValue: string;
  weight: number;
}

export interface ImportedProfile {
  name: string;
  hireDate?: string;
  employmentStatus: "probation" | "regular";
  probationMonths: 2 | 3 | 6;
  managerName: string;
  skipManagerName: string | null;
  probationGoals: ImportedGoal[];
  performanceGoals: ImportedGoal[];
}

const COLUMNS = [
  "姓名",
  "入职日期",
  "岗位（备注）",
  "人员状态",
  "试用期时长",
  "直接上级",
  "隔级上级",
  "目标类型",
  "目标名称",
  "权重",
  "目标说明",
  "衡量标准",
] as const;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function excelDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const normalized = text(value)
    .replace(/[./年]/g, "-")
    .replace(/月/g, "-")
    .replace(/日/g, "");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return undefined;
  const [, year, month, day] = match;
  if (!year || !month || !day) return undefined;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function status(value: unknown, row: number): "probation" | "regular" {
  const normalized = text(value).toLowerCase();
  if (["试用", "试用期", "probation"].includes(normalized)) return "probation";
  if (["正式", "regular"].includes(normalized)) return "regular";
  throw new AppError("PERFORMANCE_IMPORT_INVALID", `第${row}行人员状态应为“试用期”或“正式”`, 400);
}

function goalType(value: unknown, row: number): "probation" | "performance" {
  const normalized = text(value).toLowerCase();
  if (["试用", "试用期", "probation"].includes(normalized)) return "probation";
  if (["绩效", "正式绩效", "performance"].includes(normalized)) return "performance";
  throw new AppError("PERFORMANCE_IMPORT_INVALID", `第${row}行目标类型应为“试用期”或“绩效”`, 400);
}

export function parsePeoplePerformanceWorkbook(buffer: Buffer): ImportedProfile[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  if (!sheet) throw new AppError("PERFORMANCE_IMPORT_EMPTY", "表格中没有可读取的工作表", 400);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) throw new AppError("PERFORMANCE_IMPORT_EMPTY", "表格中没有配置数据", 400);

  const profiles = new Map<string, ImportedProfile>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const name = text(row["姓名"]);
    const managerName = text(row["直接上级"]);
    const goalTitle = text(row["目标名称"]);
    const weight = Number(row["权重"]);
    if (!name || !managerName || !goalTitle || !Number.isFinite(weight) || weight <= 0) {
      throw new AppError(
        "PERFORMANCE_IMPORT_INVALID",
        `第${rowNumber}行须填写姓名、直接上级、目标名称及有效权重`,
        400,
      );
    }
    const employmentStatus = status(row["人员状态"], rowNumber);
    const monthsValue = Number(row["试用期时长"] || 2);
    if (monthsValue !== 2 && monthsValue !== 3 && monthsValue !== 6) {
      throw new AppError(
        "PERFORMANCE_IMPORT_INVALID",
        `第${rowNumber}行试用期时长只能为2、3或6`,
        400,
      );
    }
    const hireDate = excelDate(row["入职日期"]);
    if (row["入职日期"] && !hireDate) {
      throw new AppError("PERFORMANCE_IMPORT_INVALID", `第${rowNumber}行入职日期格式无效`, 400);
    }
    const skipManagerName = text(row["隔级上级"]) || null;
    const existing = profiles.get(name);
    if (
      existing &&
      (existing.managerName !== managerName ||
        existing.skipManagerName !== skipManagerName ||
        existing.employmentStatus !== employmentStatus ||
        existing.probationMonths !== monthsValue ||
        (existing.hireDate && hireDate && existing.hireDate !== hireDate))
    ) {
      throw new AppError(
        "PERFORMANCE_IMPORT_INCONSISTENT",
        `${name}的档案字段在不同目标行中不一致`,
        400,
      );
    }
    const profile = existing ?? {
      name,
      hireDate,
      employmentStatus,
      probationMonths: monthsValue,
      managerName,
      skipManagerName,
      probationGoals: [],
      performanceGoals: [],
    };
    if (!profile.hireDate && hireDate) profile.hireDate = hireDate;
    const target = goalType(row["目标类型"], rowNumber);
    profile[target === "probation" ? "probationGoals" : "performanceGoals"].push({
      title: goalTitle,
      description: text(row["目标说明"]),
      metric: text(row["衡量标准"]),
      targetValue: text(row["衡量标准"]),
      weight,
    });
    profiles.set(name, profile);
  });

  for (const profile of profiles.values()) {
    for (const [label, goals] of [
      ["试用期", profile.probationGoals],
      ["绩效", profile.performanceGoals],
    ] as const) {
      if (goals.length > 20) {
        throw new AppError(
          "PERFORMANCE_IMPORT_INVALID",
          `${profile.name}的${label}目标不能超过20项`,
          400,
        );
      }
      const total = goals.reduce((sum, goal) => sum + goal.weight, 0);
      if (goals.length > 0 && Math.abs(total - 100) >= 0.01) {
        throw new AppError(
          "PERFORMANCE_IMPORT_INVALID",
          `${profile.name}的${label}目标权重合计为${total}%，应为100%`,
          400,
        );
      }
    }
  }
  return [...profiles.values()];
}

function uniqueByName<T extends { name: string }>(items: T[]): Map<string, T | null> {
  const result = new Map<string, T | null>();
  for (const item of items) result.set(item.name, result.has(item.name) ? null : item);
  return result;
}

export async function importPeoplePerformanceWorkbook(buffer: Buffer): Promise<{
  configured: number;
  failed: { name: string; reason: string }[];
}> {
  const access = await resolvePerformanceAccess();
  if (!access.manageProfiles) throw new AppError("AUTH_FORBIDDEN", "无人员考核档案管理权限", 403);
  const imported = parsePeoplePerformanceWorkbook(buffer);
  const [people, managers] = await Promise.all([
    listPeoplePerformance(),
    listPerformanceManagerOptions(),
  ]);
  const peopleByName = uniqueByName(people);
  const managersByName = uniqueByName(managers);
  const failed: { name: string; reason: string }[] = [];
  let configured = 0;

  for (const profile of imported) {
    const person = peopleByName.get(profile.name);
    const manager = managersByName.get(profile.managerName);
    const skipManager = profile.skipManagerName
      ? managersByName.get(profile.skipManagerName)
      : undefined;
    if (person === undefined) {
      failed.push({ name: profile.name, reason: "人员管理中未找到该姓名" });
      continue;
    }
    if (person === null) {
      failed.push({ name: profile.name, reason: "存在同名人员，请改用单人配置" });
      continue;
    }
    if (manager === undefined || manager === null) {
      failed.push({ name: profile.name, reason: `无法唯一匹配直接上级“${profile.managerName}”` });
      continue;
    }
    if (profile.skipManagerName && (skipManager === undefined || skipManager === null)) {
      failed.push({
        name: profile.name,
        reason: `无法唯一匹配隔级上级“${profile.skipManagerName}”`,
      });
      continue;
    }
    try {
      const result = await bulkConfigurePeopleProfiles({
        userIds: [person.userId],
        managerUserId: manager.userId,
        skipManagerUserId: skipManager?.userId ?? null,
        hireDateOverride: profile.hireDate,
        employmentStatus: profile.employmentStatus,
        probationMonths: profile.probationMonths,
        applyProbationGoals: profile.probationGoals.length > 0,
        probationGoals: profile.probationGoals,
        applyPerformanceGoals: profile.performanceGoals.length > 0,
        performanceGoals: profile.performanceGoals,
      });
      if (result.failed[0]) failed.push({ name: profile.name, reason: result.failed[0].reason });
      else configured += result.configured;
    } catch (error) {
      failed.push({
        name: profile.name,
        reason: error instanceof Error ? error.message : "配置失败",
      });
    }
  }
  return { configured, failed };
}

export function createPeoplePerformanceTemplate(): Buffer {
  const workbook = XLSX.utils.book_new();
  const rows = [
    [...COLUMNS],
    [
      "张三",
      "2026-08-01",
      "运营",
      "正式",
      2,
      "李经理",
      "王总监",
      "绩效",
      "月度业绩",
      60,
      "完成当月项目目标",
      "实际完成率",
    ],
    [
      "张三",
      "2026-08-01",
      "运营",
      "正式",
      2,
      "李经理",
      "王总监",
      "绩效",
      "协作质量",
      40,
      "保障跨部门协作",
      "按期交付且无重大返工",
    ],
    [
      "李四",
      "2026-08-15",
      "后期",
      "试用期",
      2,
      "赵经理",
      "",
      "试用期",
      "岗位胜任",
      100,
      "掌握岗位工作流程",
      "独立完成指定任务",
    ],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = COLUMNS.map((column) => ({ wch: Math.max(column.length * 2 + 4, 14) }));
  XLSX.utils.book_append_sheet(workbook, sheet, "批量配置");
  const instructions = XLSX.utils.aoa_to_sheet([
    ["填写说明"],
    ["一行代表一个考核目标；同一员工有多个目标时重复填写档案字段。"],
    ["人员状态填写“试用期”或“正式”；目标类型填写“试用期”或“绩效”。"],
    [
      "试用期时长填写2、3或6（单位：月）；2个月和3个月为单个完整考核周期，6个月按第1、3、5月节点考核。",
    ],
    ["同一员工、同一目标类型的权重合计必须为100。隔级上级可以留空。"],
    ["入职日期建议填写；留空时系统会先读取已有档案，再实时补抓钉钉花名册。"],
  ]);
  instructions["!cols"] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "填写说明");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
