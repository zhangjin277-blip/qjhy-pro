import { z } from "zod";
import { AppError } from "@/lib/errors";
import type { Goal, GoalAccess, GoalDefinition } from "./types";
import {
  metricOption,
  SOURCE_PRODUCTS,
  isAdditiveMetric,
  BUYU_TOTAL_PRODUCT,
  BUYU_SOURCE_PRODUCTS,
} from "./catalog";

export const periodSchema = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2]|Q[1-4])$/, "周期应为 YYYY-MM 或 YYYY-Q1");
const nullableNumber = z.number().finite().min(0).max(1e12).nullable();
const qualificationSchema = z
  .object({
    roi: z.number().finite().min(0).max(10000),
    min_cost: z.number().finite().min(0).max(1e12),
  })
  .strict();
export const bindingSchema = z
  .object({
    source: z.enum(["douyin", "buyu"]),
    product: z.string().min(1).max(150),
    field: z.string().min(1).max(150),
    selection: z.enum(["all", "accounts", "operators"]),
    account_snapshot_at: z.string().datetime().nullable().optional(),
    account_ids: z
      .array(z.string().min(1).max(150))
      .max(2000)
      .transform((ids) => [...ids].sort()),
    direction: z.enum(["gte", "lte"]),
    qualification: qualificationSchema.nullable(),
    qualification_by_product: z
      .object({
        product_buyu: qualificationSchema,
        product_ue4: qualificationSchema,
        product_urp: qualificationSchema,
      })
      .strict()
      .optional(),
    account_targets: z
      .record(z.string().min(1).max(150), z.number().finite().min(0).max(1e12))
      .optional(),
  })
  .strict();
export const definitionSchema = z
  .object({
    period: periodSchema,
    project: z.string().trim().min(1).max(40),
    line: z.string().trim().min(1).max(60),
    dept_id: z.string().min(1).max(150).nullable(),
    owner_ids: z.array(z.string().min(1).max(150)).max(10),
    owner_labels: z.array(z.string().trim().min(1).max(80)).max(10),
    metric: z.string().trim().min(1).max(60),
    binding: bindingSchema.nullable().optional(),
    unit: z.string().trim().min(1).max(12),
    kind: z.enum(["sum", "count", "ratio"]),
    target: nullableNumber,
    weight: z.number().finite().min(0).max(100).nullable().optional(),
    definition: z.string().trim().max(2000),
    confirmed: z.boolean(),
    parent_id: z.string().uuid().nullable(),
    team_parent_id: z.string().uuid().nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.binding) {
      const b = v.binding,
        m = metricOption(b.source, b.field);
      const error = (message: string) => ctx.addIssue({ code: "custom", message });
      const product = SOURCE_PRODUCTS[b.source].find((p) => p.id === b.product);
      if (!product) error("请选择已配置的来源产品");
      else if (v.project !== (b.source === "buyu" ? "捕鱼" : product.name))
        error("目标项目须与来源产品一致");
      if (!m?.selectable) error("该指标不支持数值目标");
      else if (v.metric !== m.label || v.unit !== m.unit || v.kind !== m.kind)
        error("指标名称、单位与类型必须与数据源一致");
      if (b.selection === "accounts" && !b.account_ids.length) error("请至少选择一个统计账号");
      if (b.selection === "all" && b.account_ids.length) error("全产品范围不能同时指定账号");
      if (b.selection === "operators" && v.owner_ids.length !== 1)
        error("个人运营目标请选择一位运营负责人，账号将自动匹配");
      if (b.account_targets) {
        if (b.source !== "buyu" || b.field !== "消耗" || b.selection !== "operators")
          error("账号级目标仅适用于捕鱼消耗的个人自动匹配目标");
        if (!v.team_parent_id) error("账号级目标须关联团队目标");
      }
      if (v.team_parent_id && b.selection !== "operators")
        error("团队拆分的个人目标须按运营归属自动匹配账号");
      if (new Set(b.account_ids).size !== b.account_ids.length) error("统计账号不能重复");
      if (b.source === "buyu" && b.field === "qualified_accounts") {
        if (b.product === BUYU_TOTAL_PRODUCT) {
          if (
            !b.qualification_by_product ||
            BUYU_SOURCE_PRODUCTS.some((p) => !b.qualification_by_product?.[p.id])
          )
            error("请分别配置3D、UE4、URP的账号达标ROI门槛与最低消耗");
          if (b.qualification) error("捕鱼总盘请使用分产品达标条件");
        } else if (!b.qualification) error("请配置账号达标ROI门槛与最低消耗");
      }
      if (
        b.qualification_by_product &&
        (b.source !== "buyu" ||
          b.product !== BUYU_TOTAL_PRODUCT ||
          b.field !== "qualified_accounts")
      )
        error("仅捕鱼总盘达标账号数使用分产品条件");
      if (b.field !== "qualified_accounts" && b.qualification) error("该指标不使用账号达标条件");
    }
    if (v.kind === "ratio" && v.unit !== "%")
      ctx.addIssue({ code: "custom", message: "比率单位必须为 %" });
    if (v.kind === "count" && v.target !== null && !Number.isInteger(v.target))
      ctx.addIssue({ code: "custom", message: "人数、账号数目标须为整数" });
    if (v.confirmed && (!v.definition || !v.owner_ids.length || v.owner_labels.length))
      ctx.addIssue({ code: "custom", message: "请绑定全部负责人并填写统计口径后再确认" });
  });
export const mutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      definition: definitionSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("edit"),
      id: z.string().uuid(),
      version: z.number().int().positive(),
      definition: definitionSchema,
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("progress"),
      id: z.string().uuid(),
      version: z.number().int().positive(),
      actual: nullableNumber,
      as_of: z.string().nullable(),
      evidence: z.string().trim().max(2000),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.enum(["publish", "close", "reopen", "delete", "refresh-accounts"]),
      id: z.string().uuid(),
      version: z.number().int().positive(),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export function fail(message: string, status = 400): never {
  throw new AppError("GOALS_INVALID", message, status);
}
export function validateMetricWeights(definitions: GoalDefinition[]) {
  if (definitions.every((d) => d.weight == null)) return;
  if (
    definitions.some(
      (d) => d.weight == null || !Number.isFinite(d.weight) || d.weight < 0 || d.weight > 100,
    ) ||
    Math.abs(definitions.reduce((sum, d) => sum + (d.weight ?? 0), 0) - 100) > 0.001
  )
    fail("自定义指标权重须全部填写，合计为100%");
}
export const metricBatchSchema = z
  .object({
    action: z.literal("save-metrics"),
    definitions: z.array(definitionSchema).min(1).max(20),
    edit: z
      .object({ id: z.string().uuid(), version: z.number().int().positive() })
      .strict()
      .nullable(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    const first = value.definitions[0];
    if (!first) return;
    const fields = new Set<string>();
    for (const definition of value.definitions) {
      const binding = definition.binding;
      if (!binding || fields.has(binding.field)) {
        ctx.addIssue({ code: "custom", message: "批量保存须选择不同的标准指标" });
        continue;
      }
      fields.add(binding.field);
      if (
        [
          "period",
          "project",
          "line",
          "dept_id",
          "owner_ids",
          "owner_labels",
          "confirmed",
          "team_parent_id",
        ].some(
          (key) =>
            JSON.stringify(definition[key as keyof typeof definition]) !==
            JSON.stringify(first[key as keyof typeof first]),
        ) ||
        ["source", "product", "selection", "account_ids"].some(
          (key) =>
            JSON.stringify(binding[key as keyof typeof binding]) !==
            JSON.stringify(first.binding?.[key as keyof typeof binding]),
        )
      )
        ctx.addIssue({
          code: "custom",
          message: "多指标须使用相同周期、产品、部门、负责人和账号范围",
        });
    }
  });
const goalRefSchema = z
  .object({ id: z.string().uuid(), version: z.number().int().positive() })
  .strict();
export const publishTeamSchema = z
  .object({
    action: z.literal("publish-team"),
    goal: goalRefSchema,
    children: z.array(goalRefSchema).max(500),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const personalTeamQuerySchema = z
  .object({
    period: periodSchema,
    project: z.string().trim().min(1).max(40),
    dept_id: z.string().min(1).max(150).nullable(),
    owner_id: z.string().min(1).max(150),
    team_id: z.string().uuid().nullable().optional(),
    source_product: z.string().min(1).max(150).nullable().optional(),
  })
  .strict();
export const personalGoalsSchema = z
  .object({
    action: z.literal("save-personal-goals"),
    team_id: z.string().uuid(),
    owner_id: z.string().min(1).max(150),
    targets: z
      .array(
        z
          .object({
            goal: goalRefSchema,
            target: z.number().finite().min(0).max(1e12),
            edit: goalRefSchema.nullable(),
            account_targets: z
              .record(z.string().min(1).max(150), z.number().finite().min(0).max(1e12))
              .optional(),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const splitGoalSchema = z
  .object({
    action: z.literal("split-goals"),
    goals: z.array(goalRefSchema).min(1).max(20),
    allocations: z
      .array(
        z
          .object({
            owner_id: z.string().min(1).max(150),
            targets: z
              .array(
                z
                  .object({
                    goal_id: z.string().uuid(),
                    target: z.number().finite().min(0).max(1e12),
                    account_targets: z
                      .record(z.string().min(1).max(150), z.number().finite().min(0).max(1e12))
                      .optional(),
                  })
                  .strict(),
              )
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export const goalGroupSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("edit-group"),
      entries: z
        .array(z.object({ edit: goalRefSchema.nullable(), definition: definitionSchema }).strict())
        .min(1)
        .max(100),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("close-group"),
      goals: z.array(goalRefSchema).min(1).max(100),
      reason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);
export function requireGoalPoint(actor: GoalAccess, point = "view") {
  if (actor.scope === "none" || !actor.points.includes("view") || !actor.points.includes(point))
    fail(
      "没有目标" + (point === "view" ? "查看" : point === "fill" ? "填报" : "发布／调整") + "权限",
      403,
    );
}
/** Viewing delegated employees does not grant team management or assignment rights. */
export function canManageTeamGoals(actor: GoalAccess): boolean {
  return (
    actor.delegatedIds === null &&
    (actor.scope === "all" || (actor.scope === "team" && actor.deptIds.length > 0))
  );
}
export function requireGoalOwnerAssignment(actor: GoalAccess, ownerIds: string[]) {
  if (!canManageTeamGoals(actor) && (ownerIds.length !== 1 || ownerIds[0] !== actor.userId))
    fail("普通运营只能填报本人的个人目标，其他人员须由部门负责人或有管理权限的人员操作", 403);
}
export function requireGoalDefinitionAccess(actor: GoalAccess, definition: GoalDefinition) {
  requireGoalOwnerAssignment(actor, definition.owner_ids);
  if (
    !canManageTeamGoals(actor) &&
    (definition.binding?.selection !== "operators" || !definition.team_parent_id)
  )
    fail("团队目标须由部门负责人或有管理权限的人员建立；请关联团队填报个人目标", 403);
}
export function inGoalScope(
  actor: GoalAccess,
  goal: Pick<GoalDefinition, "dept_id" | "owner_ids">,
): boolean {
  const delegated = actor.delegatedIds;
  if (delegated !== null) return goal.owner_ids.some((id) => delegated.includes(id));
  if (actor.scope === "all") return true;
  if (actor.scope === "self") return goal.owner_ids.includes(actor.userId);
  if (actor.scope === "team")
    return (
      goal.owner_ids.includes(actor.userId) ||
      (!!goal.dept_id && actor.deptIds.includes(goal.dept_id))
    );
  return false;
}
export function periodBounds(period: string) {
  periodSchema.parse(period);
  const year = Number(period.slice(0, 4));
  const q = period.includes("Q");
  const month = q ? (Number(period.slice(-1)) - 1) * 3 : Number(period.slice(-2)) - 1;
  return {
    start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(year, month + (q ? 3 : 1), 0)).toISOString().slice(0, 10),
  };
}
/** Compare like periods: a full calendar month, or a full quarter. */
export function previousGoalPeriod(period: string): string | null {
  const { start } = periodBounds(period);
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - (period.includes("Q") ? 3 : 1));
  if (date.getUTCFullYear() < 2000) return null;
  return period.includes("Q")
    ? `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
    : date.toISOString().slice(0, 7);
}
export function validateProgress(
  goal: Goal,
  actual: number | null,
  asOf: string | null,
  evidence: string,
  today: string,
) {
  if (goal.status === "closed") fail("已归档目标不可填报，请先重新开启");
  if (goal.binding) fail("该目标自动读取业务数据，不能人工覆盖实际值");
  if (actual === null) return;
  if (!goal.confirmed) fail("请先确认统计口径和负责人，才能填报实际值");
  if (goal.kind === "count" && !Number.isInteger(actual)) fail("人数、账号数实际值须为整数");
  const bounds = periodBounds(goal.period);
  if (
    !asOf ||
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    !Number.isFinite(new Date(asOf + "T00:00:00Z").getTime()) ||
    new Date(asOf + "T00:00:00Z").toISOString().slice(0, 10) !== asOf ||
    asOf < bounds.start ||
    asOf > bounds.end ||
    asOf > today
  )
    fail("统计日期须为目标周期内且不晚于今天的有效日期");
  if (!evidence.trim()) fail("请填写统计依据");
}
export function validateAllocation(goal: GoalDefinition, parent: Goal, siblings: GoalDefinition[]) {
  if (!/^20\d{2}-\d{2}$/.test(goal.period) || !parent.period.includes("Q"))
    fail("仅支持月目标关联季度目标");
  const childBounds = periodBounds(goal.period),
    parentBounds = periodBounds(parent.period);
  if (childBounds.start < parentBounds.start || childBounds.end > parentBounds.end)
    fail("月目标不在所选季度内");
  for (const key of [
    "project",
    "metric",
    "unit",
    "kind",
    "dept_id",
    "definition",
    "confirmed",
  ] as const)
    if (goal[key] !== parent[key])
      fail("季度与月度目标须使用相同项目、指标、负责人、部门和统计口径");
  if (allocationBindingKey(goal.binding) !== allocationBindingKey(parent.binding))
    fail("季度与月度目标须绑定相同来源指标及账号范围");
  if (
    [...goal.owner_ids].sort().join("|") !== [...parent.owner_ids].sort().join("|") ||
    [...goal.owner_labels].sort().join("|") !== [...parent.owner_labels].sort().join("|")
  )
    fail("季度与月度负责人不一致");
  if (goal.kind === "ratio") fail("ROI门槛不能按月相加拆分");
  if (
    goal.binding &&
    (!isAdditiveMetric(goal.binding.source, goal.binding.field) || goal.binding.direction === "lte")
  )
    fail("均值、峰值、成本及上限指标不能按月相加拆分");
  if (siblings.some((g) => g.period === goal.period)) fail("同一季度指标在该月份已有拆分目标");
  if (parent.target === null || goal.target === null) fail("请先设置季度与月度目标值");
  if (siblings.reduce((sum, g) => sum + (g.target ?? 0), goal.target) > parent.target + 1e-8)
    fail("月度目标分配总额超过季度目标");
}
/** Snapshot timestamps do not change the metric or account scope of an allocation. */
export function allocationBindingKey(binding: GoalDefinition["binding"]) {
  if (!binding) return "null";
  const scope = bindingSchema.parse(binding);
  delete scope.account_snapshot_at;
  return JSON.stringify(scope);
}
export function formatGoalValue(value: number | null, unit: string): string {
  if (value === null) return "待设置";
  if (unit === "%") return `${Number(value.toFixed(3))}%`;
  return `${value >= 10000 ? `${Number((value / 10000).toFixed(2))}万` : value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${unit}`;
}
export function goalProgress(g: Goal) {
  if (g.binding && g.source_result?.status !== "ready")
    return { label: g.source_result?.note ?? "等待同步数据", percent: null, attention: true };
  if (!g.confirmed) return { label: "口径待配置", percent: null, attention: true };
  if (g.target === null) return { label: "目标待设置", percent: null, attention: true };
  if (g.actual === null) return { label: "待填报", percent: null, attention: true };
  if (g.binding?.direction === "lte")
    return {
      label:
        g.actual <= g.target ? "符合上限" : `超出 ${formatGoalValue(g.actual - g.target, g.unit)}`,
      percent: null,
      attention: g.actual > g.target,
    };
  if (g.kind === "ratio")
    return {
      label:
        g.actual >= g.target
          ? "已达门槛"
          : `差 ${Number((g.target - g.actual).toFixed(3))} 个百分点`,
      percent: null,
      attention: g.actual < g.target,
    };
  return {
    label: g.actual >= g.target ? "已完成" : `差 ${formatGoalValue(g.target - g.actual, g.unit)}`,
    percent:
      g.target === 0 ? (g.actual >= 0 ? 100 : 0) : Math.min(100, (g.actual / g.target) * 100),
    attention: false,
  };
}
