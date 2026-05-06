import { z } from "zod";

export const datasetIdSchema = z.enum(["product_buyu", "product_ue4", "product_urp"]);
export type DatasetId = z.infer<typeof datasetIdSchema>;

export const DATASET_LABEL: Record<DatasetId, string> = {
  product_buyu: "捕鱼",
  product_ue4: "UE4",
  product_urp: "URP",
};

export const placementRowInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour: z.number().int().min(0).max(23),
  dataset_id: datasetIdSchema,
  live_account_id: z.string(), // ⚠️ live_account.id 是 TEXT 不是 UUID
  cost_yuan: z.number().nonnegative(),
  activations: z.number().int().nonnegative(),
  payment_yuan: z.number().nonnegative(),
  start_download: z.number().int().nonnegative(),
  finish_download: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.unknown()),
});
export type PlacementRowInput = z.infer<typeof placementRowInputSchema>;

export type AttributionSource = "override" | "default" | "conflict" | "unmatched";

export interface BatchSummary {
  id: string;
  source: string;
  file_name: string | null;
  dataset_id: string;
  date_range_from: string | null;
  date_range_to: string | null;
  row_count: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  status: "parsing" | "completed" | "failed" | "partial";
  error_log: { row?: unknown; reason: string }[] | null;
  uploaded_by: string | null;
  uploaded_at: string;
}
