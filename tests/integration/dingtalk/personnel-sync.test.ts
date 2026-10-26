import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Db } from "@/db/client";
import { businessDate } from "@/lib/business-date";

const m = vi.hoisted(() => ({
  database: null as Db | null,
  users: vi.fn(),
  depts: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  broker: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  db: new Proxy(
    {},
    {
      get(_target, property) {
        if (!m.database) throw new Error("Test database is not initialized");
        const value = Reflect.get(m.database, property);
        return typeof value === "function" ? value.bind(m.database) : value;
      },
    },
  ),
}));
vi.mock("@/lib/dingtalk", () => ({ fetchAllDepartments: m.depts, fetchAllUsers: m.users }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: m.audit }));
vi.mock("@/lib/notify", () => ({ notifyError: m.notify }));
vi.mock("@/modules/brokers/server", () => ({ syncBrokerMappings: m.broker }));
import { syncDingtalk } from "@/worker/jobs/sync-dingtalk";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for temporary-table tests");
const client = postgres(databaseUrl, { max: 1, prepare: false });
const ids = ["baseline-a", "baseline-b", "baseline-c", "baseline-d", "baseline-e"];
const users = (list = ids) => list.map((userid) => ({ userid, name: userid, dept_id_list: [1] }));
let clock: ReturnType<typeof vi.spyOn>;
beforeAll(async () => {
  // This connection's temporary table shadows the real table. No business personnel are modified.
  await client`CREATE TEMP TABLE dingtalk_user (LIKE public.dingtalk_user INCLUDING ALL)`;
  m.database = drizzle(client);
});
beforeEach(async () => {
  vi.clearAllMocks();
  await client`TRUNCATE pg_temp.dingtalk_user`;
  for (const id of [...ids, "external"])
    await client`INSERT INTO pg_temp.dingtalk_user (user_id, unionid, name, dept_ids, active, raw, is_external) VALUES (${id}, ${id}, ${id}, '["1"]', true, '{}', ${id === "external"})`;
  m.depts.mockResolvedValue([]);
  m.users.mockResolvedValue(users());
  m.broker.mockResolvedValue({ matched: 0, pending: 0 });
  clock?.mockRestore();
  clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-05T01:00:00Z"));
});
afterAll(async () => {
  clock?.mockRestore();
  await client.end();
});

describe("personnel synchronization lifecycle dates", () => {
  it("records only a new person's first import, preserves it on refresh, and uses Beijing calendar dates", async () => {
    clock.mockReturnValue(Date.parse("2026-09-30T16:05:00Z"));
    m.users.mockResolvedValue(users([...ids, "new-person"]));
    await syncDingtalk();
    const [first] =
      await client`SELECT first_synced_at FROM pg_temp.dingtalk_user WHERE user_id='new-person'`;
    expect(businessDate(new Date(first?.first_synced_at))).toBe("2026-10-01");
    clock.mockReturnValue(Date.parse("2026-10-15T01:00:00Z"));
    await syncDingtalk();
    const [again] =
      await client`SELECT first_synced_at FROM pg_temp.dingtalk_user WHERE user_id='new-person'`;
    expect(new Date(again?.first_synced_at).toISOString()).toBe(
      new Date(first?.first_synced_at).toISOString(),
    );
    const baseline =
      await client`SELECT first_synced_at FROM pg_temp.dingtalk_user WHERE user_id LIKE 'baseline-%'`;
    expect(baseline.every((row) => row.first_synced_at === null)).toBe(true);
  });
  it("records a departure once, excludes external users, and preserves the departure after returning", async () => {
    m.users.mockResolvedValue(users(ids.slice(1)));
    await syncDingtalk();
    const [left] =
      await client`SELECT active,last_inactive_at FROM pg_temp.dingtalk_user WHERE user_id='baseline-a'`;
    expect(left?.active).toBe(false);
    expect(new Date(left?.last_inactive_at).toISOString()).toBe("2026-10-05T01:00:00.000Z");
    clock.mockReturnValue(Date.parse("2026-10-06T01:00:00Z"));
    await syncDingtalk();
    const [stillLeft] =
      await client`SELECT last_inactive_at FROM pg_temp.dingtalk_user WHERE user_id='baseline-a'`;
    expect(new Date(stillLeft?.last_inactive_at).toISOString()).toBe(
      new Date(left?.last_inactive_at).toISOString(),
    );
    m.users.mockResolvedValue(users());
    await syncDingtalk();
    const [returned] =
      await client`SELECT active,first_synced_at,last_inactive_at FROM pg_temp.dingtalk_user WHERE user_id='baseline-a'`;
    expect(returned?.active).toBe(true);
    expect(returned?.first_synced_at).toBeNull();
    expect(new Date(returned?.last_inactive_at).toISOString()).toBe(
      new Date(left?.last_inactive_at).toISOString(),
    );
    const [external] =
      await client`SELECT active,last_inactive_at FROM pg_temp.dingtalk_user WHERE user_id='external'`;
    expect(external).toMatchObject({ active: true, last_inactive_at: null });
  });
  it("does not record departures for empty or below-floor synchronization results", async () => {
    m.users.mockResolvedValue(users(ids.slice(0, 1)));
    await syncDingtalk();
    expect(m.notify).toHaveBeenCalledOnce();
    m.users.mockResolvedValue([]);
    await syncDingtalk();
    const rows = await client`SELECT active,last_inactive_at FROM pg_temp.dingtalk_user`;
    expect(rows.every((row) => row.active && row.last_inactive_at === null)).toBe(true);
  });
});
