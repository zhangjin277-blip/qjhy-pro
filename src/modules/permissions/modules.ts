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
  "software_library",
  "recording",
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
  software_library: "软件库",
  recording: "直播录制",
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
  software_library: "工作软件上传下载 / 分类管理",
  recording: "直播录制任务与录像文件管理",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/* ────────────────────────────────────────────────────────────────
 * 权限点注册表（spec: 2026-07-06-permission-points-redesign）
 *
 * 「查询」不设点：由板块 scope ≠ none 表达。
 * key 板块内唯一；判权时用 requirePoint(module, key)。
 * section 是权限配置 UI 的功能区分组行。
 * ──────────────────────────────────────────────────────────────── */

export interface PermissionPointDef {
  key: string;
  label: string;
  section: string;
  /** 敏感点：UI 红「敏」标 */
  sensitive?: boolean;
}

export const MODULE_POINTS: Record<ModuleKey, PermissionPointDef[]> = {
  dashboard: [{ key: "export", label: "导出", section: "数据" }],
  anchors: [{ key: "export", label: "导出 CSV", section: "数据" }],
  crawler: [
    { key: "run_jobs", label: "重跑 / 补数", section: "采集" },
    { key: "cookie_update", label: "Cookie 更新", section: "采集" },
    { key: "field_alias", label: "字段别名维护", section: "采集" },
  ],
  permissions: [
    { key: "manage_roles", label: "岗位管理", section: "配置" },
    { key: "manage_overrides", label: "个人权限覆盖", section: "配置" },
    { key: "manage_dept_leaders", label: "部门主管设置", section: "配置" },
    { key: "invite_codes", label: "邀请码管理", section: "配置" },
  ],
  live_account: [
    { key: "account_edit", label: "账号新增 / 改资料", section: "账号" },
    { key: "delete_request", label: "提交删除申请", section: "账号" },
    { key: "delete_review", label: "删除审批（直删）", section: "账号", sensitive: true },
    { key: "schedule_edit", label: "排班编辑", section: "排班 / 直播间" },
    { key: "room_edit", label: "直播间编辑", section: "排班 / 直播间" },
    { key: "room_delete", label: "直播间删除", section: "排班 / 直播间", sensitive: true },
    { key: "floorplan_edit", label: "平面图编辑", section: "排班 / 直播间" },
    { key: "session_correct", label: "开播记录纠错", section: "开播记录", sensitive: true },
  ],
  live_anchor: [
    { key: "anchor_edit", label: "档案新增 / 编辑", section: "档案" },
    { key: "anchor_delete", label: "档案删除", section: "档案", sensitive: true },
    { key: "binding_edit", label: "账号绑定 / 解绑", section: "档案" },
  ],
  live_room: [],
  placement: [{ key: "upload", label: "Excel 上传", section: "数据" }],
  editing_workflow: [
    { key: "task_create", label: "创建任务", section: "任务流" },
    { key: "source_upload", label: "上传素材", section: "任务流" },
    { key: "task_claim", label: "领取任务", section: "任务流" },
    { key: "task_assign", label: "分配剪辑师（派单）", section: "任务流" },
    { key: "edited_upload", label: "上传成品（交片）", section: "任务流" },
    { key: "review", label: "审核通过 / 驳回", section: "任务流", sensitive: true },
    { key: "publish", label: "标记发布", section: "任务流" },
    { key: "task_manage", label: "回退 / 优先级 / 不合格", section: "任务流" },
    { key: "task_delete", label: "删除任务", section: "任务流", sensitive: true },
    { key: "cover_manage", label: "封面管理", section: "任务流" },
    { key: "material_upload", label: "素材上传 / 编辑", section: "素材库" },
    { key: "material_organize", label: "目录管理 / 移动", section: "素材库" },
    { key: "material_delete", label: "素材 / 目录删除", section: "素材库", sensitive: true },
  ],
  software_library: [
    { key: "item_edit", label: "上传 / 编辑", section: "软件" },
    { key: "item_delete", label: "删除软件 / 分类", section: "软件", sensitive: true },
  ],
  recording: [
    { key: "task_manage", label: "录制任务管理", section: "录制" },
    { key: "file_delete", label: "删除录像", section: "录制", sensitive: true },
  ],
};

/** 全部权限点总数（UI「共计开通 x/N」用） */
export const TOTAL_POINT_COUNT = Object.values(MODULE_POINTS).reduce((s, pts) => s + pts.length, 0);

export function isPointKey(module: ModuleKey, key: string): boolean {
  return MODULE_POINTS[module].some((p) => p.key === key);
}
