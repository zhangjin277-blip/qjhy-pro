import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { live_account } from "@/db/schema/live-account";
import { live_anchor } from "@/db/schema/live-anchor";
import { schedule_override } from "@/db/schema/schedule-override";
import { sql, eq, isNotNull } from "drizzle-orm";
import { ingestRows } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM schedule_override`);
});

describe("override 编辑 → 归因结果变化", () => {
  it("ingest → job → default / 加 override → job → override 替代", async () => {
    // 取一个有 placement_label 的账号
    const acc = (
      await db.select().from(live_account).where(isNotNull(live_account.placement_label)).limit(1)
    )[0];
    if (!acc?.placement_label) return; // skip 如果没数据

    // 取两个真实 live_anchor.dingtalk_user_id
    const anchors = await db
      .select({ id: live_anchor.dingtalk_user_id })
      .from(live_anchor)
      .limit(2);
    if (anchors.length < 2) return;
    const u1 = anchors[0]?.id;
    const u2 = anchors[1]?.id;
    if (!u1 || !u2) return;

    // 清理该账号可能存在的 default 排班，避免真实数据干扰
    await db.execute(sql`DELETE FROM account_anchor_default WHERE account_id = ${acc.id}`);

    // seed default：u1 覆盖 09:00–13:00
    await db.insert(account_anchor_default).values({
      id: crypto.randomUUID(),
      account_id: acc.id,
      dingtalk_user_id: u1,
      time_slots: [["09:00", "13:00"]],
      rest_days: [],
      effective_from: "2025-01-01",
    });

    // ingest 一条 hour=10 的投放行（在 09:00–13:00 时段内）
    await ingestRows({
      source: "excel-upload",
      dataset_id: "test_override_e2e",
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label,
          date: "2026-05-06",
          hour: 10,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    });

    // 第一次跑 job → 应命中 default，归因到 u1
    await runAttributionJob();
    let rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    const row1 = rows.at(0);
    expect(row1?.attributed_dingtalk_user_id).toBe(u1);
    expect(row1?.attribution_source).toBe("default");
    expect(row1?.attribution_dirty).toBe(false);

    // 加 override：u1 时段清空（请假），u2 顶替 09:00–13:00
    await db.insert(schedule_override).values([
      {
        account_id: acc.id,
        date: "2026-05-06",
        dingtalk_user_id: u1,
        time_slots: [],
      },
      {
        account_id: acc.id,
        date: "2026-05-06",
        dingtalk_user_id: u2,
        time_slots: [["09:00", "13:00"]],
      },
    ]);

    // 手动标 dirty（模拟 markDirtyByAccountDate 的效果）
    await db
      .update(placement_row)
      .set({ attribution_dirty: true })
      .where(eq(placement_row.live_account_id, acc.id));

    // 第二次跑 job → 应命中 override，归因到 u2
    await runAttributionJob();
    rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    const row2 = rows.at(0);
    expect(row2?.attributed_dingtalk_user_id).toBe(u2);
    expect(row2?.attribution_source).toBe("override");
    expect(row2?.attribution_dirty).toBe(false);

    // 清理该账号 default（避免污染其他测试）
    await db.execute(sql`DELETE FROM account_anchor_default WHERE account_id = ${acc.id}`);
  });
});
