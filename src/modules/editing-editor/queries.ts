import "server-only";
import { db } from "@/db/client";
import { dingtalk_user, user_position_override } from "@/db/schema";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

export interface EditorOption {
  userId: string;
  name: string;
}

/**
 * 获取剪辑师列表。
 * 优先 user_position_override.position = '剪辑'，回退 dingtalk_user.title LIKE '%剪辑%'
 */
export async function listEditors(): Promise<EditorOption[]> {
  const rows = await db
    .selectDistinct({
      userId: dingtalk_user.user_id,
      name: dingtalk_user.name,
    })
    .from(dingtalk_user)
    .leftJoin(user_position_override, eq(user_position_override.user_id, dingtalk_user.user_id))
    .where(
      and(
        eq(dingtalk_user.active, true),
        or(
          eq(user_position_override.position, "剪辑"),
          and(isNull(user_position_override.position), sql`${dingtalk_user.title} LIKE '%剪辑%'`),
        ),
      ),
    )
    .orderBy(asc(dingtalk_user.name));

  return rows;
}
