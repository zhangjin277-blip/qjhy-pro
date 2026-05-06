/**
 * 业务板块（module）定义。
 *
 * 每个 module 在 `auth_permission_override` 与 `role_default_permission` 中独立一行，
 * 调用方通过 `resolvePermission(userId, module)` 拿对应板块的最终权限。
 */

export const MODULE_KEYS = ["dashboard", "anchors", "crawler", "permissions"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "工作台",
  anchors: "主播明细",
  crawler: "爬虫监控",
  permissions: "权限管理",
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  dashboard: "业务看板 / 数据总览",
  anchors: "主播列表 / 编辑 / 导出",
  crawler: "抖音 / 快手数据爬取（仅 admin）",
  permissions: "用户角色与权限分配（仅 admin）",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
