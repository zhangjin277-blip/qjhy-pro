import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { live_account } from "@/db/schema/live-account";
import { isNotNull, sql } from "drizzle-orm";
import { ingestRows, type IngestInput } from "@/modules/placement/ingest";

const TEST_DATASET = "product_buyu";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM placement_import_batch`);
});

describe("ingestRows", () => {
  it("成功 ingest 1 行（账号匹配 placement_label）", async () => {
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc?.placement_label) {
      // 没有 seed 数据，跳过
      return;
    }

    const input: IngestInput = {
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label,
          date: "2026-05-06",
          hour: 19,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: { mock: true },
        },
      ],
      parse_errors: [],
    };

    const batch = await ingestRows(input);
    expect(batch.status).toBe("completed");
    expect(batch.rows_inserted).toBe(1);
    expect(batch.rows_skipped).toBe(0);

    const rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    expect(rows.at(0)?.attribution_dirty).toBe(true);
  });

  it("账号未匹配 placement_label → rows_skipped + error_log 含「未找到」", async () => {
    const input: IngestInput = {
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: "不存在的账号-xxx",
          date: "2026-05-06",
          hour: 19,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    };

    const batch = await ingestRows(input);
    expect(batch.rows_skipped).toBe(1);
    const errorLog = batch.error_log;
    expect(errorLog).toBeDefined();
    expect(Array.isArray(errorLog) && errorLog.length).toBeGreaterThanOrEqual(1);
    const firstError = Array.isArray(errorLog) ? errorLog.at(0) : null;
    expect(firstError?.reason).toMatch(/未找到/);
  });

  it("重复 (date,hour,dataset,account) → UPDATE + rows_updated=1 + attribution_dirty=true", async () => {
    const accs = await db
      .select()
      .from(live_account)
      .where(isNotNull(live_account.placement_label))
      .limit(1);
    const acc = accs.at(0);
    if (!acc?.placement_label) return;

    const makeInput = (cost: number): IngestInput => ({
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label as string,
          date: "2026-05-06",
          hour: 19,
          cost_yuan: cost,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    });

    await ingestRows(makeInput(100));
    const second = await ingestRows(makeInput(200));
    expect(second.rows_updated).toBe(1);
    expect(second.rows_inserted).toBe(0);

    const rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    expect(Number(rows.at(0)?.cost_yuan)).toBe(200);
    expect(rows.at(0)?.attribution_dirty).toBe(true);
  });
});
