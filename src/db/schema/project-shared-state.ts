import { index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/** Small, team-visible project state. Large binary assets must be stored outside PostgreSQL. */
export const project_shared_state = pgTable(
  "project_shared_state",
  {
    project_key: text("project_key").notNull(),
    state_key: text("state_key").notNull(),
    payload: jsonb("payload").notNull().default({}),
    revision: integer("revision").notNull().default(1),
    updated_by: text("updated_by").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      name: "project_shared_state_pk",
      columns: [table.project_key, table.state_key],
    }),
    updatedAtIdx: index("idx_project_shared_state_updated_at").on(table.updated_at),
  }),
);
