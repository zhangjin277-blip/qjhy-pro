import "server-only";
import { db } from "@/db/client";
import { dingtalk_user, live_account } from "@/db/schema";
import { schedule_override } from "@/db/schema/schedule-override";
import { eq, inArray, sql } from "drizzle-orm";
import { listAccounts } from "@/modules/live-account/server";
import { listScheduleAnchorOptions } from "@/modules/live-anchor/server";
import { listBindings } from "@/modules/live-anchor";
import { listRooms } from "@/modules/live-room/server";
import type { AccountWithRelations } from "@/modules/live-account";
import type { OverrideRowView } from "../_components/schedule-override-tab";

// 直播一部部门 ID — 钉钉权威源（与直播账号页一致）
const LIVE_DEPT_ID = "724640467";

export interface AccountEditDrawerData {
  accounts: AccountWithRelations[];
  bindingsByAccount: Record<
    string,
    {
      id: string;
      account_id: string | null;
      dingtalk_user_id: string;
      anchor_name: string | null;
      time_slots: [string, string][];
      rest_days: number[];
      remark: string | null;
    }[]
  >;
  overridesByAccount: Record<string, OverrideRowView[]>;
  rooms: { id: string; room_no: string }[];
  dingtalkUsers: { user_id: string; name: string; title: string | null; active: boolean }[];
  anchors: { dingtalk_user_id: string; name: string }[];
  placementLabelOptions: string[];
}

/**
 * AccountEditDrawer 的全套支撑数据（从直播账号页的组装逻辑提炼，供平面图等
 * 其他入口复用编辑抽屉）。accounts 按当前用户 scope 过滤——scope 外的账号
 * 不可编辑，调用方自行回落只读展示。
 */
export async function getAccountEditDrawerData(
  dingtalkUserId?: string,
  isEmergency = false,
): Promise<AccountEditDrawerData> {
  const [accounts, allBindings, rooms, anchors, activeUsers, placementLabelRows] =
    await Promise.all([
      listAccounts({}, dingtalkUserId, isEmergency),
      listBindings({}),
      listRooms(dingtalkUserId, isEmergency),
      listScheduleAnchorOptions(),
      db.execute<{ user_id: string; name: string; title: string | null; active: boolean }>(sql`
        WITH RECURSIVE dept_tree AS (
          SELECT dept_id FROM dingtalk_dept WHERE dept_id = ${LIVE_DEPT_ID}
          UNION ALL
          SELECT d.dept_id FROM dingtalk_dept d JOIN dept_tree t ON d.parent_id = t.dept_id
        )
        SELECT user_id, name, title, active
        FROM dingtalk_user
        WHERE active = true
          AND dept_ids ?| ARRAY(SELECT dept_id FROM dept_tree)
        ORDER BY name
      `),
      db
        .selectDistinct({ placement_label: live_account.placement_label })
        .from(live_account)
        .where(sql`${live_account.placement_label} IS NOT NULL`)
        .orderBy(live_account.placement_label),
    ]);

  const bindingsByAccount: AccountEditDrawerData["bindingsByAccount"] = {};
  for (const b of allBindings) {
    if (!b.account_id) continue;
    (bindingsByAccount[b.account_id] ??= []).push({
      id: b.id,
      account_id: b.account_id,
      dingtalk_user_id: b.dingtalk_user_id,
      anchor_name: b.anchor_name,
      time_slots: b.time_slots as [string, string][],
      rest_days: b.rest_days,
      remark: b.remark,
    });
  }

  const allOverrides: OverrideRowView[] =
    accounts.length > 0
      ? (
          await db
            .select({
              id: schedule_override.id,
              account_id: schedule_override.account_id,
              date: schedule_override.date,
              dingtalk_user_id: schedule_override.dingtalk_user_id,
              anchor_name: dingtalk_user.name,
              time_slots: schedule_override.time_slots,
              reason: schedule_override.reason,
            })
            .from(schedule_override)
            .leftJoin(dingtalk_user, eq(schedule_override.dingtalk_user_id, dingtalk_user.user_id))
            .where(
              inArray(
                schedule_override.account_id,
                accounts.map((a) => a.id),
              ),
            )
            .orderBy(schedule_override.date)
        ).map((r) => ({ ...r, time_slots: r.time_slots as [string, string][] }))
      : [];
  const overridesByAccount: Record<string, OverrideRowView[]> = {};
  for (const o of allOverrides) {
    (overridesByAccount[o.account_id] ??= []).push(o);
  }


  return {
    accounts,
    bindingsByAccount,
    overridesByAccount,
    rooms: rooms.map((r) => ({ id: r.id, room_no: r.room_no })),
    dingtalkUsers: activeUsers.map((u) => ({
      user_id: u.user_id,
      name: u.name,
      title: u.title,
      active: u.active,
    })),
    anchors,
    placementLabelOptions: (placementLabelRows as { placement_label: string | null }[])
      .map((r) => r.placement_label)
      .filter((l): l is string => !!l),
  };
}
