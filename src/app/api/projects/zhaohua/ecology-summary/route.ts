import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { requireUser } from "@/lib/auth/page-auth";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    await requireUser();
    const from = request.nextUrl.searchParams.get("date_from");
    const to = request.nextUrl.searchParams.get("date_to");
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "INVALID_DATE" }, { status: 400 });
    }
    const result = await db.execute(sql`
      WITH roster AS (
        SELECT item->>'operator' AS operator, item->>'anchorId' AS anchor_id
        FROM project_shared_state state,
          LATERAL jsonb_array_elements(COALESCE(state.payload->'anchors', '[]'::jsonb)) item
        WHERE state.project_key = 'zhaohua' AND state.state_key = 'ecology_roster'
          AND item->>'anchorId' IS NOT NULL AND item->>'anchorId' <> ''
      ),
      daily AS (
        SELECT r.operator,
          COALESCE(SUM(ad.total_fan_ticket), 0)::numeric AS fan,
          COALESCE(SUM(ad.live_duration_1d), 0)::numeric AS live_hours,
          COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0)::numeric AS active,
          COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS activate,
          COUNT(DISTINCT ad.anchor_id) FILTER (WHERE ad.live_duration_1d > 0 AND COALESCE(mg.live_duration, 0) > 0)::numeric AS rod
        FROM roster r
        LEFT JOIN anchor_daily ad ON ad.anchor_id = r.anchor_id AND ad.date >= ${from} AND ad.date <= ${to}
        LEFT JOIN anchor_minigame_daily mg ON mg.anchor_id = ad.anchor_id AND mg.date = ad.date
        GROUP BY r.operator
      ),
      flow AS (
        SELECT r.operator, COALESCE(SUM(mg.before_divided_income), 0)::numeric AS project_flow
        FROM roster r
        LEFT JOIN anchor_minigame_daily mg ON mg.anchor_id = r.anchor_id AND mg.date >= ${from} AND mg.date <= ${to}
        GROUP BY r.operator
      )
      SELECT d.operator, d.fan, d.live_hours, d.active, d.activate, d.rod, f.project_flow
      FROM daily d JOIN flow f ON f.operator IS NOT DISTINCT FROM d.operator
      ORDER BY d.operator NULLS LAST
    `);
    const profiles = await db.execute(sql`
      SELECT ap.anchor_id, ap.nick_name, ap.avatar, ap.aweme_display_id
      FROM anchor_profile ap
      WHERE ap.anchor_id IN (
        SELECT item->>'anchorId'
        FROM project_shared_state state,
          LATERAL jsonb_array_elements(COALESCE(state.payload->'anchors', '[]'::jsonb)) item
        WHERE state.project_key = 'zhaohua' AND state.state_key = 'ecology_roster'
          AND item->>'anchorId' IS NOT NULL AND item->>'anchorId' <> ''
      )
    `);
    const anchorMetrics = await db.execute(sql`
      WITH roster AS (
        SELECT item->>'operator' AS operator, item->>'anchorId' AS anchor_id
        FROM project_shared_state state,
          LATERAL jsonb_array_elements(COALESCE(state.payload->'anchors', '[]'::jsonb)) item
        WHERE state.project_key = 'zhaohua' AND state.state_key = 'ecology_roster'
          AND item->>'anchorId' IS NOT NULL AND item->>'anchorId' <> ''
      )
      SELECT r.operator, r.anchor_id,
        COALESCE(SUM(ad.total_fan_ticket), 0)::numeric AS fan,
        COALESCE(SUM(ad.live_duration_1d), 0)::numeric AS live_hours,
        COALESCE(SUM(mg.gm_active_ucnt), 0)::numeric AS activate,
        COALESCE(SUM(mg.before_divided_income), 0)::numeric AS project_flow,
        COUNT(DISTINCT ad.date) FILTER (WHERE ad.live_duration_1d > 0)::numeric AS active,
        COUNT(DISTINCT ad.date) FILTER (WHERE ad.live_duration_1d > 0 AND COALESCE(mg.live_duration, 0) > 0)::numeric AS rod
      FROM roster r
      LEFT JOIN anchor_daily ad ON ad.anchor_id = r.anchor_id AND ad.date >= ${from} AND ad.date <= ${to}
      LEFT JOIN anchor_minigame_daily mg ON mg.anchor_id = r.anchor_id AND mg.date = ad.date
      GROUP BY r.operator, r.anchor_id
    `);
    return NextResponse.json({
      rows: (result as unknown as Record<string, unknown>[]).map((row) => ({
        operator: row.operator ?? "未分配",
        fan: Number(row.fan ?? 0),
        liveHours: Number(row.live_hours ?? 0),
        active: Number(row.active ?? 0),
        activate: Number(row.activate ?? 0),
        rod: Number(row.rod ?? 0),
        projectFlow: Number(row.project_flow ?? 0),
      })),
      profiles: (profiles as unknown as Record<string, unknown>[]).map((row) => ({
        anchorId: String(row.anchor_id),
        nickName: row.nick_name ?? null,
        avatar: row.avatar ?? null,
        douyinId: row.aweme_display_id ?? null,
      })),
      anchorMetrics: (anchorMetrics as unknown as Record<string, unknown>[]).map((row) => ({
        operator: row.operator ?? "未分配",
        anchorId: String(row.anchor_id),
        fan: Number(row.fan ?? 0),
        liveHours: Number(row.live_hours ?? 0),
        activate: Number(row.activate ?? 0),
        projectFlow: Number(row.project_flow ?? 0),
        active: Number(row.active ?? 0),
        rod: Number(row.rod ?? 0),
      })),
    });
  } catch (error) {
    console.error("[/api/projects/zhaohua/ecology-summary]", error);
    return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
  }
}
