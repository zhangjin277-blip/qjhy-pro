# PRO3 考勤迁移

页面直接移植 miracle-pro3 的 AttendanceView 和四个面板，主导航按考勤汇总、异常统计、打卡与审批、数据同步排列，默认打开考勤汇总。打卡与审批中保留打卡明细、审批记录两个子页，审批子页沿用权限控制；移除标记审核入口。个人日历、工作时间、公休、10 分钟宽限、每月前三次轻微迟到宽限、审批关联、备注核实、主播状态标记及原版 Excel 工作表沿用旧实现。

## 数据和身份

- 当前唯一生效的考勤数据源是 qjhy-pro PostgreSQL 中的 PRO3 兼容表：`attendance_records`、`approval_instances`、`dingtalk_users`、`dingtalk_departments` 及相关主播/排班表。页面不再读取独立 SQLite 文件。
- 原 NAS SQLite 数据已归档备份；本次按用户要求不迁移旧考勤记录，兼容表为空，之后从钉钉重新同步。组织人员从 qjhy-pro 的 `dingtalk_user` 和 `dingtalk_dept` 初始化。
- 使用新后台当前登录身份和 attendance 权限点，不运行 PRO3 登录服务、不接受旧 token。全员默认可看本人考勤及审批；部门负责人以本后台权限管理中的“管理部门”（`dept_leader`）为准，读取本人及所管理部门/子部门成员，不采用钉钉默认主管标记。考勤数据范围固定为本人/负责部门，旧岗位全员范围与委托视图不生效；自定义操作权限点仍保留。汇总、明细、审批、排休在数据库分页/聚合前按钉钉人员ID过滤，旧版姓名入口遇到范围外同名人员时拒绝访问。超级管理员沿用应急管理员身份，具备全部考勤范围和操作权限。`0079_attendance_default_permissions.sql` 重置默认阅读配置并保存权限审计快照。
- `/api/attendance/pro3/[...path]` 是原版接口的适配器；旧 `/api/attendance` 及 `/api/attendance/[id]` 同样转入该库。原 PostgreSQL 考勤表保留但已停止作为此模块的读写源。
- 钉钉同步使用新后台的 `DINGTALK_APP_KEY` 和 `DINGTALK_APP_SECRET`，写入 qjhy-pro PostgreSQL。Worker 的 `sync-attendance` 任务每天北京时间 09:00 同步前一天考勤与审批，并分别写入 `attendance_sync_log`；审批仍可通过页面手动补充同步。

## 原版样式

`styles.css` 保留 PRO3 组件和主题 token，`legacy-utilities.css` 由旧版 Tailwind 3 配置生成，所有规则限定在 `.pro3-attendance` 内。弹窗同样包在该范围内，避免影响其他模块。修改界面类名后运行 `pnpm attendance:styles` 重新生成。

## 后续迁移

旧 SQLite 导入脚本仅用于历史取证和应急恢复，不是当前运行路径。新部署只需执行 `0077_attendance_pro3_compat.sql`，然后从钉钉同步。

上下班默认时间、09:00 自动同步、异常统计和权限规则已于 2026-10-14 一起部署到 NAS。当前运行使用 PostgreSQL，无需挂载原 PRO3 SQLite 数据库。

验证边界：完成隔离发布的 TypeScript、生产构建及 Web 路由检查；NAS Web/Worker 启动正常、重启数为0，确认09:00/09:01任务注册。遵照用户要求，不执行浏览器操作测试、不创建测试业务记录；只初始化当月真实表格排休。视觉及实际操作验收由用户进行。

异常统计替代直播统计，复用考勤汇总接口、部门别名筛选及表格，仅显示迟到或早退人员。默认昨日，可选择本周（周一起）、上周、本月及其他月份，按北京时间确定日期。

考勤弹性规则同时用于钉钉默认班次和手动班次：上班迟到不超过10分钟按正常；超过10分钟但不超过30分钟，每人每月按日期先后前3次标为 `GraceLate`（迟到免扣），第4次及之后仍为迟到。以钉钉当天计划上班时间为默认基准，手工设置优先；表格休息日不占用次数。免扣次数读取完整月份记录，按钉钉用户ID区分人员，分页、单日筛选及跨月查询不重置额度。日历、明细、汇总、异常统计和导出复用同一判定，不改写原始打卡数据。

异常统计同时列出普通迟到、早退、迟到（免）和弹性10分钟；后两者独立统计并可点击查看明细，仍按正常/免扣处理。弹性记录通过 `flexible_late` 和 `flexible_late_minutes` 保留实际晚到信息，不计入普通迟到，也不占用月度3次额度。

## 表格排休

- 来源为钉钉节点 `np9zOoBVByjjxwMQSnRzEXgjW1DK0g6l`；每天北京时间 09:01，Worker 的 `sync-attendance-roster` 读取当月“排班表X月”。同时校验表头全年月日，排除备注页，目录不完整、月份不符或重复表不会覆盖旧数据。
- 数据同步页提供“同步表格休息”按钮，可选择历史月份。与考勤同步一样要求 `attendance:sync` 操作权限。
- `0078_attendance_roster.sql` 创建逐日排班快照及独立同步日志；人员用字符串钉钉用户ID匹配，保留ID前导零。一次成功同步在事务内替换该月全部快照，改班、取消排休及移除行会撤销旧标记；失败回滚并保留上次成功数据。手动与定时使用同一 PostgreSQL 事务锁，避免同月重叠。
- 已有逐日排班优先于固定每周休息日及周末猜测；“休”在查询中排除迟到/早退，日历和矩阵显示休息，应出勤导出按表格排休计算。原始钉钉打卡记录不改写，表格取消休息后原始结果恢复生效。空白代表未配置，不推断为休息。
- 读取通过已授权的 DWS CLI，固定使用长沙奇迹互娱组织 profile。Web 和 Worker 的运行用户都需要能够执行 `dws` 且有该组织文档读取授权；可用 `DINGTALK_ROSTER_DWS_BIN` 指定二进制路径。CLI 不存在或授权失效会明确报错，保留旧快照，不输出认证凭据。
- NAS Web/Worker 已安装 DWS，并共用 NAS 现有的独立授权目录挂载（`dws-auth/local-share`、`dws-auth/config`），凭据不写入镜像或代码。CLI 新版本的 `data` 返回包装已兼容。2026-10-14 初始化当月真实排休，成功读取“排班表10月”：47人、1457逐日条目、509休息人日。手动按钮和定时任务使用同一读取/事务逻辑。
- 本地首次同步命令：`NODE_OPTIONS=--conditions=react-server pnpm exec tsx --env-file=.env.local scripts/sync-attendance-roster-local.ts`，脚本拒绝连接非本机数据库。执行前先在本地运行 `0078_attendance_roster.sql`。

个人考勤弹窗按月历、单日详情、考勤设置顺序显示，考勤设置移至详情下方。

2026-10-14 已部署 `qjhy-web:20261014-attendance-final` / `qjhy-worker:20261014-attendance-final`，并执行0078排休表及0079默认权限配置迁移。发布前权限配置和原镜像均保留回滚备份；未改动原 PRO3 项目及数据库。
