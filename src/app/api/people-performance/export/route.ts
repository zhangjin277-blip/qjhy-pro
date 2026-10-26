import { and, desc, eq, inArray, ne } from "drizzle-orm";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { dingtalk_user, performance_cycle, performance_goal } from "@/db/schema";
// API route runs on the server; authz intentionally stays out of the shared client-safe index.
// eslint-disable-next-line import/no-restricted-paths
import { resolvePerformanceAccess } from "@/modules/people-performance/authz";
import { calculateWeightedScore, visiblePerformanceRating } from "@/modules/people-performance";

export async function GET(request: Request) {
  try {
    const access = await resolvePerformanceAccess();
    if (!access.manageAll && !access.manageProfiles) return NextResponse.json({ error: "无导出权限" }, { status: 403 });
    const url = new URL(request.url);
    const cycleId = url.searchParams.get("cycleId");
    const ids = (url.searchParams.get("userIds") ?? "").split(",").filter(Boolean);
    const cycleLabel = url.searchParams.get("cycleLabel");
    const cycles = await db.select({ cycle: performance_cycle, name: dingtalk_user.name })
      .from(performance_cycle).innerJoin(dingtalk_user, eq(dingtalk_user.user_id, performance_cycle.user_id))
      .where(cycleId ? eq(performance_cycle.id, cycleId) : and(
        ids.length ? inArray(performance_cycle.user_id, ids) : ne(performance_cycle.kind, "quarterly"),
        cycleLabel ? eq(performance_cycle.label, cycleLabel) : ne(performance_cycle.kind, "quarterly"),
      )).orderBy(desc(performance_cycle.period_start));
    const selected = cycleId ? cycles : cycles.filter((item, index, all) => all.findIndex((other) => other.cycle.user_id === item.cycle.user_id) === index);
    const rows: Record<string, unknown>[] = [];
    for (const item of selected) {
      const goals = await db.select().from(performance_goal).where(eq(performance_goal.cycle_id, item.cycle.id)).orderBy(performance_goal.sort_order);
      if (cycleId) {
        for (const goal of goals) rows.push({ 姓名: item.name, 考核周期: item.cycle.label, 目标名称: goal.title, 目标说明: goal.description, 目标值: goal.target_value, 权重: Number(goal.weight), 完成情况: goal.completion ?? "", 自评分: goal.self_score === null ? "" : Number(goal.self_score), 直接上级评分: goal.manager_score === null ? "" : Number(goal.manager_score), 隔级上级评分: goal.skip_manager_score === null ? "" : Number(goal.skip_manager_score), 直接上级评语: goal.manager_comment ?? "", 隔级上级评语: goal.skip_manager_comment ?? "" });
      } else {
        const direct = calculateWeightedScore(goals.map((goal) => ({ weight: Number(goal.weight), managerScore: goal.manager_score === null ? null : Number(goal.manager_score) })));
        const skip = calculateWeightedScore(goals.map((goal) => ({ weight: Number(goal.weight), managerScore: goal.skip_manager_score === null ? null : Number(goal.skip_manager_score) })));
        rows.push({ 姓名: item.name, 考核周期: item.cycle.label, 直属上级分数: direct ?? "", 隔级上级分数: skip ?? "", 总分: item.cycle.final_score ?? "", 最终评级: visiblePerformanceRating(item.cycle, access.userId === item.cycle.user_id) ?? "", 当前环节: item.cycle.stage });
      }
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), cycleId ? "考核表" : "考核结果");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(cycleId ? "人员考核表.xlsx" : "人员考核结果.xlsx")}` } });
  } catch (error) {
    console.error("[people-performance-export]", error);
    return NextResponse.json({ error: "导出失败，请稍后重试" }, { status: 500 });
  }
}
