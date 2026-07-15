# 权限点细分改造（Permission Points）设计 Spec

> 2026-07-06 · 与张锦对齐后定稿。替换「编辑/导出/管理」三布尔为权限点集合，参考快手公会后台的权限点交互。

## 1. 背景与目标

现状每板块只有 `scope + can_edit/can_export/can_admin`，粒度太粗：
- 直播间/主播档案/素材库/软件库/录像的**删除**与普通编辑同门槛（can_edit 一把梭）
- 剪辑工作流的**派单/审核/发布**等管理动作与上传素材同门槛
- **创建剪辑任务无任何权限判定**（仅登录）
- 素材库寄生在剪辑工作流权限下（**保持不变**，用户已确认）

目标：板块内细分为**权限点**（共 38 个），照快手公会后台交互重做权限配置 UI。

已拍板：① 素材库不独立板块；② 粒度按下表；③ 旧三布尔列**直接删除**；④ 「复用员工权限」升级为连权限点一起复制。

## 2. 权限点注册表（唯一事实源：`modules.ts` 静态定义）

key 全局唯一 = `<module>.<point>`。「查询」不设点——由板块 scope ≠ none 表达（UI 中数据范围下拉即查询开关）。[敏] = sensitive，UI 红标。

| 板块 | section | 权限点 key | label |
|---|---|---|---|
| dashboard | 数据 | export | 导出 |
| anchors | 数据 | export | 导出 CSV |
| crawler | 采集 | run_jobs | 重跑 / 补数 |
| | | cookie_update | Cookie 更新 |
| | | field_alias | 字段别名维护 |
| permissions | 配置 | manage_roles | 岗位管理 |
| | | manage_overrides | 个人权限覆盖 |
| | | manage_dept_leaders | 部门主管设置 |
| | | invite_codes | 邀请码管理 |
| live_account | 账号 | account_edit | 账号新增 / 改资料 |
| | | delete_request | 提交删除申请 |
| | | delete_review | 删除审批（直删）[敏] |
| | 排班/直播间 | schedule_edit | 排班编辑 |
| | | room_edit | 直播间编辑 |
| | | room_delete | 直播间删除 [敏] |
| | | floorplan_edit | 平面图编辑 |
| | 开播记录 | session_correct | 记录纠错（强制下播/改时间/改主播/补时长）[敏] |
| live_anchor | 档案 | anchor_edit | 档案新增 / 编辑 |
| | | anchor_delete | 档案删除 [敏] |
| | | binding_edit | 账号绑定 / 解绑 |
| placement | 数据 | upload | Excel 上传 |
| editing_workflow | 任务流 | task_create | 创建任务 |
| | | source_upload | 上传素材 |
| | | task_claim | 领取任务 |
| | | task_assign | 分配剪辑师（派单） |
| | | edited_upload | 上传成品（交片） |
| | | review | 审核通过 / 驳回 [敏] |
| | | publish | 标记发布 |
| | | task_manage | 回退 / 优先级 / 不合格 |
| | | task_delete | 删除任务 [敏] |
| | | cover_manage | 封面管理 |
| | 素材库 | material_upload | 素材上传 / 编辑 |
| | | material_organize | 目录管理 / 移动 |
| | | material_delete | 素材 / 目录删除 [敏] |
| software_library | 软件 | item_edit | 上传 / 编辑 |
| | | item_delete | 删除软件 / 分类 [敏] |
| recording | 录制 | task_manage | 录制任务管理（添加/启停/配置） |
| | | file_delete | 删除录像 [敏] |

共 **38 点**。注册表结构：

```ts
interface PermissionPointDef {
  key: string;          // "review"（板块内唯一）
  label: string;
  section: string;      // 功能区分组（UI 行）
  sensitive?: boolean;
}
export const MODULE_POINTS: Record<ModuleKey, PermissionPointDef[]> = { ... };
export type PointKey = `${ModuleKey}.${string}`; // 判权用全限定 key
```

## 3. 数据模型

两张表同一迁移（0054）：

```sql
ALTER TABLE role_default_permission ADD COLUMN points jsonb NOT NULL DEFAULT '[]';
ALTER TABLE auth_permission_override ADD COLUMN points jsonb;  -- null = 不覆盖
-- 回填（见 §6 翻译规则）之后：
ALTER TABLE role_default_permission DROP COLUMN can_edit, DROP COLUMN can_export, DROP COLUMN can_admin;
ALTER TABLE auth_permission_override DROP COLUMN can_edit, DROP COLUMN can_export, DROP COLUMN can_admin;
```

- `points` 存该板块下的点 key 数组（板块内短 key，如 `["account_edit","schedule_edit"]`）
- override 语义：`points = null` → 完全不覆盖（用岗位默认）；`points = [...]` → **整体替换**该板块点集（UI 编辑时先展示合并结果再存完整集合）。scope 合并规则不变（MAX，不能降）
- dept_leader 加成只影响 scope（升 team），不加点——不变
- `delegated_user_ids` 委托视图机制不动

## 4. 解析与判权 API

```ts
interface Permission {
  scope: Scope;
  points: ReadonlySet<string>;      // 板块内短 key 集合
  delegatedUserIds?: string[] | null;
}
// 合并：points = override.points ?? roleDefault.points
export function hasPoint(p: Permission, key: string): boolean;
// server helper（替代 requireModuleEdit/Admin）：
export async function requirePoint(module: ModuleKey, point: string): Promise<{ userId, perm }>;
```

- `visibleModules` 判定改为：`scope !== "none" || points.size > 0`
- 旧 `requireModuleEdit/requireModuleAdmin` 删除，调用点全部替换（见 §7）
- emergency 后门行为不变（绕过所有判定）

## 5. UI 改造（权限页）

照参考图交互，岗位编辑弹窗与个人覆盖共用一个新组件 `PointMatrix`：

- 板块折叠分组；组头 = 板块名 + 数据范围下拉 + 「开通 x/n 个权限点」计数
- 组内按 section 行分（左：功能区名，右：权限点 checkbox 流式排布）
- 敏感点带红色「敏」徽章
- 顶部「权限关键词」搜索框（过滤高亮点）+ 全局计数「共计开通 x/38」
- 个人覆盖：展示合并后的生效值；某板块动过任一点 → 该板块存完整替换集合；提供「恢复岗位默认」按钮（置 points=null）
- 「快速复用其他员工权限」：从仅拷 scope 升级为拷 **scope + points**（不复制岗位，保持现状说明文案更新）
- 邀请码创建表单里的 per-module 权限配置同步换成点选择

## 6. 存量翻译规则（迁移回填，行为 100% 不变）

按「现状行为等价」翻译，上线日无任何人权限变化（唯一例外见下）：

| 板块 | can_edit=true 给 | can_admin=true 追加 | can_export=true 给 |
|---|---|---|---|
| dashboard | – | – | export |
| anchors | – | – | export |
| crawler | run_jobs, cookie_update, field_alias | – | – |
| permissions | – | manage_roles, manage_overrides, manage_dept_leaders, invite_codes | – |
| live_account | account_edit, delete_request, schedule_edit, room_edit, **room_delete**, floorplan_edit | delete_review, session_correct | – |
| live_anchor | anchor_edit, **anchor_delete**, binding_edit | – | – |
| placement | upload | – | – |
| editing_workflow | task_create, source_upload, task_claim, task_assign, edited_upload, **review**, publish, task_manage, cover_manage, material_upload, material_organize, **material_delete** | task_delete | – |
| software_library | item_edit, **item_delete** | – | – |
| recording | task_manage, **file_delete** | – | – |

加粗 = 现状确实混在 edit 里的危险点，翻译时保留（行为不变），**上线后由张锦在新 UI 逐岗位收紧**。

**唯一行为收紧**：创建剪辑任务（现状仅登录）→ 需要 `editing_workflow.task_create`。原有 editing.can_edit 的岗位翻译后都有此点，实际影响 = 没有剪辑编辑权的人不能再建任务（合意变化）。

role_default_permission 与 auth_permission_override（非 null 的行）都按此表回填；override 三布尔为 null 的字段 → 对应点跟岗位走（即 override.points 仅当该行任一布尔非 null 时生成：以「岗位翻译结果 + 该行非 null 布尔的增减」计算完整替换集合）。

## 7. 调用点改造映射（实施 checklist）

| 文件 | 旧判定 | 新判定 |
|---|---|---|
| modules/crawler/actions.ts（5 个 action） | requireModuleEdit("crawler") | requirePoint: rerun/backfill/ksSync→run_jobs; saveCookie→cookie_update; fieldAlias→field_alias |
| modules/live-account/actions.ts upsertAccount | can_edit | account_edit |
| 同上 删除流 | edit→申请, admin→直删/审批 | delete_request / delete_review |
| modules/live-room/actions.ts（建/改/删） | requireModuleEdit("live_account") | room_edit；deleteRoom→room_delete |
| modules/schedule-override/actions.ts | live_account.can_edit | schedule_edit |
| 平面图编辑 action（floor-plan） | live_account.can_edit | floorplan_edit |
| modules/checkin/server.ts canForceEnd 等 | live_account.can_admin | session_correct（dept_leader 通道保留） |
| modules/live-anchor/actions.ts | can_edit | anchor_edit；deleteAnchor→anchor_delete |
| modules/live-anchor/account-bindings.ts | can_edit | binding_edit |
| app/api/placements/upload/route.ts | placement.can_edit | upload |
| modules/editing-task/actions/create-task.ts | 仅登录 | task_create |
| editing 各 action（requireEditingWriter） | can_edit+scope | 各自的点+scope：upload-source→source_upload; claim→task_claim; assign→task_assign; upload-edited→edited_upload; review-approve/reject→review; mark-published→publish; reset/priority/disqualified→task_manage; upload-cover→cover_manage |
| editing delete-task | can_admin | task_delete |
| editing delete-cover | can_admin ∥ 本人 | cover_manage ∥ 本人 |
| modules/material-library/authz.ts | editing.can_edit | material_upload / material_organize / material_delete（按 action 分） |
| modules/software-library/authz.ts | can_edit | item_edit；delete-item/delete-category→item_delete |
| modules/recording/authz.ts | can_edit | task_manage；delete-file→file_delete |
| modules/permissions/actions.ts | admin 页面守卫 | 4 个 manage_* 点分别判 |
| modules/permissions/resolve.ts visibleModules | scope≠none ∥ can_admin | scope≠none ∥ points.size>0 |
| modules/invite-codes/server.ts | 拷 can_* 进 override | 拷 points |
| UI role-defaults-tab / user-detail | 3 checkbox 列 | PointMatrix 组件 |

## 8. 测试与验收

- resolve 合并逻辑单测（override 替换/不覆盖/过期、dept_leader 只升 scope）
- 翻译规则单测（每板块 edit/admin/export → 点集合快照）
- 现有 201 测试全过；typecheck/lint 过
- 上线验收：抽 3 个真实岗位（财务/运营/剪辑师）对照改前后可见页面与可用按钮一致；财务不能删任何东西
- 部署顺序：先迁移 SQL（NAS 手动 psql，本地同步）→ web+worker 同 release；迁移前 pg_dump 备份

## 9. 不做（Out of Scope）

- 点级数据范围（scope 保持板块级）
- 素材库独立权限板块（用户确认不动）
- 权限申请/审批流（现在由 admin 直接配）
- 历史 audit_log 结构不动（写点变更时 target 记 `<module>.<point>`）
