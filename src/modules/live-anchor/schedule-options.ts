import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { listAnchors } from "./queries";

/** 排班候选：已建档主播，以及合作主播部门树下的在职成员。 */
export async function listScheduleAnchorOptions(): Promise<
  { dingtalk_user_id: string; name: string }[]
> {
  const [profiles, departmentUsers] = await Promise.all([
    listAnchors({}),
    db.execute<{ user_id: string; name: string }>(sql`
      WITH RECURSIVE anchor_departments AS (
        SELECT dept_id FROM dingtalk_dept WHERE dept_id = '728935814'
        UNION
        SELECT d.dept_id FROM dingtalk_dept d
        JOIN anchor_departments parent ON d.parent_id = parent.dept_id
      )
      SELECT user_id, name FROM dingtalk_user
      WHERE active = true
        AND dept_ids ?| ARRAY(SELECT dept_id FROM anchor_departments)
      ORDER BY name
    `),
  ]);
  const options = new Map<string, { dingtalk_user_id: string; name: string }>();
  for (const profile of profiles) {
    options.set(profile.dingtalk_user_id, {
      dingtalk_user_id: profile.dingtalk_user_id,
      name: profile.name,
    });
  }
  for (const user of departmentUsers) {
    if (!options.has(user.user_id)) {
      options.set(user.user_id, { dingtalk_user_id: user.user_id, name: user.name });
    }
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"));
}
