import { redirect } from "next/navigation";
import { getCurrentDingtalkUser } from "@/lib/auth/page-auth";
import { getFloorPlanData } from "@/modules/live-room/server";
import {
  FLOOR_SECTIONS,
  deriveRoomView,
  normalizeRoomNo,
  type RoomAccountInput,
} from "@/modules/live-room";
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

  // 今天星期几（ISO 1-7，Asia/Shanghai）
  const shanghaiNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const todayIsoWeekday = shanghaiNow.getDay() === 0 ? 7 : shanghaiNow.getDay();

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
  const restDaysByAccountId = new Map<string, number[][]>();
  for (const b of data.bindings) {
    restDaysByAccountId.set(b.account_id, [
      ...(restDaysByAccountId.get(b.account_id) ?? []),
      b.rest_days,
    ]);
  }

  const sections: SectionVM[] = FLOOR_SECTIONS.map((sec) => ({
    key: sec.key,
    title: sec.title,
    columns: sec.columns,
    rowHeightPx: sec.rowHeightPx,
    cells: sec.cells.map((cell) => {
      if (cell.kind === "zone") return cell;
      const key = normalizeRoomNo(cell.roomNo) as string;
      const roomIds = roomIdsByKey.get(key) ?? [];
      const accounts = roomIds.flatMap((id) => accountsByRoomId.get(id) ?? []);
      const inputs: RoomAccountInput[] = accounts.map((acc) => {
        const checkin = checkinByAccountId.get(acc.id);
        return {
          product: acc.product,
          checkin: checkin
            ? {
                anchorName: checkin.anchor_name,
                startAtLabel: startAtLabel(checkin.start_at, new Date()),
              }
            : null,
          trendActive: acc.platform_account_id !== null && trendActive.has(acc.platform_account_id),
          bindingRestDays: restDaysByAccountId.get(acc.id) ?? [],
        };
      });
      return { ...cell, view: deriveRoomView(inputs, todayIsoWeekday) };
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
