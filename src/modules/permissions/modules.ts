/**
 * 业务板块（module）定义。
 *
 * 每个 module 在 `auth_permission_override` 与 `role_default_permission` 中独立一行，
 * 调用方通过 `resolvePermission(userId, module)` 拿对应板块的最终权限。
 */

export const MODULE_KEYS = [
  "dashboard",
  "goals",
  "project_zhaohua",
  "project_ai_comic",
  "project_buyu",
  "checkin_history",
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
  "people_performance",
  "business_recruitment",
  "courses",
  "procurement",
  "attendance",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "工作台",
  goals: "目标管理",
  project_zhaohua: "造化直播",
  project_ai_comic: "造化视频",
  project_buyu: "捕鱼直播",
  checkin_history: "开播记录",
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
  people_performance: "人员绩效",
  business_recruitment: "商务招募",
  courses: "课程中心",
  procurement: "道具采购",
  attendance: "考勤打卡",
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  dashboard: "业务看板 / 数据总览",
  goals: "月度与季度目标、进度填报、发布与调整记录；首页目标板块独立授权",
  project_zhaohua: "造化仙府 / 造化直播项目协作与执行数据",
  project_ai_comic: "造化仙府 / 造化视频多平台内容数据",
  project_buyu: "捕鱼中心 / 捕鱼直播项目汇总与账号运营数据",
  checkin_history: "捕鱼中心 / 主播开播与下播记录",
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
  people_performance: "非主播员工试用期与正式绩效考核",
  business_recruitment: "主播候选人登记、初评、复评与签约跟进",
  courses: "课程学习、课程资源和考试管理",
  procurement: "道具采购申请、审批、购买、物流与入库",
  attendance: "钉钉考勤同步、记录、审批与核实",
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/* ────────────────────────────────────────────────────────────────
 * 权限点注册表（spec: 2026-07-06-permission-points-redesign）
 *
 * 一般查询由板块 scope ≠ none 表达；工作台敏感卡片另设显示权限点。
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
  goals: [
    { key: "view", label: "查看目标（含工作台）", section: "目标" },
    { key: "fill", label: "创建草稿 / 填报进度", section: "目标" },
    { key: "publish", label: "发布 / 调整 / 归档", section: "目标", sensitive: true },
  ],
  dashboard: [
    { key: "export", label: "导出", section: "数据" },
    { key: "view_personnel", label: "查看部门人员概览", section: "工作台板块", sensitive: true },
  ],
  project_zhaohua: [{ key: "project_edit", label: "项目数据编辑", section: "项目协作" }],
  project_ai_comic: [{ key: "project_edit", label: "项目数据编辑", section: "项目协作" }],
  project_buyu: [],
  checkin_history: [
    { key: "session_correct", label: "开播记录纠错", section: "开播记录", sensitive: true },
  ],
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
    // 账号不提供删除（2026-10-08）；key 沿用 delete_request 以兼容已存权限数据
    { key: "delete_request", label: "废弃 / 恢复账号", section: "账号" },
    { key: "schedule_edit", label: "排班编辑", section: "排班 / 直播间" },
    { key: "room_edit", label: "直播间编辑", section: "排班 / 直播间" },
    { key: "room_delete", label: "直播间删除", section: "排班 / 直播间", sensitive: true },
    { key: "floorplan_edit", label: "平面图编辑", section: "排班 / 直播间" },
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
  people_performance: [
    { key: "manage_profiles", label: "人员档案与周期管理", section: "人员" },
    { key: "manage_process", label: "代办与流程调整", section: "流程", sensitive: true },
    { key: "calibrate", label: "HR校准与定级", section: "结果", sensitive: true },
  ],
  business_recruitment: [
    { key: "candidate_edit", label: "候选人登记 / 商务初评", section: "招募" },
    { key: "demand_manage", label: "招聘需求维护", section: "招募" },
    { key: "operation_review", label: "运营复评 / 带教分配", section: "复评" },
    { key: "signing_manage", label: "入会 / 签约 / 开播维护", section: "跟进" },
  ],
  courses: [
    { key: "course_edit", label: "课程创建 / 编辑", section: "课程" },
    { key: "course_upload", label: "封面 / 视频上传", section: "课程" },
    { key: "course_delete", label: "课程删除", section: "课程", sensitive: true },
    { key: "exam_manage", label: "考试配置", section: "考试" },
    { key: "learning_stats", label: "学习数据统计", section: "学习" },
    { key: "training_manage", label: "主播培训管理", section: "培训" },
  ],
  procurement: [
    { key: "create", label: "提交采购申请", section: "采购" },
    { key: "approve", label: "审批采购申请", section: "采购", sensitive: true },
    { key: "manage", label: "购买 / 发货 / 入库 / 退货", section: "采购" },
    { key: "export", label: "导出采购记录", section: "数据" },
  ],
  attendance: [
    { key: "sync", label: "同步钉钉考勤", section: "同步", sensitive: true },
    { key: "remark", label: "备注与核实", section: "记录" },
    { key: "approval", label: "查看审批", section: "审批" },
    { key: "export", label: "导出考勤", section: "数据" },
  ],
};

/** 全部权限点总数（UI「共计开通 x/N」用） */
export const TOTAL_POINT_COUNT = Object.values(MODULE_POINTS).reduce((s, pts) => s + pts.length, 0);

export function isPointKey(module: ModuleKey, key: string): boolean {
  return MODULE_POINTS[module].some((p) => p.key === key);
}
