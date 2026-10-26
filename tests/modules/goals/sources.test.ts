/* eslint-disable @typescript-eslint/no-non-null-assertion -- Known fixtures and recorded mock calls. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const m = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  permission: vi.fn(),
  managed: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { execute: m.execute, select: m.select } }));
vi.mock("@/modules/permissions/server", () => ({
  resolvePermission: m.permission,
  getManagedDeptIds: m.managed,
}));
vi.mock("@/lib/business-date", () => ({ businessDate: () => "2026-10-16" }));
import {
  goalSourceOptions,
  resolveGoalSource,
  resolveParticipatingTeamSummary,
  validateGoalBinding,
} from "@/modules/goals/sources";
import { metricOption } from "@/modules/goals/catalog";
import { goalProgress } from "@/modules/goals/rules";
import type { Goal, GoalAccess } from "@/modules/goals/types";
const actor: GoalAccess = {
  userId: "u",
  name: "主管",
  scope: "all",
  points: ["view", "fill"],
  deptIds: [],
  delegatedIds: null,
};
function goal(field = "g_pay_amount"): Goal {
  const metric = metricOption("douyin", field)!;
  return {
    id: "test",
    project: "三冰",
    line: "生态",
    period: "2026-09",
    dept_id: null,
    owner_ids: ["u"],
    owner_labels: [],
    metric: metric.label,
    unit: metric.unit,
    kind: metric.kind,
    target: 100,
    definition: "test",
    confirmed: true,
    parent_id: null,
    actual: 999,
    as_of: "2026-09-01",
    evidence: "old",
    status: "published",
    version: 1,
    created_by: "u",
    updated_at: "",
    binding: {
      source: "douyin",
      product: "three",
      field,
      selection: "accounts",
      account_ids: ["a"],
      direction: "gte",
      qualification: null,
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.permission.mockResolvedValue({ scope: "all", delegatedUserIds: null });
});
describe("goal account value breakdown", () => {
  it("returns the participating team's full total without granting source permission or exposing account IDs and values", async () => {
    const g = goal();
    g.owner_ids = ["manager"];
    g.binding!.account_ids = ["a", "b"];
    m.permission.mockResolvedValue({ scope: "none", delegatedUserIds: null });
    m.execute
      .mockResolvedValueOnce([
        { id: "a", name: "本人账号" },
        { id: "b", name: "其他运营账号" },
      ])
      .mockResolvedValueOnce([
        {
          actual: 300,
          date: "2026-09-16",
          known: 2,
          known_ids: ["a", "b"],
          recorded_ids: ["a", "b"],
          account_values: [
            { id: "a", actual: 100 },
            { id: "b", actual: 200 },
          ],
        },
      ]);
    const result = await resolveParticipatingTeamSummary(g);
    expect(result).toMatchObject({
      read_only: true,
      actual: 300,
      binding: { account_ids: [] },
      source_result: { status: "ready" },
    });
    expect(Object.keys(result.source_result ?? {}).sort()).toEqual(["note", "status"]);
    expect(JSON.stringify(result)).not.toContain("其他运营账号");
    expect(m.permission).not.toHaveBeenCalled();
    const normal = await resolveGoalSource({ ...actor, scope: "self" }, g);
    expect(normal.actual).toBeNull();
    expect(normal.source_result?.status).toBe("forbidden");
    expect(m.execute).toHaveBeenCalledTimes(2);
  });
  it.each(["ddz", "three", "zhaohua"])(
    "returns %s account values from the same aggregate query with zero and missing fields distinguished",
    async (product) => {
      const g = goal();
      g.binding!.product = product;
      g.binding!.account_ids = ["a", "b", "c", "d"];
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "甲" },
          { id: "b", name: "乙" },
          { id: "c", name: "丙" },
          { id: "d", name: "丁" },
        ])
        .mockResolvedValueOnce([
          {
            actual: 30,
            date: "2026-09-03",
            known: 2,
            known_ids: ["a", "b"],
            recorded_ids: ["a", "b", "c"],
            account_values: [
              { id: "a", actual: 30, as_of: "2026-09-03" },
              { id: "b", actual: 0, as_of: "2026-09-02" },
              { id: "c", actual: null, as_of: "2026-09-01" },
            ],
          },
        ]);
      const result = await resolveGoalSource(actor, g);
      expect(result.actual).toBe(30);
      expect(result.source_result?.account_values_additive).toBe(true);
      expect(result.source_result?.account_values).toMatchObject([
        { id: "a", name: "甲", actual: 30, status: "ready", as_of: "2026-09-03" },
        { id: "b", actual: 0, status: "ready" },
        { id: "c", actual: null, status: "pending" },
        { id: "d", actual: 0, status: "no_record", as_of: null },
      ]);
      expect(result.source_result?.status).toBe("partial");
      expect(m.execute).toHaveBeenCalledTimes(2);
      expect(new PgDialect().sqlToQuery(m.execute.mock.calls[1]![0]).sql).toContain("JSONB_AGG");
    },
  );
  it("scales percentage account values without labeling them additive", async () => {
    const g = goal("enter_room_rate");
    m.execute.mockResolvedValueOnce([{ id: "a", name: "甲" }]).mockResolvedValueOnce([
      {
        actual: 0.2,
        date: "2026-09-03",
        known: 1,
        known_ids: ["a"],
        recorded_ids: ["a"],
        account_values: [{ id: "a", actual: 0.2, as_of: "2026-09-03" }],
      },
    ]);
    const result = await resolveGoalSource(actor, g);
    expect(result.actual).toBe(20);
    expect(result.source_result?.account_values?.[0]?.actual).toBe(20);
    expect(result.source_result?.account_values_additive).toBe(false);
  });
  it("keeps fishing snapshots separate by product and retains missing logs as unknown", async () => {
    const g = fishingGoal("product_buyu_all");
    m.execute
      .mockResolvedValueOnce([
        { id: "a", name: "甲", products: ["product_buyu", "product_ue4"] },
        { id: "b", name: "乙", products: ["product_urp"] },
      ])
      .mockResolvedValueOnce([
        { ...fishingRow("product_buyu", "a", 50), date: "2026-09-01" },
        fishingRow("product_buyu", "a", 100),
        fishingRow("product_ue4", "a", 300),
      ]);
    const result = await resolveGoalSource(actor, g);
    expect(result.actual).toBe(400);
    expect(result.source_result?.account_values_additive).toBe(true);
    expect(result.source_result?.account_values).toMatchObject([
      { id: "a", name: "甲", product: "product_buyu", actual: 100, status: "ready" },
      { id: "a", product: "product_ue4", actual: 300, status: "ready" },
      { id: "b", product: "product_urp", actual: null, status: "pending" },
    ]);
    expect(m.execute).toHaveBeenCalledTimes(2);
  });
  it("does not expose breakdowns when source permission fails", async () => {
    m.permission.mockResolvedValue({ scope: "none", delegatedUserIds: null });
    const result = await resolveGoalSource(actor, goal());
    expect(result.source_result?.status).toBe("forbidden");
    expect(result.source_result?.account_values).toBeUndefined();
    expect(m.execute).not.toHaveBeenCalled();
  });
});
describe("goal live source authorization and values", () => {
  it.each(["accounts", "all"] as const)(
    "lists fishing accounts missing period logs for %s scopes",
    async (selection) => {
      const g = goal();
      g.project = "捕鱼";
      g.binding = {
        ...g.binding!,
        source: "buyu",
        product: "product_buyu",
        field: "消耗",
        selection,
        account_ids: selection === "accounts" ? ["a", "b"] : [],
      };
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "甲" },
          { id: "b", name: "乙" },
        ])
        .mockResolvedValueOnce([
          {
            account_id: "a",
            account_name: "甲",
            date: "2026-09-03",
            cost: 100,
            additions: 1,
            payment: 0,
            raw: { _summary_months: { "2026-09": { 消耗: 100 } } },
          },
        ]);
      const r = await resolveGoalSource(actor, g);
      expect(r.source_result?.missing_accounts).toEqual([{ id: "b", name: "乙" }]);
      expect(r.actual).toBe(selection === "all" ? 100 : null);
      expect(r.source_result?.status).toBe(selection === "all" ? "partial" : "pending");
    },
  );
  it("denies options before database access without goals view", async () => {
    await expect(goalSourceOptions({ ...actor, points: [] }, "douyin", "three")).rejects.toThrow(
      "权限",
    );
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("honors explicit empty delegation even when broad permission exists", async () => {
    m.permission.mockResolvedValue({ scope: "all", delegatedUserIds: [] });
    await expect(goalSourceOptions(actor, "douyin", "three")).rejects.toThrow("权限");
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("does not expose stale/manual actual when source permission was revoked", async () => {
    m.permission.mockResolvedValue({ scope: "none", delegatedUserIds: null });
    const r = await resolveGoalSource(actor, goal());
    expect(r.actual).toBeNull();
    expect(r.evidence).toBe("");
    expect(r.source_result?.status).toBe("forbidden");
    expect(r.source_result?.missing_accounts).toBeUndefined();
  });
  it("requires access to every bound account and never returns a partial authorized total", async () => {
    m.execute.mockResolvedValueOnce([{ id: "a", name: "A" }]);
    const g = goal();
    g.binding!.account_ids = ["a", "outside"];
    const r = await resolveGoalSource(actor, g);
    expect(r.actual).toBeNull();
    expect(r.source_result?.status).toBe("forbidden");
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it("does not query unconfirmed goals or future periods", async () => {
    expect((await resolveGoalSource(actor, { ...goal(), confirmed: false })).actual).toBeNull();
    expect((await resolveGoalSource(actor, { ...goal(), period: "2027-01" })).actual).toBeNull();
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("keeps recorded null metrics unknown, but accepts a recorded zero", async () => {
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A" }])
      .mockResolvedValueOnce([
        { actual: null, date: null, known: 0, known_ids: null, recorded_ids: ["a"] },
      ]);
    const empty = await resolveGoalSource(actor, goal());
    expect(empty.actual).toBeNull();
    expect(empty.source_result?.missing_accounts).toEqual([{ id: "a", name: "A" }]);
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A" }])
      .mockResolvedValueOnce([
        { actual: 0, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
      ]);
    expect((await resolveGoalSource(actor, goal())).actual).toBe(0);
  });
  it("converts fractional percentage to the target input percent scale", async () => {
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A" }])
      .mockResolvedValueOnce([
        { actual: 0.125, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
      ]);
    const r = await resolveGoalSource(actor, goal("g_like_uavg"));
    expect(r.actual).toBe(12.5);
    expect(r.as_of).toBe("2026-09-03");
  });
  it.each(["accounts", "all"] as const)(
    "counts accounts without period activity as zero in %s totals without blocking achievement",
    async (selection) => {
      const g = goal();
      g.binding!.selection = selection;
      g.binding!.account_ids = selection === "accounts" ? ["a", "b"] : [];
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ])
        .mockResolvedValueOnce([
          { actual: 100, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
        ]);
      const result = await resolveGoalSource(actor, g);
      expect(result.actual).toBe(100);
      expect(result.source_result).toMatchObject({
        status: "ready",
        unknown_accounts: 0,
        missing_accounts: [],
        no_record_accounts: [{ id: "b", name: "B" }],
      });
      expect(result.source_result?.note).toContain("本期无记录，按0计入");
      expect(goalProgress(result).label).toBe("已完成");
    },
  );
  it("returns zero for an empty cumulative period but leaves averages without records pending", async () => {
    for (const field of ["g_pay_amount", "g_acu"]) {
      m.execute
        .mockResolvedValueOnce([{ id: "a", name: "A" }])
        .mockResolvedValueOnce([
          { actual: null, date: null, known: 0, known_ids: null, recorded_ids: null },
        ]);
      const result = await resolveGoalSource(actor, goal(field));
      expect(result.actual).toBe(field === "g_pay_amount" ? 0 : null);
      expect(result.source_result?.status).toBe(field === "g_pay_amount" ? "ready" : "pending");
    }
  });
  it("does not turn source read failures into zero progress", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      m.execute
        .mockResolvedValueOnce([{ id: "a", name: "A" }])
        .mockRejectedValueOnce(new Error("read failed"));
      const result = await resolveGoalSource(actor, goal());
      expect(result.actual).toBeNull();
      expect(result.source_result?.status).toBe("error");
    } finally {
      log.mockRestore();
    }
  });
  it("rejects non-additive multi-account aggregation", async () => {
    m.execute.mockResolvedValue([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    const g = goal("g_acu");
    g.binding!.account_ids = ["a", "b"];
    await expect(validateGoalBinding(actor, g.binding!)).rejects.toThrow("一个主播");
  });
  it("disallows all-product binding for limited goals scope", async () => {
    m.execute.mockResolvedValue([{ id: "a", name: "A" }]);
    const g = goal();
    g.binding!.selection = "all";
    g.binding!.account_ids = [];
    await expect(validateGoalBinding({ ...actor, scope: "self" }, g.binding!)).rejects.toThrow(
      "全产品",
    );
  });
  it("pins correct product attribution before aggregation and source scene in SQL", async () => {
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A" }])
      .mockResolvedValueOnce([
        { actual: 10, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
      ]);
    await resolveGoalSource(actor, goal());
    const dialect = new PgDialect();
    const accountQuery = dialect.sqlToQuery(m.execute.mock.calls[0]![0]);
    expect(accountQuery.params).toContain("造化仙府");
    expect(accountQuery.sql).toContain("is_threekingdoms");
    expect(accountQuery.params).toContain("three");
    const q = dialect.sqlToQuery(m.execute.mock.calls[1]![0]);
    expect(q.sql).toContain("promote_scene = 'live'");
    expect(q.sql).toContain("biz_mode = 'cps'");
    expect(q.params).toContain("2026-09-01");
    expect(q.params).toContain("2026-09-30");
  });
  it.each(["accounts", "all"] as const)(
    "keeps recorded but null %s metrics as a partial total",
    async (selection) => {
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ])
        .mockResolvedValueOnce([
          { actual: 100, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a", "b"] },
        ]);
      const g = goal();
      g.binding!.selection = selection;
      g.binding!.account_ids = selection === "accounts" ? ["a", "b"] : [];
      const r = await resolveGoalSource(actor, g);
      expect(r.actual).toBe(100);
      expect(r.as_of).toBe("2026-09-03");
      expect(r.source_result).toMatchObject({ status: "partial", unknown_accounts: 1 });
      expect(r.source_result?.note).toContain("1/2个账号有本期指标数据");
      expect(r.source_result?.missing_accounts).toEqual([{ id: "b", name: "B" }]);
      expect(goalProgress(r)).toMatchObject({ percent: null, attention: true });
      expect(goalProgress(r).label).not.toBe("已完成");
    },
  );
  it("retains a recorded partial zero and clears the partial state after all accounts have data", async () => {
    const g = goal();
    g.binding!.account_ids = ["a", "b"];
    for (const known of [1, 2]) {
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ])
        .mockResolvedValueOnce([
          {
            actual: 0,
            date: "2026-09-03",
            known,
            known_ids: ["a", "b"].slice(0, known),
            recorded_ids: ["a", "b"],
          },
        ]);
      const r = await resolveGoalSource(actor, g);
      expect(r.actual).toBe(0);
      expect(r.source_result?.status).toBe(known === 1 ? "partial" : "ready");
      expect(r.source_result?.unknown_accounts).toBe(2 - known);
      expect(r.source_result?.missing_accounts).toHaveLength(2 - known);
    }
  });
  it("filters candidates by department without granting delegated viewers personnel assignment rights", async () => {
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A", operator_ids: ["operator"] }])
      .mockResolvedValueOnce([]);
    const options = await goalSourceOptions(
      { ...actor, delegatedIds: ["operator"] },
      "douyin",
      "ddz",
      "offline",
    );
    expect(options.users).toEqual([]);
    expect(options.allowAll).toBe(false);
    const dialect = new PgDialect();
    const accounts = dialect.sqlToQuery(m.execute.mock.calls[0]![0]);
    expect(accounts.sql).toContain("mapped.dept_ids->>0 ELSE ag.dept_id END=");
    expect(accounts.params).toContain("offline");
    const users = dialect.sqlToQuery(m.execute.mock.calls[1]![0]);
    expect(users.sql).toContain("du.active=true");
    expect(users.sql).toContain("du.dept_ids->>0=");
    expect(users.sql).toContain("false");
    expect(users.params).toContain("operator");
    expect(users.params).toContain("offline");
  });
  it.each([
    ["self", []],
    ["team", []],
    ["team", ["offline"]],
    ["all", []],
  ] as const)(
    "restricts operator choices for %s scope with managed departments %j",
    async (scope, deptIds) => {
      m.execute
        .mockResolvedValueOnce([
          { id: "a", name: "A", operator_ids: ["u"] },
          { id: "b", name: "B", operator_ids: ["other"] },
        ])
        .mockResolvedValueOnce([]);
      await goalSourceOptions(
        { ...actor, scope, deptIds: [...deptIds] },
        "douyin",
        "ddz",
        "offline",
      );
      const users = new PgDialect().sqlToQuery(m.execute.mock.calls[1]![0]);
      if (scope === "self" || (scope === "team" && !deptIds.length)) {
        expect(users.sql).toContain("du.user_id=");
        expect(users.params.filter((value) => value === "u")).toHaveLength(2);
      } else if (scope === "team") {
        expect(users.sql).toContain("du.dept_ids ?|");
      } else {
        expect(users.sql).toContain("AND true AND");
      }
    },
  );
  it("rejects owners and accounts outside the selected product and department", async () => {
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A", operator_ids: ["operator"] }])
      .mockResolvedValueOnce([{ id: "operator", name: "运营" }]);
    await expect(
      validateGoalBinding(actor, { ...goal().binding!, selection: "operators" }, "offline", [
        "outside",
      ]),
    ).rejects.toThrow("负责人不属于");
    m.execute.mockResolvedValueOnce([]);
    await expect(validateGoalBinding(actor, goal().binding!, "offline")).rejects.toThrow(
      "不属于所选产品及部门",
    );
  });
  it("keeps empty attribution empty instead of falling back to all company personnel", async () => {
    m.execute.mockResolvedValueOnce([]);
    expect((await goalSourceOptions(actor, "douyin", "ddz", "empty")).users).toEqual([]);
    expect(m.execute).toHaveBeenCalledTimes(1);
  });
  it("limits all-account actuals to the saved department, independently of responsible owners", async () => {
    const g = goal();
    g.dept_id = "offline";
    g.binding!.selection = "all";
    g.binding!.account_ids = [];
    m.execute
      .mockResolvedValueOnce([{ id: "a", name: "A" }])
      .mockResolvedValueOnce([
        { actual: 10, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
      ]);
    expect((await resolveGoalSource(actor, g)).actual).toBe(10);
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(m.execute.mock.calls[0]![0]).params).toContain("offline");
    const totals = dialect.sqlToQuery(m.execute.mock.calls[1]![0]);
    expect(totals.params).toContain("a");
    expect(totals.params).not.toContain("u");
  });
});

function fishingGoal(product: string): Goal {
  return {
    ...goal(),
    project: "捕鱼",
    dept_id: "fishing",
    metric: "消耗",
    unit: "元",
    kind: "sum",
    binding: {
      source: "buyu",
      product,
      field: "消耗",
      selection: "all",
      account_ids: [],
      direction: "gte",
      qualification: null,
    },
  };
}
function fishingRow(dataset_id: string, account_id: string, cost: number) {
  return {
    dataset_id,
    account_id,
    account_name: account_id,
    date: "2026-09-03",
    cost,
    additions: 1,
    payment: 0,
    raw: { _summary_months: { "2026-09": { 消耗: cost } } },
  };
}
describe("fishing total data queries and authorized operator accounts", () => {
  it.each(["product_buyu", "product_ue4", "product_urp", "product_buyu_all"])(
    "reads only the requested datasets for %s and retains department scope",
    async (product) => {
      const datasets =
        product === "product_buyu_all" ? ["product_buyu", "product_ue4", "product_urp"] : [product];
      m.execute
        .mockResolvedValueOnce([{ id: "a", name: "A" }])
        .mockResolvedValueOnce(datasets.map((id, i) => fishingRow(id, "a", (i + 1) * 100)));
      const result = await resolveGoalSource(actor, fishingGoal(product));
      expect(result.actual).toBe(product === "product_buyu_all" ? 600 : 100);
      for (const index of [0, 1]) {
        const query = new PgDialect().sqlToQuery(m.execute.mock.calls[index]![0]);
        for (const id of ["product_buyu", "product_ue4", "product_urp"])
          expect(query.params.includes(id)).toBe(datasets.includes(id));
        expect(query.params).not.toContain("product_buyu_all");
      }
      const accountQuery = new PgDialect().sqlToQuery(m.execute.mock.calls[0]![0]);
      expect(accountQuery.params).toContain("fishing");
      const dataQuery = new PgDialect().sqlToQuery(m.execute.mock.calls[1]![0]);
      expect(dataQuery.sql).toContain("DISTINCT ON(c.dataset_id,c.live_account_id");
      expect(result.source_result?.product_details?.map((p) => p.actual)).toEqual(
        product === "product_buyu_all" ? [100, 200, 300] : undefined,
      );
    },
  );
  it("automatically totals two products for one operator and excludes other operators", async () => {
    const g = fishingGoal("product_buyu_all");
    g.status = "draft";
    g.binding!.selection = "operators";
    m.execute
      .mockResolvedValueOnce([
        { id: "a", name: "A", operator_ids: ["u"] },
        { id: "b", name: "B", operator_ids: ["u"] },
        { id: "other", name: "Other", operator_ids: ["other-user"] },
      ])
      .mockResolvedValueOnce([
        fishingRow("product_buyu", "a", 100),
        fishingRow("product_ue4", "b", 300),
      ]);
    const result = await resolveGoalSource(actor, g);
    expect(result.actual).toBe(400);
    expect(result.source_result?.matched_accounts?.map((a) => a.id)).toEqual(["a", "b"]);
    const query = new PgDialect().sqlToQuery(m.execute.mock.calls[1]![0]);
    expect(query.params).not.toContain("other");
    expect(query.params).toContain("a");
    expect(query.params).toContain("b");
    expect(
      result.source_result?.product_details?.flatMap((p) => p.accounts.map((a) => a.id)),
    ).toEqual(["a", "b"]);
  });
  it("does not widen delegated source visibility when aggregating products", async () => {
    m.permission.mockResolvedValue({ scope: "all", delegatedUserIds: ["u"] });
    const g = fishingGoal("product_buyu_all");
    g.binding!.selection = "accounts";
    g.binding!.account_ids = ["a", "outside"];
    m.execute.mockResolvedValueOnce([{ id: "a", name: "A" }]);
    const result = await resolveGoalSource(actor, g);
    expect(result.source_result?.status).toBe("forbidden");
    expect(result.source_result?.product_details).toBeUndefined();
    expect(m.execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(m.execute.mock.calls[0]![0]);
    expect(query.sql).toContain("a.agent_dingtalk_user_id IN");
    expect(query.params).toContain("u");
  });
  it.each(["ddz", "three", "zhaohua"])(
    "keeps %s queries restricted to their original product",
    async (product) => {
      const g = goal();
      g.binding!.product = product;
      m.execute
        .mockResolvedValueOnce([{ id: "a", name: "A" }])
        .mockResolvedValueOnce([
          { actual: 42, date: "2026-09-03", known: 1, known_ids: ["a"], recorded_ids: ["a"] },
        ]);
      const result = await resolveGoalSource(actor, g);
      expect(result.actual).toBe(42);
      expect(result.source_result?.product_details).toBeUndefined();
      const query = new PgDialect().sqlToQuery(m.execute.mock.calls[0]![0]);
      expect(query.params).toContain(product);
      expect(query.sql).not.toContain("placement_cumulative_raw");
    },
  );
});

it("returns threshold progress only for the operator's matched accounts, without extra queries", async () => {
  const g = fishingGoal("product_buyu_all");
  g.status = "draft";
  g.kind = "count";
  g.unit = "个";
  g.metric = "达标账号数";
  g.binding = {
    ...g.binding!,
    field: "qualified_accounts",
    selection: "operators",
    qualification_by_product: {
      product_buyu: { roi: 12, min_cost: 100 },
      product_ue4: { roi: 13.5, min_cost: 200 },
      product_urp: { roi: 7.5, min_cost: 100 },
    },
  };
  m.execute
    .mockResolvedValueOnce([
      { id: "a", name: "A", operator_ids: ["u"], products: ["product_buyu"] },
      { id: "b", name: "B", operator_ids: ["u"], products: ["product_ue4"] },
      { id: "outside", name: "Outside", operator_ids: ["other"], products: ["product_urp"] },
    ])
    .mockResolvedValueOnce([
      {
        ...fishingRow("product_buyu", "a", 50),
        raw: { _summary_months: { "2026-09": { 消耗: 50, 实时净ROI: 0.105 } } },
      },
    ]);
  const result = await resolveGoalSource(actor, g);
  expect(result.source_result?.account_progress).toHaveLength(2);
  expect(result.source_result?.account_progress?.[0]).toMatchObject({
    id: "a",
    roi: 10.5,
    required_roi: 12,
    roi_gap: 1.5,
    cost_gap: 50,
    status: "unqualified",
  });
  expect(result.source_result?.account_progress?.[1]).toMatchObject({
    id: "b",
    product: "product_ue4",
    status: "pending",
    roi: null,
  });
  expect(m.execute).toHaveBeenCalledTimes(2);
});

it("still exposes known account progress when an explicitly selected account has no logs", async () => {
  const g = fishingGoal("product_buyu");
  g.metric = "达标账号数";
  g.kind = "count";
  g.unit = "个";
  g.binding = {
    ...g.binding!,
    field: "qualified_accounts",
    selection: "accounts",
    account_ids: ["a", "b"],
    qualification: { roi: 12, min_cost: 100 },
  };
  m.execute
    .mockResolvedValueOnce([
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ])
    .mockResolvedValueOnce([
      {
        ...fishingRow("product_buyu", "a", 100),
        raw: { _summary_months: { "2026-09": { 消耗: 100, 实时净ROI: 0.15 } } },
      },
    ]);
  const result = await resolveGoalSource(actor, g);
  expect(result.actual).toBeNull();
  expect(result.source_result?.account_progress?.map((a) => [a.id, a.status])).toEqual([
    ["a", "qualified"],
    ["b", "pending"],
  ]);
});
