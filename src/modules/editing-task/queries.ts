import "server-only";
import { db } from "@/db/client";
import {
  editing_task,
  editing_task_event,
  live_account,
  dingtalk_user,
  product_config,
} from "@/db/schema";
import type {
  BoardCard,
  TaskDetail,
  TaskEvent,
  GanttRow,
  MonthlyProductShare,
  StatusCounts,
  EditorMonthlyStat,
  AnchorMonthlyCoverage,
  FishCoverage,
  FishCoverageItem,
  TodaySummary,
  TodayAnchorDist,
  TodayEditorLoad,
} from "./types";
import type { EditingTaskStatus } from "@/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface BoardFilter {
  whereClause?: SQL;
  productNames?: string[];
  accountIds?: string[];
  anchorIds?: string[];
  editorUserIds?: string[];
  dateFrom: string; // 必填
  dateTo: string;
}

export async function listForBoard(args: BoardFilter): Promise<BoardCard[]> {
  const filters: (SQL | undefined)[] = [args.whereClause];
  filters.push(isNull(editing_task.deleted_at));
  if (args.productNames?.length) filters.push(inArray(live_account.product, args.productNames));
  if (args.accountIds?.length) filters.push(inArray(editing_task.live_account_id, args.accountIds));
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
      anchor_name: anchorUser.name, // anchor_profile 显示名字段为 nick_name
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      source_duration_sec: editing_task.source_duration_sec,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      is_disqualified: editing_task.is_disqualified,
      disqualified_reason: editing_task.disqualified_reason,
      priority: editing_task.priority,
      is_duplicate: editing_task.is_duplicate,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchorUser, eq(anchorUser.user_id, editing_task.anchor_id))
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
  source_duration_sec: number | null;
  editing_started_at: Date | null;
  edited_uploaded_at: Date | null;
  reviewed_at: Date | null;
  published_at: Date | null;
  is_disqualified: boolean;
  disqualified_reason: string | null;
  priority: string;
  is_duplicate: boolean;
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
    sourceDurationSec: r.source_duration_sec,
    hasSource: r.source_uploaded_at != null,
    hasEdited: r.edited_uploaded_at != null,
    isDisqualified: r.is_disqualified,
    disqualifiedReason: r.disqualified_reason,
    priority: (r.priority === "urgent"
      ? "urgent"
      : "normal") as import("./types").EditingTaskPriority,
    isDuplicate: r.is_duplicate,
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
const anchorUser = alias(dingtalk_user, "anchor_user");

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
      anchor_name: anchorUser.name,
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      source_duration_sec: editing_task.source_duration_sec,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      // Detail fields
      cover_image: editing_task.cover_image,
      source_files: editing_task.source_files,
      source_file_names: editing_task.source_file_names,
      source_file_hashes: editing_task.source_file_hashes,
      edited_files: editing_task.edited_files,
      edited_file_names: editing_task.edited_file_names,
      edited_file_hashes: editing_task.edited_file_hashes,
      reviewed_by_name: reviewer.name,
      review_watch_seconds: editing_task.review_watch_seconds,
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
      is_duplicate: editing_task.is_duplicate,
      duplicate_of: editing_task.duplicate_of,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchorUser, eq(anchorUser.user_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .leftJoin(creator, eq(creator.user_id, editing_task.created_by_user_id))
    .leftJoin(reviewer, eq(reviewer.user_id, editing_task.reviewed_by_user_id))
    .leftJoin(publisher, eq(publisher.user_id, editing_task.published_by_user_id))
    .leftJoin(disqualifier, eq(disqualifier.user_id, editing_task.disqualified_by_user_id))
    .where(and(eq(editing_task.id, taskId), isNull(editing_task.deleted_at)));

  if (!r) return null;

  const card = toBoardCard(r);
  return {
    ...card,
    sourceFiles: r.source_files,
    sourceFileNames: r.source_file_names,
    sourceFileHashes: r.source_file_hashes,
    sourceUploadedAt: r.source_uploaded_at?.toISOString() ?? null,
    editedFiles: r.edited_files,
    editedFileNames: r.edited_file_names,
    editedFileHashes: r.edited_file_hashes,
    editedUploadedAt: r.edited_uploaded_at?.toISOString() ?? null,
    reviewedByName: r.reviewed_by_name,
    reviewedAt: r.reviewed_at?.toISOString() ?? null,
    reviewWatchSeconds: r.review_watch_seconds,
    publishedByName: r.published_by_name,
    videoId: r.video_id,
    sourceRemark: r.source_remark,
    createdByName: r.created_by_name ?? "(已离职)",
    createdAt: r.created_at.toISOString(),
    disqualifiedByName: r.disqualified_by_name ?? null,
    disqualifiedAt: r.disqualified_at?.toISOString() ?? null,
    urgentReason: r.urgent_reason ?? null,
    coverImage: r.cover_image ?? null,
    duplicateOf: r.duplicate_of ?? null,
  };
}

export interface TableFilter extends BoardFilter {
  statuses?: EditingTaskStatus[];
}

export async function listForTable(args: TableFilter): Promise<BoardCard[]> {
  const filters: (SQL | undefined)[] = [args.whereClause];
  filters.push(isNull(editing_task.deleted_at));
  if (args.productNames?.length) filters.push(inArray(live_account.product, args.productNames));
  if (args.accountIds?.length) filters.push(inArray(editing_task.live_account_id, args.accountIds));
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
      anchor_name: anchorUser.name,
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      source_duration_sec: editing_task.source_duration_sec,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
      is_disqualified: editing_task.is_disqualified,
      disqualified_reason: editing_task.disqualified_reason,
      priority: editing_task.priority,
      is_duplicate: editing_task.is_duplicate,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchorUser, eq(anchorUser.user_id, editing_task.anchor_id))
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

// ---- 甘特图 / 完成统计 ----

/**
 * 按周查询剪辑完成情况（publisher_at 时区转换为 Asia/Shanghai 日期）。
 * 按剪辑师 × 日期 × 产品聚合，返回 GanttRow[]。
 */
export async function queryWeeklyGantt(args: {
  weekStart: string; // YYYY-MM-DD（周一）
  weekEnd: string; // YYYY-MM-DD（周日）
  whereClause?: SQL;
}): Promise<GanttRow[]> {
  // 完成口径：按「交片(edited_uploaded_at = 上传成品)那天」算剪辑师产出
  const filters: (SQL | undefined)[] = [
    args.whereClause,
    isNotNull(editing_task.editor_user_id),
    isNotNull(editing_task.edited_uploaded_at),
    isNull(editing_task.deleted_at),
    gte(
      sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
      sql`${args.weekStart}::date`,
    ),
    lte(
      sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
      sql`${args.weekEnd}::date`,
    ),
  ];

  const rows = await db
    .select({
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      product: live_account.product,
      published_date: sql<string>`((${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date)::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(and(...(filters.filter(Boolean) as SQL[])))
    .groupBy(
      editing_task.editor_user_id,
      dingtalk_user.name,
      live_account.product,
      sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
    );

  // 按 editor 聚合成 GanttRow[]
  const editorMap = new Map<
    string,
    {
      editorUserId: string;
      editorName: string;
      dailyMap: Map<string, number>;
      productMap: Map<string, Map<string, number>>;
    }
  >();

  for (const r of rows) {
    if (!r.editor_user_id) continue;
    const uid = r.editor_user_id;
    const date = r.published_date;
    const product = r.product ?? "未分类";
    const count = r.count;

    if (!editorMap.has(uid)) {
      editorMap.set(uid, {
        editorUserId: uid,
        editorName: r.editor_name ?? "(未知)",
        dailyMap: new Map(),
        productMap: new Map(),
      });
    }
    const entry = editorMap.get(uid);
    if (!entry) continue;
    entry.dailyMap.set(date, (entry.dailyMap.get(date) ?? 0) + count);
    if (!entry.productMap.has(product)) {
      entry.productMap.set(product, new Map());
    }
    const pd = entry.productMap.get(product);
    if (!pd) continue;
    pd.set(date, (pd.get(date) ?? 0) + count);
  }

  return Array.from(editorMap.values())
    .map((entry) => {
      const daily = Array.from(entry.dailyMap.entries()).map(([date, count]) => ({
        date,
        count,
      }));
      const total = daily.reduce((s, x) => s + x.count, 0);
      const products = Array.from(entry.productMap.entries()).map(([product, dateMap]) => {
        const pDaily = Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
        const pTotal = pDaily.reduce((s, x) => s + x.count, 0);
        return { product, total: pTotal, daily: pDaily };
      });
      return {
        editorUserId: entry.editorUserId,
        editorName: entry.editorName,
        total,
        daily,
        products,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * 本月产品占比查询。
 * 按剪辑师 × 产品聚合，计算每个产品占该剪辑师本月完成总量的比例。
 */
export async function queryMonthlyProductShare(args: {
  monthStart: string; // YYYY-MM-01
  monthEnd: string; // YYYY-MM-{last day}
  whereClause?: SQL;
}): Promise<MonthlyProductShare[]> {
  // 完成口径：按交片(edited_uploaded_at = 上传成品)日算
  const filters: (SQL | undefined)[] = [
    args.whereClause,
    isNotNull(editing_task.editor_user_id),
    isNotNull(editing_task.edited_uploaded_at),
    isNull(editing_task.deleted_at),
    gte(
      sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
      sql`${args.monthStart}::date`,
    ),
    lte(
      sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
      sql`${args.monthEnd}::date`,
    ),
  ];

  const rows = await db
    .select({
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      product: live_account.product,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(and(...(filters.filter(Boolean) as SQL[])))
    .groupBy(editing_task.editor_user_id, dingtalk_user.name, live_account.product);

  // 按 editor 聚合
  const editorMap = new Map<
    string,
    {
      editorUserId: string;
      editorName: string;
      byProduct: Map<string, number>;
    }
  >();

  for (const r of rows) {
    if (!r.editor_user_id) continue;
    const uid = r.editor_user_id;
    const product = r.product ?? "未分类";
    if (!editorMap.has(uid)) {
      editorMap.set(uid, {
        editorUserId: uid,
        editorName: r.editor_name ?? "(未知)",
        byProduct: new Map(),
      });
    }
    const entry = editorMap.get(uid);
    if (!entry) continue;
    entry.byProduct.set(product, (entry.byProduct.get(product) ?? 0) + r.count);
  }

  return Array.from(editorMap.values())
    .map((entry) => {
      const byProductArr = Array.from(entry.byProduct.entries()).map(([product, count]) => ({
        product,
        count,
      }));
      const total = byProductArr.reduce((s, x) => s + x.count, 0);
      const byProduct = byProductArr
        .map((x) => ({ ...x, share: total > 0 ? x.count / total : 0 }))
        .sort((a, b) => b.count - a.count);
      return {
        editorUserId: entry.editorUserId,
        editorName: entry.editorName,
        total,
        byProduct,
      };
    })
    .sort((a, b) => b.total - a.total);
}

// ---- 统计视图聚合 ----

/**
 * 当前各状态任务数（不受月份过滤，实时数量）。
 */
export async function queryStatusCounts(args: { whereClause?: SQL }): Promise<StatusCounts> {
  const rows = await db
    .select({
      status: editing_task.status,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task)
    .where(and(args.whereClause, isNull(editing_task.deleted_at)))
    .groupBy(editing_task.status);

  const result: StatusCounts = { uploaded: 0, editing: 0, review: 0, ready: 0, published: 0 };
  for (const r of rows) {
    if (r.status in result) (result as unknown as Record<string, number>)[r.status] = r.count;
  }
  return result;
}

/**
 * 剪辑师月度统计：完成数 + 被回退数 + 回退率。
 */
export async function queryEditorMonthlyStats(args: {
  monthStart: string;
  monthEnd: string;
  whereClause?: SQL;
}): Promise<EditorMonthlyStat[]> {
  // 完成数：本月交片（edited_uploaded_at = 上传成品）且 editor_user_id = X
  const completedRows = await db
    .select({
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(
      and(
        args.whereClause,
        isNotNull(editing_task.edited_uploaded_at),
        isNotNull(editing_task.editor_user_id),
        gte(
          sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
          sql`${args.monthStart}::date`,
        ),
        lte(
          sql`(${editing_task.edited_uploaded_at} AT TIME ZONE 'Asia/Shanghai')::date`,
          sql`${args.monthEnd}::date`,
        ),
        isNull(editing_task.deleted_at),
      ),
    )
    .groupBy(editing_task.editor_user_id, dingtalk_user.name);

  // 被回退数：本月 review_rejected 事件，按 task 当前 editor_user_id 分组
  const rejectedRows = await db
    .select({
      editor_user_id: editing_task.editor_user_id,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task_event)
    .innerJoin(editing_task, eq(editing_task.id, editing_task_event.task_id))
    .where(
      and(
        args.whereClause,
        eq(editing_task_event.event_type, "review_rejected"),
        isNotNull(editing_task.editor_user_id),
        gte(
          sql`(${editing_task_event.created_at} AT TIME ZONE 'Asia/Shanghai')::date`,
          sql`${args.monthStart}::date`,
        ),
        lte(
          sql`(${editing_task_event.created_at} AT TIME ZONE 'Asia/Shanghai')::date`,
          sql`${args.monthEnd}::date`,
        ),
        isNull(editing_task.deleted_at),
      ),
    )
    .groupBy(editing_task.editor_user_id);

  const rejectedMap = new Map(rejectedRows.map((r) => [r.editor_user_id ?? "", r.count]));

  return completedRows
    .filter((r): r is typeof r & { editor_user_id: string } => r.editor_user_id !== null)
    .map((r) => {
      const rejected = rejectedMap.get(r.editor_user_id) ?? 0;
      return {
        editorUserId: r.editor_user_id,
        editorName: r.editor_name ?? "(未知)",
        completed: r.count,
        rejected,
        rejectionRate: r.count > 0 ? rejected / r.count : 0,
      };
    })
    .sort((a, b) => b.completed - a.completed);
}

/**
 * 主播月度上传覆盖度（基于开播记录 live_session_log，只算捕鱼系）：
 * - 应上传 = 该主播本月开播天数（account×anchor×日期 去重，每开播日应出 1 条素材）
 * - 实际上传 = 这些开播日里实际有合格素材上传的天数（material_date 命中同一天）
 * - 覆盖率 = 实际 / 应上传
 */
export async function queryAnchorMonthlyCoverage(args: {
  monthStart: string;
  monthEnd: string;
}): Promise<AnchorMonthlyCoverage[]> {
  const result = await db.execute<{
    anchor_id: string;
    anchor_name: string | null;
    product: string;
    expected: number;
    uploaded: number;
  }>(sql`
    WITH sessions AS (
      SELECT DISTINCT
        sl.live_account_id AS account_id,
        sl.anchor_dingtalk_user_id AS anchor_id,
        (sl.start_at AT TIME ZONE 'Asia/Shanghai')::date AS d,
        la.product
      FROM live_session_log sl
      JOIN live_account la ON la.id = sl.live_account_id
      WHERE (sl.start_at AT TIME ZONE 'Asia/Shanghai')::date
              BETWEEN ${args.monthStart}::date AND ${args.monthEnd}::date
        AND la.product ILIKE ${"%捕鱼%"}
        AND sl.anchor_dingtalk_user_id IS NOT NULL
        -- 只算真主播：部门名含「主播」（排除运营「三组」「直播一部」等）
        AND EXISTS (
          SELECT 1 FROM dingtalk_user du
          JOIN dingtalk_dept dd ON dd.dept_id IN (SELECT jsonb_array_elements_text(du.dept_ids))
          WHERE du.user_id = sl.anchor_dingtalk_user_id AND dd.name LIKE ${"%主播%"}
        )
    ),
    uploaded AS (
      SELECT DISTINCT
        et.live_account_id AS account_id,
        et.anchor_id,
        (et.material_date)::date AS d
      FROM editing_task et
      WHERE (et.material_date)::date BETWEEN ${args.monthStart}::date AND ${args.monthEnd}::date
        AND et.source_uploaded_at IS NOT NULL
        AND et.deleted_at IS NULL
        AND et.is_disqualified = false
    )
    SELECT
      s.anchor_id,
      du.name AS anchor_name,
      s.product AS product,
      COUNT(*)::int AS expected,
      COUNT(u.account_id)::int AS uploaded
    FROM sessions s
    LEFT JOIN uploaded u
      ON u.account_id = s.account_id AND u.anchor_id = s.anchor_id AND u.d = s.d
    LEFT JOIN dingtalk_user du ON du.user_id = s.anchor_id
    GROUP BY s.anchor_id, du.name, s.product
    ORDER BY s.product, expected DESC, uploaded DESC
  `);

  const rows = Array.from(
    result as unknown as Iterable<{
      anchor_id: string;
      anchor_name: string | null;
      product: string;
      expected: number;
      uploaded: number;
    }>,
  );
  return rows.map((r) => ({
    anchorId: r.anchor_id,
    anchorName: r.anchor_name ?? "(未命名)",
    product: r.product,
    expected: Number(r.expected),
    uploaded: Number(r.uploaded),
    missing: Number(r.expected) - Number(r.uploaded),
    coverageRate: Number(r.expected) > 0 ? Number(r.uploaded) / Number(r.expected) : 0,
  }));
}

// ---- 捕鱼系上传覆盖度 ----

/**
 * 查询日期区间内「捕鱼系」账号的上传覆盖情况（跟看板日期筛选走）。
 *
 * 逻辑（基于开播记录，不再用排班）：
 * 1. 从 live_session_log 查 start_at 落在 [dateFrom, dateTo]（Asia/Shanghai 时区）的 session
 * 2. Join live_account 过滤 product ILIKE '%捕鱼%'
 * 3. 查区间内 material_date 已上传（source_uploaded_at IS NOT NULL）的 editing_task
 * 4. 以 (live_account_id, anchor_dingtalk_user_id) 为维度做覆盖度对比
 * 5. 同一 (account_id, anchor_dingtalk_user_id) 可能有多场 session，去重后只计一个
 */
export async function queryFishCoverage(args: {
  dateFrom: string;
  dateTo: string;
}): Promise<FishCoverage> {
  const { dateFrom, dateTo } = args;

  // 1) 查区间内捕鱼账号的开播记录（按 Asia/Shanghai 时区切日期）
  const sessionRows = await db.execute<{
    account_id: string;
    dingtalk_user_id: string;
    account_name: string;
    product: string;
  }>(sql`
    SELECT DISTINCT
      sl.live_account_id AS account_id,
      sl.anchor_dingtalk_user_id AS dingtalk_user_id,
      la.account_name,
      la.product
    FROM live_session_log sl
    JOIN live_account la ON la.id = sl.live_account_id
    WHERE (sl.start_at AT TIME ZONE 'Asia/Shanghai')::date BETWEEN ${dateFrom}::date AND ${dateTo}::date
      AND la.product ILIKE ${"%" + "捕鱼" + "%"}
      AND sl.anchor_dingtalk_user_id IS NOT NULL
      -- 只算真主播：部门名含「主播」（排除运营）
      AND EXISTS (
        SELECT 1 FROM dingtalk_user du
        JOIN dingtalk_dept dd ON dd.dept_id IN (SELECT jsonb_array_elements_text(du.dept_ids))
        WHERE du.user_id = sl.anchor_dingtalk_user_id AND dd.name LIKE ${"%主播%"}
      )
  `);

  const scheduled: {
    account_id: string;
    dingtalk_user_id: string;
    account_name: string;
    product: string;
  }[] = Array.from(
    sessionRows as unknown as Iterable<{
      account_id: string;
      dingtalk_user_id: string;
      account_name: string;
      product: string;
    }>,
  );

  if (scheduled.length === 0) {
    return { date: dateFrom, total: 0, uploaded: 0, missing: 0, items: [] };
  }
  const fishAccountIds = [...new Set(scheduled.map((s) => s.account_id))];

  // 3) 查区间内已上传且未被标记不合格的捕鱼系任务（不合格视为未完成）
  const uploadedTasks = await db
    .select({
      id: editing_task.id,
      live_account_id: editing_task.live_account_id,
      anchor_id: editing_task.anchor_id,
    })
    .from(editing_task)
    .where(
      and(
        sql`${editing_task.material_date}::date BETWEEN ${dateFrom}::date AND ${dateTo}::date`,
        isNotNull(editing_task.source_uploaded_at),
        isNull(editing_task.deleted_at),
        eq(editing_task.is_disqualified, false),
        inArray(editing_task.live_account_id, fishAccountIds),
      ),
    );

  // 4) 查主播名（dingtalk_user 表）
  const userIds = [...new Set(scheduled.map((s) => s.dingtalk_user_id))];
  const userRows = await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(inArray(dingtalk_user.user_id, userIds));
  const nameMap = new Map(userRows.map((u) => [u.user_id, u.name]));

  // 5) 拼 items
  //    匹配逻辑：task.anchor_id 现存 dingtalk_user_id（去 FK 后），直接和排班 dingtalk_user_id 对等比较
  const items: FishCoverageItem[] = scheduled.map((s) => {
    const task = uploadedTasks.find(
      (t) => t.live_account_id === s.account_id && t.anchor_id === s.dingtalk_user_id,
    );

    return {
      liveAccountId: s.account_id,
      liveAccountName: s.account_name,
      product: s.product,
      anchorId: s.dingtalk_user_id,
      anchorName: nameMap.get(s.dingtalk_user_id) ?? null,
      uploaded: !!task,
      taskId: task?.id ?? null,
    };
  });

  return {
    date: dateFrom,
    total: items.length,
    uploaded: items.filter((i) => i.uploaded).length,
    missing: items.filter((i) => !i.uploaded).length,
    items,
  };
}

// ---- 今日统计面板 ----

export async function queryTodaySummary(args: {
  whereClause?: SQL;
  dateFrom: string;
  dateTo: string;
}): Promise<TodaySummary> {
  const tz = "Asia/Shanghai";
  const { dateFrom, dateTo } = args;
  const inRange = (col: AnyColumn) =>
    sql`(${col} AT TIME ZONE ${tz})::date BETWEEN ${dateFrom}::date AND ${dateTo}::date`;

  const [r] = await db
    .select({
      uploaded: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.source_uploaded_at)})::int`,
      assigned: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.editing_started_at)})::int`,
      review: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.edited_uploaded_at)})::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.reviewed_at)})::int`,
      published: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.published_at)})::int`,
    })
    .from(editing_task)
    .where(and(args.whereClause, isNull(editing_task.deleted_at)));

  return {
    uploadedToday: r?.uploaded ?? 0,
    assignedToday: r?.assigned ?? 0,
    reviewToday: r?.review ?? 0,
    approvedToday: r?.approved ?? 0,
    publishedToday: r?.published ?? 0,
  };
}

export async function queryTodayAnchorDist(args: {
  whereClause?: SQL;
}): Promise<TodayAnchorDist[]> {
  const tz = "Asia/Shanghai";
  const rows = await db
    .select({
      anchor_id: editing_task.anchor_id,
      anchor_name: anchorUser.name,
      product: live_account.product,
      count: sql<number>`count(*)::int`,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(anchorUser, eq(anchorUser.user_id, editing_task.anchor_id))
    .where(
      and(
        args.whereClause,
        sql`(${editing_task.material_date})::date = (NOW() AT TIME ZONE ${tz})::date`,
        isNull(editing_task.deleted_at),
      ),
    )
    .groupBy(editing_task.anchor_id, anchorUser.name, live_account.product)
    .orderBy(desc(sql`count(*)`));

  return rows.map((r) => ({
    anchorId: r.anchor_id,
    anchorName: r.anchor_name ?? "(无主播)",
    product: r.product ?? "未分类",
    count: r.count,
  }));
}

export async function queryTodayEditorLoad(args: {
  whereClause?: SQL;
  dateFrom: string;
  dateTo: string;
}): Promise<TodayEditorLoad[]> {
  const tz = "Asia/Shanghai";
  const { dateFrom, dateTo } = args;
  const inRange = (col: AnyColumn) =>
    sql`(${col} AT TIME ZONE ${tz})::date BETWEEN ${dateFrom}::date AND ${dateTo}::date`;

  // 单次扫描，三个区间口径用 FILTER 一次算出：派(领取) / 交片 / 通过(审核)
  const rows = await db
    .select({
      editor_user_id: editing_task.editor_user_id,
      assigned: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.editing_started_at)})::int`,
      submitted: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.edited_uploaded_at)})::int`,
      approved: sql<number>`count(*) FILTER (WHERE ${inRange(editing_task.reviewed_at)})::int`,
    })
    .from(editing_task)
    .where(
      and(
        args.whereClause,
        isNotNull(editing_task.editor_user_id),
        isNull(editing_task.deleted_at),
      ),
    )
    .groupBy(editing_task.editor_user_id);

  // 区间内有任意动作（派/交片/通过）的剪辑师才露出
  const active = rows.filter(
    (r): r is typeof r & { editor_user_id: string } =>
      !!r.editor_user_id && (r.assigned > 0 || r.submitted > 0 || r.approved > 0),
  );
  if (active.length === 0) return [];

  const userNames = await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(
      inArray(
        dingtalk_user.user_id,
        active.map((r) => r.editor_user_id),
      ),
    );
  const nameMap = new Map(userNames.map((u) => [u.user_id, u.name]));

  return active
    .map((r) => ({
      editorUserId: r.editor_user_id,
      editorName: nameMap.get(r.editor_user_id) ?? "(未知)",
      assigned: r.assigned,
      submitted: r.submitted,
      approved: r.approved,
    }))
    .sort((a, b) => b.assigned + b.submitted - (a.assigned + a.submitted));
}

export interface TaskAccountDist {
  accountId: string;
  accountName: string;
  product: string;
}

/**
 * 当前日期范围 + 权限 scope 内「有剪辑任务的直播账号」，按产品 + 账号名排序。
 * 剪辑工作台账号筛选面板用（按产品平铺分组、点击筛选）。
 */
export async function queryTaskAccounts(args: {
  whereClause?: SQL;
  dateFrom: string;
  dateTo: string;
}): Promise<TaskAccountDist[]> {
  const rows = await db
    .selectDistinct({
      account_id: editing_task.live_account_id,
      account_name: live_account.account_name,
      product: live_account.product,
    })
    .from(editing_task)
    .innerJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(
      and(
        args.whereClause,
        isNull(editing_task.deleted_at),
        gte(editing_task.material_date, new Date(args.dateFrom)),
        lte(editing_task.material_date, new Date(args.dateTo)),
      ),
    )
    .orderBy(live_account.product, live_account.account_name);
  return rows.map((r) => ({
    accountId: r.account_id,
    accountName: r.account_name ?? "(未知账号)",
    product: r.product ?? "未分类",
  }));
}
