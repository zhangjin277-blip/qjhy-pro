import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getFloorPlanData } from "@/modules/live-room/server";
import {
  FLOOR_SECTIONS,
  deriveRoomView,
  normalizeRoomNo,
  type RoomAccountInput,
  type ScheduleEntry,
} from "@/modules/live-room";
import { mergeWithOverride } from "@/modules/schedule-override";
import { FloorPlanBoard, type SectionVM } from "./_components/floor-plan-board";

const HHMM = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const MMDD = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
});

/** 今天只显示 HH:mm；跨天的 in_progress（线上有 cron 兜底关，罕见）带 MM-DD 防误导 */
function startAtLabel(startAt: Date, now: Date): string {
  const hhmm = HHMM.format(startAt);
  if (MMDD.format(startAt) === MMDD.format(now)) return hhmm;
  return `${MMDD.format(startAt).replace("/", "-")} ${hhmm}`;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

export default async function FloorPlanPage() {
  const ctx = await getCurrentDingtalkUser();
  if (ctx.kind === "unauth") redirect("/login");
  if (ctx.kind === "user_not_synced") {
    return (
      <div className="p-6 text-sm text-red-600">
        当前账号尚未同步到钉钉用户表，无法计算权限。请联系管理员。
      </div>
    );
  }

  const data = await getFloorPlanData(ctx.dingtalkUserId, ctx.isEmergency);
  if (!data) {
    return <div className="p-6 text-sm text-slate-500">没有直播账号板块的查看权限。</div>;
  }

  // 今天星期几（ISO 1-7）+ 当前时刻 HH:mm，均按 Asia/Shanghai
  const shanghaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const todayIsoWeekday = shanghaiNow.getDay() === 0 ? 7 : shanghaiNow.getDay();
  const nowHHmm = HHMM.format(new Date());

  // 索引：归一房号 → room_ids（库里可能同房两种写法并存，合并）
  const roomIdsByKey = new Map<string, string[]>();
  const unmapped: string[] = [];
  const configKeys = new Set(
    FLOOR_SECTIONS.flatMap((s) =>
      s.cells.flatMap((c) => (c.kind === "room" ? [normalizeRoomNo(c.roomNo) as string] : [])),
    ),
  );
  for (const room of data.rooms) {
    const key = normalizeRoomNo(room.room_no);
    if (!key || !configKeys.has(key)) {
      unmapped.push(room.room_no);
      continue;
    }
    roomIdsByKey.set(key, [...(roomIdsByKey.get(key) ?? []), room.id]);
  }

  const accountsByRoomId = new Map<string, typeof data.accounts>();
  for (const acc of data.accounts) {
    accountsByRoomId.set(acc.room_id, [...(accountsByRoomId.get(acc.room_id) ?? []), acc]);
  }
  const checkinByAccountId = new Map(data.checkins.map((c) => [c.live_account_id, c]));
  const trendActive = new Set(data.trendActiveMemberIds);

  const bindingsByAccountId = groupBy(data.bindings, (b) => b.account_id);
  const overridesByAccountId = groupBy(data.overrides, (o) => o.account_id);
  const segmentsByAccountId = groupBy(data.dailySegments, (s) => s.account_id);
  const anchorNameById = new Map<string, string>([
    ...data.bindings.map((b) => [b.dingtalk_user_id, b.anchor_name] as const),
    ...data.overrides.map((o) => [o.dingtalk_user_id, o.anchor_name] as const),
    ...data.dailySegments.map((s) => [s.dingtalk_user_id, s.anchor_name] as const),
  ]);

  /** 账号今日有效排班：daily segment 存在则整体取代，否则 default+override 合并（同归因口径），剔除今天休的主播 */
  function effectiveSchedule(accountId: string): ScheduleEntry[] {
    const segments = segmentsByAccountId.get(accountId) ?? [];
    if (segments.length > 0) {
      const byUser = new Map<string, [string, string][]>();
      for (const seg of segments) {
        if (seg.is_rest) continue;
        const slot: [string, string] = [
          `${String(seg.start_hour).padStart(2, "0")}:00`,
          `${String(seg.end_hour).padStart(2, "0")}:00`,
        ];
        byUser.set(seg.dingtalk_user_id, [...(byUser.get(seg.dingtalk_user_id) ?? []), slot]);
      }
      return [...byUser.entries()].map(([user, slots]) => ({
        anchorName: anchorNameById.get(user) ?? user,
        slots,
      }));
    }
    const effective = mergeWithOverride(
      (bindingsByAccountId.get(accountId) ?? []).map((b) => ({
        user: b.dingtalk_user_id,
        slots: b.time_slots,
        rest_days: b.rest_days,
      })),
      (overridesByAccountId.get(accountId) ?? []).map((o) => ({
        user: o.dingtalk_user_id,
        slots: o.time_slots,
      })),
    );
    return effective
      .filter((e) => !e.rest_days.includes(todayIsoWeekday))
      .map((e) => ({ anchorName: anchorNameById.get(e.user) ?? e.user, slots: e.slots }));
  }

  const sections: SectionVM[] = FLOOR_SECTIONS.map((sec) => ({
    key: sec.key,
    title: sec.title,
    zone: sec.zone,
    columns: sec.columns,
    rowHeightPx: sec.rowHeightPx,
    cells: sec.cells.map((cell) => {
      if (cell.kind === "zone") return cell;
      const key = normalizeRoomNo(cell.roomNo) as string;
      const roomIds = roomIdsByKey.get(key) ?? [];
      const accounts = roomIds.flatMap((id) => accountsByRoomId.get(id) ?? []);
      const inputs: RoomAccountInput[] = accounts.map((acc) => {
        const checkin = checkinByAccountId.get(acc.id);
        // 快手排班变动大不可信（2026-07-11 用户定）：排班显示与「今日休」只看抖音账号
        const isDouyin = acc.platform === "抖音";
        return {
          product: acc.product,
          checkin: checkin
            ? {
                anchorName: checkin.anchor_name,
                startAtLabel: startAtLabel(checkin.start_at, new Date()),
              }
            : null,
          trendActive: acc.platform_account_id !== null && trendActive.has(acc.platform_account_id),
          bindingRestDays: isDouyin
            ? (bindingsByAccountId.get(acc.id) ?? []).map((b) => b.rest_days)
            : [],
          schedule: isDouyin ? effectiveSchedule(acc.id) : [],
        };
      });
      return { ...cell, view: deriveRoomView(inputs, todayIsoWeekday, nowHHmm) };
    }),
  }));

  const roomViews = sections.flatMap((s) =>
    s.cells.flatMap((c) => (c.kind === "room" ? [c.view] : [])),
  );
  const stats = {
    livingCheckin: roomViews.filter((v) => v.state === "living_checkin").length,
    livingCrawler: roomViews.filter((v) => v.state === "living_crawler").length,
    rest: roomViews.filter((v) => v.state === "rest").length,
    idle: roomViews.filter((v) => v.state === "idle").length,
    vacant: roomViews.filter((v) => v.state === "vacant").length,
  };

  return (
    <FloorPlanBoard
      sections={sections}
      stats={stats}
      unmapped={unmapped}
      generatedAtHHmm={HHMM.format(new Date())}
    />
  );
}
