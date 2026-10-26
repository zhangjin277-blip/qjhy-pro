/* eslint-disable @typescript-eslint/no-non-null-assertion -- Initialized temporary database and known isolated fixtures. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import { metricOption, type GoalDefinition } from "@/modules/goals";
const state = vi.hoisted(() => ({ database: null as Db | null, emergency: true }));
vi.mock("@/db/client", () => ({
  db: {
    select: (...args: unknown[]) => Reflect.apply(state.database!.select, state.database, args),
    execute: (...args: unknown[]) => Reflect.apply(state.database!.execute, state.database, args),
    transaction: (...args: unknown[]) =>
      Reflect.apply(state.database!.transaction, state.database, args),
  },
}));
vi.mock("@/lib/auth/page-auth", () => ({
  getCurrentDingtalkUser: async () => ({
    kind: "ok",
    dingtalkUserId: "qa",
    isEmergency: state.emergency,
  }),
}));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: async () => ({
    scope: "all",
    points: new Set(["view", "fill"]),
    delegatedUserIds: null,
  }),
  getManagedDeptIds: vi.fn(),
}));
vi.mock("@/modules/aliases/server", () => ({ getDeptAliasMap: async () => new Map() }));
import { saveGoalMetrics, mutateGoal, previewGoal, mutateGoalGroup } from "@/modules/goals/server";
const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Local temporary tables only");
const client = postgres(url, { max: 1, prepare: false });
function definition(field: string): GoalDefinition {
  const m = metricOption("douyin", field);
  if (!m) throw new Error("Unknown fixture metric");
  return {
    period: "2026-06",
    project: "三冰",
    line: "整体",
    dept_id: null,
    owner_ids: [],
    owner_labels: [],
    metric: m.label,
    unit: m.unit,
    kind: m.kind,
    target: 100,
    definition: m.note,
    confirmed: false,
    parent_id: null,
    binding: {
      source: "douyin",
      product: "three",
      field,
      selection: "all",
      account_ids: [],
      direction: m.direction,
      qualification: null,
    },
  };
}
const batch = (definitions: GoalDefinition[]) => ({
  action: "save-metrics",
  definitions,
  edit: null,
  reason: "临时表验收",
});
beforeAll(async () => {
  for (const table of [
    "business_goal",
    "business_goal_revision",
    "anchor_profile",
    "anchor_game_promo_daily",
    "anchor_minigame_daily",
    "dingtalk_user",
    "entity_alias",
  ])
    await client.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  state.database = drizzle(client);
  await client`INSERT INTO pg_temp.anchor_profile (anchor_id,nick_name,is_threekingdoms,is_archived,raw) VALUES ('a','验收主播',true,false,'{}')`;
});
beforeEach(async () => {
  state.emergency = true;
  await client`TRUNCATE pg_temp.business_goal_revision, pg_temp.business_goal`;
});
afterAll(async () => {
  await client.end();
});
describe("atomic multi-metric goal saving with real SQL temporary tables", () => {
  it("requires publish permission when adding metrics while editing a published goal", async () => {
    const [goal] = await saveGoalMetrics(batch([definition("controller_total_amount")]));
    const published = await mutateGoal({
      action: "publish",
      id: goal!.id,
      version: goal!.version,
      reason: "验收发布",
    });
    state.emergency = false;
    await expect(
      saveGoalMetrics({
        ...batch([definition("controller_total_amount"), definition("minigame_total_amount")]),
        edit: { id: published.id, version: published.version },
      }),
    ).rejects.toMatchObject({ httpStatus: 403 });
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    expect(count?.n).toBe(1);
  });
  it("creates separate drafts and audit records, then edits the original and adds a new draft", async () => {
    const defs = [definition("controller_total_amount"), definition("minigame_total_amount")];
    const created = await saveGoalMetrics(batch(defs));
    expect(created).toHaveLength(2);
    expect(new Set(created.map((g) => g.id)).size).toBe(2);
    expect(created.every((g) => g.status === "draft")).toBe(true);
    const first = created[0]!;
    const published = await mutateGoal({
      action: "publish",
      id: first.id,
      version: first.version,
      reason: "验收发布",
    });
    const edited = await saveGoalMetrics({
      ...batch([{ ...defs[0]!, target: 200 }, definition("g_watch_ucnt")]),
      edit: { id: first.id, version: published.version },
    });
    expect(edited[0]).toMatchObject({ id: first.id, target: 200, status: "published" });
    expect(edited[1]?.status).toBe("draft");
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    expect(count?.n).toBe(3);
    const [audits] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal_revision`;
    expect(audits?.n).toBe(5);
  });
  it("rolls back the first inserted goal and audit when the second metric has an invalid quarter", async () => {
    await expect(
      saveGoalMetrics(
        batch([
          definition("controller_total_amount"),
          {
            ...definition("minigame_total_amount"),
            parent_id: "00000000-0000-4000-8000-000000000099",
          },
        ]),
      ),
    ).rejects.toThrow("季度目标不存在");
    const [goals] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    const [audits] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal_revision`;
    expect(goals?.n).toBe(0);
    expect(audits?.n).toBe(0);
  });
  it("rejects duplicate fields, changed scopes and stale edits", async () => {
    await expect(
      saveGoalMetrics(
        batch([definition("controller_total_amount"), definition("controller_total_amount")]),
      ),
    ).rejects.toThrow("不同的标准指标");
    await expect(
      saveGoalMetrics(
        batch([
          definition("controller_total_amount"),
          { ...definition("minigame_total_amount"), period: "2026-07" },
        ]),
      ),
    ).rejects.toThrow("相同周期");
    const [created] = await saveGoalMetrics(batch([definition("controller_total_amount")]));
    await expect(
      saveGoalMetrics({
        ...batch([definition("controller_total_amount"), definition("minigame_total_amount")]),
        edit: { id: created!.id, version: 99 },
      }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    expect(count?.n).toBe(1);
  });
  it("previews inactive cumulative accounts as zero without saving a goal", async () => {
    const result = await previewGoal(definition("controller_total_amount"));
    expect(result.actual).toBe(0);
    expect(result.source_result?.status).toBe("ready");
    expect(result.source_result?.missing_accounts).toEqual([]);
    expect(result.source_result?.no_record_accounts).toEqual([{ id: "a", name: "验收主播" }]);
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    expect(count?.n).toBe(0);
  });
});

const ref = (goal: { id: string; version: number }) => ({ id: goal.id, version: goal.version });
const groupEdit = (goals: { id: string; version: number }[], definitions: GoalDefinition[]) => ({
  action: "edit-group",
  entries: definitions.map((definition, index) => ({
    edit: goals[index] ? ref(goals[index]!) : null,
    definition,
  })),
  reason: "统一调整验收",
});
describe("atomic group adjustment and archive", () => {
  const defs = () => [definition("controller_total_amount"), definition("minigame_total_amount")];
  it("updates both existing IDs, keeps mixed statuses, and adds only the new metric as a draft", async () => {
    const goals = await saveGoalMetrics(batch(defs()));
    goals[0] = await mutateGoal({ action: "publish", ...ref(goals[0]!), reason: "发布" });
    const updated = await mutateGoalGroup(
      groupEdit(goals, [
        { ...defs()[0]!, target: 250 },
        { ...defs()[1]!, target: 350 },
        definition("g_watch_ucnt"),
      ]),
    );
    expect(updated.map((g) => g.id).slice(0, 2)).toEqual(goals.map((g) => g.id));
    expect(updated.map((g) => g.status)).toEqual(["published", "draft", "draft"]);
    expect(updated.map((g) => g.target)).toEqual([250, 350, 100]);
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal`;
    expect(count?.n).toBe(3);
  });
  it("rolls back earlier metric and audit updates when a later version is stale", async () => {
    const goals = await saveGoalMetrics(batch(defs()));
    goals[1] = { ...goals[1]!, version: 99 };
    await expect(
      mutateGoalGroup(
        groupEdit(
          goals,
          defs().map((d) => ({ ...d, target: 500 })),
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 409 });
    const rows = await client`SELECT target,version FROM pg_temp.business_goal`;
    expect(rows.every((r) => r.target === 100 && r.version === 1)).toBe(true);
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal_revision`;
    expect(count?.n).toBe(2);
  });
  it("rolls back earlier draft edits when another metric needs publish permission", async () => {
    const goals = await saveGoalMetrics(batch(defs()));
    goals[1] = await mutateGoal({ action: "publish", ...ref(goals[1]!), reason: "发布" });
    state.emergency = false;
    await expect(
      mutateGoalGroup(
        groupEdit(
          goals,
          defs().map((d) => ({ ...d, target: 500 })),
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 403 });
    const rows = await client`SELECT target FROM pg_temp.business_goal`;
    expect(rows.every((r) => r.target === 100)).toBe(true);
  });
  it("archives all submitted published metrics together and retains unsubmitted drafts", async () => {
    const goals = await saveGoalMetrics(batch([...defs(), definition("g_watch_ucnt")]));
    const published = [];
    for (const goal of goals.slice(0, 2))
      published.push(await mutateGoal({ action: "publish", ...ref(goal), reason: "发布" }));
    const result = await mutateGoalGroup({
      action: "close-group",
      goals: published.map(ref),
      reason: "整组归档",
    });
    expect(result.every((g) => g.status === "closed")).toBe(true);
    const [draft] =
      await client`SELECT status,version FROM pg_temp.business_goal WHERE id=${goals[2]!.id}`;
    expect(draft).toMatchObject({ status: "draft", version: 1 });
  });
  it("rolls back the whole archive when a submitted metric is a draft", async () => {
    const goals = await saveGoalMetrics(batch(defs()));
    goals[0] = await mutateGoal({ action: "publish", ...ref(goals[0]!), reason: "发布" });
    await expect(
      mutateGoalGroup({ action: "close-group", goals: goals.map(ref), reason: "归档" }),
    ).rejects.toMatchObject({ httpStatus: 409 });
    const [first] =
      await client`SELECT status,version FROM pg_temp.business_goal WHERE id=${goals[0]!.id}`;
    expect(first).toMatchObject({ status: "published", version: 2 });
  });
  it("rejects repeated IDs and goals from different groups", async () => {
    const goals = await saveGoalMetrics(batch(defs()));
    await expect(mutateGoalGroup(groupEdit([goals[0]!, goals[0]!], defs()))).rejects.toThrow(
      "不重复",
    );
    goals[1] = await mutateGoal({
      action: "edit",
      ...ref(goals[1]!),
      definition: { ...defs()[1]!, line: "其他" },
      reason: "分组",
    });
    await expect(mutateGoalGroup(groupEdit(goals, defs()))).rejects.toThrow("同一项目负责人");
  });
  it("retains independent account ranges and confirmation flags", async () => {
    const a = definition("controller_total_amount"),
      b = { ...definition("minigame_total_amount"), owner_ids: ["qa"], confirmed: true };
    await client`INSERT INTO pg_temp.dingtalk_user (user_id,unionid,name,active,dept_ids,raw) VALUES ('qa','qa-union','验收人员',true,'[]','{}') ON CONFLICT (user_id) DO NOTHING`;
    await client`UPDATE pg_temp.anchor_profile SET broker_name='验收人员' WHERE anchor_id='a'`;
    a.owner_ids = ["qa"];
    b.binding = { ...b.binding!, selection: "accounts", account_ids: ["a"] };
    const goals = [
      await mutateGoal({ action: "create", definition: a, reason: "创建" }),
      await mutateGoal({ action: "create", definition: b, reason: "创建" }),
    ];
    const result = await mutateGoalGroup(
      groupEdit(goals, [
        { ...a, target: 200 },
        { ...b, target: 300 },
      ]),
    );
    expect(result.map((g) => g.binding?.selection)).toEqual(["all", "accounts"]);
    expect(result.map((g) => g.confirmed)).toEqual([false, true]);
  });
  it("rolls back all group edits when a quarter allocation would be exceeded", async () => {
    const quarterDefs = defs().map((d) => ({ ...d, period: "2026-Q2", target: 100 }));
    const quarters = await saveGoalMetrics(batch(quarterDefs));
    const monthDefs = defs().map((d, i) => ({ ...d, parent_id: quarters[i]!.id, target: 50 }));
    const goals = await saveGoalMetrics(batch(monthDefs));
    await expect(
      mutateGoalGroup(
        groupEdit(goals, [
          { ...monthDefs[0]!, target: 80 },
          { ...monthDefs[1]!, target: 110 },
        ]),
      ),
    ).rejects.toThrow("超过季度目标");
    const rows =
      await client`SELECT target,version FROM pg_temp.business_goal WHERE period='2026-06'`;
    expect(rows.every((r) => r.target === 50 && r.version === 1)).toBe(true);
  });
});

describe("persistent weighted goals", () => {
  const defs = () => [definition("controller_total_amount"), definition("minigame_total_amount")];
  it("persists weights atomically without replacing IDs, statuses or reported actuals", async () => {
    await client`INSERT INTO pg_temp.dingtalk_user (user_id,unionid,name,active,dept_ids,raw) VALUES ('qa','qa-union','验收人员',true,'[]','{}') ON CONFLICT (user_id) DO NOTHING`;
    await client`UPDATE pg_temp.anchor_profile SET broker_name='验收人员' WHERE anchor_id='a'`;
    const initial = defs().map((d, i) => ({
      ...d,
      confirmed: true,
      owner_ids: ["qa"],
      weight: i === 0 ? 75 : 25,
    }));
    const goals = await saveGoalMetrics(batch(initial));
    expect(goals.map((g) => g.weight)).toEqual([75, 25]);
    goals[0] = await mutateGoal({ action: "publish", ...ref(goals[0]!), reason: "发布" });
    await client`UPDATE pg_temp.business_goal SET actual=42.03, as_of='2026-06-30', evidence='保留填报'`;
    const result = await mutateGoalGroup(
      groupEdit(
        goals,
        initial.map((d) => ({ ...d, weight: 50 })),
      ),
    );
    expect(result.map((g) => g.id)).toEqual(goals.map((g) => g.id));
    expect(result.map((g) => g.status)).toEqual(["published", "draft"]);
    const stored =
      await client`SELECT weight,actual,as_of::text,evidence FROM pg_temp.business_goal`;
    expect(
      stored.every(
        (g) =>
          g.weight === 50 &&
          g.actual === 42.03 &&
          g.as_of === "2026-06-30" &&
          g.evidence === "保留填报",
      ),
    ).toBe(true);
    const audits =
      await client`SELECT after FROM pg_temp.business_goal_revision WHERE action='edit'`;
    expect(audits).toHaveLength(2);
    expect(audits.every((a) => a.after.weight === 50)).toBe(true);
  });
  it("rejects bad sums and rolls back weight changes on a later version conflict", async () => {
    await expect(saveGoalMetrics(batch(defs().map((d) => ({ ...d, weight: 40 }))))).rejects.toThrow(
      "合计为100%",
    );
    const goals = await saveGoalMetrics(batch(defs()));
    await expect(
      mutateGoalGroup(
        groupEdit(
          goals,
          defs().map((d) => ({ ...d, weight: 60 })),
        ),
      ),
    ).rejects.toThrow("合计为100%");
    goals[1] = { ...goals[1]!, version: 99 };
    await expect(
      mutateGoalGroup(
        groupEdit(
          goals,
          defs().map((d) => ({ ...d, weight: 50 })),
        ),
      ),
    ).rejects.toMatchObject({ httpStatus: 409 });
    const rows = await client`SELECT weight,version FROM pg_temp.business_goal`;
    expect(rows.every((r) => r.weight === null && r.version === 1)).toBe(true);
    const [count] = await client`SELECT COUNT(*)::int AS n FROM pg_temp.business_goal_revision`;
    expect(count?.n).toBe(2);
  });
});
