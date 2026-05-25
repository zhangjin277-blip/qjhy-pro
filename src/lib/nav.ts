import {
  BarChart3,
  Home,
  MonitorPlay,
  Settings2,
  Shield,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/modules/permissions";

export interface NavLeaf {
  key: string;
  label: string;
  href: string;
  disabled?: boolean;
  /** 此 leaf 属于哪个权限 module；未填表示无需权限（如「我的」），始终可见 */
  module?: ModuleKey;
}

export type NavItem =
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      single: true;
      href: string;
      module?: ModuleKey;
    }
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      single?: false;
      children: NavLeaf[];
    };

export const NAV: NavItem[] = [
  {
    key: "workbench",
    label: "工作台",
    icon: Home,
    single: true,
    href: "/dashboard",
    module: "dashboard",
  },
  {
    key: "anchor",
    label: "主播管理",
    icon: Users,
    children: [
      { key: "anchor-detail", label: "主播明细", href: "/anchors", module: "anchors" },
      { key: "anchor-list", label: "主播列表", href: "/anchors/list", disabled: true },
      { key: "anchor-recruit", label: "主播招募", href: "/anchors/recruit", disabled: true },
      { key: "anchor-profile", label: "主播档案", href: "/anchors/profile", disabled: true },
      { key: "anchor-flow", label: "关系流转", href: "/anchors/flow", disabled: true },
    ],
  },
  {
    key: "data",
    label: "直播数据",
    icon: BarChart3,
    children: [
      { key: "data-board", label: "业务看板", href: "/dashboard", module: "dashboard" },
      { key: "data-placement", label: "投放数据", href: "/placements", module: "placement" },
      { key: "data-realtime", label: "实时数据", href: "/live/realtime", disabled: true },
      { key: "data-daily", label: "主播日报", href: "/live/daily", disabled: true },
      { key: "data-rank", label: "排行榜", href: "/live/rank", disabled: true },
    ],
  },
  {
    key: "live",
    label: "直播管理",
    icon: MonitorPlay,
    children: [
      { key: "live-accounts", label: "直播账号", href: "/live-accounts", module: "live_account" },
      { key: "live-anchors", label: "主播档案", href: "/live-anchors", module: "live_anchor" },
      {
        key: "live-today",
        label: "今日排班",
        href: "/live-accounts/schedule-today",
        module: "live_account",
      },
      {
        key: "live-schedule",
        label: "默认排班",
        href: "/live-accounts/schedule-overview",
        module: "live_account",
      },
      {
        key: "live-checkin",
        label: "开播记录",
        href: "/live-accounts/checkin-history",
        module: "live_account",
      },
    ],
  },
  {
    key: "ops",
    label: "运营管理",
    icon: Settings2,
    children: [
      { key: "ops-room", label: "直播间", href: "/ops/room", disabled: true },
      { key: "ops-campaign", label: "活动", href: "/ops/campaign", disabled: true },
      { key: "ops-play", label: "玩法", href: "/ops/play", disabled: true },
      { key: "ops-notice", label: "公告", href: "/ops/notice", disabled: true },
    ],
  },
  {
    key: "system",
    label: "系统管理",
    icon: Shield,
    children: [
      {
        key: "sys-permission",
        label: "用户与权限",
        href: "/admin/permissions",
        module: "permissions",
      },
      { key: "sys-brokers", label: "经纪人映射", href: "/admin/brokers", module: "permissions" },
      { key: "sys-dept", label: "部门架构", href: "/admin/depts", disabled: true },
      { key: "sys-alias", label: "字段别名", href: "/admin/aliases", disabled: true },
      { key: "sys-crawler", label: "采集监控", href: "/admin/crawler", module: "crawler" },
    ],
  },
  {
    key: "me",
    label: "我的",
    icon: UserCircle2,
    single: true,
    href: "/profile",
  },
];

/**
 * 按 visible modules 过滤 NAV。
 * - leaf 没 module → 始终可见（如「我的」）
 * - leaf 有 module 但不在 visible 里 → 隐藏
 * - section 所有 children 都不可见 → 整个 section 隐藏
 * - bypass=true（emergency / 应急）→ 不过滤
 */
export function filterNavByVisibility(visible: Set<ModuleKey>, bypass = false): NavItem[] {
  if (bypass) return NAV;
  const result: NavItem[] = [];
  for (const item of NAV) {
    if (item.single) {
      if (!item.module || visible.has(item.module)) result.push(item);
      continue;
    }
    const children = item.children.filter((c) => !c.module || visible.has(c.module));
    if (children.length > 0) result.push({ ...item, children });
  }
  return result;
}

/** 当前 pathname 是否激活某个 href */
export function isHrefActive(href: string, pathname: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

/** 当前 pathname 处在哪个 section（用于默认展开） */
export function findActiveSectionKey(pathname: string): string | null {
  for (const sec of NAV) {
    if (sec.single) {
      if (isHrefActive(sec.href, pathname)) return sec.key;
    } else {
      if (sec.children.some((c) => !c.disabled && isHrefActive(c.href, pathname))) return sec.key;
    }
  }
  return null;
}
