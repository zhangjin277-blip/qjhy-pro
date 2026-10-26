import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { execute: mock.execute } }));
import { getDrawerDetail } from "@/modules/dashboard/queries";
import type { DrawerMetric } from "@/modules/dashboard/types";

const dialect = new PgDialect();
const filters = {
  project: "three" as const,
  group: "offline" as const,
  date_from: "2026-09-01",
  date_to: "2026-09-02",
};
const attribution = (id: string) => [
  {
    anchor_id: id,
    project: "three",
    group: "offline",
    operator_id: "operator",
    dept_id: "offline",
    is_threekingdoms: true,
  },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.execute.mockImplementation(async (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    if (sql.includes("product_activity AS"))
      return attribution(sql.includes("'foreign'") ? "foreign-account" : "own-account");
    if (sql.includes("::int AS c")) return [{ c: 3 }];
    if (sql.includes("ap.nick_name"))
      return [{ anchor_id: "own-account", metric_value: 250, nick_name: "主播" }];
    const prior = params.includes("2026-08-30");
    const d = prior ? "2026-08-30" : "2026-09-01";
    if (sql.includes("AS total_fan_ticket"))
      return [{ d, total_fan_ticket: prior ? 100 : 200, active_anchor_count: 2 }];
    if (sql.includes("before_divided_income")) return [{ d, v: prior ? 50 : 250 }];
    return [];
  });
});
describe("dashboard drawer query reuse", () => {
  it.each<DrawerMetric>([
    "flow",
    "live_flow",
    "total_fan_ticket",
    "active_anchor_count",
    "show_uv",
    "watch_uv",
    "install_or_activate",
    "new_anchor_count",
    "first_live_anchor_count",
  ])(
    "resolves project history once for %s while preserving both comparison periods and counts",
    async (metric) => {
      const response = await getDrawerDetail(
        { ...filters, metric },
        { kind: "broker_ids", ids: ["owned"] },
      );
      const queries = mock.execute.mock.calls.map(([query]) => dialect.sqlToQuery(query));
      const history = queries.filter((query) => query.sql.includes("product_activity AS"));
      expect(history).toHaveLength(1);
      expect(history[0]?.sql).toContain("'owned'");
      for (const query of queries.filter((query) => !query.sql.includes("product_activity AS"))) {
        expect(query.sql).toContain("jsonb_to_recordset");
        expect(query.params).toContain(JSON.stringify(attribution("own-account")));
      }
      expect(response.kpis.find((kpi) => kpi.key === "flow")).toMatchObject({
        value: 250,
        vs_prev: 400,
      });
      expect(response.kpis.find((kpi) => kpi.key === "total_fan_ticket")).toMatchObject({
        value: 200,
        vs_prev: 100,
      });
      expect(response.daily_rows.map((row) => row.date)).toEqual(["2026-09-01", "2026-09-02"]);
      expect(response.prev_daily_rows.map((row) => row.date)).toEqual(["2026-08-30", "2026-08-31"]);
      expect(response.kpis.find((kpi) => kpi.key === "video_flow")?.not_applicable).toBe(true);
      expect(response.total_anchors).toBe(
        metric === "new_anchor_count" || metric === "first_live_anchor_count" ? 1 : 3,
      );
    },
  );
  it("never shares attributed accounts between concurrent permission scopes", async () => {
    await Promise.all([
      getDrawerDetail(filters, { kind: "broker_ids", ids: ["owned"] }),
      getDrawerDetail(filters, { kind: "broker_ids", ids: ["foreign"] }),
    ]);
    const attributed = mock.execute.mock.calls
      .map(([query]) => dialect.sqlToQuery(query))
      .filter((query) => query.sql.includes("jsonb_to_recordset"));
    expect(attributed.length).toBeGreaterThan(0);
    expect(
      attributed.some((query) => query.params.includes(JSON.stringify(attribution("own-account")))),
    ).toBe(true);
    expect(
      attributed.some((query) =>
        query.params.includes(JSON.stringify(attribution("foreign-account"))),
      ),
    ).toBe(true);
    expect(
      attributed.every(
        (query) =>
          query.params.filter((p) => typeof p === "string" && p.includes('"anchor_id"')).length ===
          1,
      ),
    ).toBe(true);
  });
  it("does not query historical or business records for a rejected scope", async () => {
    expect(await getDrawerDetail(filters, { kind: "reject" })).toMatchObject({
      kpis: [],
      top_anchors: [],
      total_anchors: 0,
    });
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
