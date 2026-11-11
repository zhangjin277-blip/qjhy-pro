import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { dingtalk_user } from "./dingtalk";

export const PEOPLE_EMPLOYMENT_STATUS = ["probation", "regular", "inactive"] as const;
export type PeopleEmploymentStatus = (typeof PEOPLE_EMPLOYMENT_STATUS)[number];

export const PERFORMANCE_CYCLE_KIND = ["probation", "quarterly", "monthly"] as const;
export type PerformanceCycleKind = (typeof PERFORMANCE_CYCLE_KIND)[number];

export const PERFORMANCE_STAGE = [
  "scheduled",
  "goal_setting",
  "goal_review",
  "in_progress",
  "self_review",
  "manager_review",
  "skip_manager_review",
  "hr_calibration",
  "employee_confirm",
  "completed",
  "cancelled",
] as const;
export type PerformanceStage = (typeof PERFORMANCE_STAGE)[number];

export interface PerformanceGoalTemplate {
  title: string;
  description: string;
  metric: string;
  targetValue: string;
  weight: number;
}

/** 钉钉人员之上的人事考核档案。钉钉表保持只读，业务字段单独维护。 */
export const people_performance_profile = pgTable(
  "people_performance_profile",
  {
    user_id: text("user_id")
      .primaryKey()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    manager_user_id: text("manager_user_id").references(() => dingtalk_user.user_id),
    skip_manager_user_id: text("skip_manager_user_id").references(() => dingtalk_user.user_id),
    hire_date: date("hire_date", { mode: "string" }).notNull(),
    employment_status: text("employment_status", { enum: PEOPLE_EMPLOYMENT_STATUS })
      .notNull()
      .default("probation"),
    probation_months: integer("probation_months").notNull().default(2),
    regularized_at: date("regularized_at", { mode: "string" }),
    probation_goal_template: jsonb("probation_goal_template")
      .$type<PerformanceGoalTemplate[]>()
      .notNull()
      .default([]),
    performance_goal_template: jsonb("performance_goal_template")
      .$type<PerformanceGoalTemplate[]>()
      .notNull()
      .default([]),
    created_by_user_id: text("created_by_user_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    probationMonthsCheck: check(
      "people_performance_profile_probation_months_check",
      sql`${t.probation_months} IN (2, 3, 6)`,
    ),
    idx_manager: index("idx_people_performance_profile_manager").on(t.manager_user_id),
    idx_skip_manager: index("idx_people_performance_profile_skip_manager").on(
      t.skip_manager_user_id,
    ),
    idx_status: index("idx_people_performance_profile_status").on(t.employment_status),
  }),
);

/** 季度父周期、月度子周期和试用期节点均使用同一张周期表。 */
export const performance_cycle = pgTable(
  "performance_cycle",
  {
    id: text("id").primaryKey(),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    parent_cycle_id: text("parent_cycle_id"),
    kind: text("kind", { enum: PERFORMANCE_CYCLE_KIND }).notNull(),
    label: text("label").notNull(),
    period_start: date("period_start", { mode: "string" }).notNull(),
    period_end: date("period_end", { mode: "string" }).notNull(),
    sequence: integer("sequence").notNull().default(1),
    stage: text("stage", { enum: PERFORMANCE_STAGE }).notNull().default("scheduled"),
    manager_user_id: text("manager_user_id").references(() => dingtalk_user.user_id),
    skip_manager_user_id: text("skip_manager_user_id").references(() => dingtalk_user.user_id),
    requires_final_review: boolean("requires_final_review").notNull().default(true),
    hr_user_id: text("hr_user_id").references(() => dingtalk_user.user_id),
    self_summary: text("self_summary"),
    manager_summary: text("manager_summary"),
    skip_manager_summary: text("skip_manager_summary"),
    hr_comment: text("hr_comment"),
    final_score: numeric("final_score", { precision: 5, scale: 2 }),
    final_grade: text("final_grade"),
    probation_result: text("probation_result", {
      enum: ["passed", "extended", "failed"],
    }),
    confirmed_at: timestamp("confirmed_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_period: unique("uq_performance_cycle_user_kind_period").on(
      t.user_id,
      t.kind,
      t.period_start,
    ),
    idx_user_time: index("idx_performance_cycle_user_time").on(t.user_id, t.period_start),
    idx_stage: index("idx_performance_cycle_stage").on(t.stage, t.period_start),
    idx_parent: index("idx_performance_cycle_parent").on(t.parent_cycle_id),
  }),
);

export const performance_goal = pgTable(
  "performance_goal",
  {
    id: text("id").primaryKey(),
    cycle_id: text("cycle_id")
      .notNull()
      .references(() => performance_cycle.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    metric: text("metric").notNull().default(""),
    target_value: text("target_value").notNull().default(""),
    weight: numeric("weight", { precision: 5, scale: 2 }).notNull(),
    completion: text("completion"),
    self_score: numeric("self_score", { precision: 5, scale: 2 }),
    manager_score: numeric("manager_score", { precision: 5, scale: 2 }),
    manager_comment: text("manager_comment"),
    skip_manager_score: numeric("skip_manager_score", { precision: 5, scale: 2 }),
    skip_manager_comment: text("skip_manager_comment"),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_cycle_order: index("idx_performance_goal_cycle_order").on(t.cycle_id, t.sort_order),
  }),
);

/** 每个流程动作的不可变事件，用于流程页和变更记录。 */
export const performance_event = pgTable(
  "performance_event",
  {
    id: serial("id").primaryKey(),
    cycle_id: text("cycle_id")
      .notNull()
      .references(() => performance_cycle.id, { onDelete: "cascade" }),
    actor_user_id: text("actor_user_id"),
    event_type: text("event_type").notNull(),
    from_stage: text("from_stage"),
    to_stage: text("to_stage"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_cycle_time: index("idx_performance_event_cycle_time").on(t.cycle_id, t.created_at),
  }),
);

/** 通知去重与投递结果。dedupe_key 保证 cron 重跑不会重复打扰。 */
export const performance_notification = pgTable(
  "performance_notification",
  {
    id: serial("id").primaryKey(),
    cycle_id: text("cycle_id")
      .notNull()
      .references(() => performance_cycle.id, { onDelete: "cascade" }),
    recipient_user_id: text("recipient_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    dedupe_key: text("dedupe_key").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    sent_at: timestamp("sent_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_dedupe: unique("uq_performance_notification_dedupe").on(
      t.cycle_id,
      t.recipient_user_id,
      t.dedupe_key,
    ),
  }),
);
