import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { GoalBinding } from "@/modules/goals/types";

/** One metric per goal. Owner IDs and department IDs are stable authorization keys. */
export const business_goal = pgTable(
  "business_goal",
  {
    id: text("id").primaryKey(),
    period: text("period").notNull(),
    project: text("project").notNull(),
    line: text("line").notNull(),
    dept_id: text("dept_id"),
    owner_ids: jsonb("owner_ids").$type<string[]>().notNull().default([]),
    owner_labels: jsonb("owner_labels").$type<string[]>().notNull().default([]),
    metric: text("metric").notNull(),
    binding: jsonb("binding").$type<GoalBinding | null>(),
    unit: text("unit").notNull(),
    kind: text("kind", { enum: ["sum", "count", "ratio"] }).notNull(),
    target: doublePrecision("target"),
    weight: doublePrecision("weight"),
    actual: doublePrecision("actual"),
    as_of: date("as_of"),
    evidence: text("evidence").notNull().default(""),
    definition: text("definition").notNull().default(""),
    confirmed: boolean("confirmed").notNull().default(false),
    parent_id: text("parent_id"),
    team_parent_id: text("team_parent_id"),
    status: text("status", { enum: ["draft", "published", "closed"] })
      .notNull()
      .default("draft"),
    version: integer("version").notNull().default(1),
    created_by: text("created_by").notNull(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_business_goal_period").on(t.period),
    index("idx_business_goal_parent").on(t.parent_id),
    index("idx_business_goal_team_parent").on(t.team_parent_id),
  ],
);

export const business_goal_revision = pgTable(
  "business_goal_revision",
  {
    id: text("id").primaryKey(),
    goal_id: text("goal_id")
      .notNull()
      .references(() => business_goal.id),
    action: text("action").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown>>().notNull(),
    reason: text("reason").notNull(),
    actor_id: text("actor_id").notNull(),
    actor_name: text("actor_name").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_business_goal_revision").on(t.goal_id, t.created_at)],
);
