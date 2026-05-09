import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import { sql } from "drizzle-orm";
import type { ParsedRow } from "./xlsx-adapter";
import type { DatasetId } from "./schema";

/**
 * placement_label 在 live_account 表里对应的 product 字段，反查回 dataset_id。
 * 6 个细分产品 → 3 个 dataset：
 * - 捕鱼大作战 → product_buyu
 * - 途游休闲捕鱼 → product_ue4
 * - 电玩捕鱼 → product_urp
 * - 其它（斗地主/麻将/三国）暂无对应 dataset
 */
const PRODUCT_TO_DATASET: Record<string, DatasetId> = {
  捕鱼大作战: "product_buyu",
  途游休闲捕鱼: "product_ue4",
  电玩捕鱼: "product_urp",
};

export interface DetectResult {
  datasetId: DatasetId | null;
  votes: Record<DatasetId, number>; // 每个 dataset 的主播标签命中数（去重后）
  unmatched: string[]; // 没在 live_account 找到 placement_label 的标签
  mixed: boolean; // 多个 dataset 都有命中
}

/**
 * 根据 excel rows 里出现的主播标签（备注/account_name），投票猜出文件属于哪个 dataset。
 * 投票规则：每个唯一 placement_label 算一票（不按行数加权，避免某些主播跑量大压制）。
 */
export async function detectDatasetFromRows(rows: ParsedRow[]): Promise<DetectResult> {
  const votes: Record<DatasetId, number> = {
    product_buyu: 0,
    product_ue4: 0,
    product_urp: 0,
  };

  const labelSet = new Set<string>();
  for (const r of rows) {
    if (r.account_name) labelSet.add(r.account_name);
  }
  if (labelSet.size === 0) {
    return { datasetId: null, votes, unmatched: [], mixed: false };
  }
  const labels = [...labelSet];

  // 大小写不敏感匹配：DB 的 placement_label 全部 lower 拿出来
  const lowerLabels = labels.map((l) => l.toLowerCase());
  const accounts = await db.execute<{ placement_label: string; product: string }>(sql`
    SELECT DISTINCT placement_label, product
    FROM ${live_account}
    WHERE placement_label IS NOT NULL
      AND lower(placement_label) IN (${sql.join(
        lowerLabels.map((l) => sql`${l}`),
        sql`, `,
      )})
  `);
  const rows_ = accounts as unknown as { placement_label: string; product: string }[];

  // 把 DB label → product 拉出来（lower-key）
  const labelToProduct = new Map<string, string>();
  for (const a of rows_) {
    labelToProduct.set(a.placement_label.toLowerCase(), a.product);
  }

  const unmatched: string[] = [];
  for (const label of labels) {
    const product = labelToProduct.get(label.toLowerCase());
    if (!product) {
      unmatched.push(label);
      continue;
    }
    const ds = PRODUCT_TO_DATASET[product];
    if (ds) votes[ds]++;
  }

  // 选最高票
  const sorted = (Object.entries(votes) as [DatasetId, number][])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  if (!top) {
    return { datasetId: null, votes, unmatched, mixed: false };
  }
  const [topDs, topVotes] = top;
  const second = sorted[1];
  const mixed = second !== undefined && second[1] >= topVotes; // 平票算 mixed
  return { datasetId: topDs, votes, unmatched, mixed };
}
