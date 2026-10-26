import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  recruitment_application,
  recruitment_candidate,
  recruitment_stage_event,
} from "@/db/schema";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

import { resolveRecruitmentAccess } from "./authz";
import { findActiveStaffByNames } from "./center-server";
import { parsePipelineTable, type RecruitmentPipelineImportRow } from "./pipeline-import";

const execFileAsync = promisify(execFile);
const TABLE_NAME = "面试邀约表";

interface DingtalkTableSheet {
  sheetId?: unknown;
  name?: unknown;
  columns?: unknown;
  data?: unknown;
}

interface DingtalkTableResponse {
  sheets?: unknown;
}

export interface RecruitmentPipelineSyncResult {
  sourceRows: number;
  imported: number;
  updated: number;
  unchanged: number;
  skipped: number;
  issues: { row: number; message: string }[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTableResponse(raw: string): { columns: unknown[]; data: unknown[][] } {
  let parsed: DingtalkTableResponse;
  try {
    parsed = JSON.parse(raw) as DingtalkTableResponse;
  } catch {
    throw new AppError("DINGTALK_SHEET_INVALID_RESPONSE", "钉钉表格返回了无法解析的数据", 502);
  }
  const sheets = Array.isArray(parsed.sheets) ? parsed.sheets : [];
  const sheet = sheets.find((item): item is DingtalkTableSheet => {
    if (!isObject(item)) return false;
    const name = item.name;
    const sheetId = item.sheetId;
    return name === TABLE_NAME || sheetId === env.DINGTALK_RECRUITMENT_SHEET_ID;
  });
  if (!sheet) {
    throw new AppError(
      "DINGTALK_SHEET_NOT_FOUND",
      `钉钉表格中找不到“${TABLE_NAME}”，请检查工作表 ID 配置`,
      502,
    );
  }
  const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
  const data = Array.isArray(sheet.data)
    ? sheet.data.filter((row): row is unknown[] => Array.isArray(row))
    : [];
  if (columns.length === 0) {
    throw new AppError("DINGTALK_SHEET_EMPTY", `钉钉表格“${TABLE_NAME}”没有表头`, 502);
  }
  return { columns, data };
}

async function fetchDingtalkPipelineRows(): Promise<ReturnType<typeof parsePipelineTable>> {
  let stdout: string;
  try {
    const profileArgs = env.DINGTALK_CLI_PROFILE ? ["--profile", env.DINGTALK_CLI_PROFILE] : [];
    const result = await execFileAsync(
      env.DINGTALK_CLI_PATH,
      [
        "sheet",
        "table-get",
        ...profileArgs,
        "--node",
        env.DINGTALK_RECRUITMENT_SHEET_URL,
        "--sheet-id",
        env.DINGTALK_RECRUITMENT_SHEET_ID,
        "--range",
        "A1:X1200",
        "--format",
        "json",
      ],
      { maxBuffer: 20 * 1024 * 1024, timeout: 90_000 },
    );
    stdout = String(result.stdout ?? "");
  } catch (error) {
    const code = isObject(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") {
      throw new AppError(
        "DINGTALK_SHEET_CLI_MISSING",
        "本地未找到 dws 命令，请先安装并登录钉钉 DWS CLI",
        503,
      );
    }
    const detail = error instanceof Error ? error.message : String(error);
    throw new AppError("DINGTALK_SHEET_READ_FAILED", `读取钉钉候选人表失败：${detail}`, 502);
  }
  const table = parseTableResponse(stdout);
  return parsePipelineTable(table.columns, table.data, TABLE_NAME);
}

function valueChanged(current: unknown, next: unknown): boolean {
  return (current ?? null) !== (next ?? null);
}

function applicationChanged(
  current: typeof recruitment_application.$inferSelect,
  row: RecruitmentPipelineImportRow,
  recruiterUserId: string | null,
  mentorUserId: string | null,
): boolean {
  return (
    valueChanged(current.project, row.project) ||
    valueChanged(current.channel, row.channel) ||
    valueChanged(current.recruiter_user_id, recruiterUserId) ||
    valueChanged(current.recruiter_name_snapshot, row.recruiterName) ||
    valueChanged(current.stage, row.stage) ||
    valueChanged(current.invited_date, row.invitedDate) ||
    valueChanged(current.interview_date, row.interviewDate) ||
    valueChanged(current.interview_time, row.interviewTime) ||
    valueChanged(current.attendance_status, row.attendanceStatus) ||
    valueChanged(current.initial_result, row.initialResult) ||
    valueChanged(current.final_result, row.finalResult) ||
    valueChanged(current.offer_status, row.offerStatus) ||
    valueChanged(current.expected_join_date, row.expectedJoinDate) ||
    valueChanged(current.actual_join_date, row.actualJoinDate) ||
    valueChanged(current.trial_result, row.trialResult) ||
    valueChanged(current.trial_date, row.actualJoinDate) ||
    valueChanged(current.mentor_user_id, mentorUserId) ||
    valueChanged(current.mentor_name_snapshot, row.mentorName) ||
    valueChanged(current.contract_status, row.contractStatus) ||
    valueChanged(current.leave_date, row.leaveDate) ||
    valueChanged(current.notes, row.notes)
  );
}

/** 从钉钉「面试邀约表」幂等同步候选人流程数据。 */
export async function syncRecruitmentPipelineFromDingtalk(): Promise<RecruitmentPipelineSyncResult> {
  const access = await resolveRecruitmentAccess();
  if (!access.canEditCandidate) {
    throw new AppError("AUTH_FORBIDDEN", "无候选人流程维护权限", 403);
  }

  const parsed = await fetchDingtalkPipelineRows();
  const sourceRows = parsed.rows.length;
  const sourceKeys = parsed.rows.map((row) => row.sourceKey);
  const existingRows =
    sourceKeys.length === 0
      ? []
      : await db
          .select({ application: recruitment_application, candidate: recruitment_candidate })
          .from(recruitment_application)
          .innerJoin(
            recruitment_candidate,
            eq(recruitment_candidate.id, recruitment_application.candidate_id),
          )
          .where(inArray(recruitment_application.source_key, sourceKeys));
  const existingByKey = new Map(
    existingRows
      .map((row) => [row.application.source_key, row] as const)
      .filter((entry): entry is [string, (typeof existingRows)[number]] => Boolean(entry[0])),
  );
  const staffByName = await findActiveStaffByNames(
    parsed.rows.flatMap((row) => [row.recruiterName ?? "", row.mentorName ?? ""]),
  );
  const issues = [...parsed.issues];
  let imported = 0;
  let updated = 0;
  let unchanged = 0;

  await db.transaction(async (tx) => {
    for (const row of parsed.rows) {
      const existing = existingByKey.get(row.sourceKey);
      const recruiterUserId = row.recruiterName
        ? (staffByName.get(row.recruiterName) ?? existing?.application.recruiter_user_id ?? null)
        : null;
      const mentorUserId = row.mentorName
        ? (staffByName.get(row.mentorName) ?? existing?.application.mentor_user_id ?? null)
        : null;

      if (existing) {
        const candidateChanged = valueChanged(existing.candidate.name, row.candidateName);
        const applicationWasChanged = applicationChanged(
          existing.application,
          row,
          recruiterUserId,
          mentorUserId,
        );
        if (!candidateChanged && !applicationWasChanged) {
          unchanged += 1;
          continue;
        }
        const now = new Date();
        if (candidateChanged) {
          await tx
            .update(recruitment_candidate)
            .set({ name: row.candidateName, updated_at: now })
            .where(eq(recruitment_candidate.id, existing.candidate.id));
        }
        if (applicationWasChanged) {
          await tx
            .update(recruitment_application)
            .set({
              project: row.project,
              channel: row.channel,
              recruiter_user_id: recruiterUserId,
              recruiter_name_snapshot: row.recruiterName,
              stage: row.stage,
              invited_date: row.invitedDate,
              interview_date: row.interviewDate,
              interview_time: row.interviewTime,
              attendance_status: row.attendanceStatus,
              initial_result: row.initialResult,
              final_result: row.finalResult,
              offer_status: row.offerStatus,
              expected_join_date: row.expectedJoinDate,
              actual_join_date: row.actualJoinDate,
              trial_result: row.trialResult,
              trial_date: row.actualJoinDate,
              mentor_user_id: mentorUserId,
              mentor_name_snapshot: row.mentorName,
              contract_status: row.contractStatus,
              leave_date: row.leaveDate,
              notes: row.notes,
              updated_at: now,
            })
            .where(eq(recruitment_application.id, existing.application.id));
        }
        if (existing.application.stage !== row.stage) {
          await tx.insert(recruitment_stage_event).values({
            application_id: existing.application.id,
            actor_user_id: access.actorUserId,
            event_type: "application_synced",
            from_stage: existing.application.stage,
            to_stage: row.stage,
            payload: { source: "dingtalk_sheet", sourceRow: row.sourceRow },
          });
        }
        updated += 1;
        continue;
      }

      const candidateId = crypto.randomUUID();
      const applicationId = crypto.randomUUID();
      await tx.insert(recruitment_candidate).values({
        id: candidateId,
        name: row.candidateName,
      });
      await tx.insert(recruitment_application).values({
        id: applicationId,
        candidate_id: candidateId,
        project: row.project,
        channel: row.channel,
        recruiter_user_id: recruiterUserId,
        recruiter_name_snapshot: row.recruiterName,
        stage: row.stage,
        invited_date: row.invitedDate,
        interview_date: row.interviewDate,
        interview_time: row.interviewTime,
        attendance_status: row.attendanceStatus,
        initial_result: row.initialResult,
        final_result: row.finalResult,
        offer_status: row.offerStatus,
        expected_join_date: row.expectedJoinDate,
        actual_join_date: row.actualJoinDate,
        trial_result: row.trialResult,
        trial_date: row.actualJoinDate,
        mentor_user_id: mentorUserId,
        mentor_name_snapshot: row.mentorName,
        contract_status: row.contractStatus,
        leave_date: row.leaveDate,
        notes: row.notes,
        source_key: row.sourceKey,
        created_by_user_id: access.actorUserId,
      });
      await tx.insert(recruitment_stage_event).values({
        application_id: applicationId,
        actor_user_id: access.actorUserId,
        event_type: "application_imported",
        to_stage: row.stage,
        payload: { source: "dingtalk_sheet", sourceRow: row.sourceRow },
      });
      imported += 1;
    }
  });

  for (const row of parsed.rows) {
    if (row.recruiterName && !staffByName.has(row.recruiterName)) {
      issues.push({ row: row.sourceRow, message: `未匹配到招聘人员“${row.recruiterName}”` });
    }
    if (row.mentorName && !staffByName.has(row.mentorName)) {
      issues.push({ row: row.sourceRow, message: `未匹配到带教运营“${row.mentorName}”` });
    }
  }
  await writeSyncAudit(access.actorUserId, { sourceRows, imported, updated, unchanged, issues });
  return {
    sourceRows,
    imported,
    updated,
    unchanged,
    skipped: parsed.issues.length,
    issues: issues.slice(0, 100),
  };
}

async function writeSyncAudit(
  actorUserId: string,
  result: Omit<RecruitmentPipelineSyncResult, "issues" | "skipped"> & {
    issues: { row: number; message: string }[];
  },
): Promise<void> {
  // Keep the audit dependency isolated from the transaction: a failed audit write
  // must not roll back a successful source synchronization.
  const { writeAuditLog } = await import("@/lib/audit");
  await writeAuditLog({
    user_id: actorUserId,
    action: "recruitment.pipeline.sync_dingtalk",
    target_type: "recruitment_application",
    target_id: null,
    after: {
      sourceRows: result.sourceRows,
      imported: result.imported,
      updated: result.updated,
      unchanged: result.unchanged,
      issueCount: result.issues.length,
    },
  });
}
