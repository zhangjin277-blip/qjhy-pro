import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/db/client";
import { normalizeCourseCategories } from "../src/modules/course-center/categories";
import { dingtalk_user } from "../src/db/schema/dingtalk";
import {
  course,
  course_exam,
  course_exam_result,
  course_favorite,
  course_progress,
} from "../src/db/schema/courses";

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const source = resolve(
  sourceArg?.slice("--source=".length) || "/Users/zhangjin/miracle-pro3/server/database.sqlite",
);
const apply = process.argv.includes("--apply");
if (!existsSync(source)) throw new Error(`旧数据库不存在：${source}`);

function rows<T>(query: string): T[] {
  const output = execFileSync("sqlite3", ["-json", source, query], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  return output.trim() ? (JSON.parse(output) as T[]) : [];
}
function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
function when(raw: unknown): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const value = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}+08:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

interface OldUser {
  id: number;
  name: string | null;
  username: string;
  dingtalk_user_id: string | null;
  dingtalk_userid: string | null;
}
type OldCourse = Record<string, unknown> & {
  id: string;
  title: string;
  category: string;
  type: string;
  stage: string;
};
interface OldProgress {
  user_id: number;
  course_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}
interface OldFavorite {
  user_id: number;
  course_id: string;
  created_at: string | null;
}
interface OldExam {
  course_id: string;
  questions: string;
  total_score: number;
  created_at: string | null;
  updated_at: string | null;
}
interface OldResult {
  course_id: string;
  user_id: number;
  score: number;
  total_score: number;
  pass_score: number;
  is_passed: number;
  answers: string;
  submitted_at: string | null;
}

const oldUsers = rows<OldUser>(
  "SELECT id,name,username,dingtalk_user_id,dingtalk_userid FROM users",
);
const oldCourses = rows<OldCourse>("SELECT * FROM courses");
const progress = rows<OldProgress>(
  "SELECT user_id,course_id,status,started_at,completed_at FROM course_progress",
);
const favorites = rows<OldFavorite>("SELECT user_id,course_id,created_at FROM course_favorites");
const exams = rows<OldExam>(
  "SELECT course_id,questions,total_score,created_at,updated_at FROM course_exams",
);
const results = rows<OldResult>(
  "SELECT course_id,user_id,score,total_score,pass_score,is_passed,answers,submitted_at FROM exam_results",
);
async function main() {
  const currentUsers = await db
    .select({ id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user);
  const validIds = new Set(currentUsers.map((user) => user.id));
  const byName = new Map<string, string[]>();
  for (const user of currentUsers)
    byName.set(user.name, [...(byName.get(user.name) ?? []), user.id]);
  const mapping = new Map<number, string>();
  const unresolved: { oldId: number; name: string; reason: string }[] = [];
  for (const user of oldUsers) {
    const direct = [user.dingtalk_user_id, user.dingtalk_userid].find(
      (id) => id && validIds.has(id),
    );
    if (direct) {
      mapping.set(user.id, direct);
      continue;
    }
    const matches = byName.get(user.name || user.username) ?? [];
    const matched = matches[0];
    if (matches.length === 1 && matched) mapping.set(user.id, matched);
    else
      unresolved.push({
        oldId: user.id,
        name: user.name || user.username,
        reason: matches.length > 1 ? "姓名重复" : "待确认",
      });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        source,
        counts: {
          courses: oldCourses.length,
          progress: progress.length,
          favorites: favorites.length,
          exams: exams.length,
          results: results.length,
        },
        mappedUsers: mapping.size,
        unresolved,
      },
      null,
      2,
    ),
  );
  if (!apply) process.exit(0);

  const categoryMap: Record<string, string> = {
    tuyoun_ddz: "途游斗地主",
    tuyou_ddz: "途游斗地主",
    buyu_dzz: "捕鱼大作战",
    tuyou_buyu: "途游休闲捕鱼",
    "3d_buyu": "3D捕鱼",
    sanguo_binghe: "三国:冰河时代",
    other: "其他产品",
  };
  const courseIds = new Set(oldCourses.map((item) => item.id));
  let orphanProgress = 0;
  let orphanFavorites = 0;
  let orphanResults = 0;
  for (const item of oldCourses) {
    const rawCategories = json<unknown[]>(item.category, []);
    const sourceCategories = rawCategories.length ? rawCategories : [item.category];
    const categories = normalizeCourseCategories(sourceCategories).map(
      (value) => categoryMap[value] ?? value,
    );
    await db
      .insert(course)
      .values({
        id: item.id,
        title: item.title,
        description: String(item.description ?? "") || null,
        category: categories[0] ?? "其他产品",
        categories,
        type: item.type,
        stage: item.stage,
        cover_path: String(item.cover ?? "") || null,
        duration_min: Number(item.duration ?? 0),
        chapters: json(item.chapters, []),
        content: String(item.content ?? "") || null,
        video_url: String(item.videoUrl ?? "") || null,
        instructor: String(item.instructor ?? "") || null,
        views: Number(item.views ?? 0),
        likes: Number(item.likes ?? 0),
        has_exam: Number(item.has_exam ?? 0),
        exam_pass_score: Number(item.exam_pass_score ?? 60),
        created_at: when(item.created_at) ?? new Date(),
        updated_at: when(item.updated_at) ?? new Date(),
      })
      .onConflictDoUpdate({
        target: course.id,
        set: {
          title: item.title,
          categories,
          category: categories[0] ?? "其他产品",
          cover_path: String(item.cover ?? "") || null,
          video_url: String(item.videoUrl ?? "") || null,
          updated_at: new Date(),
        },
      });
  }
  for (const item of progress) {
    if (!courseIds.has(item.course_id)) {
      orphanProgress += 1;
      continue;
    }
    const userId = mapping.get(item.user_id);
    if (!userId) continue;
    await db
      .insert(course_progress)
      .values({
        user_id: userId,
        course_id: item.course_id,
        status: item.status === "completed" ? "completed" : "in_progress",
        started_at: when(item.started_at),
        completed_at: when(item.completed_at),
        last_viewed_at: when(item.completed_at) ?? when(item.started_at) ?? new Date(),
      })
      .onConflictDoNothing();
  }
  for (const item of favorites) {
    if (!courseIds.has(item.course_id)) {
      orphanFavorites += 1;
      continue;
    }
    const userId = mapping.get(item.user_id);
    if (!userId) continue;
    await db
      .insert(course_favorite)
      .values({
        user_id: userId,
        course_id: item.course_id,
        created_at: when(item.created_at) ?? new Date(),
      })
      .onConflictDoNothing();
  }
  for (const item of exams) {
    await db
      .insert(course_exam)
      .values({
        course_id: item.course_id,
        questions: json(item.questions, []),
        total_score: item.total_score,
        created_at: when(item.created_at) ?? new Date(),
        updated_at: when(item.updated_at) ?? new Date(),
      })
      .onConflictDoNothing();
  }
  for (const item of results) {
    if (!courseIds.has(item.course_id)) {
      orphanResults += 1;
      continue;
    }
    const userId = mapping.get(item.user_id);
    if (!userId) continue;
    await db
      .insert(course_exam_result)
      .values({
        course_id: item.course_id,
        user_id: userId,
        score: item.score,
        total_score: item.total_score,
        pass_score: item.pass_score,
        is_passed: item.is_passed,
        answers: json(item.answers, []),
        submitted_at: when(item.submitted_at) ?? new Date(),
      })
      .onConflictDoNothing();
  }
  console.log(
    `导入完成：${oldCourses.length} 门课程；未匹配用户 ${unresolved.length} 人（保留为待确认，未导入其个人记录）；跳过旧库孤儿记录：进度 ${orphanProgress}、收藏 ${orphanFavorites}、考试 ${orphanResults}。`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
