"use server";

import { AppError } from "@/lib/errors";
import { getRecruitmentStatistics } from "./statistics-server";
import type { RecruitmentStatisticsData } from "./statistics";

export async function getRecruitmentStatisticsAction(
  input: unknown,
): Promise<{ ok: true; data: RecruitmentStatisticsData } | { ok: false; error: string }> {
  try {
    return { ok: true, data: await getRecruitmentStatistics(input) };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, error: error.message };
    console.error("[招募月统计] 查询失败", error);
    return { ok: false, error: "统计加载失败，请检查月份后重试" };
  }
}
