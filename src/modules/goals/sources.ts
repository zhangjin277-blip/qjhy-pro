import "server-only";
import { anchorGroupCte } from "@/modules/dashboard/server";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { broker_user_mapping, dingtalk_user } from "@/db/schema";
import { getManagedDeptIds, resolvePermission } from "@/modules/permissions/server";
import { businessDate } from "@/lib/business-date";
import { canManageTeamGoals, fail, periodBounds, requireGoalPoint } from "./rules";
import { DOUYIN_METRIC_QUERIES } from "./douyin-queries";
import {
  metricOption,
  SOURCE_PRODUCTS,
  buyuProductIds,
  BUYU_TOTAL_PRODUCT,
  BUYU_SOURCE_PRODUCTS,
} from "./catalog";
import {
  buyuAccountProgress,
  calculateBuyuMetric,
  type BuyuSourceRow,
  type SourceValue,
} from "./source-rules";
import type { Goal, GoalAccess, GoalBinding, GoalAccountValue } from "./types";

export interface GoalAccountOption {
  id: string;
  name: string;
  operator_ids?: string[];
  unassigned?: boolean;
  products?: string[];
}
interface SourceScope {
  full: boolean;
  userIds: string[];
  brokerIds: string[];
}
export async function goalSourceScope(
  actor: GoalAccess,
  source: "douyin" | "buyu",
): Promise<SourceScope> {
  const permission = actor.isEmergency
    ? { scope: "all", delegatedUserIds: null }
    : await resolvePermission(actor.userId, source === "douyin" ? "anchors" : "project_buyu");
  const delegated = permission.delegatedUserIds;
  if (
    permission.scope === "none" ||
    (delegated !== null && delegated !== undefined && !delegated.length)
  )
    fail("没有对应业务数据的查看权限", 403);
  if (permission.scope === "all" && !delegated) return { full: true, userIds: [], brokerIds: [] };
  let ids: string[] = [];
  if (delegated) ids = delegated;
  else if (permission.scope === "self") ids = [actor.userId];
  else if (permission.scope === "team") {
    const depts = await getManagedDeptIds(actor.userId);
    if (depts.length) {
      const rows = await db
        .select({ id: dingtalk_user.user_id })
        .from(dingtalk_user)
        .where(
          and(
            eq(dingtalk_user.active, true),
            sql`${dingtalk_user.dept_ids} ?| ARRAY[${sql.join(
              depts.map((d) => sql`${d}`),
              sql`, `,
            )}]::text[]`,
          ),
        );
      ids = rows.map((r) => r.id);
    }
  }
  if (!ids.length) fail("当前账号暂无可访问的业务数据范围", 403);
  const brokers =
    source === "douyin"
      ? await db
          .select({ id: broker_user_mapping.broker_id })
          .from(broker_user_mapping)
          .where(inArray(broker_user_mapping.dingtalk_user_id, ids))
      : [];
  return { full: false, userIds: ids, brokerIds: brokers.map((r) => r.id) };
}
function oneOf(column: SQL, values: string[]) {
  return values.length
    ? sql`${column} IN (${sql.join(
        values.map((id) => sql`${id}`),
        sql`, `,
      )})`
    : sql`false`;
}
async function accountsForScope(
  scope: SourceScope,
  source: "douyin" | "buyu",
  product: string,
  departmentId: string | null = null,
  includeUnassigned = false,
): Promise<GoalAccountOption[]> {
  if (!SOURCE_PRODUCTS[source].some((p) => p.id === product)) fail("来源产品未配置");
  if (source === "douyin") {
    const scopeRule = scope.full
      ? { kind: "all" as const }
      : { kind: "broker_ids" as const, ids: scope.brokerIds };
    // Prefer the stored broker/user link; retain the board's name attribution as a fallback.
    const operator = sql`COALESCE(bm.dingtalk_user_id, ag.operator_id)`;
    const department = sql`CASE WHEN bm.dingtalk_user_id IS NOT NULL THEN mapped.dept_ids->>0 ELSE ag.dept_id END`;
    return (await db.execute(sql`WITH ${anchorGroupCte(scopeRule)}
      SELECT ap.anchor_id AS id, COALESCE(ap.nick_name,ap.anchor_id) AS name,
        (ag.project IS NULL) AS unassigned,
        COALESCE(jsonb_agg(DISTINCT ${operator}) FILTER(WHERE ${operator} IS NOT NULL),'[]'::jsonb) AS operator_ids
      FROM anchor_group ag JOIN anchor_profile ap ON ap.anchor_id=ag.anchor_id
      LEFT JOIN broker_user_mapping bm ON bm.broker_id=ap.broker_id
      LEFT JOIN dingtalk_user mapped ON mapped.user_id=bm.dingtalk_user_id
      WHERE (ag.project=${product} OR ${includeUnassigned ? sql`ag.project IS NULL` : sql`false`}) AND ${departmentId ? sql`${department}=${departmentId}` : sql`true`}
      GROUP BY ap.anchor_id,ap.nick_name,ag.project ORDER BY ap.nick_name,ap.anchor_id`)) as unknown as GoalAccountOption[];
  }
  // Collapse historical log rows before joining people/accounts. This avoids
  // multiplying those joins by every log row when JSONB selectivity is misestimated.
  return (await db.execute(sql`WITH source_accounts AS MATERIALIZED (
    SELECT live_account_id,jsonb_agg(DISTINCT dataset_id) AS products
    FROM placement_cumulative_raw
    WHERE ${oneOf(sql`dataset_id`, buyuProductIds(product))} AND raw ? '_source_sheet'
    GROUP BY live_account_id
  ) SELECT a.id,a.account_name AS name,c.products,
    CASE WHEN du.user_id IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(du.user_id) END AS operator_ids
    FROM live_account a JOIN source_accounts c ON c.live_account_id=a.id
    LEFT JOIN dingtalk_user du ON du.user_id=a.agent_dingtalk_user_id
    WHERE ${scope.full ? sql`true` : oneOf(sql`a.agent_dingtalk_user_id`, scope.userIds)}
      AND ${departmentId ? sql`du.dept_ids->>0=${departmentId}` : sql`true`}
    ORDER BY a.account_name,a.id`)) as unknown as GoalAccountOption[];
}
function goalOwnerScope(actor: GoalAccess): SQL {
  if (!canManageTeamGoals(actor))
    return actor.delegatedIds !== null && !actor.delegatedIds.includes(actor.userId)
      ? sql`false`
      : sql`du.user_id=${actor.userId}`;
  if (actor.delegatedIds !== null) return oneOf(sql`du.user_id`, actor.delegatedIds);
  if (actor.scope === "all") return sql`true`;
  if (actor.scope === "self") return sql`du.user_id=${actor.userId}`;
  if (actor.scope === "team")
    return sql`(du.user_id=${actor.userId} OR ${
      actor.deptIds.length
        ? sql`du.dept_ids ?| ARRAY[${sql.join(
            actor.deptIds.map((id) => sql`${id}`),
            sql`, `,
          )}]::text[]`
        : sql`false`
    })`;
  return sql`false`;
}

export async function goalSourceOptions(
  actor: GoalAccess,
  source: "douyin" | "buyu",
  product: string,
  departmentId: string | null = null,
) {
  requireGoalPoint(actor);
  const scope = await goalSourceScope(actor, source);
  const candidates = await accountsForScope(scope, source, product, departmentId, true);
  const accounts = candidates.filter((a) => !a.unassigned);
  const operators = [
    ...new Set(
      accounts.filter((a) => a.operator_ids?.length === 1).flatMap((a) => a.operator_ids ?? []),
    ),
  ];
  const users = operators.length
    ? ((await db.execute(
        sql`SELECT du.user_id AS id,du.name FROM dingtalk_user du WHERE du.active=true AND ${oneOf(sql`du.user_id`, operators)} AND ${goalOwnerScope(actor)} AND ${departmentId ? sql`du.dept_ids->>0=${departmentId}` : sql`true`} ORDER BY du.name,du.user_id`,
      )) as unknown as { id: string; name: string }[])
    : [];
  return {
    accounts: accounts.map(({ id, name, operator_ids, products }) => ({
      id,
      name,
      operator_ids,
      ...(products ? { products } : {}),
    })),
    unassignedAccounts: candidates.filter((a) => a.unassigned).length,
    unassignedOperators: accounts.filter((a) => a.operator_ids?.length !== 1).length,
    users,
    allowAll: scope.full && actor.scope === "all" && actor.delegatedIds === null,
  };
}
export async function validateGoalBinding(
  actor: GoalAccess,
  binding: GoalBinding,
  departmentId: string | null = null,
  ownerIds: string[] = [],
  frozen = false,
) {
  if (binding.selection === "operators" && frozen) {
    const scope = await goalSourceScope(actor, binding.source);
    const available = new Set(
      (await accountsForScope(scope, binding.source, binding.product)).map((a) => a.id),
    );
    if (
      ownerIds.length !== 1 ||
      !binding.account_ids.length ||
      binding.account_ids.some((id) => !available.has(id))
    )
      fail("已固定的目标账号超出当前产品或数据权限，请核对配置", 403);
    const query = DOUYIN_METRIC_QUERIES[binding.field];
    if (binding.source === "douyin" && query && !query.additive && binding.account_ids.length !== 1)
      fail("该指标为比率、均值或峰值，请明确选择一个主播统计");
    return;
  }
  const options = await goalSourceOptions(actor, binding.source, binding.product, departmentId);
  const owners = new Set(options.users.map((u) => u.id));
  if (binding.selection === "operators" && ownerIds.some((id) => !owners.has(id)))
    fail("负责人不属于所选产品、部门的已归因运营范围，请重新选择", 403);
  if (binding.selection === "all" && !options.allowAll)
    fail("全产品目标需完整业务数据及全范围目标权限，请改为明确选择账号", 403);
  if (binding.selection === "accounts") {
    const ids = new Set(options.accounts.map((a) => a.id));
    if (!binding.account_ids.length || binding.account_ids.some((id) => !ids.has(id)))
      fail("所选账号不存在、不属于所选产品及部门或超出数据权限", 403);
  }
  const matched =
    binding.selection === "operators"
      ? options.accounts.filter(
          (a) => a.operator_ids?.length === 1 && a.operator_ids.some((id) => ownerIds.includes(id)),
        )
      : [];
  if (binding.selection === "operators" && (ownerIds.length !== 1 || !matched.length))
    fail("该运营在所选产品、部门下暂无已确认归属的账号，请先完善归属记录");
  const query = DOUYIN_METRIC_QUERIES[binding.field];
  if (
    binding.source === "douyin" &&
    query &&
    !query.additive &&
    (binding.selection === "operators"
      ? matched.length !== 1
      : binding.selection !== "accounts" || binding.account_ids.length !== 1)
  )
    fail("该指标为比率、均值或峰值，请明确选择一个主播统计");
}
/** Server resolves identifiers from the same product/department attribution as the board. */
export async function operatorAccountIds(
  actor: GoalAccess,
  binding: GoalBinding,
  departmentId: string | null,
  ownerIds: string[],
) {
  const scope = await goalSourceScope(actor, binding.source);
  const accounts = await accountsForScope(scope, binding.source, binding.product, departmentId);
  return [
    ...new Set(
      accounts
        .filter(
          (a) => a.operator_ids?.length === 1 && a.operator_ids.some((id) => ownerIds.includes(id)),
        )
        .map((a) => a.id),
    ),
  ].sort();
}
function computedQuery(
  field: string,
): { table: string; expression: string; extra: string; additive: boolean } | undefined {
  if (field === "minigame_total_amount")
    return {
      table: "anchor_minigame_daily",
      expression: "SUM(d.before_divided_income)",
      extra: "d.scene = 'live'",
      additive: true,
    };
  const scene = field.startsWith("v_") ? "video" : "live";
  if (
    [
      "controller_total_amount",
      "g_total_amount",
      "v_total_amount",
      "g_promote_active_amount",
      "v_promote_active_amount",
    ].includes(field)
  )
    return {
      table: "anchor_game_promo_daily",
      expression: `SUM(CASE WHEN d.promote_anchor_active_pay_amount_1d IS NULL AND d.promote_faction_active_pay_amount_1d IS NULL ${field.endsWith("promote_active_amount") ? "" : "AND d.promote_download_pay_amount_1d IS NULL"} THEN NULL ELSE (COALESCE(d.promote_anchor_active_pay_amount_1d,0)+COALESCE(d.promote_faction_active_pay_amount_1d,0))/0.4${field.endsWith("promote_active_amount") ? "" : "+COALESCE(d.promote_download_pay_amount_1d,0)"} END)`,
      extra: `d.biz_mode = 'cps_all'${field === "controller_total_amount" ? " AND d.promote_scene IN ('live','video')" : ` AND d.promote_scene = '${scene}'`}`,
      additive: true,
    };
}
async function douyinValue(
  binding: GoalBinding,
  ids: string[],
  from: string,
  to: string,
  accounts: GoalAccountOption[],
): Promise<SourceValue> {
  const query = DOUYIN_METRIC_QUERIES[binding.field] ?? computedQuery(binding.field);
  const option = metricOption("douyin", binding.field);
  if (!query || !option) return { actual: null, as_of: null, note: "该字段的目标统计口径待配置" };
  if (!query.additive && ids.length !== 1)
    return { actual: null, as_of: null, note: "比率、均值、峰值须选择单个主播，避免直接平均" };
  if (!ids.length) return { actual: null, as_of: null, note: "所选产品暂无可统计主播" };
  const rows = await db.execute(sql`WITH per_anchor AS (
    SELECT d.anchor_id, ${sql.raw(query.expression)} AS value, MAX(d.date)::text AS date,
    COUNT(*)::int AS records FROM ${sql.identifier(query.table)} d
    WHERE ${oneOf(sql`d.anchor_id`, ids)} AND d.date BETWEEN ${from} AND ${to}
    AND ${query.extra ? sql.raw(query.extra) : sql`true`} GROUP BY d.anchor_id
  ) SELECT SUM(value)::float AS actual, MAX(date) AS date, COUNT(value)::int AS known,
    ARRAY_AGG(anchor_id) AS recorded_ids,
    ARRAY_AGG(anchor_id) FILTER (WHERE value IS NOT NULL) AS known_ids,
    COALESCE(JSONB_AGG(jsonb_build_object('id',anchor_id,'actual',value,'as_of',date)), '[]'::jsonb) AS account_values
    FROM per_anchor`);
  const result = (
    rows as unknown as {
      actual: number | null;
      date: string | null;
      known: number;
      known_ids: string[] | null;
      recorded_ids: string[] | null;
      account_values?: { id: string; actual: number | null; as_of: string | null }[];
    }[]
  )[0];
  if (!result) throw new Error("Missing metric aggregate result");
  const knownIds = new Set(result?.known_ids ?? []);
  const recordedIds = new Set(result?.recorded_ids ?? []);
  const noRecordIds = query.additive ? ids.filter((id) => !recordedIds.has(id)) : [];
  const missingIds = ids.filter(
    (id) => !knownIds.has(id) && (!query.additive || recordedIds.has(id)),
  );
  const perAccount = new Map((result.account_values ?? []).map((row) => [row.id, row]));
  const account_values = accounts.map((account): GoalAccountValue => {
    const row = perAccount.get(account.id);
    const noRecord = noRecordIds.includes(account.id);
    return {
      id: account.id,
      name: account.name,
      actual: noRecord
        ? 0
        : row?.actual == null
          ? null
          : Number(row.actual) * (option.unit === "%" ? 100 : 1),
      as_of: row?.as_of ?? null,
      status: noRecord ? "no_record" : row?.actual == null ? "pending" : "ready",
      note: noRecord ? "本期无记录，按0计入" : row?.actual == null ? "指标数据待同步" : "",
    };
  });
  const breakdown = { account_values, account_values_additive: query.additive };
  if (query.additive && noRecordIds.length === ids.length)
    return {
      ...breakdown,
      actual: 0,
      as_of: to,
      note: `所选${ids.length}个账号本期无该指标记录，按0计入`,
      unknown_accounts: 0,
      missing_account_ids: [],
      no_record_account_ids: noRecordIds,
    };
  if (!result?.date || !result.known || result.actual === null)
    return {
      ...breakdown,
      actual: null,
      as_of: null,
      note: query.additive
        ? "本期已有记录，但该指标字段为空，待补齐"
        : "所选周期尚无该指标的同步记录",
      missing_account_ids: missingIds,
      no_record_account_ids: noRecordIds,
    };
  const missing = missingIds.length;
  return {
    ...breakdown,
    actual: Number(result.actual) * (option.unit === "%" ? 100 : 1),
    as_of: result.date,
    note: [
      `${result.known}/${ids.length}个账号有本期指标数据`,
      noRecordIds.length ? `${noRecordIds.length}个账号本期无记录，按0计入` : "",
      missing ? `${missing}个账号已有记录但指标字段为空（部分合计，待补齐）` : "",
      option.note,
    ]
      .filter(Boolean)
      .join("；"),
    unknown_accounts: missing,
    missing_account_ids: missing > 0 ? missingIds : [],
    no_record_account_ids: noRecordIds,
  };
}
async function buyuValue(
  binding: GoalBinding,
  ids: string[],
  period: string,
  from: string,
  to: string,
  accounts: GoalAccountOption[],
): Promise<SourceValue> {
  if (!ids.length) return { actual: null, as_of: null, note: "所选范围暂无投流日志账号" };
  const rows =
    await db.execute(sql`SELECT DISTINCT ON(c.dataset_id,c.live_account_id,c.subaccount_name,c.date)
    c.dataset_id,c.live_account_id AS account_id,a.account_name,c.subaccount_name,c.date::text AS date,c.cost_yuan::float AS cost,
    c.activations::float AS additions,c.payment_yuan::float AS payment,c.raw
    FROM placement_cumulative_raw c JOIN live_account a ON a.id=c.live_account_id
    WHERE ${oneOf(sql`c.dataset_id`, buyuProductIds(binding.product))} AND ${oneOf(sql`c.live_account_id`, ids)}
    AND c.raw ? '_source_sheet' AND c.date BETWEEN ${from} AND ${to}
    ORDER BY c.dataset_id,c.live_account_id,c.subaccount_name,c.date,c.hour DESC`);
  const records = rows as unknown as BuyuSourceRow[];
  const account_progress =
    binding.field === "qualified_accounts"
      ? buyuAccountProgress(records, binding, period, accounts)
      : undefined;
  const recordedIds = new Set(records.map((r) => r.account_id));
  const missingIds = ids.filter((id) => !recordedIds.has(id));
  // Reuse the already authorized rows, preserving monthly snapshot and ratio rules.
  const grouped = new Map<string, Map<string, BuyuSourceRow[]>>();
  for (const row of records) {
    const byProduct = grouped.get(row.account_id) ?? new Map<string, BuyuSourceRow[]>();
    const product = row.dataset_id ?? binding.product;
    const list = byProduct.get(product) ?? [];
    list.push(row);
    byProduct.set(product, list);
    grouped.set(row.account_id, byProduct);
  }
  const account_values =
    binding.field === "qualified_accounts"
      ? undefined
      : accounts.flatMap((account) => {
          const byProduct = grouped.get(account.id);
          const products = [
            ...new Set([
              ...(byProduct?.keys() ?? []),
              ...(account.products ?? []).filter((p) =>
                buyuProductIds(binding.product).includes(p),
              ),
            ]),
          ];
          if (!products.length) products.push(binding.product);
          return products.map((product): GoalAccountValue => {
            const value = calculateBuyuMetric(byProduct?.get(product) ?? [], binding, period);
            return {
              id: account.id,
              name: account.name,
              product,
              product_name:
                BUYU_SOURCE_PRODUCTS.find((p) => p.id === product)?.name ?? "产品待确认",
              actual: value.actual,
              as_of: value.as_of,
              status: value.actual === null ? "pending" : "ready",
              note: value.actual === null ? value.note : "",
            };
          });
        });
  const breakdown = {
    account_values,
    account_values_additive: ["消耗", "新增", "自然量新增"].includes(binding.field),
  };
  if (binding.selection === "accounts" && missingIds.length)
    return {
      ...breakdown,
      actual: null,
      as_of: null,
      note: "部分所选账号在该周期尚无投流日志，等待同步",
      missing_account_ids: missingIds,
      account_progress,
    };
  const value = calculateBuyuMetric(records, binding, period);
  const product_details =
    binding.product === BUYU_TOTAL_PRODUCT
      ? BUYU_SOURCE_PRODUCTS.map((product) => {
          const productRows = records.filter((r) => r.dataset_id === product.id);
          const result = calculateBuyuMetric(productRows, binding, period);
          const byAccount = new Map<string, BuyuSourceRow[]>();
          for (const row of productRows) {
            const accountRows = byAccount.get(row.account_id) ?? [];
            accountRows.push(row);
            byAccount.set(row.account_id, accountRows);
          }
          return {
            product: product.id,
            name: product.name,
            actual: result.actual,
            note: result.note,
            accounts: [...byAccount].map(([id, accountRows]) => {
              const account = calculateBuyuMetric(accountRows, binding, period);
              return {
                id,
                name: accountRows[0]?.account_name ?? id,
                actual: account.actual,
                note: account.note,
              };
            }),
          };
        })
      : undefined;
  return {
    ...value,
    ...breakdown,
    product_details,
    account_progress,
    missing_account_ids: missingIds,
    unknown_accounts:
      value.actual !== null && missingIds.length ? missingIds.length : value.unknown_accounts,
    note: value.note + (missingIds.length ? `；${missingIds.length}个账号本期暂无投流日志` : ""),
  };
}
export async function resolveGoalSource(
  actor: GoalAccess,
  goal: Goal,
  scopeCache = new Map<string, Promise<SourceScope>>(),
  accountCache = new Map<string, Promise<GoalAccountOption[]>>(),
): Promise<Goal> {
  return resolveGoalSourceValue(actor, goal, scopeCache, accountCache);
}

/** Call only after list-level participation authorization; expose team totals, never account data. */
export async function resolveParticipatingTeamSummary(
  goal: Goal,
  accountCache = new Map<string, Promise<GoalAccountOption[]>>(),
): Promise<Goal> {
  const result = await resolveGoalSourceValue(null, goal, new Map(), accountCache);
  return {
    ...result,
    read_only: true,
    binding: result.binding ? { ...result.binding, account_ids: [] } : result.binding,
    source_result: result.source_result
      ? { status: result.source_result.status, note: result.source_result.note }
      : undefined,
  };
}

async function resolveGoalSourceValue(
  actor: GoalAccess | null,
  goal: Goal,
  scopeCache: Map<string, Promise<SourceScope>>,
  accountCache: Map<string, Promise<GoalAccountOption[]>>,
): Promise<Goal> {
  const binding = goal.binding;
  if (!binding) return goal;
  const pending = (status: "pending" | "forbidden" | "error", note: string): Goal => ({
    ...goal,
    actual: null,
    as_of: null,
    evidence: "",
    source_result: { status, note },
  });
  if (!goal.confirmed) return pending("pending", "请确认指标口径与账号范围");
  const bounds = periodBounds(goal.period),
    to = bounds.end < businessDate() ? bounds.end : businessDate();
  if (bounds.start > to) return pending("pending", "目标周期尚未开始");
  try {
    const key = binding.source;
    if (!scopeCache.has(key))
      scopeCache.set(
        key,
        actor
          ? goalSourceScope(actor, binding.source)
          : Promise.resolve({ full: true, userIds: [], brokerIds: [] }),
      );
    const scope = await scopeCache.get(key);
    if (!scope) return pending("forbidden", "无来源数据权限");
    const frozen =
      binding.selection === "operators" && goal.status !== "draft" && !!binding.account_snapshot_at;
    const accountKey = JSON.stringify([
      binding.source,
      binding.product,
      frozen ? null : goal.dept_id,
    ]);
    if (!accountCache.has(accountKey))
      accountCache.set(
        accountKey,
        accountsForScope(scope, binding.source, binding.product, frozen ? null : goal.dept_id),
      );
    const visible = (await accountCache.get(accountKey)) ?? [];
    const available = new Set(visible.map((a) => a.id));
    if (binding.selection === "all" && (!scope.full || (actor && actor.delegatedIds !== null)))
      return pending("forbidden", "需完整来源数据权限才能查看该全产品目标");
    if (
      (binding.selection === "accounts" || frozen) &&
      binding.account_ids.some((id) => !available.has(id))
    )
      return pending("forbidden", "部分目标账号已超出当前数据权限或产品归属，请核对配置");
    const ids =
      binding.selection === "all"
        ? visible.map((a) => a.id)
        : binding.selection === "operators" && !frozen
          ? visible
              .filter(
                (a) =>
                  a.operator_ids?.length === 1 &&
                  a.operator_ids.some((id) => goal.owner_ids.includes(id)),
              )
              .map((a) => a.id)
          : binding.account_ids;
    if (binding.selection === "operators" && !ids.length)
      return pending("pending", "该运营在所选产品、部门下暂无可统计账号，请核对账号归属");
    const value =
      binding.source === "douyin"
        ? await douyinValue(
            binding,
            ids,
            bounds.start,
            to,
            visible.filter((a) => ids.includes(a.id)),
          )
        : await buyuValue(
            binding,
            ids,
            goal.period,
            bounds.start,
            to,
            visible.filter((a) => ids.includes(a.id)),
          );
    const missingIds = new Set(value.missing_account_ids);
    const noRecordIds = new Set(value.no_record_account_ids);
    const source_result = {
      status:
        value.actual === null
          ? ("pending" as const)
          : value.unknown_accounts
            ? ("partial" as const)
            : ("ready" as const),
      note: value.note,
      matched_accounts:
        binding.selection === "operators"
          ? visible.filter((a) => ids.includes(a.id)).map(({ id, name }) => ({ id, name }))
          : undefined,
      product_details: value.product_details,
      account_progress: value.account_progress,
      account_values: value.account_values,
      account_values_additive: value.account_values_additive,
      unknown_accounts: value.unknown_accounts,
      missing_accounts: visible
        .filter((a) => missingIds.has(a.id))
        .map(({ id, name }) => ({ id, name })),
      no_record_accounts: visible
        .filter((a) => noRecordIds.has(a.id))
        .map(({ id, name }) => ({ id, name })),
    };
    return {
      ...goal,
      actual: value.actual,
      as_of: value.as_of,
      evidence: value.actual === null ? "" : value.note,
      source_result,
    };
  } catch (error) {
    if (error && typeof error === "object" && "httpStatus" in error && error.httpStatus === 403)
      return pending("forbidden", "没有所绑定业务数据的完整查看权限");
    console.error("[goals] source data unavailable");
    return pending("error", "数据读取失败，请稍后刷新");
  }
}
