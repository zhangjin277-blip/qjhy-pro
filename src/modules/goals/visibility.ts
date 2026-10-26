import { sql, type SQL } from "drizzle-orm";
import { business_goal as goals } from "@/db/schema/goals";
import type { GoalAccess } from "./types";

/** List-only grant: an active personal allocation exposes its published parent group.
 * Keep this separate from goalScopeSql, which also authorizes mutations and history.
 */
export function participatingTeamScopeSql(actor: GoalAccess): SQL {
  if (actor.scope === "none" || actor.delegatedIds !== null) return sql`false`;
  return sql`(
    ${goals.status} = 'published'
    AND ${goals.team_parent_id} IS NULL
    AND ${goals.binding}->>'selection' IN ('all', 'accounts')
    AND EXISTS (
      SELECT 1 FROM ${goals} AS participant
      JOIN ${goals} AS team_root ON team_root.id = participant.team_parent_id
      WHERE participant.owner_ids ? ${actor.userId}
        AND participant.deleted_at IS NULL AND participant.status <> 'closed'
        AND participant.binding->>'selection' = 'operators'
        AND team_root.deleted_at IS NULL AND team_root.status = 'published'
        AND team_root.team_parent_id IS NULL
        AND team_root.binding->>'selection' IN ('all', 'accounts')
        AND participant.period = team_root.period
        AND participant.project = team_root.project
        AND participant.dept_id IS NOT DISTINCT FROM team_root.dept_id
        AND participant.binding->>'source' = team_root.binding->>'source'
        AND participant.binding->>'product' = team_root.binding->>'product'
        AND ${goals.period} = team_root.period
        AND ${goals.project} = team_root.project
        AND ${goals.line} = team_root.line
        AND ${goals.dept_id} IS NOT DISTINCT FROM team_root.dept_id
        AND ${goals.binding}->>'source' = team_root.binding->>'source'
        AND ${goals.binding}->>'product' = team_root.binding->>'product'
        AND ${goals.owner_ids} @> team_root.owner_ids AND ${goals.owner_ids} <@ team_root.owner_ids
        AND ${goals.owner_labels} @> team_root.owner_labels AND ${goals.owner_labels} <@ team_root.owner_labels
    )
  )`;
}
