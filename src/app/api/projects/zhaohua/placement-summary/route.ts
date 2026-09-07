import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getCurrentDingtalkUser, requireUser } from "@/lib/auth/page-auth";
import { resolvePlacementScope } from "@/modules/placement/server";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest): Promise<NextResponse> {
  await requireUser();
  const identity = await getCurrentDingtalkUser();
  if (identity.kind !== "ok") return NextResponse.json({ error: "未登录" }, { status: 401 });
  const scope = await resolvePlacementScope(identity.dingtalkUserId, identity.isEmergency);
  const from = request.nextUrl.searchParams.get("from") ?? "1900-01-01";
  const to = request.nextUrl.searchParams.get("to") ?? "2999-12-31";
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
    return NextResponse.json({ error: "日期范围无效" }, { status: 400 });
  }

  const scopeClause =
    scope.kind === "all"
      ? sql`TRUE`
      : scope.kind === "reject" || scope.ids.length === 0
        ? sql`FALSE`
        : sql`p.attributed_dingtalk_user_id = ANY(ARRAY[${sql.join(
            scope.ids.map((id) => sql`${id}`),
            sql`, `,
          )}]::text[])`;

  // 部分旧数据库尚未执行 anchor_type 迁移；先退化为排班归因筛选，避免汇总接口整体失败。
  const anchorTypeColumn = await db.execute(sql`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'live_anchor' AND column_name = 'anchor_type'
    LIMIT 1
  `);
  const hasAnchorType = (anchorTypeColumn as unknown as unknown[]).length > 0;
  const anchorTypeClause = hasAnchorType ? sql`AND la.anchor_type = '竞价主播'` : sql``;

  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(p.cost_yuan), 0)::float AS cost,
      COALESCE(SUM(p.start_download), 0)::int AS clicks,
      COALESCE(SUM(p.activations), 0)::int AS added,
      COUNT(DISTINCT p.attributed_dingtalk_user_id)
        FILTER (WHERE p.attributed_dingtalk_user_id IS NOT NULL)::int AS anchor_count
    FROM placement_row p
    JOIN live_anchor la
      ON la.dingtalk_user_id = p.attributed_dingtalk_user_id
     ${anchorTypeClause}
    WHERE p.date BETWEEN ${from} AND ${to}
      AND p.attributed_dingtalk_user_id IS NOT NULL
      AND p.attribution_source IS NOT NULL
      AND ${scopeClause}
  `);
  const row = (rows as unknown as Record<string, unknown>[])[0] ?? {};
  const cost = Number(row.cost ?? 0);
  const clicks = Number(row.clicks ?? 0);
  const added = Number(row.added ?? 0);
  return NextResponse.json({
    cost,
    clicks,
    added,
    anchorCount: Number(row.anchor_count ?? 0),
    addedCost: added > 0 ? cost / added : null,
    clickRate: clicks > 0 ? added / clicks : null,
  });
}
