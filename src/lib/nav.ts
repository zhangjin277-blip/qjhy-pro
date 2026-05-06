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

export interface NavLeaf {
  key: string;
  label: string;
  href: string;
  disabled?: boolean;
}

export type NavItem =
  | {
      key: string;
      label: string;
      icon: LucideIcon;
      single: true;
      href: string;
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
  },
  {
    key: "anchor",
    label: "主播管理",
    icon: Users,
    children: [
      { key: "anchor-detail", label: "主播明细", href: "/anchors" },
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
      { key: "data-board", label: "业务看板", href: "/dashboard" },
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
      { key: "live-accounts", label: "直播账号", href: "/live-accounts" },
      { key: "live-anchors", label: "主播档案", href: "/live-anchors" },
      { key: "live-schedule", label: "排班总览", href: "/live-accounts/schedule-overview" },
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
      { key: "sys-permission", label: "用户与权限", href: "/admin/permissions" },
      { key: "sys-brokers", label: "经纪人映射", href: "/admin/brokers" },
      { key: "sys-dept", label: "部门架构", href: "/admin/depts", disabled: true },
      { key: "sys-alias", label: "字段别名", href: "/admin/aliases", disabled: true },
      { key: "sys-crawler", label: "采集监控", href: "/admin/crawler" },
      { key: "sys-migration", label: "PRO3 迁移", href: "/live-account-migration" },
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
