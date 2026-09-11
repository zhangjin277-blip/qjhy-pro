import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { course, course_progress } from "@/db/schema/courses";
import { dingtalk_user } from "@/db/schema/dingtalk";
import { requireCourseViewer } from "./authz";

export async function getCourseStats() {
  const { userId } = await requireCourseViewer();
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const completed = and(
    eq(course_progress.user_id, userId),
    eq(course_progress.status, "completed"),
  );
  const completedThisWeek = and(completed, gte(course_progress.completed_at, weekStart));

  const rankingQuery = (weekOnly: boolean) =>
    db
      .select({
        userId: course_progress.user_id,
        name: dingtalk_user.name,
        count: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${course.duration_min}), 0)::int`,
      })
      .from(course_progress)
      .innerJoin(course, eq(course.id, course_progress.course_id))
      .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, course_progress.user_id))
      .where(weekOnly ? completedThisWeek : eq(course_progress.status, "completed"))
      .groupBy(course_progress.user_id, dingtalk_user.name)
      .orderBy(desc(sql`coalesce(sum(${course.duration_min}), 0)`))
      .limit(10);
  const [catalogRows, totalRows, weekRows, weekRanking, totalRanking] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(course),
    db
      .select({
        count: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${course.duration_min}), 0)::int`,
      })
      .from(course_progress)
      .innerJoin(course, eq(course.id, course_progress.course_id))
      .where(completed),
    db
      .select({
        count: sql<number>`count(*)::int`,
        minutes: sql<number>`coalesce(sum(${course.duration_min}), 0)::int`,
      })
      .from(course_progress)
      .innerJoin(course, eq(course.id, course_progress.course_id))
      .where(completedThisWeek),
    rankingQuery(true),
    rankingQuery(false),
  ]);

  return {
    totalCourses: catalogRows[0]?.count ?? 0,
    completedCourses: totalRows[0]?.count ?? 0,
    totalMinutes: totalRows[0]?.minutes ?? 0,
    weekCourses: weekRows[0]?.count ?? 0,
    weekMinutes: weekRows[0]?.minutes ?? 0,
    weekRanking: weekRanking.map((row) => ({ ...row, name: row.name ?? "待确认" })),
    totalRanking: totalRanking.map((row) => ({ ...row, name: row.name ?? "待确认" })),
  };
}
