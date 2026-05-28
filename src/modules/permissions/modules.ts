/**
 * 业务板块（module）定义。
 *
 * 每个 module 在 `auth_permission_override` 与 `role_default_permission` 中独立一行，
 * 调用方通过 `resolvePermission(userId, module)` 拿对应板块的最终权限。
 */

export const MODULE_KEYS = [
  "dashboard",
  "anchors",
  "crawler",
  "permissions",
  "live_account",
  "live_anchor",
  "live_room",
  "placement",
  "editing_workflow",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "工作台",
  anchors: "主播明细",
  crawler: "爬虫监控",
  permissions: "权限管理",
  live_account: "直播账号",
  live_anchor: "主播档案",
  live_room: "直播间",
  placement: "投放数据",
  editing_workflow: "剪辑工作流",
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  dashboard: "业务看板 / 数据总览",
  anchors: "主播列表 / 编辑 / 导出",
  crawler: "抖音 / 快手数据爬取（仅 admin）",
  permissions: "用户角色与权限分配（仅 admin）",
  live_account: "直播账号档案 / 主播绑定 / 默认排班",
  live_anchor: "主播业务档案（钉钉用户的主播扩展）",
  live_room: "线下物理直播间管理",
  placement: "投放消耗 / 激活 / 主播归因看板",
  editing_workflow: "剪辑任务全链路看板 / 派单 / 审核 / 发布",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
