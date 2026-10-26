/**
 * Integration: 管理员补录 / 改时间不得制造同账号场次时段重叠
 *
 * 回归：2026-10 审计发现生产 726 对重叠场次（均来自 admin_insert / 改时间），
 * 导致投放分摊与时长统计重复计算。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client";
import { audit_log, dingtalk_user, live_account, live_session_log } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  insertManualSession,
  SessionOverlapError,
  updateSessionTime,
} from "@/modules/checkin/server";

const ACCOUNT_ID = "test-acc-session-overlap";
const ANCHOR_ID = "test-anchor-session-overlap";
const OPERATOR_ID = "test-op-session-overlap";

const t = (hhmmss: string) => new Date(`2026-09-01T${hhmmss}+08:00`);

async function insert(start: string, end: string): Promise<string> {
  const r = await insertManualSession({
    liveAccountId: ACCOUNT_ID,
    anchorDingtalkUserId: ANCHOR_ID,
    startAt: t(start),
    endAt: t(end),
    operatorDingtalkUserId: OPERATOR_ID,
    isEmergency: true,
  });
  return r.session_id;
}

async function clearSessions(): Promise<void> {
  const ids = (
    await db
      .select({ id: live_session_log.id })
      .from(live_session_log)
      .where(eq(live_session_log.live_account_id, ACCOUNT_ID))
  ).map((r) => r.id);
  if (ids.length > 0) await db.delete(audit_log).where(inArray(audit_log.target_id, ids));
  await db.delete(live_session_log).where(eq(live_session_log.live_account_id, ACCOUNT_ID));
}

beforeAll(async () => {
  await clearSessions();
  await db.delete(live_account).where(eq(live_account.id, ACCOUNT_ID));
  await db.delete(dingtalk_user).where(inArray(dingtalk_user.user_id, [ANCHOR_ID, OPERATOR_ID]));
  await db.insert(dingtalk_user).values([
    { user_id: ANCHOR_ID, unionid: `${ANCHOR_ID}_u`, name: "测试主播-重叠", raw: {} },
    { user_id: OPERATOR_ID, unionid: `${OPERATOR_ID}_u`, name: "测试管理员-重叠", raw: {} },
  ]);
  await db.insert(live_account).values({
    id: ACCOUNT_ID,
    account_name: "测试账号-重叠",
    platform: "快手",
    product: "测试产品",
    raw: {},
  });
});

afterAll(async () => {
  await clearSessions();
  await db.delete(live_account).where(eq(live_account.id, ACCOUNT_ID));
  await db.delete(dingtalk_user).where(inArray(dingtalk_user.user_id, [ANCHOR_ID, OPERATOR_ID]));
});

beforeEach(clearSessions);

describe("manual session insert", () => {
  it("rejects a session overlapping an ended one, reporting the conflict", async () => {
    await insert("10:00:00", "12:00:00");
    const err = await insert("11:00:00", "13:00:00").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SessionOverlapError);
    expect((err as SessionOverlapError).conflict.anchorName).toBe("测试主播-重叠");
  });

  it("rejects a session fully containing an existing one", async () => {
    await insert("10:00:00", "11:00:00");
    await expect(insert("09:00:00", "12:00:00")).rejects.toBeInstanceOf(SessionOverlapError);
  });

  it("allows back-to-back sessions and sub-minute boundary overlap", async () => {
    await insert("10:00:00", "12:00:00");
    await expect(insert("12:00:00", "13:00:00")).resolves.toBeTruthy();
    await expect(insert("12:59:30", "14:00:00")).resolves.toBeTruthy(); // 30s 在容差内
  });

  it("rejects overlapping an in-progress session", async () => {
    await db.insert(live_session_log).values({
      live_account_id: ACCOUNT_ID,
      anchor_dingtalk_user_id: ANCHOR_ID,
      start_at: t("10:00:00"),
      status: "in_progress",
      raw: {},
    });
    await expect(insert("11:00:00", "12:00:00")).rejects.toBeInstanceOf(SessionOverlapError);
    await expect(insert("08:00:00", "10:00:00")).resolves.toBeTruthy();
  });
});

describe("session time edit", () => {
  const edit = (sessionId: string, start: string, end: string | null) =>
    updateSessionTime({
      sessionId,
      newStartAt: t(start),
      newEndAt: end ? t(end) : null,
      operatorDingtalkUserId: OPERATOR_ID,
      isEmergency: true,
    });

  it("rejects stretching a session over its neighbour", async () => {
    const a = await insert("10:00:00", "12:00:00");
    await insert("12:00:00", "14:00:00");
    await expect(edit(a, "10:00:00", "13:00:00")).rejects.toBeInstanceOf(SessionOverlapError);
  });

  it("allows editing a session within its own range (excludes itself)", async () => {
    const a = await insert("10:00:00", "12:00:00");
    await insert("12:00:00", "14:00:00");
    await expect(edit(a, "10:30:00", "11:50:00")).resolves.toBeTruthy();
  });

  it("rejects reopening a session as in-progress when later sessions exist", async () => {
    const a = await insert("10:00:00", "12:00:00");
    await insert("13:00:00", "14:00:00");
    await expect(edit(a, "10:00:00", null)).rejects.toBeInstanceOf(SessionOverlapError);
  });
});
