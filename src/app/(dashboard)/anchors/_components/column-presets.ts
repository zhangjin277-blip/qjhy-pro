import { ALL_COLUMNS, type ColumnDef } from "@/modules/anchors";
export { ALL_COLUMNS, ALL_GROUPS } from "@/modules/anchors";
export type { ColumnDef, ColFmt } from "@/modules/anchors";

/** 列 key 集合，用于预设 */
type ColKey = (typeof ALL_COLUMNS)[number]["key"];

// ── 预设字段集 ────────────────────────────────────────────────────────────────

/** 基础常驻列（所有预设都包含；nick_name / project 是 pinned 列，渲染时自动加，不放预设里） */
const BASE_KEYS: ColKey[] = [
  "broker_name",
  "recruit_broker_name",
  "anchor_health_score",
  "total_fans",
];

const AUDIO_KEYS: ColKey[] = [
  "total_fan_ticket",
  "live_fan_ticket_no_guest",
  "property_fan_ticket_no_guest",
  "guest_fan_ticket",
  "subscribe_fan_ticket",
  "star_guard_earn_score",
];

const DURATION_KEYS: ColKey[] = [
  "live_duration",
  "valid_live_duration",
  "live_days",
  "solo_valid_days",
  "new_follow_fans",
];

const SIGN_KEYS: ColKey[] = [
  "broker_name",
  "recruit_broker_name",
  "sign_start_time",
  "sign_end_time",
  "income_percent",
];

export type PresetId = "ddz" | "three" | "guild" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  keys: ColKey[];
}

export const PRESETS: Preset[] = [
  {
    id: "ddz",
    label: "斗地主默认",
    keys: [
      "broker_name",
      "recruit_broker_name",
      "total_fan_ticket",
      "controller_total_amount",
      "show_uv",
      "g_watch_ucnt",
      "g_acu",
      "feed_acu",
      "g_pcu",
      "g_install_finish",
      "g_total_amount",
      "v_total_amount",
    ],
  },
  {
    id: "three",
    label: "三国默认",
    keys: [
      "broker_name",
      "recruit_broker_name",
      "total_fan_ticket",
      "minigame_total_amount",
      "show_uv",
      "watch_uv",
      "mg_watch_ucnt",
      "mg_click_ucnt",
      "mg_active_ucnt",
      "mg_acu",
      "feed_acu",
      "mg_pcu",
      "mg_room_cnt",
      "mg_duration",
    ],
  },
  {
    id: "guild",
    label: "公会管理",
    keys: [...BASE_KEYS, ...SIGN_KEYS, ...AUDIO_KEYS, "g_anchor_income", "mg_anchor_income"],
  },
  {
    id: "custom",
    label: "自定义",
    keys: [...BASE_KEYS, ...AUDIO_KEYS, ...DURATION_KEYS],
  },
];

// v5: 项目列也改为 pinned（自动渲染、不入预设），bump 让旧缓存失效
const STORAGE_KEY_PREFIX = "anchor_columns_v5_";

/** 固定列（pinned: true 的，永远渲染在最前；不参与 customizer） */
export const PINNED_COLUMNS: ColumnDef[] = ALL_COLUMNS.filter((c) => c.pinned);

/** 从 localStorage 读取保存的列配置，SSR 安全（返回 null） */
export function loadSavedColumns(presetId: PresetId): ColKey[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${presetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    // 验证 key 合法 + 过滤掉 pinned 列（pinned 不入预设）
    const validKeys = new Set(ALL_COLUMNS.filter((c) => !c.pinned).map((c) => c.key));
    const filtered = (parsed as string[]).filter((k) => validKeys.has(k as ColKey));
    return filtered.length > 0 ? (filtered as ColKey[]) : null;
  } catch {
    return null;
  }
}

/** 保存列配置到 localStorage */
export function saveColumns(presetId: PresetId, keys: ColKey[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${presetId}`, JSON.stringify(keys));
  } catch {
    // ignore
  }
}

/** 按 key 列表获取列定义，保持顺序 */
export function getColumnsByKeys(keys: ColKey[]): ColumnDef[] {
  const map = new Map(ALL_COLUMNS.map((c) => [c.key, c]));
  return keys.map((k) => map.get(k)).filter(Boolean) as ColumnDef[];
}

/** 按组获取所有列（中栏展示用，pinned 列不显示） */
export function getColumnsByGroup(group: string): ColumnDef[] {
  return ALL_COLUMNS.filter((c) => c.group === group && !c.pinned);
}

/** 按 subGroup 切块返回（保持 ALL_COLUMNS 原顺序）。无 subGroup 的列归入 null 块。 */
export function getColumnsBySubGroup(
  group: string,
): { subGroup: string | null; columns: ColumnDef[] }[] {
  const cols = getColumnsByGroup(group);
  const blocks: { subGroup: string | null; columns: ColumnDef[] }[] = [];
  for (const c of cols) {
    const sg = c.subGroup ?? null;
    const last = blocks[blocks.length - 1];
    if (last && last.subGroup === sg) {
      last.columns.push(c);
    } else {
      blocks.push({ subGroup: sg, columns: [c] });
    }
  }
  return blocks;
}
