/**
 * 直播间平面图：布局配置 + 房号归一化 + 房卡状态判定。
 * client-safe（纯数据 + 纯函数，不碰 DB）。
 *
 * 布局按老系统（PRO3 直播间管理）平面图 1:1 转录，坐标为网格单位：
 * col/row 从 1 开始，w/h 为跨度。每个 section 一张独立 CSS grid。
 * 房号忌 4（无 x4/x14/x24），是实际门牌就这么编的，不是漏抄。
 * 大直播间 D1-D5 当前库里没有对应 live_room，先按功能区渲染；
 * 若以后建了 D 房号，把对应 cell 的 kind 改成 "room" 即可接上数据。
 */

export interface FloorCellRoom {
  kind: "room";
  roomNo: string; // 展示用房号（'A区-01'），匹配时会归一化
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface FloorCellZone {
  kind: "zone";
  label: string;
  sub?: string; // 面积等副标签
  col: number;
  row: number;
  w: number;
  h: number;
}

export type FloorCell = FloorCellRoom | FloorCellZone;

export interface FloorSection {
  key: string;
  title?: string; // 分区标题（如 'C 区'）；不填不显示
  columns: number;
  cells: FloorCell[];
}

const room = (roomNo: string, col: number, row: number, w = 3, h = 1): FloorCellRoom => ({
  kind: "room",
  roomNo,
  col,
  row,
  w,
  h,
});

const zone = (
  label: string,
  col: number,
  row: number,
  w: number,
  h = 1,
  sub?: string,
): FloorCellZone => ({ kind: "zone", label, sub, col, row, w, h });

export const FLOOR_SECTIONS: FloorSection[] = [
  {
    key: "ab",
    columns: 44,
    cells: [
      // ── Row 1：A 区首排（宽格）──
      zone("舞蹈室", 1, 1, 4),
      room("A区-01", 5, 1),
      room("A区-02", 8, 1),
      room("A区-03", 11, 1),
      room("A区-05", 14, 1),
      room("A区-06", 17, 1),
      room("A区-07", 20, 1),
      room("A区-08", 23, 1),
      room("A区-09", 26, 1),
      zone("拍摄房", 29, 1, 12, 1, "60㎡"),
      zone("大直播间1", 41, 1, 4, 4, "D1 · 160㎡"),
      // ── Row 2：A 区次排（窄格）──
      zone("机房", 1, 2, 4, 1, "16㎡"),
      room("A区-10", 5, 2, 2),
      room("A区-11", 7, 2, 2),
      room("A区-12", 9, 2, 2),
      room("A区-13", 11, 2, 2),
      room("A区-15", 13, 2, 2),
      room("A区-16", 15, 2, 2),
      zone("休闲区", 17, 2, 3, 1, "19㎡"),
      room("A区-17", 20, 2, 2),
      room("A区-19", 22, 2, 2),
      room("A区-20", 24, 2, 2),
      room("A区-21", 26, 2, 2),
      room("A区-22", 28, 2, 2),
      room("A区-23", 30, 2, 2),
      room("A区-25", 32, 2, 2),
      zone("茶水间", 34, 2, 3),
      room("A区-26", 37, 2, 2),
      room("A区-27", 39, 2, 2),
      // ── Row 3：B 区首排 ──
      zone("IT仓库", 1, 3, 4, 1, "9㎡"),
      room("B区-01", 5, 3),
      room("B区-02", 8, 3),
      room("B区-03", 11, 3),
      room("B区-05", 14, 3),
      zone("休闲区", 17, 3, 2, 1, "19㎡"),
      room("B区-06", 19, 3),
      room("B区-07", 22, 3),
      room("B区-08", 25, 3),
      room("B区-09", 28, 3),
      room("B区-10", 31, 3),
      room("B区-11", 34, 3),
      // ── Row 4：B 区次排 ──
      room("B区-12", 1, 4, 6),
      zone("复盘室4", 7, 4, 2, 1, "6㎡"),
      zone("复盘室5", 9, 4, 2, 1, "6㎡"),
      room("B区-13", 11, 4),
      room("B区-15", 14, 4),
      zone("休息区", 17, 4, 2),
      room("B区-16", 19, 4),
      room("B区-17", 22, 4),
      room("B区-19", 25, 4),
      room("B区-20", 28, 4),
      room("B区-21", 31, 4),
      room("B区-22", 34, 4),
    ],
  },
  {
    key: "c",
    title: "C 区",
    columns: 40,
    cells: [
      // ── Row 1 ──
      zone("机房", 1, 1, 4),
      room("C区-01", 5, 1, 4),
      room("C区-02", 9, 1, 4),
      room("C区-03", 13, 1, 4),
      room("C区-05", 17, 1, 4),
      room("C区-06", 21, 1, 4),
      zone("大直播间5", 26, 1, 5, 2, "D5"),
      zone("大直播间3", 31, 1, 5, 2, "D3 · 148㎡"),
      // ── Row 2 ──
      zone("机房仓", 1, 2, 4),
      room("C区-07", 21, 2, 4),
      // ── Row 3 ──
      zone("业务仓", 1, 3, 4),
      room("C区-11", 9, 3, 4),
      room("C区-10", 13, 3, 4),
      room("C区-09", 17, 3, 4),
      room("C区-08", 21, 3, 4),
      zone("大直播间2", 31, 3, 5, 2, "D2 · 160㎡"),
      // ── Row 4 ──
      zone("会议室", 1, 4, 2),
      zone("行政仓", 3, 4, 2),
      room("C区-12", 7, 4, 4),
      room("C区-15", 13, 4, 4),
      room("C区-17", 19, 4, 4),
      // ── Row 5 ──
      room("C区-13", 7, 5, 4),
      room("C区-16", 13, 5, 4),
      room("C区-19", 19, 5, 4),
    ],
  },
];

/**
 * 房号归一化：'A1' / 'A01' / 'A区-01' / 'a区-1' / 'B17' → 'A-01' / 'B-17'。
 * 库里 room_no 格式混杂（PRO3 迁移 + 手维护），两边归一后再匹配。
 * 不认识的格式返回 null（调用方进「未上图」兜底，不静默丢）。
 */
export function normalizeRoomNo(raw: string): string | null {
  const m = raw
    .trim()
    .toUpperCase()
    .match(/^([A-Z])\s*区?\s*[-–—]?\s*(\d{1,3})$/);
  if (!m) return null;
  const [, zoneLetter, num] = m;
  return `${zoneLetter}-${String(Number(num)).padStart(2, "0")}`;
}

/** 产品全名 → 平面图 tag 短名（老系统口径） */
export const PRODUCT_SHORT: Record<string, string> = {
  捕鱼大作战: "大作战",
  途游斗地主: "斗地主",
  途游休闲捕鱼: "休闲捕鱼",
  电玩捕鱼: "电玩捕鱼",
  三国冰河时代: "三冰",
  线上招募: "线上招募",
};

export function productShortName(product: string): string {
  return PRODUCT_SHORT[product] ?? product;
}

// ── 房卡状态判定（纯函数，服务端组装 view model 时调用）──

export type RoomState =
  | "living_checkin" // 在播·已打卡（最高优先级）
  | "living_crawler" // 在播·未打卡（仅爬虫 trend 信号）
  | "rest" // 今日休（所有默认排班绑定主播今天都休）
  | "idle" // 有账号但无在播信号
  | "vacant"; // 没有账号绑定该房间

export interface RoomAccountInput {
  product: string;
  /** in_progress 打卡（同账号至多一条，DB 唯一索引保证）。startAtLabel：今天 'HH:mm'，跨天 'MM-DD HH:mm' */
  checkin: { anchorName: string; startAtLabel: string } | null;
  /** platform_account_id 在 trend 最近 15 分钟有快照 */
  trendActive: boolean;
  /** 今天生效的默认排班绑定的 rest_days（ISO weekday 1-7） */
  bindingRestDays: number[][];
}

export interface RoomCellView {
  state: RoomState;
  /** 去重后的产品短名（展示最多 2 个，多的 +N 由 UI 处理） */
  products: string[];
  /** living_checkin 时按开播时间升序的打卡列表 */
  checkins: { anchorName: string; startAtLabel: string }[];
}

export function deriveRoomView(
  accounts: RoomAccountInput[],
  todayIsoWeekday: number,
): RoomCellView {
  const products = [...new Set(accounts.map((a) => productShortName(a.product)))];

  if (accounts.length === 0) return { state: "vacant", products, checkins: [] };

  const checkins = accounts
    .flatMap((a) => (a.checkin ? [a.checkin] : []))
    .sort((a, b) => a.startAtLabel.localeCompare(b.startAtLabel));
  if (checkins.length > 0) return { state: "living_checkin", products, checkins };

  if (accounts.some((a) => a.trendActive))
    return { state: "living_crawler", products, checkins: [] };

  // 今日休：每个账号都有绑定，且所有绑定的 rest_days 都含今天
  const allRestDays = accounts.flatMap((a) => a.bindingRestDays);
  const everyAccountBound = accounts.every((a) => a.bindingRestDays.length > 0);
  if (
    everyAccountBound &&
    allRestDays.length > 0 &&
    allRestDays.every((days) => days.includes(todayIsoWeekday))
  ) {
    return { state: "rest", products, checkins: [] };
  }

  return { state: "idle", products, checkins: [] };
}
