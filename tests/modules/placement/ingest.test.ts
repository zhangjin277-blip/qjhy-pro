import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { live_account } from "@/db/schema/live-account";
import { isNotNull, sql } from "drizzle-orm";
import { ingestRows, type IngestInput } from "@/modules/placement/ingest";

const TEST_DATASET = "product_buyu";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM placement_cumulative_raw`);
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

  it("账号未匹配 placement_label → 自动建 stub live_account 并 ingest", async () => {
    const stubName = `不存在的账号-${Date.now()}`;
    const input: IngestInput = {
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: stubName,
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
    // 现行行为：未匹配账号自动建 stub live_account，不再 skip
    expect(batch.status).toBe("completed");
    expect(batch.rows_inserted).toBe(1);
    expect(batch.rows_skipped).toBe(0);
    const stub = await db
      .select()
      .from(live_account)
      .where(sql`${live_account.placement_label} = ${stubName}`);
    expect(stub).toHaveLength(1);
    const raw = stub.at(0)?.raw as { _stub?: boolean } | null;
    expect(raw?._stub).toBe(true);
  });

  it("重复 (date,hour,dataset,account) → DELETE+INSERT 重算，最终金额为最新值", async () => {
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
    // excel-upload 路径每次重算都先 DELETE 再 INSERT，rows_updated 永远 0
    expect(second.rows_updated).toBe(0);
    expect(second.rows_inserted).toBeGreaterThanOrEqual(1);

    const rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    // cumulative_raw 用 GREATEST 把 (h=19) 累计覆盖为 200；单点序列差分回写 placement_row=200
    expect(Number(rows.at(0)?.cost_yuan)).toBe(200);
    expect(rows.at(0)?.attribution_dirty).toBe(true);
  });
});
