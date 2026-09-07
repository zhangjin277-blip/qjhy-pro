import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { dingtalk_user } from "./dingtalk";

export const RECRUITMENT_PIPELINE_STAGE = [
  "invited",
  "interview",
  "initial_pass",
  "final_pass",
  "offer",
  "joined",
  "trial_pass",
  "rejected",
  "withdrawn",
  "left",
] as const;

export const recruitment_candidate = pgTable(
  "recruitment_candidate",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    gender: text("gender", { enum: ["female", "male", "unspecified"] })
      .notNull()
      .default("unspecified"),
    identity_key: text("identity_key"),
    linked_dingtalk_user_id: text("linked_dingtalk_user_id").references(
      () => dingtalk_user.user_id,
    ),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_identity: unique("uq_recruitment_candidate_identity").on(t.identity_key),
    idx_name: index("idx_recruitment_candidate_name").on(t.name),
    idx_dingtalk: index("idx_recruitment_candidate_dingtalk").on(t.linked_dingtalk_user_id),
  }),
);

export const recruitment_application = pgTable(
  "recruitment_application",
  {
    id: text("id").primaryKey(),
    candidate_id: text("candidate_id")
      .notNull()
      .references(() => recruitment_candidate.id, { onDelete: "cascade" }),
    project: text("project"),
    channel: text("channel").notNull().default("other"),
    source_account: text("source_account"),
    recruiter_user_id: text("recruiter_user_id").references(() => dingtalk_user.user_id),
    recruiter_name_snapshot: text("recruiter_name_snapshot"),
    stage: text("stage", { enum: RECRUITMENT_PIPELINE_STAGE }).notNull().default("invited"),
    invited_date: date("invited_date", { mode: "string" }).notNull(),
    interview_date: date("interview_date", { mode: "string" }),
    interview_time: time("interview_time"),
    attendance_status: text("attendance_status", {
      enum: ["pending", "attended", "no_show"],
    })
      .notNull()
      .default("pending"),
    initial_result: text("initial_result", { enum: ["pending", "pass", "fail"] })
      .notNull()
      .default("pending"),
    final_result: text("final_result", { enum: ["pending", "pass", "fail"] })
      .notNull()
      .default("pending"),
    offer_status: text("offer_status", { enum: ["pending", "sent", "declined"] })
      .notNull()
      .default("pending"),
    expected_join_date: date("expected_join_date", { mode: "string" }),
    actual_join_date: date("actual_join_date", { mode: "string" }),
    trial_result: text("trial_result", { enum: ["pending", "pass", "fail"] })
      .notNull()
      .default("pending"),
    trial_date: date("trial_date", { mode: "string" }),
    mentor_user_id: text("mentor_user_id").references(() => dingtalk_user.user_id),
    mentor_name_snapshot: text("mentor_name_snapshot"),
    contract_status: text("contract_status", { enum: ["pending", "signed", "declined"] })
      .notNull()
      .default("pending"),
    leave_date: date("leave_date", { mode: "string" }),
    leave_reason: text("leave_reason"),
    notes: text("notes"),
    source_key: text("source_key"),
    legacy_business_candidate_id: text("legacy_business_candidate_id"),
    created_by_user_id: text("created_by_user_id").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_source: unique("uq_recruitment_application_source").on(t.source_key),
    idx_stage_date: index("idx_recruitment_application_stage_date").on(t.stage, t.invited_date),
    idx_recruiter: index("idx_recruitment_application_recruiter").on(t.recruiter_user_id),
    idx_project: index("idx_recruitment_application_project").on(t.project),
    idx_candidate: index("idx_recruitment_application_candidate").on(t.candidate_id),
  }),
);

export const recruitment_stage_event = pgTable(
  "recruitment_stage_event",
  {
    id: serial("id").primaryKey(),
    application_id: text("application_id")
      .notNull()
      .references(() => recruitment_application.id, { onDelete: "cascade" }),
    actor_user_id: text("actor_user_id"),
    event_type: text("event_type").notNull(),
    from_stage: text("from_stage"),
    to_stage: text("to_stage"),
    occurred_at: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => ({
    idx_application_time: index("idx_recruitment_stage_event_application_time").on(
      t.application_id,
      t.occurred_at,
    ),
  }),
);

export const recruitment_demand = pgTable(
  "recruitment_demand",
  {
    id: text("id").primaryKey(),
    month: date("month", { mode: "string" }).notNull(),
    category: text("category"),
    project: text("project").notNull(),
    target_count: integer("target_count").notNull(),
    notes: text("notes"),
    created_by_user_id: text("created_by_user_id").notNull(),
    updated_by_user_id: text("updated_by_user_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uq_month_project: unique("uq_recruitment_demand_month_project").on(t.month, t.project),
    idx_month: index("idx_recruitment_demand_month").on(t.month),
  }),
);
