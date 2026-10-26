import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Db } from "@/db/client";

const state = vi.hoisted(() => ({ database: null as Db | null, attributionScans: 0 }));
vi.mock("@/db/client", () => ({
  db: {
    execute: (...args: unknown[]) => {
      if (!state.database) throw new Error("Test database not initialized");
      if (new PgDialect().sqlToQuery(args[0] as SQL).sql.includes("product_activity AS"))
        state.attributionScans++;
      return Reflect.apply(state.database.execute, state.database, args);
    },
  },
}));
import {
  queryWorkbenchRanking,
  getDashboardOverview,
  getSection2Breakdown,
  getDrawerDetail,
} from "@/modules/dashboard/queries";
import type { DashboardScope } from "@/modules/dashboard/scope";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for temporary-table tests");
const client = postgres(url, { max: 1, prepare: false });
const interval = { date_from: "2026-09-01", date_to: "2026-09-02" };
beforeAll(async () => {
  // All queries use connection-local temporary tables, leaving actual business data untouched.
  for (const table of [
    "anchor_profile",
    "dingtalk_user",
    "entity_alias",
    "anchor_daily",
    "anchor_portrait_daily",
    "anchor_game_promo_daily",
    "anchor_minigame_daily",
  ])
    await client.unsafe(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  state.database = drizzle(client);
  for (const [id, three, recruit, broker, archived] of [
    ["ddz", false, "other", "owned", false],
    ["three", true, "三国项目", "owned", false],
    ["zhaohua", true, "造化仙府", "owned", false],
    ["foreign", false, "other", "foreign", false],
    ["archived", false, "other", "owned", true],
  ] as const)
    await client`INSERT INTO pg_temp.anchor_profile (anchor_id,nick_name,broker_id,broker_name,recruit_broker_name,is_threekingdoms,is_archived,raw) VALUES (${id},${id},${broker},'same-name',${recruit},${three},${archived},'{}')`;
  // Deliberate duplicate operator names must not multiply facts.
  for (const id of ["operator-a", "operator-b"])
    await client`INSERT INTO pg_temp.dingtalk_user (user_id,unionid,name,raw) VALUES (${id},${id},'same-name','{}')`;
  for (const id of ["ddz", "foreign", "archived"]) {
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_anchor_active_pay_amount_1d,promote_faction_active_pay_amount_1d,promote_download_pay_amount_1d,raw) VALUES (${id},'2026-09-01','live','cps_all','途游斗地主（比赛版）',40,20,10,'{}')`;
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_anchor_active_pay_amount_1d,raw) VALUES (${id},'2026-09-01','video','cps_all','途游斗地主（比赛版）',99999,'{}')`;
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_anchor_active_pay_amount_1d,raw) VALUES (${id},'2026-09-01','live','cps','途游斗地主（比赛版）',99999,'{}')`;
    await client`INSERT INTO pg_temp.anchor_game_promo_daily (anchor_id,date,promote_scene,biz_mode,game_name,promote_anchor_active_pay_amount_1d,raw) VALUES (${id},'2026-09-02','live','cps_all','途游斗地主（比赛版）',40,'{}')`;
  }
  for (const [id, amount] of [
    ["three", 100],
    ["zhaohua", 200],
  ] as const) {
    await client`INSERT INTO pg_temp.anchor_minigame_daily (anchor_id,date,scene,mp_name,before_divided_income,raw) VALUES (${id},'2026-09-01','live','game',${amount},'{}')`;
    await client`INSERT INTO pg_temp.anchor_minigame_daily (anchor_id,date,scene,mp_name,before_divided_income,raw) VALUES (${id},'2026-09-01','video','game',99999,'{}')`;
  }
  for (const [date, hours, acu, uv] of [
    ["2026-09-01", 8, 100, 20],
    ["2026-09-02", 4, 80, 30],
  ] as const) {
    await client`INSERT INTO pg_temp.anchor_daily (anchor_id,date,live_duration_1d,feed_acu,raw) VALUES ('ddz',${date},${hours},${acu},'{}')`;
    await client`INSERT INTO pg_temp.anchor_portrait_daily (anchor_id,date,watch_uv,raw) VALUES ('ddz',${date},${uv},'{}')`;
  }
});
afterAll(async () => {
  await client.end();
});

describe("live ranking PostgreSQL aggregation", () => {
  it("excludes video and cps duplicates, honors broker scope, and does not multiply same-name operators", async () => {
    const result = await queryWorkbenchRanking(
      { ...interval, project: "ddz", metric: "flow" },
      { kind: "broker_ids", ids: ["owned"] },
    );
    expect(result.rows.map((row) => [row.id, row.value])).toEqual([["ddz", 260]]);
    expect(result.total).toBe(1);
    expect(result.latestDate).toBe("2026-09-02");
  });
  it("isolates products and only includes live minigame income", async () => {
    for (const [project, amount] of [
      ["three", 100],
      ["zhaohua", 200],
    ] as const) {
      const result = await queryWorkbenchRanking(
        { ...interval, project, metric: "flow" },
        { kind: "all" },
      );
      expect(result.rows.map((row) => [row.id, row.value])).toEqual([[project, amount]]);
    }
  });
  it("sums duration and daily UV but takes maximum daily ACU", async () => {
    for (const [metric, value] of [
      ["duration", 12],
      ["acu", 100],
      ["uv", 50],
    ] as const) {
      const result = await queryWorkbenchRanking(
        { ...interval, project: "ddz", metric },
        { kind: "all" },
      );
      expect(result.rows.map((row) => [row.id, row.value])).toEqual([["ddz", value]]);
    }
  });
  it("reports the last available date without substituting older results into an empty period", async () => {
    const result = await queryWorkbenchRanking(
      { date_from: "2026-10-01", date_to: "2026-10-15", project: "ddz", metric: "flow" },
      { kind: "all" },
    );
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.latestDate).toBe("2026-09-02");
    expect(
      (
        await queryWorkbenchRanking(
          { ...interval, project: "ddz", metric: "flow" },
          { kind: "reject" },
        )
      ).rows,
    ).toEqual([]);
  });
});

describe("dashboard attribution reuse", () => {
  it("reuses request-scoped attribution throughout drawer matrices, list and count queries", async () => {
    for (const metric of [
      "flow",
      "total_fan_ticket",
      "active_anchor_count",
      "show_uv",
      "new_anchor_count",
      "first_live_anchor_count",
    ] as const) {
      state.attributionScans = 0;
      const result = await getDrawerDetail(
        { ...interval, project: "three", metric },
        { kind: "broker_ids", ids: ["owned"] },
      );
      expect(state.attributionScans).toBe(1);
      expect(result.kpis.find((item) => item.key === "flow")?.value).toBe(200198);
      expect(result.kpis.find((item) => item.key === "video_flow")?.not_applicable).toBe(true);
      expect(result.prev_daily_rows.every((row) => row.values.flow === 0)).toBe(true);
      if (metric === "flow") {
        expect(result.top_anchors.map((row) => [row.anchor_id, row.metric_value])).toEqual([
          ["three", 200198],
        ]);
        expect(result.total_anchors).toBe(1);
      }
    }
    const [owned, foreign] = await Promise.all([
      getDrawerDetail(
        { ...interval, project: "three", metric: "flow" },
        { kind: "broker_ids", ids: ["owned"] },
      ),
      getDrawerDetail(
        { ...interval, project: "three", metric: "flow" },
        { kind: "broker_ids", ids: ["foreign"] },
      ),
    ]);
    expect(owned.kpis.find((item) => item.key === "flow")?.value).toBe(200198);
    expect(foreign.kpis.find((item) => item.key === "flow")?.value).toBe(0);
    expect(foreign.top_anchors).toEqual([]);
    state.attributionScans = 0;
    expect((await getDrawerDetail(interval, { kind: "reject" })).kpis).toEqual([]);
    expect(state.attributionScans).toBe(0);
  });
  it("matches all ten independent metric queries and scans history only once per request", async () => {
    const metrics = [
      "total_fan_ticket",
      "flow",
      "active_anchor_count",
      "new_anchor_count",
      "first_live_anchor_count",
      "live_flow",
      "video_flow",
      "install_or_activate",
      "show_uv",
      "watch_uv",
    ] as const;
    for (const scope of [
      { kind: "all" },
      { kind: "broker_ids", ids: ["owned"] },
    ] as DashboardScope[]) {
      const expected = await Promise.all(
        metrics.map(async (metric) => ({
          metric,
          ...(await getSection2Breakdown(metric, interval.date_from, interval.date_to, scope)),
        })),
      );
      state.attributionScans = 0;
      const actual = await getDashboardOverview(interval.date_from, interval.date_to, scope);
      expect(actual.breakdown).toEqual(expected);
      expect(state.attributionScans).toBe(1);
    }
  });

  it("keeps attribution isolated between concurrent broker scopes and rejects without querying", async () => {
    const [owned, foreign] = await Promise.all([
      getDashboardOverview(interval.date_from, interval.date_to, {
        kind: "broker_ids",
        ids: ["owned"],
      }),
      getDashboardOverview(interval.date_from, interval.date_to, {
        kind: "broker_ids",
        ids: ["foreign"],
      }),
    ]);
    expect(owned.breakdown.find((row) => row.metric === "flow")?.three.total.value).toBeGreaterThan(
      0,
    );
    expect(foreign.breakdown.find((row) => row.metric === "flow")?.three.total.value).toBe(0);
    state.attributionScans = 0;
    const rejected = await getDashboardOverview(interval.date_from, interval.date_to, {
      kind: "reject",
    });
    expect(rejected.core.flow.current).toBe(0);
    expect(state.attributionScans).toBe(0);
  });
});
