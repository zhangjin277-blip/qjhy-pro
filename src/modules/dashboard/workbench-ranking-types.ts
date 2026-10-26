import { z } from "zod";
import { legacyCalendarDate } from "@/lib/business-date";
import { PROJECT_KEYS } from "./types";

export const RANKING_METRICS = ["flow", "duration", "acu", "uv"] as const;
export type RankingMetric = (typeof RANKING_METRICS)[number];
export const RANKING_LABELS: Record<RankingMetric, string> = {
  flow: "流水",
  duration: "时长",
  acu: "人气 (ACU)",
  uv: "UV（看播）",
};
const date = z.string().refine((value) => legacyCalendarDate(value) === value, "日期无效");
export const WorkbenchRankingFilters = z
  .object({
    project: z.enum(PROJECT_KEYS).default("ddz"),
    metric: z.enum(RANKING_METRICS).default("flow"),
    date_from: date,
    date_to: date,
  })
  .refine((value) => value.date_from <= value.date_to, "开始日期不能晚于结束日期")
  .refine(
    (value) => Date.parse(value.date_to) - Date.parse(value.date_from) < 366 * 86400000,
    "请选择一年以内的日期区间",
  );
export type WorkbenchRankingFilters = z.infer<typeof WorkbenchRankingFilters>;
export interface WorkbenchRankingRow {
  id: string;
  name: string;
  avatar: string | null;
  value: number;
}
export interface WorkbenchRankingData extends WorkbenchRankingFilters {
  rows: WorkbenchRankingRow[];
  total: number;
  latestDate: string | null;
}
