import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { db } from "@/db/client";
import { dingtalk_user, editing_task, live_account } from "@/db/schema";
import { sql, eq } from "drizzle-orm";
import { AppError } from "@/lib/errors";
import {
  cancelDeleteRequest,
  countDeleteImpact,
  createDeleteRequest,
  findPendingRequest,
  reviewDeleteRequest,
} from "@/modules/live-account/delete-request";

const ACC_ID = "test-delreq-account";

async function anyUserId(): Promise<string | null> {
  const [u] = await db.select({ id: dingtalk_user.user_id }).from(dingtalk_user).limit(1);
  return u?.id ?? null;
}

async function cleanup() {
  await db.execute(sql`DELETE FROM live_account_delete_request WHERE account_id = ${ACC_ID}`);
  await db.execute(sql`DELETE FROM editing_task WHERE live_account_id = ${ACC_ID}`);
  await db.execute(sql`DELETE FROM live_account WHERE id = ${ACC_ID}`);
}

async function seedAccount(userId: string, taskCount = 2) {
  await db.insert(live_account).values({
    id: ACC_ID,
    account_name: "测试-删除审核",
    platform: "抖音",
    product: "三国冰河时代",
    live_status: "unknown",
  });
  for (let i = 0; i < taskCount; i++) {
    await db.insert(editing_task).values({
      live_account_id: ACC_ID,
      material_date: new Date("2026-07-01"),
      status: "uploaded",
      created_by_user_id: userId,
    });
  }
}

beforeEach(cleanup);
afterAll(cleanup);

describe("直播账号删除审核流", () => {
  it("countDeleteImpact 统计连带数据", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId, 3);

    const impact = await countDeleteImpact(ACC_ID);
    expect(impact.editing_tasks).toBe(3);
    expect(impact.live_sessions).toBe(0);
    expect(impact.placement_rows).toBe(0);
  });

  it("创建申请→pending；同账号重复申请被拒", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId);

    const row = await createDeleteRequest({
      accountId: ACC_ID,
      reason: "换直播间",
      requestedBy: userId,
    });
    expect(row.status).toBe("pending");
    expect(row.account_name).toBe("测试-删除审核");
    expect(row.impact.editing_tasks).toBe(2);

    const pending = await findPendingRequest(ACC_ID);
    expect(pending?.id).toBe(row.id);

    await expect(
      createDeleteRequest({ accountId: ACC_ID, reason: null, requestedBy: userId }),
    ).rejects.toThrowError(AppError);
  });

  it("驳回：申请转 rejected，账号保留", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId);
    const row = await createDeleteRequest({ accountId: ACC_ID, reason: null, requestedBy: userId });

    const res = await reviewDeleteRequest({
      requestId: row.id,
      approve: false,
      note: "先不删",
      reviewedBy: userId,
    });
    expect(res.executed).toBe(false);
    expect(res.request.status).toBe("rejected");

    const [acc] = await db.select().from(live_account).where(eq(live_account.id, ACC_ID));
    expect(acc).toBeDefined();
    // 已处理的申请不能再审
    await expect(
      reviewDeleteRequest({ requestId: row.id, approve: true, note: null, reviewedBy: userId }),
    ).rejects.toThrowError(AppError);
  });

  it("批准：账号与剪辑任务被删除，申请转 approved", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId);
    const row = await createDeleteRequest({ accountId: ACC_ID, reason: null, requestedBy: userId });

    const res = await reviewDeleteRequest({
      requestId: row.id,
      approve: true,
      note: null,
      reviewedBy: userId,
    });
    expect(res.executed).toBe(true);
    expect(res.accountMissing).toBe(false);
    expect(res.request.status).toBe("approved");

    const [acc] = await db.select().from(live_account).where(eq(live_account.id, ACC_ID));
    expect(acc).toBeUndefined();
    const tasks = await db
      .select()
      .from(editing_task)
      .where(eq(editing_task.live_account_id, ACC_ID));
    expect(tasks.length).toBe(0);
  });

  it("批准时账号已不存在：申请转 cancelled，不报错", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId, 0);
    const row = await createDeleteRequest({ accountId: ACC_ID, reason: null, requestedBy: userId });
    await db.execute(sql`DELETE FROM live_account WHERE id = ${ACC_ID}`);

    const res = await reviewDeleteRequest({
      requestId: row.id,
      approve: true,
      note: null,
      reviewedBy: userId,
    });
    expect(res.executed).toBe(false);
    expect(res.accountMissing).toBe(true);
    expect(res.request.status).toBe("cancelled");
  });

  it("撤销：非本人非管理员被拒；本人可撤销", async () => {
    const userId = await anyUserId();
    if (!userId) return;
    await seedAccount(userId);
    const row = await createDeleteRequest({ accountId: ACC_ID, reason: null, requestedBy: userId });

    await expect(
      cancelDeleteRequest({ requestId: row.id, userId: "someone-else", isAdmin: false }),
    ).rejects.toThrowError(AppError);

    const cancelled = await cancelDeleteRequest({ requestId: row.id, userId, isAdmin: false });
    expect(cancelled.status).toBe("cancelled");
    expect(await findPendingRequest(ACC_ID)).toBeNull();
  });
});
