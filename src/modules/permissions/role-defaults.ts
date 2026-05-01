import type { Permission } from "./types";

/**
 * 岗位默认权限初始 seed。
 * Phase 1 实施时一次性插入到 role_default_permission 表，之后管理员可在 UI 修改。
 */
export const ROLE_DEFAULTS_SEED: (Permission & {
  position: string;
  description: string;
})[] = [
  {
    position: "总监",
    scope: "all",
    can_edit: true,
    can_export: true,
    can_admin: true,
    description: "看所有数据，可管理",
  },
  {
    position: "老板",
    scope: "all",
    can_edit: true,
    can_export: true,
    can_admin: true,
    description: "看所有数据，可管理",
  },
  {
    position: "运营",
    scope: "self",
    can_edit: true,
    can_export: false,
    can_admin: false,
    description: "看自己负责主播",
  },
  {
    position: "主播",
    scope: "self",
    can_edit: false,
    can_export: false,
    can_admin: false,
    description: "看自己作为主播的数据",
  },
  {
    position: "剪辑",
    scope: "self",
    can_edit: false,
    can_export: false,
    can_admin: false,
    description: "看自己负责主播",
  },
  {
    position: "行政",
    scope: "none",
    can_edit: false,
    can_export: false,
    can_admin: false,
    description: "默认无权限",
  },
  {
    position: "财务",
    scope: "none",
    can_edit: false,
    can_export: true,
    can_admin: false,
    description: "默认无权限，按需开导出",
  },
  {
    position: "其他",
    scope: "none",
    can_edit: false,
    can_export: false,
    can_admin: false,
    description: "兜底",
  },
];
