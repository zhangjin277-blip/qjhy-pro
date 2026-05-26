import "server-only";
import { db } from "@/db/client";
import {
  editing_task,
  editing_task_event,
  live_account,
  anchor_profile,
  dingtalk_user,
  product_config,
} from "@/db/schema";
import type { BoardCard, TaskDetail, TaskEvent } from "./types";
import type { EditingTaskStatus } from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface BoardFilter {
  whereClause?: SQL;
  productNames?: string[];
  anchorIds?: string[];
  editorUserIds?: string[];
  dateFrom: string; // 必填
  dateTo: string;
}

export async function listForBoard(args: BoardFilter): Promise<BoardCard[]> {
  const filters: (SQL | undefined)[] = [args.whereClause];
  if (args.productNames?.length) filters.push(inArray(live_account.product, args.productNames));
  if (args.anchorIds?.length) filters.push(inArray(editing_task.anchor_id, args.anchorIds));
  if (args.editorUserIds?.length)
    filters.push(inArray(editing_task.editor_user_id, args.editorUserIds));
  filters.push(gte(editing_task.material_date, new Date(args.dateFrom)));
  filters.push(lte(editing_task.material_date, new Date(args.dateTo)));

  const rows = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      live_account_id: editing_task.live_account_id,
      live_account_name: live_account.account_name,
      product: live_account.product,
      product_short: product_config.display_short,
      product_color: product_config.accent_color,
      anchor_name: anchor_profile.nick_name, // anchor_profile 显示名字段为 nick_name
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      is_disqualified: editing_task.is_disqualified,
      disqualified_reason: editing_task.disqualified_reason,
      priority: editing_task.priority,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(and(...(filters.filter(Boolean) as SQL[])))
    .orderBy(
      sql`CASE WHEN ${editing_task.priority} = 'urgent' THEN 0 ELSE 1 END`,
      desc(editing_task.material_date),
      desc(editing_task.id),
    );

  return rows.map(toBoardCard);
}

function toBoardCard(r: {
  id: number;
  status: BoardCard["status"];
  live_account_id: string;
  live_account_name: string | null;
  product: string | null;
  product_short: string | null;
  product_color: string | null;
  anchor_name: string | null;
  editor_user_id: string | null;
  editor_name: string | null;
  material_date: Date;
  created_at: Date;
  source_uploaded_at: Date | null;
  editing_started_at: Date | null;
  edited_uploaded_at: Date | null;
  reviewed_at: Date | null;
  published_at: Date | null;
  is_disqualified: boolean;
  disqualified_reason: string | null;
  priority: string;
}): BoardCard {
  const enteredAt = pickEnteredStatusAt(r);
  return {
    id: r.id,
    status: r.status,
    liveAccountId: r.live_account_id,
    liveAccountName: r.live_account_name ?? "(未知账号)",
    product: r.product ?? "未分类",
    productShort: r.product_short ?? "?",
    productAccentColor: r.product_color ?? "#94a3b8",
    anchorName: r.anchor_name ?? null,
    editorUserId: r.editor_user_id ?? null,
    editorName: r.editor_name ?? null,
    materialDate: r.material_date.toISOString().slice(0, 10),
    enteredStatusAt: enteredAt.toISOString(),
    publishedAt: r.published_at?.toISOString() ?? null,
    isDisqualified: r.is_disqualified,
    disqualifiedReason: r.disqualified_reason,
    priority: (r.priority === "urgent"
      ? "urgent"
      : "normal") as import("./types").EditingTaskPriority,
  };
}

function pickEnteredStatusAt(r: {
  status: BoardCard["status"];
  created_at: Date;
  source_uploaded_at: Date | null;
  editing_started_at: Date | null;
  edited_uploaded_at: Date | null;
  reviewed_at: Date | null;
  published_at: Date | null;
}): Date {
  switch (r.status) {
    case "uploaded":
      return r.source_uploaded_at ?? r.created_at;
    case "editing":
      return r.editing_started_at ?? r.created_at;
    case "review":
      return r.edited_uploaded_at ?? r.created_at;
    case "ready":
      return r.reviewed_at ?? r.created_at;
    case "published":
      return r.published_at ?? r.created_at;
    default:
      return r.created_at;
  }
}

const creator = alias(dingtalk_user, "creator_user");
const reviewer = alias(dingtalk_user, "reviewer_user");
const publisher = alias(dingtalk_user, "publisher_user");
const disqualifier = alias(dingtalk_user, "disqualifier_user");

export async function getTask(taskId: number): Promise<TaskDetail | null> {
  const [r] = await db
    .select({
      // Board fields
      id: editing_task.id,
      status: editing_task.status,
      live_account_id: editing_task.live_account_id,
      live_account_name: live_account.account_name,
      product: live_account.product,
      product_short: product_config.display_short,
      product_color: product_config.accent_color,
      anchor_name: anchor_profile.nick_name,
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      // Detail fields
      source_files: editing_task.source_files,
      source_file_names: editing_task.source_file_names,
      edited_files: editing_task.edited_files,
      edited_file_names: editing_task.edited_file_names,
      reviewed_by_name: reviewer.name,
      published_by_name: publisher.name,
      video_id: editing_task.video_id,
      source_remark: editing_task.source_remark,
      created_by_name: creator.name,
      is_disqualified: editing_task.is_disqualified,
      disqualified_reason: editing_task.disqualified_reason,
      disqualified_at: editing_task.disqualified_at,
      disqualified_by_name: disqualifier.name,
      priority: editing_task.priority,
      urgent_reason: editing_task.urgent_reason,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .leftJoin(creator, eq(creator.user_id, editing_task.created_by_user_id))
    .leftJoin(reviewer, eq(reviewer.user_id, editing_task.reviewed_by_user_id))
    .leftJoin(publisher, eq(publisher.user_id, editing_task.published_by_user_id))
    .leftJoin(disqualifier, eq(disqualifier.user_id, editing_task.disqualified_by_user_id))
    .where(eq(editing_task.id, taskId));

  if (!r) return null;

  const card = toBoardCard(r);
  return {
    ...card,
    sourceFiles: r.source_files,
    sourceFileNames: r.source_file_names,
    sourceUploadedAt: r.source_uploaded_at?.toISOString() ?? null,
    editedFiles: r.edited_files,
    editedFileNames: r.edited_file_names,
    editedUploadedAt: r.edited_uploaded_at?.toISOString() ?? null,
    reviewedByName: r.reviewed_by_name,
    reviewedAt: r.reviewed_at?.toISOString() ?? null,
    publishedByName: r.published_by_name,
    videoId: r.video_id,
    sourceRemark: r.source_remark,
    createdByName: r.created_by_name ?? "(已离职)",
    createdAt: r.created_at.toISOString(),
    disqualifiedByName: r.disqualified_by_name ?? null,
    disqualifiedAt: r.disqualified_at?.toISOString() ?? null,
    urgentReason: r.urgent_reason ?? null,
  };
}

export interface TableFilter extends BoardFilter {
  statuses?: EditingTaskStatus[];
}

export async function listForTable(args: TableFilter): Promise<BoardCard[]> {
  const filters: (SQL | undefined)[] = [args.whereClause];
  if (args.productNames?.length) filters.push(inArray(live_account.product, args.productNames));
  if (args.anchorIds?.length) filters.push(inArray(editing_task.anchor_id, args.anchorIds));
  if (args.editorUserIds?.length)
    filters.push(inArray(editing_task.editor_user_id, args.editorUserIds));
  if (args.statuses?.length) filters.push(inArray(editing_task.status, args.statuses));
  filters.push(gte(editing_task.material_date, new Date(args.dateFrom)));
  filters.push(lte(editing_task.material_date, new Date(args.dateTo)));

  const rows = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      live_account_id: editing_task.live_account_id,
      live_account_name: live_account.account_name,
      product: live_account.product,
      product_short: product_config.display_short,
      product_color: product_config.accent_color,
      anchor_name: anchor_profile.nick_name,
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      is_disqualified: editing_task.is_disqualified,
      disqualified_reason: editing_task.disqualified_reason,
      priority: editing_task.priority,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(and(...(filters.filter(Boolean) as SQL[])))
    .orderBy(desc(editing_task.material_date), desc(editing_task.id));

  return rows.map(toBoardCard);
}

export async function listEvents(taskId: number): Promise<TaskEvent[]> {
  const rows = await db
    .select({
      id: editing_task_event.id,
      event_type: editing_task_event.event_type,
      actor_user_id: editing_task_event.actor_user_id,
      actor_name: dingtalk_user.name,
      payload: editing_task_event.payload,
      created_at: editing_task_event.created_at,
    })
    .from(editing_task_event)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task_event.actor_user_id))
    .where(eq(editing_task_event.task_id, taskId))
    .orderBy(asc(editing_task_event.created_at));

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorUserId: r.actor_user_id,
    actorName: r.actor_name ?? "(已离职)",
    payload: r.payload as Record<string, unknown>,
    createdAt: r.created_at.toISOString(),
  }));
}
