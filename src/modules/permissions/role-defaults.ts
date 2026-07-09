import { MODULE_KEYS, type ModuleKey } from "./modules";
import type { Permission } from "./types";

/**
 * 岗位 × 板块默认权限初始 seed。
 *
 * 每个岗位在 4 个 module 下用同一个 base scope（保留 v1 行为）；
 * 后续管理员可在 UI 单独调整某 module 的 scope。
 *
 * 新部署时通过 INSERT ... ON CONFLICT DO NOTHING 一次性写入 (position × module) 笛卡尔积。
 */
const POSITION_BASE: (Permission & { position: string; description: string })[] = [
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

export const ROLE_DEFAULTS_SEED: (Permission & {
  position: string;
  module: ModuleKey;
  description: string;
})[] = POSITION_BASE.flatMap((row) =>
  MODULE_KEYS.map((module) => ({
    ...row,
    module,
    // 软件库：全员可见可下载（scope=all）；上传/管理仅总监/老板（与 0055 种子一致）。
    // 必须显式覆盖全部权限字段——运营岗位 base 是 can_edit=true，沿用 base 会错误获得上传权。
    ...(module === "software_library"
      ? {
          scope: "all" as const,
          can_edit: row.position === "总监" || row.position === "老板",
          can_export: false,
          can_admin: row.position === "总监" || row.position === "老板",
          description: "软件库：全员可下载，管理员可上传",
        }
      : {}),
  })),
);
