import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, asc, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  business_goal as goals,
  business_goal_revision as revisions,
  dingtalk_dept,
  dingtalk_user,
} from "@/db/schema";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { businessDate } from "@/lib/business-date";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";
import { getDeptAliasMap } from "@/modules/aliases/server";
import {
  fail,
  definitionSchema,
  inGoalScope,
  mutationSchema,
  metricBatchSchema,
  goalGroupSchema,
  periodSchema,
  previousGoalPeriod,
  requireGoalPoint,
  validateAllocation,
  validateMetricWeights,
  validateProgress,
  splitGoalSchema,
  personalTeamQuerySchema,
  personalGoalsSchema,
  canManageTeamGoals,
  requireGoalOwnerAssignment,
  requireGoalDefinitionAccess,
  publishTeamSchema,
} from "./rules";
import type {
  Goal,
  GoalAccess,
  GoalDefinition,
  GoalList,
  GoalRevision,
  PersonalTeamOption,
  GoalPreview,
  GoalPreviewMode,
} from "./types";

import {
  goalSourceOptions,
  validateGoalBinding,
  resolveGoalSource,
  resolveParticipatingTeamSummary,
  operatorAccountIds,
  type GoalAccountOption,
} from "./sources";
import {
  sameTeamMetric,
  supportsTeamSplit,
  supportsAccountTargetSplit,
  validateTeamAllocation,
  personalDefinition,
} from "./team-allocation";
import { z } from "zod";
import { groupGoals } from "./presentation";
import { goalMetricWeights } from "./weights";
import { teamPublicationPlan } from "./team-publication";
import { participatingTeamScopeSql } from "./visibility";

export async function goalActor(): Promise<GoalAccess> {
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") fail("请先登录有效账号", identity.kind === "unauth" ? 401 : 403);
  const userId = identity.dingtalkUserId;
  if (identity.isEmergency)
    return {
      userId,
      name: "应急管理员",
      isEmergency: true,
      scope: "all",
      points: ["view", "fill", "publish"],
      deptIds: [],
      delegatedIds: null,
    };
  const permission = await resolvePermission(userId, "goals");
  const actor: GoalAccess = {
    userId,
    name: "",
    scope: permission.scope,
    points: [...permission.points],
    deptIds: [],
    delegatedIds: permission.delegatedUserIds ?? null,
  };
  requireGoalPoint(actor);
  const [person] = await db
    .select({ name: dingtalk_user.name })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, userId));
  actor.name = person?.name ?? "员工";
  if (actor.scope === "team") actor.deptIds = await getManagedDeptIds(userId);
  return actor;
}
function hasAny(
  column: SQL | typeof goals.owner_ids | typeof dingtalk_user.dept_ids,
  ids: string[],
): SQL {
  return ids.length
    ? sql`${column} ?| ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[]`
    : sql`false`;
}
export function goalScopeSql(actor: GoalAccess): SQL {
  if (actor.delegatedIds !== null) return hasAny(goals.owner_ids, actor.delegatedIds);
  if (actor.scope === "all") return sql`true`;
  if (actor.scope === "self") return hasAny(goals.owner_ids, [actor.userId]);
  if (actor.scope === "team")
    return (
      or(
        hasAny(goals.owner_ids, [actor.userId]),
        actor.deptIds.length ? inArray(goals.dept_id, actor.deptIds) : sql`false`,
      ) ?? sql`false`
    );
  return sql`false`;
}
function userScopeSql(actor: GoalAccess): SQL {
  if (actor.delegatedIds !== null)
    return actor.delegatedIds.length
      ? inArray(dingtalk_user.user_id, actor.delegatedIds)
      : sql`false`;
  if (actor.scope === "all") return sql`true`;
  return (
    or(
      eq(dingtalk_user.user_id, actor.userId),
      actor.scope === "team" ? hasAny(dingtalk_user.dept_ids, actor.deptIds) : sql`false`,
    ) ?? sql`false`
  );
}
type Row = typeof goals.$inferSelect;
function dto(row: Row): Goal {
  return {
    ...row,
    deleted_at: row.deleted_at?.toISOString() ?? null,
    updated_at: row.updated_at.toISOString(),
  };
}
export async function listGoals(period?: string, home = false): Promise<GoalList> {
  const actor = await goalActor();
  requireGoalPoint(actor);
  if (period) periodSchema.parse(period);
  const items = await db
    .select()
    .from(goals)
    .where(
      and(
        isNull(goals.deleted_at),
        or(goalScopeSql(actor), participatingTeamScopeSql(actor)),
        period ? eq(goals.period, period) : undefined,
        home ? eq(goals.status, "published") : undefined,
      ),
    )
    .orderBy(asc(goals.project), asc(goals.line), asc(goals.metric));
  const access = {
    userId: actor.userId,
    canManageTeam: canManageTeamGoals(actor),
    fill: actor.points.includes("fill"),
    publish: actor.points.includes("publish"),
    scope: actor.scope,
  };
  const resolved: Goal[] = [];
  const cache = new Map();
  const accountCache = new Map<string, Promise<GoalAccountOption[]>>();
  const summaryAccountCache = new Map<string, Promise<GoalAccountOption[]>>();
  for (let i = 0; i < items.length; i += 4)
    resolved.push(
      ...(await Promise.all(
        items
          .slice(i, i + 4)
          .map((row) =>
            inGoalScope(actor, row)
              ? resolveGoalSource(actor, dto(row), cache, accountCache)
              : resolveParticipatingTeamSummary(dto(row), summaryAccountCache),
          ),
      )),
    );
  const sharedTeamOwners = [
    ...new Set(resolved.filter((g) => g.read_only).flatMap((g) => g.owner_ids)),
  ];
  const personnel = await db
    .select({
      id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      deptIds: dingtalk_user.dept_ids,
    })
    .from(dingtalk_user)
    .where(
      and(
        eq(dingtalk_user.active, true),
        or(
          userScopeSql(actor),
          sharedTeamOwners.length ? inArray(dingtalk_user.user_id, sharedTeamOwners) : sql`false`,
        ),
        home
          ? inArray(dingtalk_user.user_id, [...new Set(items.flatMap((g) => g.owner_ids))])
          : undefined,
      ),
    )
    .orderBy(asc(dingtalk_user.name));
  // Team owner names identify the shared goal; their other departments are not part of this grant.
  const users = personnel.map((u) => ({
    ...u,
    deptIds:
      inGoalScope(actor, { owner_ids: [u.id], dept_id: null }) ||
      (actor.scope === "team" &&
        actor.delegatedIds === null &&
        u.deptIds.some((id) => actor.deptIds.includes(id)))
        ? u.deptIds
        : [],
  }));
  const deptIds =
    actor.scope === "team" && actor.delegatedIds === null
      ? [
          ...new Set([
            ...actor.deptIds,
            ...users.filter((u) => u.id === actor.userId).flatMap((u) => u.deptIds),
          ]),
        ]
      : [...new Set(users.flatMap((u) => u.deptIds))];
  const visibleDeptIds = [
    ...new Set([
      ...deptIds,
      ...resolved.filter((g) => g.read_only).flatMap((g) => (g.dept_id ? [g.dept_id] : [])),
    ]),
  ];
  const departments = await db
    .select({ id: dingtalk_dept.dept_id, name: dingtalk_dept.name })
    .from(dingtalk_dept)
    .where(
      home
        ? inArray(dingtalk_dept.dept_id, [
            ...new Set(items.flatMap((g) => (g.dept_id ? [g.dept_id] : []))),
          ])
        : actor.scope === "all" && actor.delegatedIds === null
          ? undefined
          : visibleDeptIds.length
            ? inArray(dingtalk_dept.dept_id, visibleDeptIds)
            : sql`false`,
    )
    .orderBy(asc(dingtalk_dept.name));
  const aliases = await getDeptAliasMap();
  return {
    items: resolved,
    access,
    users,
    departments: departments.map((d) => ({ ...d, name: aliases.get(d.id)?.alias || d.name })),
  };
}
export async function goalHistory(id: string): Promise<GoalRevision[]> {
  const actor = await goalActor();
  requireGoalPoint(actor);
  const [goal] = await db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.id, id), goalScopeSql(actor)));
  if (!goal) fail("目标不存在或无权访问", 404);
  const rows = await db
    .select()
    .from(revisions)
    .where(eq(revisions.goal_id, id))
    .orderBy(desc(revisions.created_at));
  // Old assignments can belong to a broader scope. Do not expose historical snapshots
  // to a new owner when that revision was outside their current authorization.
  return rows
    .filter((r) =>
      [r.before, r.after].every(
        (s) =>
          !s ||
          inGoalScope(actor, {
            dept_id: typeof s.dept_id === "string" ? s.dept_id : null,
            owner_ids: Array.isArray(s.owner_ids) ? (s.owner_ids as string[]) : [],
          }),
      ),
    )
    .map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      actor_name: r.actor_name,
      created_at: r.created_at.toISOString(),
      before: r.before,
      after: r.after,
    }));
}
async function validateAssignment(
  actor: GoalAccess,
  definition: Pick<GoalDefinition, "dept_id" | "owner_ids" | "owner_labels">,
) {
  requireGoalOwnerAssignment(actor, definition.owner_ids);
  if (!inGoalScope(actor, definition)) fail("目标超出可管理范围", 403);
  if (new Set(definition.owner_ids).size !== definition.owner_ids.length) fail("负责人不能重复");
  if (definition.owner_ids.length) {
    const people = await db
      .select({ id: dingtalk_user.user_id, depts: dingtalk_user.dept_ids })
      .from(dingtalk_user)
      .where(
        and(
          inArray(dingtalk_user.user_id, definition.owner_ids),
          eq(dingtalk_user.active, true),
          userScopeSql(actor),
        ),
      );
    if (people.length !== definition.owner_ids.length) fail("负责人无效或超出授权范围", 403);
    const departmentId = definition.dept_id;
    if (departmentId && people.some((p) => !p.depts.includes(departmentId)))
      fail("所选负责人必须属于所选部门；跨部门联合目标请由全范围管理员建立且不限定部门");
  }
  if (definition.dept_id) {
    const [dept] = await db
      .select({ id: dingtalk_dept.dept_id })
      .from(dingtalk_dept)
      .where(eq(dingtalk_dept.dept_id, definition.dept_id));
    // Membership was checked against active people above. Personal filing in one's own
    // department must not depend on having department management privileges.
    const ownAssignment =
      definition.owner_ids.length === 1 && definition.owner_ids[0] === actor.userId;
    if (
      !dept ||
      (actor.scope === "team" && !actor.deptIds.includes(definition.dept_id) && !ownAssignment)
    )
      fail("部门无效或超出授权范围", 403);
  }
  if (definition.owner_labels.length && actor.scope !== "all")
    fail("未绑定负责人仅由全范围管理员配置", 403);
}
const comparableKeys = [
  "period",
  "project",
  "line",
  "dept_id",
  "owner_ids",
  "owner_labels",
  "metric",
  "unit",
  "kind",
  "definition",
  "confirmed",
  "binding",
  "team_parent_id",
] as const;
type GoalCommand = z.infer<typeof mutationSchema>;
type GoalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function teamGroup(
  tx: GoalTransaction,
  actor: GoalAccess,
  id: string,
  linkedRead = false,
): Promise<Goal[]> {
  const [root] = await tx
    .select()
    .from(goals)
    .where(
      and(eq(goals.id, id), isNull(goals.deleted_at), linkedRead ? undefined : goalScopeSql(actor)),
    );
  if (!root || root.team_parent_id || root.binding?.selection === "operators")
    fail("团队目标不存在或无权访问", 404);
  const candidates = await tx
    .select()
    .from(goals)
    .where(
      and(
        eq(goals.period, root.period),
        eq(goals.project, root.project),
        isNull(goals.team_parent_id),
        isNull(goals.deleted_at),
        linkedRead ? undefined : goalScopeSql(actor),
      ),
    );
  return (
    groupGoals(candidates.map(dto)).find((g) => g.items.some((item) => item.id === id))?.items ?? []
  );
}
async function validateTeamMember(
  tx: GoalTransaction,
  actor: GoalAccess,
  child: Row,
  linkedRead = false,
  preserveAccounts = false,
) {
  if (!child.team_parent_id || child.deleted_at || child.status === "closed") return;
  const team = await teamGroup(tx, actor, child.team_parent_id, linkedRead);
  const parent = team.find((g) => sameTeamMetric(g, child));
  if (!parent || parent.status === "closed") fail("所属团队已归档或没有该指标，请先调整团队目标");
  child.weight = parent.weight ?? null;
  child.confirmed = parent.confirmed;
  const otherRows = await tx
    .select()
    .from(goals)
    .where(
      and(
        inArray(
          goals.team_parent_id,
          team.map((g) => g.id),
        ),
        isNull(goals.deleted_at),
      ),
    );
  child.team_parent_id =
    otherRows.find((g) => g.id !== child.id)?.team_parent_id ?? child.team_parent_id;
  const siblings = otherRows.filter(
    (g) => g.id !== child.id && g.status !== "closed" && sameTeamMetric(g, child),
  );
  validateTeamAllocation(child, parent, siblings);
  const idsFor = async (g: GoalDefinition) =>
    g.binding?.account_snapshot_at
      ? g.binding.account_ids
      : g.binding
        ? operatorAccountIds(actor, g.binding, g.dept_id, g.owner_ids)
        : [];
  const childIds = await idsFor(child);
  const accountTargets = child.binding?.account_targets;
  if (supportsAccountTargetSplit(parent)) {
    if (!accountTargets) fail("捕鱼消耗须为每个关联账号填写目标值");
    const keys = Object.keys(accountTargets).sort();
    if (keys.length !== childIds.length || keys.some((id, index) => id !== childIds[index]))
      fail("账号目标必须覆盖该运营当前匹配的全部账号");
    const sum = Object.values(accountTargets).reduce((total, value) => total + value, 0);
    if (!Number.isFinite(sum) || child.target === null || Math.abs(sum - child.target) > 1e-8)
      fail("账号消耗目标合计必须等于运营个人目标");
  } else if (accountTargets) {
    fail("仅捕鱼消耗目标支持按账号拆分");
  }
  const options = parent.binding
    ? await goalSourceOptions(actor, parent.binding.source, parent.binding.product, parent.dept_id)
    : null;
  const allowed = new Set(
    parent.binding?.selection === "accounts"
      ? parent.binding.account_ids
      : options?.accounts.map((a) => a.id),
  );
  if (!childIds.length || (!preserveAccounts && childIds.some((id) => !allowed.has(id))))
    fail("个人自动匹配的账号须在团队统计范围内，请核对团队账号配置");
  const used = new Set<string>();
  for (const sibling of siblings) for (const id of await idsFor(sibling)) used.add(id);
  if (childIds.some((id) => used.has(id)))
    fail("个人账号与其他运营目标重复，请先核对运营归属，避免重复计入");
}
async function validateCommand(actor: GoalAccess, command: GoalCommand) {
  requireGoalPoint(
    actor,
    command.action === "create" || command.action === "progress"
      ? "fill"
      : command.action === "edit" ||
          command.action === "delete" ||
          command.action === "refresh-accounts"
        ? "view"
        : "publish",
  );
  if (command.action === "create" || command.action === "edit") {
    requireGoalDefinitionAccess(actor, command.definition);
    await validateAssignment(actor, command.definition);
  }
}

async function validateAccountTargetSplit(
  actor: GoalAccess,
  parent: Goal,
  ownerId: string,
  target: number,
  accountTargets: Record<string, number> | undefined,
) {
  if (!supportsAccountTargetSplit(parent)) {
    if (accountTargets) fail("仅捕鱼消耗目标支持按账号拆分");
    return;
  }
  if (!accountTargets) fail("捕鱼消耗须为每个关联账号填写目标值");
  if (!parent.binding) fail("团队目标缺少数据绑定");
  const ids = await operatorAccountIds(actor, parent.binding, parent.dept_id, [ownerId]);
  const keys = Object.keys(accountTargets).sort();
  if (keys.length !== ids.length || keys.some((id, index) => id !== ids[index]))
    fail("账号目标必须覆盖该运营当前匹配的全部账号");
  const sum = Object.values(accountTargets).reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum) || Math.abs(sum - target) > 1e-8)
    fail("账号消耗目标合计必须等于运营个人目标");
}

async function applyCommand(
  tx: GoalTransaction,
  actor: GoalAccess,
  command: GoalCommand,
  authorizedTeamCreate = false,
): Promise<Goal> {
  let before: Row | null = null;
  if (command.action !== "create") {
    const [row] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, command.id), isNull(goals.deleted_at), goalScopeSql(actor)))
      .for("update");
    if (!row) fail("目标不存在或无权访问", 404);
    requireGoalOwnerAssignment(actor, row.owner_ids);
    if (!canManageTeamGoals(actor) && row.binding?.selection !== "operators")
      fail("团队目标须由部门负责人或有管理权限的人员操作", 403);
    before = row;
    if (row.version !== command.version) fail("目标已被其他人修改，请刷新后重试", 409);
    if (command.action === "edit") {
      requireGoalPoint(actor, row.status === "draft" ? "fill" : "publish");
      if (row.status === "closed") fail("已归档目标不可调整，请先重新开启");
    }
    if (command.action === "delete") {
      requireGoalPoint(actor, row.status === "draft" ? "fill" : "publish");
    }
  }
  const id = before?.id ?? randomUUID();
  let next: Row;
  if (command.action === "create")
    next = {
      ...command.definition,
      binding: command.definition.binding ?? null,
      team_parent_id: command.definition.team_parent_id ?? null,
      weight: command.definition.weight ?? null,
      id,
      actual: null,
      as_of: null,
      evidence: "",
      status: "draft",
      version: 1,
      created_by: actor.userId,
      deleted_at: null,
      updated_at: new Date(),
    };
  else {
    if (!before) fail("目标不存在", 404);
    const original = before;
    next = { ...original, version: original.version + 1, updated_at: new Date() };
    if (command.action === "edit") {
      Object.assign(next, command.definition, {
        binding: command.definition.binding ?? null,
        team_parent_id: command.definition.team_parent_id ?? null,
      });
      if (comparableKeys.some((k) => !isDeepStrictEqual(original[k] ?? null, next[k] ?? null))) {
        next.actual = null;
        next.as_of = null;
        next.evidence = "";
      }
    } else if (command.action === "refresh-accounts") {
      requireGoalPoint(actor, original.status === "draft" ? "fill" : "publish");
      if (original.status === "closed" || original.binding?.selection !== "operators")
        fail("仅可更新未归档的个人自动归属账号");
    } else if (command.action === "delete") {
      next.deleted_at = new Date();
    } else if (command.action === "progress") {
      validateProgress(dto(next), command.actual, command.as_of, command.evidence, businessDate());
      next.actual = command.actual;
      next.as_of = command.actual === null ? null : command.as_of;
      next.evidence = command.actual === null ? "" : command.evidence;
    } else {
      if (
        (command.action === "publish" && next.status !== "draft") ||
        (command.action === "close" && next.status !== "published") ||
        (command.action === "reopen" && next.status !== "closed")
      )
        fail("目标状态已变化，请刷新后重试", 409);
      next.status = command.action === "close" ? "closed" : "published";
    }
  }
  if (next.binding?.selection === "operators" && command.action !== "delete") {
    const b = next.binding;
    const sameScope =
      before &&
      before.period === next.period &&
      before.dept_id === next.dept_id &&
      isDeepStrictEqual(before.owner_ids, next.owner_ids) &&
      before.binding?.selection === "operators" &&
      before.binding.source === b.source &&
      before.binding.product === b.product;
    if (next.status === "draft")
      next.binding = { ...b, account_ids: [], account_snapshot_at: null };
    else if (
      sameScope &&
      before?.binding?.account_snapshot_at &&
      command.action !== "refresh-accounts"
    )
      next.binding = {
        ...b,
        account_ids: before.binding.account_ids,
        account_snapshot_at: before.binding.account_snapshot_at,
      };
    else {
      const ids = await operatorAccountIds(actor, b, next.dept_id, next.owner_ids);
      if (!ids.length) fail("该运营暂无可匹配账号，不能发布或更新范围");
      next.binding = { ...b, account_ids: ids, account_snapshot_at: new Date().toISOString() };
    }
  }
  if (
    before &&
    before.team_parent_id !== next.team_parent_id &&
    command.action === "edit" &&
    !(authorizedTeamCreate && !before.team_parent_id && before.binding?.selection === "operators")
  )
    fail("个人目标不能通过调整更换所属团队，请新建正确的团队拆分目标");
  if (
    next.binding &&
    ["create", "edit", "publish", "reopen", "refresh-accounts"].includes(command.action)
  )
    await validateGoalBinding(
      actor,
      next.binding,
      next.dept_id,
      next.owner_ids,
      next.status !== "draft" && !!next.binding.account_snapshot_at,
    );
  await validateTeamMember(
    tx,
    actor,
    next,
    authorizedTeamCreate || (!!before && before.team_parent_id === next.team_parent_id),
    command.action !== "refresh-accounts" &&
      !!before?.binding?.account_snapshot_at &&
      before.team_parent_id === next.team_parent_id &&
      isDeepStrictEqual(before.binding, next.binding),
  );
  const rootIds =
    before && !before.team_parent_id && before.binding?.selection !== "operators"
      ? (await teamGroup(tx, actor, id)).map((g) => g.id)
      : [];
  const linked = rootIds.length
    ? await tx
        .select()
        .from(goals)
        .where(and(isNull(goals.deleted_at), inArray(goals.team_parent_id, rootIds)))
    : [];
  // Team metric actions also apply to the matching personal metric rows. The
  // personal rows share the team's representative id, so filter by metric as
  // well; deleting/archiving one metric must not touch the other metrics in
  // the same team group.
  const linkedMetricRows = linked.filter((g) =>
    sameTeamMetric(g, before ? dto(before) : dto(next)),
  );
  if (linkedMetricRows.length && (command.action === "delete" || command.action === "close")) {
    const now = new Date();
    for (const child of linkedMetricRows) {
      if (!inGoalScope(actor, child)) fail("无权同步关联个人目标", 403);
      if (command.action === "close" && child.status === "closed") continue;
      const revised: Row = {
        ...child,
        ...(command.action === "delete" ? { deleted_at: now } : { status: "closed" }),
        version: child.version + 1,
        updated_at: now,
      };
      await tx.update(goals).set(revised).where(eq(goals.id, child.id));
      await tx.insert(revisions).values({
        id: randomUUID(),
        goal_id: child.id,
        action: command.action === "delete" ? "cascade-delete" : "cascade-close",
        before: dto(child) as unknown as Record<string, unknown>,
        after: dto(revised) as unknown as Record<string, unknown>,
        reason:
          (command.action === "delete" ? "删除" : "归档") +
          "团队指标同步处理个人目标：" +
          command.reason,
        actor_id: actor.userId,
        actor_name: actor.name,
      });
    }
  }
  if (
    before &&
    linked.length &&
    command.action === "edit" &&
    groupGoals([dto(before), dto(next)]).length !== 1
  )
    fail("团队已有个人拆分目标，请先处理关联个人目标，再更改团队周期、负责人或归属");
  if (
    before &&
    linked.length &&
    command.action === "edit" &&
    (before.binding?.selection !== next.binding?.selection ||
      !isDeepStrictEqual(before.binding?.account_ids, next.binding?.account_ids))
  )
    fail("团队已有个人拆分目标，请先处理关联个人目标，再更改团队统计账号范围");
  if (command.action === "edit")
    for (const child of linked.filter(
      (g) => g.status !== "closed" && sameTeamMetric(g, before ? dto(before) : dto(next)),
    ))
      validateTeamAllocation(
        child,
        dto(next),
        linked.filter(
          (g) => g.id !== child.id && g.status !== "closed" && sameTeamMetric(g, child),
        ),
      );
  if (before && command.action === "edit" && (before.weight ?? null) !== (next.weight ?? null)) {
    for (const child of linked.filter((g) => g.status !== "closed" && sameTeamMetric(g, before))) {
      const revised = {
        ...child,
        weight: next.weight ?? null,
        version: child.version + 1,
        updated_at: new Date(),
      };
      await tx.update(goals).set(revised).where(eq(goals.id, child.id));
      await tx.insert(revisions).values({
        id: randomUUID(),
        goal_id: child.id,
        action: "team-weights",
        before: dto(child) as unknown as Record<string, unknown>,
        after: dto(revised) as unknown as Record<string, unknown>,
        reason: "继承团队指标权重：" + command.reason,
        actor_id: actor.userId,
        actor_name: actor.name,
      });
    }
  }
  if (next.parent_id && command.action !== "delete") {
    const [parent] = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.id, next.parent_id), isNull(goals.deleted_at), goalScopeSql(actor)));
    if (!parent) fail("关联季度目标不存在或无权访问");
    const siblings = await tx
      .select()
      .from(goals)
      .where(and(eq(goals.parent_id, parent.id), isNull(goals.deleted_at)));
    validateAllocation(
      next,
      dto(parent),
      siblings.filter((g) => g.id !== id),
    );
  }
  const children = await tx
    .select()
    .from(goals)
    .where(and(eq(goals.parent_id, id), isNull(goals.deleted_at)));
  if (command.action === "delete" && children.length)
    fail("仍有关联月度目标，请先解除关联或删除月度目标后再删除季度目标", 409);
  const sharedKeys = comparableKeys.filter((k) => k !== "period" && k !== "team_parent_id");
  const previous = before;
  if (
    previous &&
    command.action === "edit" &&
    sharedKeys.some((k) => !isDeepStrictEqual(previous[k] ?? null, next[k] ?? null))
  ) {
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;
      const monthTeamIds =
        !child.team_parent_id && child.binding?.selection !== "operators"
          ? (await teamGroup(tx, actor, child.id)).map((g) => g.id)
          : [];
      if (monthTeamIds.length) {
        const [dependent] = await tx
          .select({ id: goals.id })
          .from(goals)
          .where(and(inArray(goals.team_parent_id, monthTeamIds), isNull(goals.deleted_at)))
          .limit(1);
        if (dependent) fail("关联月度目标已有个人拆分，请先处理个人目标，再调整季度统计口径");
      }
      if (!inGoalScope(actor, child)) fail("无权同步关联月度目标", 403);
      if (child.status === "closed") fail("关联月度目标已归档，请先重新开启再统一调整口径");
      requireGoalPoint(actor, child.status === "draft" ? "fill" : "publish");
      const shared = Object.fromEntries(sharedKeys.map((k) => [k, next[k]]));
      const revised: Row = {
        ...child,
        ...shared,
        actual: null,
        as_of: null,
        evidence: "",
        version: child.version + 1,
        updated_at: new Date(),
      };
      if (!inGoalScope(actor, revised)) fail("关联月度目标超出授权范围", 403);
      await tx.update(goals).set(revised).where(eq(goals.id, child.id));
      await tx.insert(revisions).values({
        id: randomUUID(),
        goal_id: child.id,
        action: "cascade",
        before: dto(child) as unknown as Record<string, unknown>,
        after: dto(revised) as unknown as Record<string, unknown>,
        reason: "季度口径同步：" + command.reason,
        actor_id: actor.userId,
        actor_name: actor.name,
      });
      children[i] = revised;
    }
  }
  for (const child of children)
    validateAllocation(
      child,
      dto(next),
      children.filter((g) => g.id !== child.id),
    );
  if (before)
    await tx
      .update(goals)
      .set(next)
      .where(and(eq(goals.id, id), eq(goals.version, before.version)));
  else await tx.insert(goals).values(next);
  await tx.insert(revisions).values({
    id: randomUUID(),
    goal_id: id,
    action: command.action,
    before: before ? (dto(before) as unknown as Record<string, unknown>) : null,
    after: dto(next) as unknown as Record<string, unknown>,
    reason: command.reason,
    actor_id: actor.userId,
    actor_name: actor.name,
  });
  return dto(next);
}
export async function mutateGoal(input: unknown): Promise<Goal> {
  const actor = await goalActor();
  const command = mutationSchema.parse(input);
  await validateCommand(actor, command);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    return applyCommand(tx, actor, command);
  });
}
/** Publish one team metric and its confirmed pending personal shares in one transaction. */
export async function publishTeamGoals(input: unknown): Promise<Goal[]> {
  const actor = await goalActor();
  requireGoalPoint(actor, "publish");
  if (!canManageTeamGoals(actor)) fail("只有部门负责人或有管理权限的人员可以联动发布", 403);
  const request = publishTeamSchema.parse(input);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    const team = await teamGroup(tx, actor, request.goal.id);
    const root = team.find((g) => g.id === request.goal.id);
    if (!root) fail("团队指标不存在或无权访问", 404);
    const children = await tx
      .select()
      .from(goals)
      .where(
        and(
          inArray(
            goals.team_parent_id,
            team.map((g) => g.id),
          ),
          isNull(goals.deleted_at),
        ),
      );
    const plan = teamPublicationPlan(actor, root, team, children.map(dto), request);
    const result: Goal[] = [];
    for (const goal of plan) {
      const command: GoalCommand = {
        action: "publish",
        id: goal.id,
        version: goal.version,
        reason: request.reason,
      };
      await validateCommand(actor, command);
      result.push(await applyCommand(tx, actor, command));
    }
    return result;
  });
}
export async function saveGoalMetrics(input: unknown): Promise<Goal[]> {
  const actor = await goalActor();
  const batch = metricBatchSchema.parse(input);
  validateMetricWeights(batch.definitions);
  const commands: GoalCommand[] = batch.definitions.map((definition, index) =>
    index === 0 && batch.edit
      ? { action: "edit", ...batch.edit, definition, reason: batch.reason }
      : { action: "create", definition, reason: batch.reason },
  );
  for (const command of commands) await validateCommand(actor, command);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    const result: Goal[] = [];
    for (const command of commands) result.push(await applyCommand(tx, actor, command));
    return result;
  });
}

type PersonalSourceCache = Map<string, Promise<Awaited<ReturnType<typeof goalSourceOptions>>>>;

/** Reveal only the definition needed to submit a personal share, never team actuals or other owners' accounts. */
async function personalTeamOption(
  tx: GoalTransaction,
  actor: GoalAccess,
  team: Goal[],
  ownerId: string,
  cache: PersonalSourceCache,
): Promise<PersonalTeamOption | null> {
  const current = team.filter((g) => g.status !== "closed" && !g.deleted_at);
  const first = current[0];
  if (
    !first?.binding ||
    !current.length ||
    current.length > 20 ||
    current.some((g) => !supportsTeamSplit(g) || g.target === null || !g.confirmed)
  )
    return null;
  const children = await tx
    .select()
    .from(goals)
    .where(
      and(
        inArray(
          goals.team_parent_id,
          team.map((g) => g.id),
        ),
        isNull(goals.deleted_at),
        sql`${goals.status} <> 'closed'`,
      ),
    );
  const own = children.filter((g) => g.owner_ids.length === 1 && g.owner_ids[0] === ownerId);
  // An eligible operator may read a published team definition, or the parent of their existing goal.
  // This does not widen listGoals, historical records, team actuals, or mutation authorization.
  if (!own.length && current.some((g) => g.status !== "published" && !inGoalScope(actor, g)))
    return null;
  const key = JSON.stringify([first.binding.source, first.binding.product, first.dept_id]);
  let pending = cache.get(key);
  if (!pending) {
    pending = goalSourceOptions(actor, first.binding.source, first.binding.product, first.dept_id);
    cache.set(key, pending);
  }
  const options = await pending;
  if (!options.users.some((u) => u.id === ownerId)) return null;
  const accounts = options.accounts.filter(
    (a) => a.operator_ids?.length === 1 && a.operator_ids[0] === ownerId,
  );
  if (
    !accounts.length ||
    current.some(
      (g) =>
        g.binding?.selection === "accounts" &&
        accounts.some((a) => !g.binding?.account_ids.includes(a.id)),
    )
  )
    return null;
  const aliases = await getDeptAliasMap();
  const [department] = first.dept_id
    ? await tx
        .select({ name: dingtalk_dept.name })
        .from(dingtalk_dept)
        .where(eq(dingtalk_dept.dept_id, first.dept_id))
    : [];
  const owners = first.owner_ids.length
    ? await tx
        .select({ name: dingtalk_user.name })
        .from(dingtalk_user)
        .where(inArray(dingtalk_user.user_id, first.owner_ids))
    : [];
  const weights = goalMetricWeights(current);
  return {
    id: children[0]?.team_parent_id ?? first.id,
    period: first.period,
    project: first.project,
    dept_id: first.dept_id,
    department: first.dept_id
      ? aliases.get(first.dept_id)?.alias || department?.name || "未指定部门"
      : "跨部门",
    owners: owners.map((u) => u.name),
    source: first.binding.source,
    product: first.binding.product,
    accounts: accounts.map(({ id, name, products }) => ({
      id,
      name,
      ...(products ? { products } : {}),
    })),
    metrics: current.map((g, index) => {
      const existing = own.find((child) => sameTeamMetric(child, g));
      const assignedToOthers = children
        .filter((child) => !child.owner_ids.includes(ownerId) && sameTeamMetric(child, g))
        .reduce((sum, child) => sum + (child.target ?? 0), 0);
      return {
        id: g.id,
        version: g.version,
        metric: g.metric,
        unit: g.unit,
        kind: g.kind,
        target: g.target ?? 0,
        weight: weights[index] ?? 0,
        definition: g.definition,
        available: Math.max(0, (g.target ?? 0) - assignedToOthers),
        existing: existing
          ? {
              id: existing.id,
              version: existing.version,
              target: existing.target,
              status: existing.status,
              ...(existing.binding?.account_targets
                ? { account_targets: existing.binding.account_targets }
                : {}),
            }
          : null,
      };
    }),
  };
}

/** The owner must already be inside the caller's normal assignment scope before any parent is read. */
async function validatePersonalOwner(
  actor: GoalAccess,
  ownerId: string,
  departmentId: string | null,
) {
  await validateAssignment(actor, {
    dept_id: departmentId,
    owner_ids: [ownerId],
    owner_labels: [],
  });
}

export async function personalTeamOptions(input: unknown): Promise<PersonalTeamOption[]> {
  const actor = await goalActor();
  requireGoalPoint(actor);
  if (!actor.points.includes("fill") && !actor.points.includes("publish"))
    requireGoalPoint(actor, "fill");
  const query = personalTeamQuerySchema.parse(input);
  await validatePersonalOwner(actor, query.owner_id, query.dept_id);
  return db.transaction(async (tx) => {
    const candidates = query.team_id
      ? await teamGroup(tx, actor, query.team_id, true)
      : (
          await tx
            .select()
            .from(goals)
            .where(
              and(
                eq(goals.period, query.period),
                eq(goals.project, query.project),
                query.dept_id ? eq(goals.dept_id, query.dept_id) : isNull(goals.dept_id),
                isNull(goals.team_parent_id),
                isNull(goals.deleted_at),
              ),
            )
            .orderBy(asc(goals.id))
        ).map(dto);
    const result: PersonalTeamOption[] = [];
    const cache: PersonalSourceCache = new Map();
    for (const group of groupGoals(candidates)) {
      if (
        group.items[0]?.period !== query.period ||
        group.items[0]?.project !== query.project ||
        group.items[0]?.dept_id !== query.dept_id
      )
        continue;
      if (query.source_product && group.items[0]?.binding?.product !== query.source_product)
        continue;
      const option = await personalTeamOption(tx, actor, group.items, query.owner_id, cache);
      if (option) result.push(option);
    }
    return result;
  });
}

/** Operators submit amounts; all metric definitions and weights are rebuilt from the locked team. */
export async function savePersonalGoals(input: unknown): Promise<Goal[]> {
  const actor = await goalActor();
  requireGoalPoint(actor);
  const batch = personalGoalsSchema.parse(input);
  requireGoalOwnerAssignment(actor, [batch.owner_id]);
  if (new Set(batch.targets.map((t) => t.goal.id)).size !== batch.targets.length)
    fail("团队指标不能重复");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    const team = await teamGroup(tx, actor, batch.team_id, true);
    const first = team[0];
    if (!first) fail("团队目标不可用，请重新选择", 404);
    await validatePersonalOwner(actor, batch.owner_id, first.dept_id);
    const option = await personalTeamOption(tx, actor, team, batch.owner_id, new Map());
    if (!option) fail("团队目标尚未发布或口径未确认，或当前运营没有符合团队范围的账号", 403);
    if (
      batch.targets.length !== option.metrics.length ||
      option.metrics.some((g) => !batch.targets.some((t) => t.goal.id === g.id))
    )
      fail("团队指标已变化，请刷新后填写全部指标", 409);
    const result: Goal[] = [];
    for (const entry of batch.targets) {
      const parent = team.find((g) => g.id === entry.goal.id);
      const metric = option.metrics.find((g) => g.id === entry.goal.id);
      if (
        !parent ||
        !metric ||
        parent.version !== entry.goal.version ||
        (metric.existing &&
          (metric.existing.id !== entry.edit?.id || metric.existing.version !== entry.edit.version))
      )
        fail("团队或个人目标已变化，请刷新后重试", 409);
      if (!metric.existing && entry.edit) {
        const [legacy] = await tx
          .select()
          .from(goals)
          .where(and(eq(goals.id, entry.edit.id), isNull(goals.deleted_at), goalScopeSql(actor)))
          .for("update");
        if (
          !legacy ||
          legacy.version !== entry.edit.version ||
          legacy.team_parent_id ||
          legacy.status === "closed" ||
          legacy.binding?.selection !== "operators" ||
          legacy.period !== parent.period ||
          legacy.project !== parent.project ||
          legacy.dept_id !== parent.dept_id ||
          legacy.owner_ids.length !== 1 ||
          legacy.owner_ids[0] !== batch.owner_id ||
          !sameTeamMetric(legacy, parent)
        )
          fail("原个人目标与团队指标不匹配或已变化，不能建立关联", 409);
      }
      const definition = definitionSchema.parse(
        personalDefinition(parent, batch.owner_id, entry.target, option.id),
      );
      if (entry.account_targets) {
        if (!definition.binding) fail("团队目标缺少数据绑定");
        definition.binding = { ...definition.binding, account_targets: entry.account_targets };
      }
      const parsedDefinition = definitionSchema.parse(definition);
      const command: GoalCommand = entry.edit
        ? { action: "edit", ...entry.edit, definition: parsedDefinition, reason: batch.reason }
        : { action: "create", definition: parsedDefinition, reason: batch.reason };
      await validateCommand(actor, command);
      result.push(await applyCommand(tx, actor, command, true));
    }
    return result;
  });
}

/** Create one personal metric per operator/team metric, with one atomic audit trail. */
export async function splitTeamGoals(input: unknown): Promise<Goal[]> {
  const actor = await goalActor();
  requireGoalPoint(actor, "fill");
  if (!canManageTeamGoals(actor)) fail("只有部门负责人或有管理权限的人员可以拆分团队目标", 403);
  const batch = splitGoalSchema.parse(input);
  if (
    new Set(batch.goals.map((g) => g.id)).size !== batch.goals.length ||
    new Set(batch.allocations.map((a) => a.owner_id)).size !== batch.allocations.length
  )
    fail("团队指标及运营人员不能重复");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    const rows = await tx
      .select()
      .from(goals)
      .where(
        and(
          inArray(
            goals.id,
            batch.goals.map((g) => g.id),
          ),
          isNull(goals.deleted_at),
          goalScopeSql(actor),
        ),
      )
      .for("update");
    if (rows.length !== batch.goals.length) fail("团队目标不存在或无权访问", 404);
    for (const ref of batch.goals)
      if (rows.find((g) => g.id === ref.id)?.version !== ref.version)
        fail("团队目标已变更，请刷新后重新拆分", 409);
    if (
      groupGoals(rows.map(dto)).length !== 1 ||
      rows.some((g) => !supportsTeamSplit(g) || g.status === "closed" || g.target === null)
    )
      fail("请选择同一团队的未归档累计指标，并先填写团队目标值");
    const first = rows[0];
    if (!first) fail("团队目标不存在", 404);
    const fullTeam = await teamGroup(tx, actor, first.id);
    if (fullTeam.filter((g) => g.status !== "closed").some((g) => !rows.some((r) => r.id === g.id)))
      fail("请在团队分组上操作，完整拆分当前全部指标");
    const existing = await tx
      .select()
      .from(goals)
      .where(
        and(
          inArray(
            goals.team_parent_id,
            fullTeam.map((g) => g.id),
          ),
          isNull(goals.deleted_at),
        ),
      );
    const representative = existing[0]?.team_parent_id ?? rows.map((g) => g.id).sort()[0];
    if (!representative) fail("团队目标不存在", 404);
    const result: Goal[] = [];
    for (const allocation of batch.allocations) {
      if (
        allocation.targets.length !== rows.length ||
        new Set(allocation.targets.map((t) => t.goal_id)).size !== rows.length
      )
        fail("请为每位运营填写团队的全部指标目标值");
      for (const parent of rows) {
        const targetEntry = allocation.targets.find((t) => t.goal_id === parent.id);
        const target = targetEntry?.target;
        if (target === undefined || !parent.binding) fail("请填写每项指标的个人目标值");
        await validateAccountTargetSplit(
          actor,
          dto(parent),
          allocation.owner_id,
          target,
          targetEntry?.account_targets,
        );
        const definition = personalDefinition(dto(parent), allocation.owner_id, target, representative);
        if (targetEntry?.account_targets) {
          if (!definition.binding) fail("团队目标缺少数据绑定");
          definition.binding = {
            ...definition.binding,
            account_targets: targetEntry.account_targets,
          };
        }
        const parsedDefinition = definitionSchema.parse(definition);
        const command: GoalCommand = { action: "create", definition: parsedDefinition, reason: batch.reason };
        await validateCommand(actor, command);
        result.push(await applyCommand(tx, actor, command));
      }
    }
    return result;
  });
}

/** Apply one project/owner group atomically, retaining each metric's identity and status. */
export async function mutateGoalGroup(input: unknown): Promise<Goal[]> {
  const actor = await goalActor();
  const batch = goalGroupSchema.parse(input);
  if (batch.action === "edit-group") validateMetricWeights(batch.entries.map((e) => e.definition));
  const commands: GoalCommand[] =
    batch.action === "edit-group"
      ? batch.entries.map(({ edit, definition }) =>
          edit
            ? { action: "edit", ...edit, definition, reason: batch.reason }
            : { action: "create", definition, reason: batch.reason },
        )
      : batch.goals.map((ref) => ({ action: "close", ...ref, reason: batch.reason }));
  const ids = commands.flatMap((command) => (command.action === "create" ? [] : [command.id]));
  if (!ids.length || new Set(ids).size !== ids.length) fail("分组须包含不重复的已有目标");
  for (const command of commands) await validateCommand(actor, command);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(82731582)`);
    const originals = await tx
      .select()
      .from(goals)
      .where(and(inArray(goals.id, ids), isNull(goals.deleted_at), goalScopeSql(actor)))
      .for("update");
    if (originals.length !== ids.length) fail("目标不存在或无权访问", 404);
    if (groupGoals(originals.map(dto)).length !== 1) fail("只能一起操作同一项目负责人分组的目标");
    if (batch.action === "edit-group") {
      const first = originals[0];
      if (!first) fail("目标不存在", 404);
      const definitions = batch.entries.map((entry) => ({ ...first, ...entry.definition }) as Row);
      if (groupGoals(definitions.map(dto)).length !== 1)
        fail("调整后的指标须属于同一项目负责人分组");
    }
    const result: Goal[] = [];
    for (const command of commands) result.push(await applyCommand(tx, actor, command));
    return result;
  });
}

export async function sourceOptions(
  source: string,
  product: string,
  departmentId: string | null = null,
) {
  const actor = await goalActor();
  requireGoalPoint(actor, "fill");
  return goalSourceOptions(
    actor,
    z.enum(["douyin", "buyu"]).parse(source),
    product,
    departmentId ? z.string().min(1).max(150).parse(departmentId) : null,
  );
}
export async function previewGoal(
  input: unknown,
  mode: GoalPreviewMode = "current",
): Promise<GoalPreview> {
  const actor = await goalActor();
  requireGoalPoint(actor, "fill");
  const definition = definitionSchema.parse(input);
  await validateAssignment(actor, definition);
  if (!definition.binding) fail("请先选择来源指标");
  await validateGoalBinding(actor, definition.binding, definition.dept_id, definition.owner_ids);
  const goal: Goal = {
    ...definition,
    // A read-only preview can inspect source data before the user confirms the saved goal.
    confirmed: true,
    id: "preview",
    actual: null,
    as_of: null,
    evidence: "",
    status: "draft",
    version: 1,
    created_by: actor.userId,
    updated_at: new Date().toISOString(),
  };
  const previous = mode === "current" ? null : previousGoalPeriod(goal.period);
  const scopeCache: NonNullable<Parameters<typeof resolveGoalSource>[2]> = new Map();
  const accountCache: NonNullable<Parameters<typeof resolveGoalSource>[3]> = new Map();
  const resolve = (period: string) =>
    resolveGoalSource(actor, { ...goal, period }, scopeCache, accountCache);
  if (mode === "previous") {
    if (!previous) fail("没有可查询的上一周期");
    return resolve(previous);
  }
  const [current, prior] = await Promise.all([
    resolve(goal.period),
    previous ? resolve(previous) : Promise.resolve(undefined),
  ]);
  return { ...current, ...(prior ? { previous: prior } : {}) };
}
