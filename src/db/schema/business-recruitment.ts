import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { dingtalk_user } from "./dingtalk";

export const RECRUITMENT_STATUS = [
  "draft",
  "business_review",
  "operation_review",
  "signing",
  "signed",
  "live",
  "rejected",
  "abnormal",
] as const;
export type RecruitmentStatus = (typeof RECRUITMENT_STATUS)[number];

export const RECRUITMENT_GRADE = ["A", "B", "C"] as const;
export type RecruitmentGrade = (typeof RECRUITMENT_GRADE)[number];

export const business_recruitment_candidate = pgTable(
  "business_recruitment_candidate",
  {
    id: text("id").primaryKey(),
    platform: text("platform", { enum: ["douyin", "kuaishou", "other"] }).notNull(),
    game_product: text("game_product").notNull(),
    anchor_name: text("anchor_name").notNull(),
    gender: text("gender", { enum: ["female", "male", "unspecified"] })
      .notNull()
      .default("unspecified"),
    phone: text("phone").notNull(),
    account_nickname: text("account_nickname").notNull(),
    account_id: text("account_id").notNull(),
    uid: text("uid"),
    follower_count: integer("follower_count").notNull().default(0),
    account_summary: text("account_summary"),
    policy: text("policy"),
    recruiter_user_id: text("recruiter_user_id").notNull(),
    equipment_status: text("equipment_status", { enum: ["ready", "partial", "missing"] }),
    willingness: text("willingness", { enum: ["strong", "medium", "weak"] }),
    appearance_pass: boolean("appearance_pass").notNull().default(false),
    appearance_note: text("appearance_note"),
    voice_pass: boolean("voice_pass").notNull().default(false),
    voice_note: text("voice_note"),
    expression_pass: boolean("expression_pass").notNull().default(false),
    expression_note: text("expression_note"),
    internet_sense_pass: boolean("internet_sense_pass").notNull().default(false),
    internet_sense_note: text("internet_sense_note"),
    resilience_pass: boolean("resilience_pass").notNull().default(false),
    resilience_note: text("resilience_note"),
    business_review_count: integer("business_review_count").notNull().default(0),
    operation_review_count: integer("operation_review_count"),
    suggested_grade: text("suggested_grade", { enum: RECRUITMENT_GRADE }),
    final_grade: text("final_grade", { enum: RECRUITMENT_GRADE }),
    operator_user_id: text("operator_user_id").references(() => dingtalk_user.user_id),
    operation_feedback: text("operation_feedback"),
    join_date: date("join_date", { mode: "string" }),
    first_live_date: date("first_live_date", { mode: "string" }),
    signing_status: text("signing_status", { enum: ["pending", "signed", "declined", "abnormal"] })
      .notNull()
      .default("pending"),
    abnormal_note: text("abnormal_note"),
    status: text("status", { enum: RECRUITMENT_STATUS }).notNull().default("draft"),
    created_by_user_id: text("created_by_user_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_platform_account: unique("uq_business_recruitment_platform_account").on(
      t.platform,
      t.account_id,
    ),
    idx_status_updated: index("idx_business_recruitment_status_updated").on(t.status, t.updated_at),
    idx_recruiter: index("idx_business_recruitment_recruiter").on(t.recruiter_user_id),
    idx_operator: index("idx_business_recruitment_operator").on(t.operator_user_id),
  }),
);

export const business_recruitment_event = pgTable(
  "business_recruitment_event",
  {
    id: serial("id").primaryKey(),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => business_recruitment_candidate.id, { onDelete: "cascade" }),
    actor_user_id: text("actor_user_id"),
    event_type: text("event_type").notNull(),
    from_status: text("from_status"),
    to_status: text("to_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_candidate_time: index("idx_business_recruitment_event_candidate_time").on(
      t.candidate_id,
      t.created_at,
    ),
  }),
);
