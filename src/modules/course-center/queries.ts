import "server-only";
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { anchor_profile } from "@/db/schema/anchors";
import {
  anchor_training,
  course,
  course_favorite,
  course_like,
  course_progress,
} from "@/db/schema/courses";
import type { CourseItem, CourseListResult, MyTrainingItem } from "./types";
import type { ListCoursesInput } from "./schema";
import { normalizeCourseCategories } from "./categories";

function mapCourse(row: {
  c: typeof course.$inferSelect;
  status: string | null;
  favorite: number | null;
  liked: number | null;
}): CourseItem {
  const normalizedCategories = normalizeCourseCategories(
    Array.isArray(row.c.categories) ? row.c.categories : [row.c.category],
  );
  return {
    id: row.c.id,
    title: row.c.title,
    description: row.c.description,
    category: normalizedCategories[0] ?? "其他产品",
    categories: normalizedCategories,
    type: row.c.type,
    stage: row.c.stage,
    coverPath: row.c.cover_path,
    durationMin: row.c.duration_min,
    chapters: Array.isArray(row.c.chapters) ? row.c.chapters : [],
    content: row.c.content,
    videoUrl: row.c.video_url,
    instructor: row.c.instructor,
    views: row.c.views,
    likes: row.c.likes,
    liked: row.liked != null,
    hasExam: row.c.has_exam === 1,
    progress: (row.status ?? "not_started") as CourseItem["progress"],
    favorited: row.favorite != null,
    createdAt: row.c.created_at.toISOString(),
  };
}

export async function getMyTrainingCourses(userId: string): Promise<MyTrainingItem[]> {
  const rows = await db
    .select({
      task: anchor_training,
      c: course,
      status: course_progress.status,
      favorite: course_favorite.id,
      liked: course_like.id,
    })
    .from(anchor_profile)
    .innerJoin(anchor_training, eq(anchor_training.anchor_id, anchor_profile.anchor_id))
    .innerJoin(course, eq(course.id, anchor_training.course_id))
    .leftJoin(
      course_progress,
      and(eq(course_progress.course_id, course.id), eq(course_progress.user_id, userId)),
    )
    .leftJoin(
      course_favorite,
      and(eq(course_favorite.course_id, course.id), eq(course_favorite.user_id, userId)),
    )
    .leftJoin(
      course_like,
      and(eq(course_like.course_id, course.id), eq(course_like.user_id, userId)),
    )
    .where(eq(anchor_profile.dingtalk_user_id, userId))
    .orderBy(desc(anchor_training.is_required), desc(anchor_training.created_at));

  return rows.map((row) => ({
    task: {
      id: row.task.id,
      anchorId: row.task.anchor_id,
      courseId: row.task.course_id,
      courseTitle: row.c.title,
      isRequired: row.task.is_required,
      deadline: row.task.deadline,
      status: row.task.status,
      score: row.task.score,
      remark: row.task.remark,
      startedAt: row.task.started_at?.toISOString() ?? null,
      completedAt: row.task.completed_at?.toISOString() ?? null,
    },
    course: mapCourse(row),
  }));
}

export async function listCourses(
  input: ListCoursesInput,
  userId: string,
): Promise<CourseListResult> {
  const conds = [sql`true`];
  if (input.category && input.category !== "all") {
    conds.push(sql`${course.categories} @> ${JSON.stringify([input.category])}::jsonb`);
  }
  if (input.type && input.type !== "all") conds.push(eq(course.type, input.type));
  if (input.stage && input.stage !== "all") conds.push(eq(course.stage, input.stage));
  if (input.keyword) {
    const keyword = or(
      ilike(course.title, `%${input.keyword}%`),
      ilike(course.description, `%${input.keyword}%`),
    );
    if (keyword) conds.push(keyword);
  }
  if (input.learningStatus === "not_started") conds.push(isNull(course_progress.id));
  if (input.learningStatus === "in_progress") conds.push(eq(course_progress.status, "in_progress"));
  if (input.learningStatus === "completed") conds.push(eq(course_progress.status, "completed"));
  const where = and(...conds);
  const base = db
    .select({
      c: course,
      status: course_progress.status,
      favorite: course_favorite.id,
      liked: course_like.id,
    })
    .from(course)
    .leftJoin(
      course_progress,
      and(eq(course_progress.course_id, course.id), eq(course_progress.user_id, userId)),
    )
    .leftJoin(
      course_favorite,
      and(eq(course_favorite.course_id, course.id), eq(course_favorite.user_id, userId)),
    )
    .leftJoin(
      course_like,
      and(eq(course_like.course_id, course.id), eq(course_like.user_id, userId)),
    )
    .where(where);
  const order =
    input.sort === "popular"
      ? desc(course.views)
      : input.sort === "liked"
        ? desc(course.likes)
        : desc(course.created_at);
  const [countRows, rows] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(course)
      .leftJoin(
        course_progress,
        and(eq(course_progress.course_id, course.id), eq(course_progress.user_id, userId)),
      )
      .where(where),
    base
      .orderBy(order, desc(course.created_at))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
  ]);
  return { total: countRows[0]?.total ?? 0, items: rows.map(mapCourse) };
}

export async function getLearningHistory(userId: string): Promise<CourseItem[]> {
  const rows = await db
    .select({
      c: course,
      status: course_progress.status,
      favorite: course_favorite.id,
      liked: course_like.id,
    })
    .from(course_progress)
    .innerJoin(course, eq(course.id, course_progress.course_id))
    .leftJoin(
      course_favorite,
      and(eq(course_favorite.course_id, course.id), eq(course_favorite.user_id, userId)),
    )
    .leftJoin(
      course_like,
      and(eq(course_like.course_id, course.id), eq(course_like.user_id, userId)),
    )
    .where(and(eq(course_progress.user_id, userId), isNotNull(course_progress.last_viewed_at)))
    .orderBy(desc(course_progress.last_viewed_at));
  return rows.map(mapCourse);
}

export async function getFavoriteCourses(userId: string): Promise<CourseItem[]> {
  const rows = await db
    .select({
      c: course,
      status: course_progress.status,
      favorite: course_favorite.id,
      liked: course_like.id,
    })
    .from(course_favorite)
    .innerJoin(course, eq(course.id, course_favorite.course_id))
    .leftJoin(
      course_progress,
      and(eq(course_progress.course_id, course.id), eq(course_progress.user_id, userId)),
    )
    .leftJoin(
      course_like,
      and(eq(course_like.course_id, course.id), eq(course_like.user_id, userId)),
    )
    .where(eq(course_favorite.user_id, userId))
    .orderBy(desc(course_favorite.created_at));
  return rows.map(mapCourse);
}
