/* eslint-disable @typescript-eslint/no-non-null-assertion -- Connection-local database and controlled fixtures. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import type { Goal, GoalDefinition } from "@/modules/goals";

const state = vi.hoisted(() => ({
  database: null as Db | null,
  points: ["view", "fill", "publish"],
  scope: "all",
}));
vi.mock("@/db/client", () => ({
  db: {
    select: (...args: unknown[]) => Reflect.apply(state.database!.select, state.database, args),
    transaction: (...args: unknown[]) =>
      Reflect.apply(state.database!.transaction, state.database, args),
  },
}));
vi.mock("@/lib/auth/page-auth", () => ({
  getCurrentDingtalkUser: async () => ({ kind: "ok", dingtalkUserId: "qa", isEmergency: false }),
}));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: async () => ({
    scope: state.scope,
    points: new Set(state.points),
    delegatedUserIds: null,
  }),
  getManagedDeptIds: async () => [],
}));
vi.mock("@/modules/aliases/server", () => ({ getDeptAliasMap: async () => new Map() }));
import { goalHistory, listGoals, mutateGoal } from "@/modules/goals/server";

const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Local temporary tables only");
const client = postgres(url, { max: 1, prepare: false });
const definition: GoalDefinition = {
  period: "2026-06",
  project: "招聘",
  line: "整体",
  dept_id: null,
  owner_ids: ["qa"],
  owner_labels: [],
  metric: "人数",
  unit: "人",
  kind: "count",
  target: 100,
  definition: "按月统计",
  confirmed: true,
  parent_id: null,
  binding: null,
};
const create = (patch: Partial<GoalDefinition> = {}) =>
  mutateGoal({ action: "create", definition: { ...definition, ...patch }, reason: "临时表创建" });
const command = (goal: Goal, action = "delete") => ({
  action,
  id: goal.id,
  version: goal.version,
  reason: "清理临时表无效目标",
});

beforeAll(async () => {
  for (const table of ["business_goal", "business_goal_revision", "dingtalk_user", "dingtalk_dept"])
    await client.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  state.database = drizzle(client);
  await client`INSERT INTO pg_temp.dingtalk_user (user_id,unionid,name,active,dept_ids,raw) VALUES ('qa','qa-union','验收人员',true,'[]','{}'),('other','other-union','其他人员',true,'[]','{}')`;
});
beforeEach(async () => {
  state.points = ["view", "fill", "publish"];
  state.scope = "all";
  await client`TRUNCATE pg_temp.business_goal_revision, pg_temp.business_goal`;
});
afterAll(async () => {
  await client.end();
});

describe("goal deletion with real SQL and connection-local temporary tables", () => {
  it("removes drafts from normal and home lists while preserving the goal and deletion audit", async () => {
    const goal = await create();
    const deleted = await mutateGoal(command(goal));
    expect(deleted).toMatchObject({ id: goal.id, version: 2, status: "draft", target: 100 });
    expect(deleted.deleted_at).toBeTruthy();
    expect((await listGoals()).items).toEqual([]);
    expect((await listGoals("2026-06", true)).items).toEqual([]);
    const [row] =
      await client`SELECT target,deleted_at,version FROM pg_temp.business_goal WHERE id=${goal.id}`;
    expect(row).toMatchObject({ target: 100, version: 2 });
    expect(row!.deleted_at).not.toBeNull();
    const history = await goalHistory(goal.id);
    const audit = history.find((revision) => revision.action === "delete");
    expect(audit).toMatchObject({
      reason: "清理临时表无效目标",
      before: { deleted_at: null },
      after: { version: 2 },
    });
    expect(audit?.after.deleted_at).toBeTruthy();
  });
  it("directly deletes published goals from normal and home lists while preserving their audit", async () => {
    const published = await mutateGoal(command(await create(), "publish"));
    expect((await listGoals("2026-06", true)).items).toHaveLength(1);
    const deleted = await mutateGoal(command(published));
    expect(deleted).toMatchObject({ status: "published", version: published.version + 1 });
    expect(deleted.deleted_at).toBeTruthy();
    expect((await listGoals()).items).toEqual([]);
    expect((await listGoals("2026-06", true)).items).toEqual([]);
    const [row] =
      await client`SELECT status,target,deleted_at,version FROM pg_temp.business_goal WHERE id=${published.id}`;
    expect(row).toMatchObject({ status: "published", target: 100, version: deleted.version });
    expect(row!.deleted_at).not.toBeNull();
    const audit = (await goalHistory(published.id)).find(
      (revision) => revision.action === "delete",
    );
    expect(audit).toMatchObject({
      reason: "清理临时表无效目标",
      before: { status: "published", deleted_at: null, version: published.version },
      after: { status: "published", version: deleted.version },
    });
    expect(audit?.after.deleted_at).toBeTruthy();
  });
  it("also allows archived goals to be deleted", async () => {
    const published = await mutateGoal(command(await create(), "publish"));
    const closed = await mutateGoal(command(published, "close"));
    expect((await mutateGoal(command(closed))).deleted_at).toBeTruthy();
    expect((await listGoals()).items).toHaveLength(0);
  });
  it("requires fill permission for drafts and publish permission for published or archived goals", async () => {
    const draft = await create();
    state.points = ["view"];
    await expect(mutateGoal(command(draft))).rejects.toMatchObject({ httpStatus: 403 });
    state.points = ["view", "fill"];
    expect((await mutateGoal(command(draft))).deleted_at).toBeTruthy();
    for (const status of ["published", "closed"]) {
      state.points = ["view", "fill", "publish"];
      const published = await mutateGoal(command(await create(), "publish"));
      const goal = status === "closed" ? await mutateGoal(command(published, "close")) : published;
      for (const points of [["view"], ["view", "fill"]]) {
        state.points = points;
        await expect(mutateGoal(command(goal))).rejects.toMatchObject({ httpStatus: 403 });
      }
      state.points = ["view", "publish"];
      expect((await mutateGoal(command(goal))).deleted_at).toBeTruthy();
    }
  });
  it("rejects stale versions and goals outside the current ownership scope", async () => {
    const goal = await mutateGoal(command(await create({ owner_ids: ["other"] }), "publish"));
    await expect(mutateGoal({ ...command(goal), version: 99 })).rejects.toMatchObject({
      httpStatus: 409,
    });
    state.scope = "self";
    await expect(mutateGoal(command(goal))).rejects.toMatchObject({ httpStatus: 404 });
    const [row] =
      await client`SELECT deleted_at,version FROM pg_temp.business_goal WHERE id=${goal.id}`;
    expect(row).toMatchObject({ deleted_at: null, version: goal.version });
  });
  it("does not allow repeated deletion or reopening a deleted goal", async () => {
    const deleted = await mutateGoal(command(await create()));
    await expect(mutateGoal(command(deleted))).rejects.toMatchObject({ httpStatus: 404 });
    await expect(mutateGoal(command(deleted, "reopen"))).rejects.toMatchObject({ httpStatus: 404 });
  });
  it("blocks deleting quarters with children and releases monthly allocation after deletion", async () => {
    const quarter = await create({ period: "2026-Q2" });
    const monthly = await create({ parent_id: quarter.id, target: 90 });
    await expect(mutateGoal(command(quarter))).rejects.toMatchObject({ httpStatus: 409 });
    await mutateGoal(command(monthly));
    const edited = await mutateGoal({
      ...command(quarter, "edit"),
      definition: { ...definition, period: "2026-Q2", target: 10 },
    });
    expect(edited.target).toBe(10);
    await mutateGoal(command(edited));
    await expect(create({ parent_id: quarter.id, target: 10 })).rejects.toThrow(
      "关联季度目标不存在",
    );
  });
  it("rolls back the deletion flag and version if audit insertion fails", async () => {
    const goal = await mutateGoal(command(await create(), "publish"));
    await client`ALTER TABLE pg_temp.business_goal_revision ADD CONSTRAINT qa_reject_delete CHECK (action <> 'delete')`;
    try {
      await expect(mutateGoal(command(goal))).rejects.toThrow();
      const [row] =
        await client`SELECT deleted_at,version FROM pg_temp.business_goal WHERE id=${goal.id}`;
      expect(row).toMatchObject({ deleted_at: null, version: goal.version });
      expect((await goalHistory(goal.id)).map((revision) => revision.action).sort()).toEqual([
        "create",
        "publish",
      ]);
    } finally {
      await client`ALTER TABLE pg_temp.business_goal_revision DROP CONSTRAINT qa_reject_delete`;
    }
  });
});
