import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/db/client";
import { editing_task, live_account, dingtalk_user } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { listForBoard, buildEditingScopeWhere } from "@/modules/editing-task/server";

const ADMIN_ID = "test-admin-scope-001";
const OP1_ID = "test-op1-scope-001";
const OP2_ID = "test-op2-scope-001";
const EDITOR1_ID = "test-editor1-scope-001";
const ACCOUNT1_ID = "test-acc1-scope";
const ACCOUNT2_ID = "test-acc2-scope";

let task1Id: number;
let task2Id: number;

beforeAll(async () => {
  // 清现有测试数据
  await db
    .delete(editing_task)
    .where(inArray(editing_task.live_account_id, [ACCOUNT1_ID, ACCOUNT2_ID]));
  await db.delete(live_account).where(inArray(live_account.id, [ACCOUNT1_ID, ACCOUNT2_ID]));
  await db
    .delete(dingtalk_user)
    .where(inArray(dingtalk_user.user_id, [ADMIN_ID, OP1_ID, OP2_ID, EDITOR1_ID]));

  // 用户
  await db.insert(dingtalk_user).values([
    { user_id: ADMIN_ID, unionid: ADMIN_ID + "_u", name: "老板A", raw: {} },
    { user_id: OP1_ID, unionid: OP1_ID + "_u", name: "运营1", raw: {} },
    { user_id: OP2_ID, unionid: OP2_ID + "_u", name: "运营2", raw: {} },
    { user_id: EDITOR1_ID, unionid: EDITOR1_ID + "_u", name: "剪辑1", title: "剪辑", raw: {} },
  ]);

  // live_account: account1 由 op1 负责，account2 由 op2 负责
  await db.insert(live_account).values([
    {
      id: ACCOUNT1_ID,
      account_name: "scope-test-账号1",
      platform: "抖音",
      product: "捕鱼大作战",
      agent_dingtalk_user_id: OP1_ID,
    },
    {
      id: ACCOUNT2_ID,
      account_name: "scope-test-账号2",
      platform: "抖音",
      product: "途游斗地主",
      agent_dingtalk_user_id: OP2_ID,
    },
  ]);

  // task1 在 account1，由 op1 创建，派给 editor1
  const t1Rows = await db
    .insert(editing_task)
    .values({
      live_account_id: ACCOUNT1_ID,
      material_date: new Date("2026-05-25"),
      status: "editing",
      editor_user_id: EDITOR1_ID,
      created_by_user_id: OP1_ID,
    })
    .returning({ id: editing_task.id });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  task1Id = t1Rows[0]!.id;

  // task2 在 account2，由 op2 创建，未派单
  const t2Rows = await db
    .insert(editing_task)
    .values({
      live_account_id: ACCOUNT2_ID,
      material_date: new Date("2026-05-25"),
      status: "uploaded",
      created_by_user_id: OP2_ID,
    })
    .returning({ id: editing_task.id });
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  task2Id = t2Rows[0]!.id;
});

afterAll(async () => {
  await db.delete(editing_task).where(inArray(editing_task.id, [task1Id, task2Id]));
  await db.delete(live_account).where(inArray(live_account.id, [ACCOUNT1_ID, ACCOUNT2_ID]));
  await db
    .delete(dingtalk_user)
    .where(inArray(dingtalk_user.user_id, [ADMIN_ID, OP1_ID, OP2_ID, EDITOR1_ID]));
});

describe("editing scope visibility", () => {
  it("admin (scope=all) sees both tasks", async () => {
    const where = await buildEditingScopeWhere({ scope: "all", userId: ADMIN_ID });
    const cards = await listForBoard({
      whereClause: where,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(task1Id);
    expect(ids).toContain(task2Id);
  });

  it("op1 (scope=self) sees own account task + uploaded pool", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: OP1_ID });
    const cards = await listForBoard({
      whereClause: where,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(task1Id); // self: 创建人 + agent
    expect(ids).toContain(task2Id); // uploaded 公共池可见
  });

  it("editor1 (scope=self) sees assigned task + uploaded pool", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: EDITOR1_ID });
    const cards = await listForBoard({
      whereClause: where,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(task1Id); // self: editor
    expect(ids).toContain(task2Id); // uploaded 公共池
  });

  it("op2 (scope=self) sees uploaded pool (no editing task1)", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: OP2_ID });
    const cards = await listForBoard({
      whereClause: where,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(task2Id);
    expect(ids).not.toContain(task1Id); // task1=editing, op2 不命中 self
  });

  it("unknown user (scope=self) sees only uploaded pool", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: "nobody-xyz" });
    const cards = await listForBoard({
      whereClause: where,
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const ids = cards.map((c) => c.id);
    expect(ids).not.toContain(task1Id);
    expect(ids).toContain(task2Id); // uploaded 公共池：无关用户也能看到（让剪辑师领）
  });
});
