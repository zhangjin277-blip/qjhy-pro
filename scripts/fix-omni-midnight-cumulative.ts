// 修 Omni 凌晨推送（HH:00-HH:18）被错存为「当天 hour=0」的历史脏数据。
//
// 症状：凌晨推送带的是「昨天全天累计」，被存到当天 hour=0 →
//       computeIncrements 里 date 内首行不做差分 → 当天 hour=0 增量爆表。
//
// 修法：
//   1. 扫 placement_cumulative_raw 里所有 hour=0 且 raw._pushed_at 时间是 HH:00-HH:18 的行
//   2. 迁移到 (date-1, hour=23)：UPSERT 用 GREATEST 保留更大累计（防止覆盖已有的正常 23 点推送）
//   3. DELETE 原 (date, hour=0) 行
//   4. 收集受影响的 (dataset, account, date) 三元组：原 date 和 date-1 都要重算
//   5. 对每个三元组重算 placement_row（拉全部 subaccount × 小时 → computeIncrements → INSERT）
//
// 幂等：重复跑无副作用（第 2 次跑 hour=0 已清空 → skip）。
//
// 用法：pnpm tsx scripts/fix-omni-midnight-cumulative.ts [--dry-run]

import { db } from "@/db/client";
import { placement_cumulative_raw, placement_row } from "@/db/schema";
import { computeIncrements, type RawCumulativeRow } from "@/modules/placement/incremental";
import { and, eq, sql } from "drizzle-orm";

const DRY = process.argv.includes("--dry-run");

interface Row {
  date: string;
  hour: number;
  dataset_id: string;
  live_account_id: string;
  subaccount_name: string;
  cost_yuan: string;
  activations: number;
  payment_yuan: string;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown> | null;
}

function prevDate(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

function isMidnightPush(raw: Record<string, unknown> | null): boolean {
  if (!raw) return false;
  const pushedAt = raw._pushed_at;
  if (typeof pushedAt !== "string") return false;
  const m = pushedAt.match(/\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/);
  if (!m) return false;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h === 0 && mm < 19;
}

async function main() {
  const badRows = (await db
    .select()
    .from(placement_cumulative_raw)
    .where(eq(placement_cumulative_raw.hour, 0))) as unknown as Row[];

  const midnightRows = badRows.filter((r) => isMidnightPush(r.raw));
  console.log(
    `[fix-omni] hour=0 rows: total=${badRows.length}, midnight_push=${midnightRows.length}`,
  );

  if (midnightRows.length === 0) {
    console.log("[fix-omni] 没有脏数据，退出");
    process.exit(0);
  }

  // 影响的 (dataset, account) × { date, prevDate } 三元组
  const affectedTriples = new Set<string>();

  await db.transaction(async (tx) => {
    for (const r of midnightRows) {
      const prev = prevDate(r.date);

      if (DRY) {
        console.log(
          `  DRY (${r.date},0,${r.dataset_id},${r.live_account_id},${r.subaccount_name}) → (${prev},23) cost=${r.cost_yuan} acts=${r.activations}`,
        );
      } else {
        // UPSERT 到 (prev, hour=23)：若已有则取 GREATEST（防覆盖正常 23 点推送）
        await tx
          .insert(placement_cumulative_raw)
          .values({
            date: prev,
            hour: 23,
            dataset_id: r.dataset_id,
            live_account_id: r.live_account_id,
            subaccount_name: r.subaccount_name,
            cost_yuan: r.cost_yuan,
            activations: r.activations,
            payment_yuan: r.payment_yuan,
            start_download: r.start_download,
            finish_download: r.finish_download,
            raw: r.raw ?? {},
          })
          .onConflictDoUpdate({
            target: [
              placement_cumulative_raw.date,
              placement_cumulative_raw.hour,
              placement_cumulative_raw.dataset_id,
              placement_cumulative_raw.live_account_id,
              placement_cumulative_raw.subaccount_name,
            ],
            set: {
              cost_yuan: sql`GREATEST(${placement_cumulative_raw.cost_yuan}, EXCLUDED.cost_yuan)`,
              activations: sql`GREATEST(${placement_cumulative_raw.activations}, EXCLUDED.activations)`,
              payment_yuan: sql`GREATEST(${placement_cumulative_raw.payment_yuan}, EXCLUDED.payment_yuan)`,
              start_download: sql`GREATEST(${placement_cumulative_raw.start_download}, EXCLUDED.start_download)`,
              finish_download: sql`GREATEST(${placement_cumulative_raw.finish_download}, EXCLUDED.finish_download)`,
              raw: sql`EXCLUDED.raw`,
              updated_at: sql`now()`,
            },
          });

        // DELETE 原 (date, hour=0) 行
        await tx
          .delete(placement_cumulative_raw)
          .where(
            and(
              eq(placement_cumulative_raw.date, r.date),
              eq(placement_cumulative_raw.hour, 0),
              eq(placement_cumulative_raw.dataset_id, r.dataset_id),
              eq(placement_cumulative_raw.live_account_id, r.live_account_id),
              eq(placement_cumulative_raw.subaccount_name, r.subaccount_name),
            ),
          );
      }

      affectedTriples.add(`${r.dataset_id}|${r.live_account_id}|${r.date}`);
      affectedTriples.add(`${r.dataset_id}|${r.live_account_id}|${prev}`);
    }
  });

  console.log(
    `[fix-omni] 迁移 ${midnightRows.length} 行完成，影响 ${affectedTriples.size} 个 (dataset,account,date) 三元组`,
  );

  if (DRY) {
    console.log("[fix-omni] DRY 模式，跳过 placement_row 重算");
    process.exit(0);
  }

  // 重算 placement_row
  let recomputed = 0;
  for (const triple of affectedTriples) {
    const [tDataset, tAccount, tDate] = triple.split("|") as [string, string, string];

    const cumRowsRaw = (await db
      .select()
      .from(placement_cumulative_raw)
      .where(
        and(
          eq(placement_cumulative_raw.dataset_id, tDataset),
          eq(placement_cumulative_raw.live_account_id, tAccount),
          eq(placement_cumulative_raw.date, tDate),
        ),
      )) as unknown as Row[];

    if (cumRowsRaw.length === 0) {
      // 该三元组已无累计数据 → 清空 placement_row
      await db
        .delete(placement_row)
        .where(
          and(
            eq(placement_row.dataset_id, tDataset),
            eq(placement_row.live_account_id, tAccount),
            eq(placement_row.date, tDate),
          ),
        );
      continue;
    }

    const cumRows: RawCumulativeRow[] = cumRowsRaw.map((c) => ({
      date: c.date,
      hour: c.hour,
      dataset_id: c.dataset_id,
      account_key: c.live_account_id,
      subaccount_key: c.subaccount_name,
      cost_yuan: Number(c.cost_yuan),
      activations: c.activations,
      payment_yuan: Number(c.payment_yuan),
      start_download: c.start_download,
      finish_download: c.finish_download,
      raw: c.raw ?? {},
    }));

    const incRows = computeIncrements(cumRows);
    const hourlyMap = new Map<number, RawCumulativeRow>();
    for (const r of incRows) {
      const existing = hourlyMap.get(r.hour);
      if (!existing) {
        hourlyMap.set(r.hour, { ...r });
      } else {
        existing.cost_yuan += r.cost_yuan;
        existing.activations += r.activations;
        existing.payment_yuan += r.payment_yuan;
        existing.start_download += r.start_download;
        existing.finish_download += r.finish_download;
      }
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(placement_row)
        .where(
          and(
            eq(placement_row.dataset_id, tDataset),
            eq(placement_row.live_account_id, tAccount),
            eq(placement_row.date, tDate),
          ),
        );
      for (const r of hourlyMap.values()) {
        await tx.insert(placement_row).values({
          date: r.date,
          hour: r.hour,
          dataset_id: r.dataset_id,
          live_account_id: r.account_key,
          cost_yuan: String(r.cost_yuan),
          activations: r.activations,
          payment_yuan: String(r.payment_yuan),
          start_download: r.start_download,
          finish_download: r.finish_download,
          attribution_dirty: true,
          raw: r.raw,
        });
      }
    });
    recomputed++;
  }

  console.log(`[fix-omni] placement_row 重算 ${recomputed} 个三元组完成`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[fix-omni] 失败:", err);
  process.exit(1);
});
