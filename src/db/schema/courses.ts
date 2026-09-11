import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";
import { anchor_profile } from "./anchors";

export interface CourseChapter {
  id: string;
  title: string;
  durationMin?: number;
  content?: string;
  resourceUrl?: string;
}

export const course = pgTable(
  "course",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    type: text("type").notNull(),
    stage: text("stage").notNull(),
    cover_path: text("cover_path"),
    duration_min: integer("duration_min").notNull().default(0),
    chapters: jsonb("chapters").$type<CourseChapter[]>().notNull().default([]),
    content: text("content"),
    video_url: text("video_url"),
    instructor: text("instructor"),
    creator_user_id: text("creator_user_id").references(() => dingtalk_user.user_id),
    views: integer("views").notNull().default(0),
    likes: integer("likes").notNull().default(0),
    has_exam: integer("has_exam").notNull().default(0),
    exam_pass_score: integer("exam_pass_score").notNull().default(60),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    category: index("idx_course_category").on(t.category),
    stage: index("idx_course_stage").on(t.stage),
  }),
);

export const course_progress = pgTable(
  "course_progress",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["in_progress", "completed"] })
      .notNull()
      .default("in_progress"),
    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    last_viewed_at: timestamp("last_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    user: index("idx_course_progress_user").on(t.user_id),
    uq: unique("uq_course_progress").on(t.user_id, t.course_id),
  }),
);

export const course_like = pgTable(
  "course_like",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique("uq_course_like").on(t.user_id, t.course_id) }),
);

export const course_favorite = pgTable(
  "course_favorite",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique("uq_course_favorite").on(t.user_id, t.course_id) }),
);

export const course_exam = pgTable(
  "course_exam",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    questions: jsonb("questions").notNull().default([]),
    total_score: integer("total_score").notNull().default(0),
    created_by_user_id: text("created_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique("uq_course_exam_course").on(t.course_id) }),
);

export const course_exam_result = pgTable(
  "course_exam_result",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    score: integer("score").notNull().default(0),
    total_score: integer("total_score").notNull().default(0),
    pass_score: integer("pass_score").notNull().default(60),
    is_passed: integer("is_passed").notNull().default(0),
    answers: jsonb("answers").notNull().default([]),
    submitted_at: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uq: unique("uq_course_exam_result").on(t.user_id, t.course_id) }),
);

export const anchor_training = pgTable(
  "anchor_training",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    anchor_id: text("anchor_id")
      .notNull()
      .references(() => anchor_profile.anchor_id, { onDelete: "cascade" }),
    course_id: text("course_id")
      .notNull()
      .references(() => course.id, { onDelete: "cascade" }),
    assigned_by_user_id: text("assigned_by_user_id").references(() => dingtalk_user.user_id),
    is_required: boolean("is_required").notNull().default(true),
    deadline: date("deadline", { mode: "string" }),
    status: text("status", { enum: ["not_started", "in_progress", "completed", "failed"] })
      .notNull()
      .default("not_started"),
    score: integer("score"),
    remark: text("remark"),
    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    anchor: index("idx_anchor_training_anchor").on(t.anchor_id),
    uq: unique("uq_anchor_training").on(t.anchor_id, t.course_id),
  }),
);

export const training_template = pgTable(
  "training_template",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    project: text("project"),
    course_ids: jsonb("course_ids").$type<string[]>().notNull().default([]),
    description: text("description"),
    created_by_user_id: text("created_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ project: index("idx_training_template_project").on(t.project) }),
);
