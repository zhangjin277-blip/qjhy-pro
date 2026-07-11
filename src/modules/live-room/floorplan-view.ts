/**
 * 平面图 view model 组装（纯函数，client-safe）。
 * 平面图主页面和电视大屏两个路由共用：getFloorPlanData(server) → buildFloorPlanView(pure) → 渲染。
 */
import { mergeWithOverride } from "@/modules/schedule-override";
import {
  FLOOR_SECTIONS,
  deriveRoomView,
  normalizeRoomNo,
  type FloorCellZone,
  type RoomAccountInput,
  type RoomCellView,
} from "./floorplan";
import type { FloorPlanRawData } from "./queries";

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

/** 今天只显示 HH:mm；跨天（打卡未关/隔夜场）带 MM-DD 防误导 */
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

/** 抽屉里展示的账号明细 */
export interface RoomAccountDetail {
  accountId: string;
  accountName: string;
  platform: string;
  product: string;
  checkin: { anchorName: string; startAtLabel: string } | null;
  /** 爬虫在播：快手 true+null（只知道在播），抖音 true+开播时间 */
  crawlerLiving: boolean;
  crawlerStartLabel: string | null;
  /** 今日排班（含休的主播，restToday 标记），快手恒空 */
  schedule: { anchorName: string; slots: [string, string][]; restToday: boolean }[];
}

export type CellVM =
  | FloorCellZone
  | {
      kind: "room";
      roomNo: string;
      col: number;
      row: number;
      w: number;
      h: number;
      view: RoomCellView;
      detail: RoomAccountDetail[];
    };

export interface SectionVM {
  key: string;
  title?: string;
  zone?: "A" | "B" | "C";
  columns: number;
  rowHeightPx?: number;
  cells: CellVM[];
}

export interface FloorPlanStats {
  livingCheckin: number;
  livingCrawler: number;
  rest: number;
  idle: number;
  vacant: number;
}

export interface FloorPlanViewModel {
  sections: SectionVM[];
  stats: FloorPlanStats;
  unmapped: string[];
  generatedAtHHmm: string;
}

export function buildFloorPlanView(data: FloorPlanRawData, now = new Date()): FloorPlanViewModel {
  // 今天星期几（ISO 1-7）+ 当前时刻，均按 Asia/Shanghai
  const shanghaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  const todayIsoWeekday = shanghaiNow.getDay() === 0 ? 7 : shanghaiNow.getDay();
  const nowHHmm = HHMM.format(now);

  // 归一房号 → room_ids（库里可能同房两种写法并存，合并）
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

  const accountsByRoomId = groupBy(data.accounts, (a) => a.room_id);
  const checkinByAccountId = new Map(data.checkins.map((c) => [c.live_account_id, c]));
  const trendActive = new Set(data.trendActiveMemberIds);
  const douyinLivingByUid = new Map(data.douyinLiving.map((d) => [d.platform_uid, d.start_at]));

  const bindingsByAccountId = groupBy(data.bindings, (b) => b.account_id);
  const overridesByAccountId = groupBy(data.overrides, (o) => o.account_id);
  const segmentsByAccountId = groupBy(data.dailySegments, (s) => s.account_id);
  const anchorNameById = new Map<string, string>([
    ...data.bindings.map((b) => [b.dingtalk_user_id, b.anchor_name] as const),
    ...data.overrides.map((o) => [o.dingtalk_user_id, o.anchor_name] as const),
    ...data.dailySegments.map((s) => [s.dingtalk_user_id, s.anchor_name] as const),
  ]);

  /**
   * 账号今日有效排班（含休标记）：daily segment 存在则整体取代，
   * 否则 default(effective 窗口) + override 合并（同投放归因口径）。
   */
  function effectiveSchedule(
    accountId: string,
  ): { anchorName: string; slots: [string, string][]; restToday: boolean }[] {
    const segments = segmentsByAccountId.get(accountId) ?? [];
    if (segments.length > 0) {
      const byUser = new Map<string, { slots: [string, string][]; rest: boolean }>();
      for (const seg of segments) {
        const entry = byUser.get(seg.dingtalk_user_id) ?? { slots: [], rest: false };
        if (seg.is_rest) entry.rest = true;
        else
          entry.slots.push([
            `${String(seg.start_hour).padStart(2, "0")}:00`,
            `${String(seg.end_hour).padStart(2, "0")}:00`,
          ]);
        byUser.set(seg.dingtalk_user_id, entry);
      }
      return [...byUser.entries()].map(([user, e]) => ({
        anchorName: anchorNameById.get(user) ?? user,
        slots: e.slots,
        restToday: e.rest && e.slots.length === 0,
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
    return effective.map((e) => ({
      anchorName: anchorNameById.get(e.user) ?? e.user,
      slots: e.slots,
      restToday: e.rest_days.includes(todayIsoWeekday),
    }));
  }

  const sections: SectionVM[] = FLOOR_SECTIONS.map((sec) => ({
    key: sec.key,
    title: sec.title,
    zone: sec.zone,
    columns: sec.columns,
    rowHeightPx: sec.rowHeightPx,
    cells: sec.cells.map((cell): CellVM => {
      if (cell.kind === "zone") return cell;
      const key = normalizeRoomNo(cell.roomNo) as string;
      const roomIds = roomIdsByKey.get(key) ?? [];
      const accounts = roomIds.flatMap((id) => accountsByRoomId.get(id) ?? []);

      const detail: RoomAccountDetail[] = [];
      const inputs: RoomAccountInput[] = accounts.map((acc) => {
        const checkinRow = checkinByAccountId.get(acc.id);
        // 快手排班变动大不可信（2026-07-11 用户定）：排班显示与「今日休」只看抖音账号
        const isDouyin = acc.platform === "抖音";

        // 爬虫在播：快手 = trend 有快照（只亮灯）；抖音 = douyin_live_room（带实际开播时间）
        let crawlerLive: RoomAccountInput["crawlerLive"] = null;
        const ksActive =
          !isDouyin && acc.platform_account_id !== null && trendActive.has(acc.platform_account_id);
        if (ksActive) {
          crawlerLive = { startAtLabel: null, startHHmm: null, startedToday: false };
        }
        const dyStart =
          isDouyin && acc.platform_uid !== null
            ? douyinLivingByUid.get(acc.platform_uid)
            : undefined;
        if (dyStart) {
          crawlerLive = {
            startAtLabel: startAtLabel(dyStart, now),
            startHHmm: HHMM.format(dyStart),
            startedToday: MMDD.format(dyStart) === MMDD.format(now),
          };
        }

        const checkin = checkinRow
          ? {
              anchorName: checkinRow.anchor_name,
              startAtLabel: startAtLabel(checkinRow.start_at, now),
            }
          : null;
        const schedule = isDouyin ? effectiveSchedule(acc.id) : [];

        detail.push({
          accountId: acc.id,
          accountName: acc.account_name,
          platform: acc.platform,
          product: acc.product,
          checkin,
          crawlerLiving: crawlerLive !== null,
          crawlerStartLabel: crawlerLive?.startAtLabel ?? null,
          schedule,
        });

        return {
          product: acc.product,
          checkin,
          crawlerLive,
          bindingRestDays: isDouyin
            ? (bindingsByAccountId.get(acc.id) ?? []).map((b) => b.rest_days)
            : [],
          schedule: schedule.filter((s) => !s.restToday),
        };
      });
      return { ...cell, view: deriveRoomView(inputs, todayIsoWeekday, nowHHmm), detail };
    }),
  }));

  const roomViews = sections.flatMap((s) =>
    s.cells.flatMap((c) => (c.kind === "room" ? [c.view] : [])),
  );
  const stats: FloorPlanStats = {
    livingCheckin: roomViews.filter((v) => v.state === "living_checkin").length,
    livingCrawler: roomViews.filter((v) => v.state === "living_crawler").length,
    rest: roomViews.filter((v) => v.state === "rest").length,
    idle: roomViews.filter((v) => v.state === "idle").length,
    vacant: roomViews.filter((v) => v.state === "vacant").length,
  };

  return { sections, stats, unmapped, generatedAtHHmm: HHMM.format(now) };
}
