"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { anchor_profile } from "@/db/schema/anchors";
import {
  anchor_training,
  course,
  course_exam,
  course_exam_result,
  course_favorite,
  course_like,
  course_progress,
  training_template,
} from "@/db/schema/courses";
import { writeAuditLog } from "@/lib/audit";
import { CourseInputSchema, ExamQuestionInput, ListCoursesInput } from "./schema";
import { requireCoursePoint, requireCourseViewer } from "./authz";
import {
  getFavoriteCourses,
  getLearningHistory,
  getMyTrainingCourses,
  listCourses,
} from "./queries";
import type { ExamPayload, ExamQuestion, TrainingTask, TrainingTemplate } from "./types";

export async function fetchCourses(input: unknown) {
  const data = ListCoursesInput.parse(input);
  const { userId } = await requireCourseViewer();
  return listCourses(data, userId);
}

export async function getPersonalLearning() {
  const { userId, isEmergency } = await requireCourseViewer();
  const [favorites, history, training] = await Promise.all([
    getFavoriteCourses(userId),
    getLearningHistory(userId),
    isEmergency ? Promise.resolve([]) : getMyTrainingCourses(userId),
  ]);
  return { favorites, history, training };
}

export async function recordCourseView(courseId: string) {
  const { userId, isEmergency } = await requireCourseViewer();
  if (isEmergency) {
    await db
      .update(course)
      .set({ views: sql`${course.views} + 1` })
      .where(eq(course.id, courseId));
    return { ok: true };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(course)
      .set({ views: sql`${course.views} + 1` })
      .where(eq(course.id, courseId));
    await tx
      .insert(course_progress)
      .values({
        user_id: userId,
        course_id: courseId,
        status: "in_progress",
        started_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [course_progress.user_id, course_progress.course_id],
        set: { last_viewed_at: new Date() },
      });
  });
  return { ok: true };
}

export async function startCourse(courseId: string) {
  const { userId, isEmergency } = await requireCourseViewer();
  if (isEmergency) return { ok: true };
  await db
    .insert(course_progress)
    .values({ user_id: userId, course_id: courseId, status: "in_progress", started_at: new Date() })
    .onConflictDoUpdate({
      target: [course_progress.user_id, course_progress.course_id],
      set: {
        started_at: sql`coalesce(${course_progress.started_at}, now())`,
        last_viewed_at: new Date(),
      },
    });
  revalidatePath("/courses");
  return { ok: true };
}

export async function completeCourse(courseId: string) {
  const { userId, isEmergency } = await requireCourseViewer();
  if (isEmergency) return { ok: true };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .insert(course_progress)
      .values({
        user_id: userId,
        course_id: courseId,
        status: "completed",
        started_at: now,
        completed_at: now,
        last_viewed_at: now,
      })
      .onConflictDoUpdate({
        target: [course_progress.user_id, course_progress.course_id],
        set: { status: "completed", completed_at: now, last_viewed_at: now },
      });
    const anchors = await tx
      .select({ id: anchor_profile.anchor_id })
      .from(anchor_profile)
      .where(eq(anchor_profile.dingtalk_user_id, userId));
    if (anchors.length) {
      await tx
        .update(anchor_training)
        .set({ status: "completed", completed_at: now, updated_at: now })
        .where(
          and(
            inArray(
              anchor_training.anchor_id,
              anchors.map((x) => x.id),
            ),
            eq(anchor_training.course_id, courseId),
          ),
        );
    }
  });
  revalidatePath("/courses");
  return { ok: true };
}

export async function toggleCourseFavorite(courseId: string) {
  const { userId, isEmergency } = await requireCourseViewer();
  if (isEmergency) throw new Error("应急管理员不记录个人收藏");
  const [existing] = await db
    .select({ id: course_favorite.id })
    .from(course_favorite)
    .where(and(eq(course_favorite.user_id, userId), eq(course_favorite.course_id, courseId)))
    .limit(1);
  if (existing) await db.delete(course_favorite).where(eq(course_favorite.id, existing.id));
  else await db.insert(course_favorite).values({ user_id: userId, course_id: courseId });
  revalidatePath("/courses");
  return { favorited: !existing };
}

export async function toggleCourseLike(courseId: string) {
  const { userId, isEmergency } = await requireCourseViewer();
  if (isEmergency) throw new Error("应急管理员不记录个人点赞");
  const liked = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: course_like.id })
      .from(course_like)
      .where(and(eq(course_like.user_id, userId), eq(course_like.course_id, courseId)))
      .limit(1);
    if (existing) {
      await tx.delete(course_like).where(eq(course_like.id, existing.id));
      await tx
        .update(course)
        .set({ likes: sql`greatest(${course.likes} - 1, 0)` })
        .where(eq(course.id, courseId));
      return false;
    }
    await tx.insert(course_like).values({ user_id: userId, course_id: courseId });
    await tx
      .update(course)
      .set({ likes: sql`${course.likes} + 1` })
      .where(eq(course.id, courseId));
    return true;
  });
  return { liked };
}

export async function deleteCourse(courseId: string) {
  const { userId } = await requireCoursePoint("course_delete");
  const [before] = await db.select().from(course).where(eq(course.id, courseId)).limit(1);
  if (!before) throw new Error("课程不存在");
  await db.delete(course).where(eq(course.id, courseId));
  await writeAuditLog({
    user_id: userId,
    action: "COURSE_DELETE",
    target_type: "course",
    target_id: courseId,
    before,
  });
  revalidatePath("/courses");
  return { ok: true };
}

export async function saveCourse(input: unknown) {
  const { userId, isEmergency } = await requireCoursePoint("course_edit");
  const parsed = CourseInputSchema.parse(input);
  const categories = parsed.categories?.length
    ? [...new Set(parsed.categories)]
    : [parsed.category];
  const data = {
    title: parsed.title,
    description: parsed.description?.trim() || null,
    category: categories[0] ?? parsed.category,
    categories,
    type: parsed.type,
    stage: parsed.stage,
    cover_path: parsed.coverPath || null,
    duration_min: parsed.durationMin ?? 0,
    chapters: parsed.chapters ?? [],
    content: parsed.content?.trim() || null,
    video_url: parsed.videoUrl || null,
    instructor: parsed.instructor || null,
    updated_at: new Date(),
  };
  const id = parsed.id ?? `course_${randomUUID()}`;
  const [before] = parsed.id
    ? await db.select().from(course).where(eq(course.id, parsed.id)).limit(1)
    : [];
  if (parsed.id) await db.update(course).set(data).where(eq(course.id, parsed.id));
  else
    await db.insert(course).values({ id, ...data, creator_user_id: isEmergency ? null : userId });
  await writeAuditLog({
    user_id: userId,
    action: parsed.id ? "COURSE_UPDATE" : "COURSE_CREATE",
    target_type: "course",
    target_id: id,
    before: before ?? null,
    after: data,
  });
  revalidatePath("/courses");
  return { ok: true, id };
}

export async function saveExam(courseId: string, rawQuestions: unknown[], passScore: number) {
  const { userId, isEmergency } = await requireCoursePoint("exam_manage");
  const questions = rawQuestions.map((q) => ExamQuestionInput.parse(q));
  if (!questions.length) throw new Error("考试至少需要一道题");
  if (!Number.isInteger(passScore) || passScore < 0) throw new Error("及格线不正确");
  const total = questions.reduce((sum, q) => sum + q.score, 0);
  if (passScore > total) throw new Error("及格线不能高于满分");
  await db.transaction(async (tx) => {
    await tx
      .update(course)
      .set({ has_exam: 1, exam_pass_score: passScore, updated_at: new Date() })
      .where(eq(course.id, courseId));
    await tx
      .insert(course_exam)
      .values({
        course_id: courseId,
        questions,
        total_score: total,
        created_by_user_id: isEmergency ? null : userId,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: course_exam.course_id,
        set: { questions, total_score: total, updated_at: new Date() },
      });
  });
  await writeAuditLog({
    user_id: userId,
    action: "COURSE_EXAM_SAVE",
    target_type: "course",
    target_id: courseId,
    after: { questionCount: questions.length, total, passScore },
  });
  revalidatePath("/courses");
  return { ok: true };
}

export async function removeExam(courseId: string) {
  const { userId } = await requireCoursePoint("exam_manage");
  await db.transaction(async (tx) => {
    await tx.delete(course_exam).where(eq(course_exam.course_id, courseId));
    await tx
      .update(course)
      .set({ has_exam: 0, updated_at: new Date() })
      .where(eq(course.id, courseId));
  });
  await writeAuditLog({
    user_id: userId,
    action: "COURSE_EXAM_DELETE",
    target_type: "course",
    target_id: courseId,
  });
  revalidatePath("/courses");
  return { ok: true };
}

export async function getCourseExam(courseId: string): Promise<ExamPayload | null> {
  const { userId, perm } = await requireCourseViewer();
  const [row] = await db
    .select({
      questions: course_exam.questions,
      total: course_exam.total_score,
      pass: course.exam_pass_score,
    })
    .from(course_exam)
    .innerJoin(course, eq(course.id, course_exam.course_id))
    .where(eq(course_exam.course_id, courseId))
    .limit(1);
  if (!row) return null;
  const [previous] = await db
    .select()
    .from(course_exam_result)
    .where(and(eq(course_exam_result.user_id, userId), eq(course_exam_result.course_id, courseId)))
    .limit(1);
  const questions = (Array.isArray(row.questions) ? row.questions : []).map((raw) => {
    const value = raw as ExamQuestion;
    if (perm.points.has("exam_manage")) return value;
    const { answer: _answer, ...publicQuestion } = value;
    return publicQuestion;
  });
  return {
    questions,
    totalScore: row.total,
    passScore: row.pass,
    previous: previous
      ? {
          score: previous.score,
          totalScore: previous.total_score,
          passScore: previous.pass_score,
          passed: previous.is_passed === 1,
          submittedAt: previous.submitted_at.toISOString(),
          details: Array.isArray(previous.answers)
            ? (previous.answers as ExamPayload["previous"] extends infer _
                ? NonNullable<ExamPayload["previous"]>["details"]
                : never)
            : [],
        }
      : null,
  };
}

export async function submitCourseExam(courseId: string, answers: Record<string, string>) {
  const { userId, isEmergency } = await requireCourseViewer();
  const [row] = await db
    .select({
      questions: course_exam.questions,
      total: course_exam.total_score,
      pass: course.exam_pass_score,
    })
    .from(course_exam)
    .innerJoin(course, eq(course.id, course_exam.course_id))
    .where(eq(course_exam.course_id, courseId))
    .limit(1);
  if (!row) throw new Error("该课程未配置考试");
  const questions = (Array.isArray(row.questions) ? row.questions : []) as ExamQuestion[];
  let score = 0;
  const details = questions.map((q) => {
    const value = String(answers[q.id] ?? "").trim();
    const correct =
      q.type === "essay"
        ? null
        : value.toLowerCase() ===
          String(q.answer ?? "")
            .trim()
            .toLowerCase();
    if (correct) score += q.score || 0;
    return {
      questionId: q.id,
      answer: value,
      correct,
      correctAnswer: q.type === "essay" ? undefined : q.answer,
    };
  });
  const passed = score >= row.pass;
  const submittedAt = new Date();
  if (!isEmergency) {
    await db
      .insert(course_exam_result)
      .values({
        course_id: courseId,
        user_id: userId,
        score,
        total_score: row.total,
        pass_score: row.pass,
        is_passed: passed ? 1 : 0,
        answers: details,
        submitted_at: submittedAt,
      })
      .onConflictDoUpdate({
        target: [course_exam_result.user_id, course_exam_result.course_id],
        set: {
          score,
          total_score: row.total,
          pass_score: row.pass,
          is_passed: passed ? 1 : 0,
          answers: details,
          submitted_at: submittedAt,
        },
      });
    if (passed) await completeCourse(courseId);
  }
  return {
    score,
    totalScore: row.total,
    passScore: row.pass,
    passed,
    details,
    submittedAt: submittedAt.toISOString(),
  };
}

function mapTraining(row: {
  task: typeof anchor_training.$inferSelect;
  courseTitle: string;
}): TrainingTask {
  return {
    id: row.task.id,
    anchorId: row.task.anchor_id,
    courseId: row.task.course_id,
    courseTitle: row.courseTitle,
    isRequired: row.task.is_required,
    deadline: row.task.deadline,
    status: row.task.status,
    score: row.task.score,
    remark: row.task.remark,
    startedAt: row.task.started_at?.toISOString() ?? null,
    completedAt: row.task.completed_at?.toISOString() ?? null,
  };
}

export async function getAnchorTraining(anchorId: string) {
  const { perm } = await requireCourseViewer();
  const [tasks, courses, templates] = await Promise.all([
    db
      .select({ task: anchor_training, courseTitle: course.title })
      .from(anchor_training)
      .innerJoin(course, eq(course.id, anchor_training.course_id))
      .where(eq(anchor_training.anchor_id, anchorId))
      .orderBy(desc(anchor_training.is_required), desc(anchor_training.created_at)),
    db
      .select({ id: course.id, title: course.title, stage: course.stage })
      .from(course)
      .orderBy(course.title),
    db.select().from(training_template).orderBy(desc(training_template.created_at)),
  ]);
  return {
    tasks: tasks.map(mapTraining),
    courses,
    templates: templates.map(
      (x): TrainingTemplate => ({
        id: x.id,
        name: x.name,
        project: x.project,
        courseIds: x.course_ids,
        description: x.description,
      }),
    ),
    canManage: perm.points.has("training_manage"),
  };
}

export async function assignAnchorCourse(input: {
  anchorId: string;
  courseId: string;
  isRequired: boolean;
  deadline?: string | null;
}) {
  const { userId, isEmergency } = await requireCoursePoint("training_manage");
  const [row] = await db
    .insert(anchor_training)
    .values({
      anchor_id: input.anchorId,
      course_id: input.courseId,
      assigned_by_user_id: isEmergency ? null : userId,
      is_required: input.isRequired,
      deadline: input.deadline || null,
    })
    .onConflictDoNothing()
    .returning({ id: anchor_training.id });
  if (!row) throw new Error("该课程已分配");
  await writeAuditLog({
    user_id: userId,
    action: "ANCHOR_TRAINING_ASSIGN",
    target_type: "anchor",
    target_id: input.anchorId,
    after: input,
  });
  return { ok: true };
}

export async function updateAnchorTraining(input: {
  id: number;
  status: "not_started" | "in_progress" | "completed" | "failed";
  score?: number | null;
  remark?: string | null;
  isRequired?: boolean;
  deadline?: string | null;
}) {
  const { userId } = await requireCoursePoint("training_manage");
  const [before] = await db
    .select()
    .from(anchor_training)
    .where(eq(anchor_training.id, input.id))
    .limit(1);
  if (!before) throw new Error("培训任务不存在");
  const now = new Date();
  await db
    .update(anchor_training)
    .set({
      status: input.status,
      score: input.score ?? null,
      remark: input.remark === undefined ? before.remark : input.remark?.trim() || null,
      is_required: input.isRequired ?? before.is_required,
      deadline: input.deadline === undefined ? before.deadline : input.deadline || null,
      started_at: input.status === "in_progress" ? (before.started_at ?? now) : before.started_at,
      completed_at: input.status === "completed" || input.status === "failed" ? now : null,
      updated_at: now,
    })
    .where(eq(anchor_training.id, input.id));
  await writeAuditLog({
    user_id: userId,
    action: "ANCHOR_TRAINING_UPDATE",
    target_type: "anchor_training",
    target_id: String(input.id),
    before,
    after: input,
  });
  return { ok: true };
}

export async function deleteAnchorTraining(id: number) {
  const { userId } = await requireCoursePoint("training_manage");
  const [before] = await db
    .select()
    .from(anchor_training)
    .where(eq(anchor_training.id, id))
    .limit(1);
  if (!before) throw new Error("培训任务不存在");
  await db.delete(anchor_training).where(eq(anchor_training.id, id));
  await writeAuditLog({
    user_id: userId,
    action: "ANCHOR_TRAINING_DELETE",
    target_type: "anchor_training",
    target_id: String(id),
    before,
  });
  return { ok: true };
}

export async function autoAssignAnchorTraining(anchorId: string, templateId?: number) {
  const { userId, isEmergency } = await requireCoursePoint("training_manage");
  let courseIds: string[] = [];
  if (templateId) {
    const [template] = await db
      .select()
      .from(training_template)
      .where(eq(training_template.id, templateId))
      .limit(1);
    courseIds = template?.course_ids ?? [];
  } else {
    const [profile] = await db
      .select({ isThree: anchor_profile.is_threekingdoms })
      .from(anchor_profile)
      .where(eq(anchor_profile.anchor_id, anchorId))
      .limit(1);
    const project = profile?.isThree ? "三国项目" : null;
    if (project) {
      const [template] = await db
        .select()
        .from(training_template)
        .where(eq(training_template.project, project))
        .limit(1);
      courseIds = template?.course_ids ?? [];
    }
    if (!courseIds.length) {
      const basics = await db
        .select({ id: course.id })
        .from(course)
        .where(eq(course.stage, "beginner"));
      courseIds = basics.map((x) => x.id);
    }
  }
  let assigned = 0;
  for (const courseId of courseIds) {
    const rows = await db
      .insert(anchor_training)
      .values({
        anchor_id: anchorId,
        course_id: courseId,
        assigned_by_user_id: isEmergency ? null : userId,
        is_required: true,
      })
      .onConflictDoNothing()
      .returning({ id: anchor_training.id });
    assigned += rows.length;
  }
  await writeAuditLog({
    user_id: userId,
    action: "ANCHOR_TRAINING_AUTO_ASSIGN",
    target_type: "anchor",
    target_id: anchorId,
    after: { templateId: templateId ?? null, assigned },
  });
  return { ok: true, assigned };
}

export async function saveTrainingTemplate(input: {
  id?: number;
  name: string;
  project?: string | null;
  courseIds: string[];
  description?: string | null;
}) {
  const { userId, isEmergency } = await requireCoursePoint("training_manage");
  if (!input.name.trim()) throw new Error("模板名称不能为空");
  const data = {
    name: input.name.trim(),
    project: input.project?.trim() || null,
    course_ids: [...new Set(input.courseIds)],
    description: input.description?.trim() || null,
    updated_at: new Date(),
  };
  let id = input.id;
  if (id) await db.update(training_template).set(data).where(eq(training_template.id, id));
  else {
    const [row] = await db
      .insert(training_template)
      .values({ ...data, created_by_user_id: isEmergency ? null : userId })
      .returning({ id: training_template.id });
    if (!row) throw new Error("培训模板保存失败");
    id = row.id;
  }
  await writeAuditLog({
    user_id: userId,
    action: input.id ? "TRAINING_TEMPLATE_UPDATE" : "TRAINING_TEMPLATE_CREATE",
    target_type: "training_template",
    target_id: String(id),
    after: data,
  });
  return { ok: true, id };
}

export async function deleteTrainingTemplate(id: number) {
  const { userId } = await requireCoursePoint("training_manage");
  const [before] = await db
    .select()
    .from(training_template)
    .where(eq(training_template.id, id))
    .limit(1);
  if (!before) throw new Error("培训模板不存在");
  await db.delete(training_template).where(eq(training_template.id, id));
  await writeAuditLog({
    user_id: userId,
    action: "TRAINING_TEMPLATE_DELETE",
    target_type: "training_template",
    target_id: String(id),
    before,
  });
  return { ok: true };
}
