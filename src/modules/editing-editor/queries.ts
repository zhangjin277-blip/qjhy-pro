import "server-only";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export interface EditorOption {
  userId: string;
  name: string;
}

/**
 * 获取剪辑师列表。
 * 规则：
 * 1. 显式标 position='剪辑' 的用户；OR
 * 2. 在钉钉「后期」部门或其直接子部门中，且未被显式标其他岗位的用户。
 * Admin 可在 /admin/permissions 给编剧等成员设置 position='编剧'（或任意非"剪辑"值）将其排除。
 */
export async function listEditors(): Promise<EditorOption[]> {
  const rows = (await db.execute<{ user_id: string; name: string }>(sql`
    WITH editor_depts AS (
      -- 名为「后期」的部门 + 其所有直接子部门
      SELECT dept_id FROM dingtalk_dept WHERE name = '后期'
      UNION
      SELECT d.dept_id FROM dingtalk_dept d
      JOIN dingtalk_dept p ON p.dept_id = d.parent_id
      WHERE p.name = '后期'
    )
    SELECT DISTINCT u.user_id, u.name
    FROM dingtalk_user u
    LEFT JOIN user_position_override o ON o.user_id = u.user_id
    WHERE u.active = true
      AND (
        -- 显式标"剪辑"岗位
        o.position = '剪辑'
        -- 或在后期相关部门，且没有被显式标其他岗位
        OR (
          (o.position IS NULL OR o.position = '剪辑')
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(u.dept_ids) AS dept_id
            WHERE dept_id IN (SELECT dept_id::text FROM editor_depts)
          )
        )
      )
    ORDER BY u.name ASC
  `)) as unknown as { user_id: string; name: string }[];

  return rows.map((r) => ({ userId: r.user_id, name: r.name }));
}
