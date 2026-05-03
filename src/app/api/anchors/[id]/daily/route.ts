import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { anchor_profile, broker_user_mapping, dingtalk_user } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { resolvePermission, getManagedDeptIds } from "@/modules/permissions/server";
import { getAnchorDaily } from "@/modules/anchors/server";

const ParamsSchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * GET /api/anchors/:id/daily?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
 *
 * 返回某主播在指定日期范围的日明细 + 同期对比。
 * 权限：只能看自己 scope 内的主播；不在范围内返回 403。
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: anchorId } = await ctx.params;
  if (!anchorId) return NextResponse.json({ error: "MISSING_ANCHOR_ID" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const parsed = ParamsSchema.safeParse({
    date_from: sp.get("date_from"),
    date_to: sp.get("date_to"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_PARAMS", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { date_from, date_to } = parsed.data;

  // ── 权限检查 ─────────────────────────────────────────────
  const isEmergency = session.user.email === "emergency@qjhy.local";
  let dingtalkUserId: string;
  if (isEmergency) {
    dingtalkUserId = session.user.id;
  } else {
    const [du] = await db
      .select({ user_id: dingtalk_user.user_id })
      .from(dingtalk_user)
      .where(eq(dingtalk_user.unionid, session.user.id));
    if (!du) return NextResponse.json({ error: "AUTH_USER_NOT_SYNCED" }, { status: 403 });
    dingtalkUserId = du.user_id;
  }

  const perm = await resolvePermission(dingtalkUserId);
  if (perm.scope === "none") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  // 验证 anchor 可见性（scope=all 直接通过）
  if (perm.scope !== "all") {
    let visibleBrokerIds: string[] = [];

    if (perm.scope === "self") {
      const myBroker = await db
        .select({ broker_id: broker_user_mapping.broker_id })
        .from(broker_user_mapping)
        .where(eq(broker_user_mapping.dingtalk_user_id, dingtalkUserId));
      visibleBrokerIds = myBroker.map((m) => m.broker_id);
    } else if (perm.scope === "team") {
      const deptIds = await getManagedDeptIds(dingtalkUserId);
      if (deptIds.length === 0) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const teamUsers = await db
        .select({ user_id: dingtalk_user.user_id })
        .from(dingtalk_user)
        .where(
          sql`${dingtalk_user.dept_ids} ?| ${sql.raw(`ARRAY[${deptIds.map((d) => `'${d.replace(/'/g, "''")}'`).join(",")}]::text[]`)}`,
        );
      if (teamUsers.length === 0) {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
      const teamBrokers = await db
        .select({ broker_id: broker_user_mapping.broker_id })
        .from(broker_user_mapping)
        .where(
          inArray(
            broker_user_mapping.dingtalk_user_id,
            teamUsers.map((u) => u.user_id),
          ),
        );
      visibleBrokerIds = teamBrokers.map((m) => m.broker_id);
    }

    if (visibleBrokerIds.length === 0) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    const [hit] = await db
      .select({ anchor_id: anchor_profile.anchor_id })
      .from(anchor_profile)
      .where(
        and(
          eq(anchor_profile.anchor_id, anchorId),
          inArray(anchor_profile.broker_id, visibleBrokerIds),
        ),
      )
      .limit(1);
    if (!hit) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  // ── 拉数据 ─────────────────────────────────────────────
  const data = await getAnchorDaily(anchorId, date_from, date_to);
  return NextResponse.json(data);
}
