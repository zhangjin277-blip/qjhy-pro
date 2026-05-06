import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { schedule_override } from "@/db/schema/schedule-override";
import { live_account } from "@/db/schema/live-account";
import { live_anchor } from "@/db/schema/live-anchor";
import { isNotNull, sql } from "drizzle-orm";
import { runAttributionJob } from "@/modules/placement-attribution/job";

const TEST_DATE = "2026-05-06";
const TEST_DATASET = "test_attribution_job";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM schedule_override`);
  // 清掉所有 id 以 'test-' 开头的测试专用 account_anchor_default
  await db.execute(sql`DELETE FROM account_anchor_default WHERE id LIKE 'test-%'`);
});

/** 清指定账号下的所有 account_anchor_default（避免真实数据干扰测试） */
async function cleanDefaultsForAccount(account_id: string) {
  await db.execute(sql`DELETE FROM account_anchor_default WHERE account_id = ${account_id}`);
}

describe("runAttributionJob", () => {
  it("dirty=true 行被处理 → default 命中 → attributed_user / source='default' / dirty=false", async () => {
    // 取一个有 placement_label 的账号
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc) return; // 无 seed 数据，跳过

    // 取一个真实 live_anchor
    const anchors = await db
      .select({ id: live_anchor.dingtalk_user_id })
      .from(live_anchor)
      .limit(1);
    const anchor = anchors.at(0);
    if (!anchor) return;

    const anchorId = anchor.id;

    // 清掉真实数据以免干扰（beforeEach 只清 test- 前缀的）
    await cleanDefaultsForAccount(acc.id);

    // 插入一条过去生效的 default 排班（覆盖测试 date 整天）
    await db.insert(account_anchor_default).values({
      id: "test-default-001",
      account_id: acc.id,
      dingtalk_user_id: anchorId,
      time_slots: [["00:00", "23:59"]],
      rest_days: [],
      effective_from: "2025-01-01",
      effective_to: null,
    });

    // 插入一条 dirty=true 的 placement_row
    await db.insert(placement_row).values({
      date: TEST_DATE,
      hour: 12,
      dataset_id: TEST_DATASET,
      live_account_id: acc.id,
      cost_yuan: "100",
      activations: 5,
      payment_yuan: "20",
      start_download: 0,
      finish_download: 0,
      attribution_dirty: true,
      raw: { mock: true },
    });

    const result = await runAttributionJob();
    expect(result.processed).toBe(1);

    const rows = await db.select().from(placement_row);
    const row = rows.at(0);
    expect(row?.attribution_dirty).toBe(false);
    expect(row?.attribution_source).toBe("default");
    expect(row?.attributed_dingtalk_user_id).toBe(anchorId);
    expect(row?.attribution_computed_at).not.toBeNull();
  });

  it("override 替代 default → source='override'", async () => {
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc) return;

    const anchors = await db
      .select({ id: live_anchor.dingtalk_user_id })
      .from(live_anchor)
      .limit(1);
    const anchor = anchors.at(0);
    if (!anchor) return;

    const anchorId = anchor.id;

    // 清掉真实数据以免干扰
    await cleanDefaultsForAccount(acc.id);

    // default 排班时段 09:00–13:00（不覆盖 hour=20）
    await db.insert(account_anchor_default).values({
      id: "test-default-002",
      account_id: acc.id,
      dingtalk_user_id: anchorId,
      time_slots: [["09:00", "13:00"]],
      rest_days: [],
      effective_from: "2025-01-01",
      effective_to: null,
    });

    // override 改为 17:00–22:00（覆盖 hour=20）
    await db.insert(schedule_override).values({
      account_id: acc.id,
      date: TEST_DATE,
      dingtalk_user_id: anchorId,
      time_slots: [["17:00", "22:00"]],
    });

    await db.insert(placement_row).values({
      date: TEST_DATE,
      hour: 20,
      dataset_id: TEST_DATASET,
      live_account_id: acc.id,
      cost_yuan: "100",
      activations: 5,
      payment_yuan: "20",
      start_download: 0,
      finish_download: 0,
      attribution_dirty: true,
      raw: {},
    });

    const result = await runAttributionJob();
    expect(result.processed).toBe(1);

    const rows = await db.select().from(placement_row);
    const row = rows.at(0);
    expect(row?.attribution_dirty).toBe(false);
    expect(row?.attribution_source).toBe("override");
    expect(row?.attributed_dingtalk_user_id).toBe(anchorId);
  });

  it("多 default 时段重叠 → conflict", async () => {
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc) return;

    // 取两个真实 live_anchor
    const anchors = await db
      .select({ id: live_anchor.dingtalk_user_id })
      .from(live_anchor)
      .limit(2);
    if (anchors.length < 2) return;

    const anchorId1 = anchors[0]?.id;
    const anchorId2 = anchors[1]?.id;
    if (!anchorId1 || !anchorId2) return;

    // 清掉真实数据以免干扰
    await cleanDefaultsForAccount(acc.id);

    // 两个 anchor 同时段排班 → conflict
    await db.insert(account_anchor_default).values([
      {
        id: "test-default-003a",
        account_id: acc.id,
        dingtalk_user_id: anchorId1,
        time_slots: [["14:00", "18:00"]],
        rest_days: [],
        effective_from: "2025-01-01",
        effective_to: null,
      },
      {
        id: "test-default-003b",
        account_id: acc.id,
        dingtalk_user_id: anchorId2,
        time_slots: [["14:00", "18:00"]],
        rest_days: [],
        effective_from: "2025-01-01",
        effective_to: null,
      },
    ]);

    await db.insert(placement_row).values({
      date: TEST_DATE,
      hour: 15,
      dataset_id: TEST_DATASET,
      live_account_id: acc.id,
      cost_yuan: "100",
      activations: 5,
      payment_yuan: "20",
      start_download: 0,
      finish_download: 0,
      attribution_dirty: true,
      raw: {},
    });

    const result = await runAttributionJob();
    expect(result.processed).toBe(1);

    const rows = await db.select().from(placement_row);
    const row = rows.at(0);
    expect(row?.attribution_dirty).toBe(false);
    expect(row?.attribution_source).toBe("conflict");
    expect(row?.attributed_dingtalk_user_id).toBeNull();
  });

  it("max_rows=1 — 超出 limit 的行不被处理", async () => {
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc) return;

    // 插入 3 条 dirty 行（不同 hour）
    await db.insert(placement_row).values([
      {
        date: TEST_DATE,
        hour: 10,
        dataset_id: TEST_DATASET,
        live_account_id: acc.id,
        cost_yuan: "100",
        activations: 1,
        payment_yuan: "10",
        start_download: 0,
        finish_download: 0,
        attribution_dirty: true,
        raw: {},
      },
      {
        date: TEST_DATE,
        hour: 11,
        dataset_id: TEST_DATASET,
        live_account_id: acc.id,
        cost_yuan: "200",
        activations: 2,
        payment_yuan: "20",
        start_download: 0,
        finish_download: 0,
        attribution_dirty: true,
        raw: {},
      },
      {
        date: TEST_DATE,
        hour: 12,
        dataset_id: TEST_DATASET,
        live_account_id: acc.id,
        cost_yuan: "300",
        activations: 3,
        payment_yuan: "30",
        start_download: 0,
        finish_download: 0,
        attribution_dirty: true,
        raw: {},
      },
    ]);

    // max_rows=1 → 只处理 1 行
    const result = await runAttributionJob({ max_rows: 1 });
    expect(result.processed).toBe(1);

    // 还剩 2 条 dirty
    const allRows = await db.select().from(placement_row);
    const dirtyCount = allRows.filter((r) => r.attribution_dirty).length;
    expect(dirtyCount).toBe(2);
  });
});
