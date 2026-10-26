/**
 * Integration: 直播账号「删除」下线，改为「废弃归档」
 *
 * 回归：删除账号曾物理删除剪辑任务 / 开播记录 / 排班（2026-07-14 事故同模式）。
 * 现在只能标记废弃（可恢复），历史数据保留；数据库外键 RESTRICT 兜底。
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const permPoints = vi.hoisted(() => ({
  current: new Set<string>(["account_edit", "delete_request"]),
}));

vi.mock("@/lib/auth/page-auth", () => ({
  requireUser: vi.fn().mockResolvedValue({ userId: "test-op-deprecate" }),
  getCurrentDingtalkUser: vi.fn().mockResolvedValue({
    kind: "ok",
    dingtalkUserId: "test-op-deprecate",
    isEmergency: false,
  }),
}));

vi.mock("@/modules/permissions/server", async () => {
  const actual = await vi.importActual<typeof import("@/modules/permissions/server")>(
    "@/modules/permissions/server",
  );
  return {
    ...actual,
    resolvePermission: vi.fn().mockImplementation(() =>
      Promise.resolve({
        scope: "all",
        points: permPoints.current,
        delegatedUserIds: null,
        sources: [],
      }),
    ),
  };
});

import { db } from "@/db/client";
import {
  audit_log,
  dingtalk_user,
  editing_task,
  live_account,
  live_session_log,
} from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { deprecateAccount, restoreAccount } from "@/modules/live-account";
import { startSession } from "@/modules/checkin/server";
import { createTask } from "@/modules/editing-task";

const ACCOUNT_ID = "test-acc-deprecate";
const OPERATOR_ID = "test-op-deprecate";

async function cleanup(): Promise<void> {
  await db.delete(audit_log).where(eq(audit_log.target_id, ACCOUNT_ID));
  await db.delete(live_session_log).where(eq(live_session_log.live_account_id, ACCOUNT_ID));
  await db.delete(editing_task).where(eq(editing_task.live_account_id, ACCOUNT_ID));
  await db.delete(live_account).where(eq(live_account.id, ACCOUNT_ID));
  await db.delete(dingtalk_user).where(inArray(dingtalk_user.user_id, [OPERATOR_ID]));
}

async function getAccount() {
  const [row] = await db.select().from(live_account).where(eq(live_account.id, ACCOUNT_ID));
  return row;
}

beforeEach(async () => {
  permPoints.current = new Set(["account_edit", "delete_request"]);
  await cleanup();
  await db
    .insert(dingtalk_user)
    .values({ user_id: OPERATOR_ID, unionid: `${OPERATOR_ID}_u`, name: "测试运营-废弃", raw: {} });
  await db.insert(live_account).values({
    id: ACCOUNT_ID,
    account_name: "测试账号-废弃",
    platform: "抖音",
    product: "捕鱼大作战",
    raw: {},
  });
  await db.insert(live_session_log).values({
    live_account_id: ACCOUNT_ID,
    anchor_dingtalk_user_id: OPERATOR_ID,
    start_at: new Date("2026-09-01T02:00:00Z"),
    end_at: new Date("2026-09-01T04:00:00Z"),
    duration_seconds: 7200,
    status: "ended",
    raw: {},
  });
});

afterAll(cleanup);

describe("deprecate / restore live account", () => {
  it("deprecates without touching history, then restores", async () => {
    expect(await deprecateAccount({ id: ACCOUNT_ID, reason: "账号被封" })).toEqual({ ok: true });
    const deprecated = await getAccount();
    expect(deprecated?.deprecated_at).toBeInstanceOf(Date);
    expect(deprecated?.deprecated_by_user_id).toBe(OPERATOR_ID);

    const sessions = await db
      .select()
      .from(live_session_log)
      .where(eq(live_session_log.live_account_id, ACCOUNT_ID));
    expect(sessions).toHaveLength(1);

    expect(await restoreAccount({ id: ACCOUNT_ID })).toEqual({ ok: true });
    expect((await getAccount())?.deprecated_at).toBeNull();

    const audits = await db
      .select({ action: audit_log.action })
      .from(audit_log)
      .where(and(eq(audit_log.target_id, ACCOUNT_ID), eq(audit_log.target_type, "live_account")));
    expect(audits.map((a) => a.action).sort()).toEqual([
      "LIVE_ACCOUNT_DEPRECATED",
      "LIVE_ACCOUNT_RESTORED",
    ]);
  });

  it("rejects double deprecation and restoring an active account", async () => {
    await deprecateAccount({ id: ACCOUNT_ID });
    expect(await deprecateAccount({ id: ACCOUNT_ID })).toMatchObject({ ok: false });
    await restoreAccount({ id: ACCOUNT_ID });
    expect(await restoreAccount({ id: ACCOUNT_ID })).toMatchObject({ ok: false });
  });

  it("requires the delete_request (废弃 / 恢复账号) point", async () => {
    permPoints.current = new Set(["account_edit"]);
    expect(await deprecateAccount({ id: ACCOUNT_ID })).toMatchObject({ ok: false });
    expect((await getAccount())?.deprecated_at).toBeNull();
  });

  it("database refuses hard-deleting an account that still has session history", async () => {
    await expect(db.delete(live_account).where(eq(live_account.id, ACCOUNT_ID))).rejects.toThrow();
    expect(await getAccount()).toBeTruthy();
  });

  it("refuses to deprecate while the account is live", async () => {
    await db.insert(live_session_log).values({
      live_account_id: ACCOUNT_ID,
      anchor_dingtalk_user_id: OPERATOR_ID,
      start_at: new Date(),
      status: "in_progress",
      raw: {},
    });
    expect(await deprecateAccount({ id: ACCOUNT_ID })).toMatchObject({
      ok: false,
      error: "该账号正在开播，请先下播再废弃",
    });
  });

  it("deprecated account cannot start a live session or get new editing tasks", async () => {
    await deprecateAccount({ id: ACCOUNT_ID });
    await expect(startSession(ACCOUNT_ID, OPERATOR_ID)).rejects.toThrow("ACCOUNT_DEPRECATED");

    permPoints.current = new Set(["account_edit", "delete_request", "task_create"]);
    await expect(
      createTask({ liveAccountId: ACCOUNT_ID, materialDate: "2026-09-01" }),
    ).rejects.toThrow("该账号已废弃");
  });
});
