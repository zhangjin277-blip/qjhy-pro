import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import type { Goal, GoalAccess, GoalBinding } from "@/modules/goals/types";

const state = vi.hoisted(() => ({ database: null as Db | null }));
vi.mock("@/db/client", () => ({
  db: {
    execute: (...args: unknown[]) => {
      if (!state.database) throw new Error("Test database not initialized");
      return Reflect.apply(state.database.execute, state.database, args);
    },
  },
}));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: vi.fn(async () => ({ scope: "all", delegatedUserIds: null })),
  getManagedDeptIds: vi.fn(async () => []),
}));
import { goalSourceOptions, resolveGoalSource, validateGoalBinding } from "@/modules/goals/sources";

const url = process.env.DATABASE_URL;
if (!url || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Temporary-table test requires a local database");
const client = postgres(url, { max: 1, prepare: false });
const actor: GoalAccess = {
  userId: "off",
  name: "测试",
  scope: "all",
  points: ["view", "fill"],
  deptIds: [],
  delegatedIds: null,
};
const binding: GoalBinding = {
  source: "douyin",
  product: "ddz",
  field: "g_pay_amount",
  selection: "all",
  account_ids: [],
  direction: "gte",
  qualification: null,
};

beforeAll(async () => {
  // Connection-local tables only. No real accounts or goals are written.
  for (const table of [
    "anchor_profile",
    "dingtalk_user",
    "entity_alias",
    "anchor_game_promo_daily",
    "anchor_minigame_daily",
  ])
    await client.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  state.database = drizzle(client);
  for (const [id, name, depts, active] of [
    ["off", "线下甲", ["offline"], true],
    ["off-duplicate", "线下甲", ["offline"], true],
    ["off-three", "线下乙", ["offline"], true],
    ["online", "线上甲", ["online", "offline"], true],
    ["unassigned", "未归因员工", ["offline"], true],
    ["inactive", "离职运营", ["offline"], false],
    ["regression-op", "归因验收运营", ["regression"], true],
  ] as const)
    await client`INSERT INTO pg_temp.dingtalk_user (user_id,unionid,name,dept_ids,active,raw) VALUES (${id},${id},${name},${JSON.stringify(depts)}::jsonb,${active},'{}')`;
  for (const [id, alias] of [
    ["online", "线上运营"],
    ["offline", "线下运营"],
  ] as const)
    await client`INSERT INTO pg_temp.entity_alias (entity_type,entity_id,alias) VALUES ('dept',${id},${alias})`;
  for (const [id, broker, three, recruit, archived] of [
    ["off-ddz", "线下甲", false, "other", false],
    ["off-three", "线下乙", true, "other", false],
    ["off-zhaohua", "线下乙", true, "造化仙府", false],
    ["on-ddz", "线上甲", false, "other", false],
    ["inactive-ddz", "离职运营", false, "other", false],
    ["fallback", "线上主播", false, "other", false],
    ["archived", "线下甲", false, "other", true],
  ] as const)
    await client`INSERT INTO pg_temp.anchor_profile (anchor_id,nick_name,broker_id,broker_name,is_threekingdoms,recruit_broker_name,is_archived,raw) VALUES (${id},${id},${broker},${broker},${three},${recruit},${archived},'{}')`;
  for (const [id, amount] of [
    ["off-ddz", 100],
    ["on-ddz", 900],
  ] as const)
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_pay_amount_1d,raw) VALUES (${id},'2026-09-01','live','cps','途游斗地主（比赛版）',${amount},'{}')`;
  await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,raw) VALUES ('inactive-ddz','2026-08-01','live','cps','途游斗地主（比赛版）','{}')`;
  await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_anchor_active_pay_amount_1d,promote_faction_active_pay_amount_1d,promote_download_pay_amount_1d,raw) VALUES
    ('off-ddz','2026-06-01','live','cps_all','途游斗地主（比赛版）',4,4,10,'{}'),
    ('off-ddz','2026-06-30','video','cps_all','途游斗地主（比赛版）',NULL,NULL,5,'{}')`;
  for (const [id, name, recruit, archived] of [
    ["legacy-three", "三国冰河时代-哇哈哈", "陈泰", false],
    ["minigame-only", "改名后的主播", "奇迹互娱", false],
    ["three-alias", "车厘子", "三冰时代", false],
    ["unknown-product", "三国冰河时代-地瓜瓜", "奇迹互娱", false],
    ["renamed-ddz", "三冰水蜜桃", "棋牌二创", false],
    ["conflict", "同日多产品", "线下主播", false],
    ["explicit-zhaohua", "造化", "造化仙府", false],
    ["archived-three", "已归档", "陈泰", true],
  ] as const)
    await client`INSERT INTO pg_temp.anchor_profile (anchor_id,nick_name,broker_id,broker_name,recruit_broker_name,is_threekingdoms,is_archived,raw) VALUES (${id},${name},'regression-op','归因验收运营',${recruit},false,${archived},'{}')`;
  for (const [id, game, date] of [
    ["legacy-three", "三国：冰河时代", "2026-09-01"],
    ["renamed-ddz", "三国：冰河时代", "2026-08-01"],
    ["renamed-ddz", "途游斗地主（比赛版）", "2026-08-02"],
    ["conflict", "三国：冰河时代", "2026-09-01"],
    ["conflict", "途游斗地主（比赛版）", "2026-09-01"],
    ["explicit-zhaohua", "途游斗地主（比赛版）", "2026-09-01"],
    ["archived-three", "三国：冰河时代", "2026-09-01"],
  ] as const)
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,raw) VALUES (${id},${date},'live','cps',${game},'{}')`;
  await client`INSERT INTO pg_temp.anchor_minigame_daily (anchor_id,date,scene,mp_name,raw) VALUES ('minigame-only','2026-09-01','live','三国冰河时代','{}')`;
});
afterAll(async () => {
  await client.end();
});

describe("goal attribution shares the workbench rule", () => {
  it("deduplicates accounts and returns only active operators attributed to the chosen product and primary department", async () => {
    const result = await goalSourceOptions(actor, "douyin", "ddz", "offline");
    expect(result.accounts.map((a) => a.id).sort()).toEqual(["inactive-ddz", "off-ddz"]);
    expect(result.users.map((u) => u.id).sort()).toEqual(["off", "off-duplicate"]);
    expect(result.allowAll).toBe(true);
  });
  it("uses primary department and preserves the dashboard zhaohua product precedence", async () => {
    expect(
      (await goalSourceOptions(actor, "douyin", "ddz", "online")).accounts.map((a) => a.id),
    ).toEqual(["on-ddz"]);
    expect(
      (await goalSourceOptions(actor, "douyin", "three", "offline")).accounts.map((a) => a.id),
    ).toEqual(["off-three"]);
    expect(
      (await goalSourceOptions(actor, "douyin", "zhaohua", "offline")).accounts.map((a) => a.id),
    ).toEqual(["off-zhaohua"]);
  });
  it("intersects candidates with goal self, team and delegated personnel permissions", async () => {
    for (const narrowed of [
      { ...actor, scope: "self" as const },
      { ...actor, scope: "team" as const, userId: "manager", deptIds: ["offline"] },
      { ...actor, delegatedIds: ["off"] },
      { ...actor, delegatedIds: [] },
    ]) {
      const result = await goalSourceOptions(narrowed, "douyin", "ddz", "offline");
      const expected =
        narrowed.delegatedIds?.length === 0
          ? []
          : narrowed.scope === "team"
            ? ["off", "off-duplicate"]
            : ["off"];
      expect(result.users.map((u) => u.id).sort()).toEqual(expected);
      expect(result.allowAll).toBe(false);
    }
  });
  it("keeps missing product evidence pending instead of defaulting to ddz", async () => {
    const result = await goalSourceOptions(actor, "douyin", "ddz", "empty");
    expect(result.accounts).toEqual([]);
    expect(result.users).toEqual([]);
    expect(
      (await goalSourceOptions(actor, "douyin", "ddz")).accounts.some((a) => a.id === "fallback"),
    ).toBe(false);
  });
  it("rejects account and owner choices that belong to another product or department", async () => {
    await expect(
      validateGoalBinding(
        actor,
        { ...binding, selection: "accounts", account_ids: ["on-ddz"] },
        "offline",
        ["off"],
      ),
    ).rejects.toThrow("不属于所选产品及部门");
    await expect(
      validateGoalBinding(
        actor,
        { ...binding, selection: "accounts", account_ids: ["off-ddz"] },
        "offline",
        ["off-three"],
      ),
    ).rejects.toThrow("负责人不属于");
  });
  it("computes all-account actuals within the saved department without duplicating same-name matches", async () => {
    const goal: Goal = {
      period: "2026-09",
      project: "斗地主",
      line: "整体",
      dept_id: "offline",
      owner_ids: ["off"],
      owner_labels: [],
      metric: "游戏流水",
      binding,
      unit: "元",
      kind: "sum",
      target: 200,
      definition: "test",
      confirmed: true,
      parent_id: null,
      id: "test",
      actual: null,
      as_of: null,
      evidence: "",
      status: "draft",
      version: 1,
      created_by: "off",
      updated_at: "",
    };
    const result = await resolveGoalSource(actor, goal);
    expect(result.actual).toBe(100);
    expect(result.source_result?.status).toBe("ready");
    expect(result.source_result?.note).toContain("1/2");
    const june = await resolveGoalSource(actor, {
      ...goal,
      period: "2026-06",
      binding: {
        ...binding,
        field: "controller_total_amount",
        selection: "accounts",
        account_ids: ["off-ddz", "inactive-ddz"],
      },
    });
    expect(june.actual).toBe(35);
    expect(june.as_of).toBe("2026-06-30");
    expect(june.source_result).toMatchObject({ status: "ready", unknown_accounts: 0 });
    expect(june.source_result?.missing_accounts).toEqual([]);
    expect(june.source_result?.no_record_accounts).toEqual([
      { id: "inactive-ddz", name: "inactive-ddz" },
    ]);
  });
});

describe("product regression from the reported mixed-account list", () => {
  it("excludes three-game records under neutral recruiters from ddz, including minigame-only evidence", async () => {
    const ddz = await goalSourceOptions(actor, "douyin", "ddz", "regression");
    const three = await goalSourceOptions(actor, "douyin", "three", "regression");
    expect(ddz.accounts.map((a) => a.id)).toEqual(["renamed-ddz"]);
    expect(three.accounts.map((a) => a.id).sort()).toEqual([
      "legacy-three",
      "minigame-only",
      "three-alias",
    ]);
    expect(ddz.users.map((u) => u.id)).toEqual(["regression-op"]);
    expect(ddz.unassignedAccounts).toBe(2);
  });
  it("uses later real product evidence rather than a nickname and leaves same-day conflicts pending", async () => {
    const ddz = await goalSourceOptions(actor, "douyin", "ddz", "regression");
    expect(ddz.accounts.map((a) => a.id)).toEqual(["renamed-ddz"]);
    expect(
      ddz.accounts.some((a) => ["unknown-product", "conflict", "archived-three"].includes(a.id)),
    ).toBe(false);
    expect(
      (await goalSourceOptions(actor, "douyin", "zhaohua", "regression")).accounts.map((a) => a.id),
    ).toEqual(["explicit-zhaohua"]);
  });
  it("rejects saving the reported three-game account as a ddz account", async () => {
    await expect(
      validateGoalBinding(
        actor,
        { ...binding, selection: "accounts", account_ids: ["legacy-three"] },
        "regression",
        ["regression-op"],
      ),
    ).rejects.toThrow("不属于所选产品及部门");
  });
});
