# Phase 3.0 — 剪辑工作流跟进（MVP）

> **状态**：Spec / 设计 — 2026-05-25
> **范围**：剪辑任务全链路看板（待剪辑 → 剪辑中 → 审核 → 待发布 → 已发布）+ 表格视图 + 批量派单 + 三层权限
> **前置**：Phase 2.2（live_account / dingtalk_user / 三层权限 / 抖音爬虫）已完成
> **参考文档**：PRO3 老需求 `/Users/zhangjin/miracle-pro3/docs/剪辑工作台需求文档.md`（不照搬，重新设计）
> **UI mockup**：`docs/design/mockups/2026-05-25-editing-board-v2.html`

## 1. 背景与目标

### 1.1 业务诉求

用户原话：「我想做一个剪辑工作流跟进的板块」「不用一模一样，我觉得可以设计的更好一些」。

PRO3 历史上有一套完整的剪辑工作台（29 个功能点 / 3 张表 / 35 个接口）；新中台不照搬，借机重新设计成更轻、更现代、更贴合 QJHY-Pro 架构的形态。

### 1.2 目标（MVP）

1. **端到端跑通一条剪辑任务**：创建 → 上传素材 → 派单 → 上传成品 → 审核 → 发布
2. **支持每天几十个任务的收纳**：时间窗 / 日期折叠分组 / 筛选 / +N 更多 / 批量派单
3. **接入三层权限**：admin / 团队负责人 / 运营 / 剪辑师 / 主播 五类典型角色
4. **保留完整事件流**：所有状态变更 / 上传 / 回退都写进 `editing_task_event`，详情抽屉显示时间线
5. **抖音视频回流自动绑定**（轻量）：发布时按账号 + 时间窗匹配抖音爬虫库，匹配不到允许手填

### 1.3 Non-goals（推到 Phase 3.1+）

- ❌ 优先级 / 紧急原因 / 钉钉加急通知
- ❌ 视频在线预览（剪辑师/审核需下载到本地看）
- ❌ 不合格素材标记
- ❌ MD5 去重 / 秒传 / 重复任务检测
- ❌ 多文件上传（合并模式 / 独立模式）
- ❌ 封面图
- ❌ 甘特图视图 / 统计视图
- ❌ 捕鱼系今日完成度 / 主播扣分系统
- ❌ 「通过并标记」+ 打包下载 ZIP + 下载审批（**已永久砍除**，不在 3.1+ 范围）
- ❌ 审核观看时长记录（**已永久砍除**）
- ❌ `editing_editors` 独立表（剪辑师由 `dingtalk_user` + 岗位「剪辑」派生）

### 1.4 关键决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 状态机 | **5 状态**：`uploaded → editing → review → ready → published` | 简化 PRO3 的 6 状态，砍掉 `pending` 占位态 |
| 任务粒度 | **1 任务 = 1 素材包 + 1 成品包**，多文件留 3.2 | 去掉 PRO3 的「独立 / 合并」双模式纠结 |
| 剪辑师来源 | **`dingtalk_user` × 岗位「剪辑」**，不建独立表 | 零维护，跟随钉钉同步 |
| 产品分类 | **`live_account.product_category`** + 新建 `product_config` 表 | 替代 PRO3 的硬编码「捕鱼系」字符串匹配，未来通用 |
| 事件流 | 独立 `editing_task_event` 表（包括状态变更/文件/回退原因）| 替代 PRO3 的 `editor_remark` 拼字符串，可审计 |
| 不合格素材 | **只 DB 标记，不改物理文件名**（推到 3.1）| 消除元数据耦合文件名的反模式 |
| 视图组合 | **看板 + 表格**（2 视图，甘特/统计推 3.3）| 看板适合扫总览，表格适合大批量管理 |
| 抖音视频绑定 | **发布时按账号+时间窗自动匹配** douyin 爬虫库，失败允许手填 video_id | 替代 PRO3 的纯手填 |
| 审核观看时长 | **永久砍除** | 体验过重，业务价值低 |
| 打包下载 + 审批流 | **永久砍除** | 业务已不需要 |
| 文件存储 | **公司 NAS** `172.16.39.61`，挂 `/mnt/qjhy-edit/` | 容量大、内网可用、与现有 NAS 部署一致 |
| 看板收纳策略 | **4 件套**：时间窗 + 日期折叠分组 + 筛选条 + +N 更多 | 应对一天几十条素材的滚动黑洞问题 |
| 批量派单 | **MVP 必需** | 一天 50 条单条派单不可行 |
| MVP 覆盖范围 | **全部 live_account** | 通用能力，不限项目分类 |

---

## 2. 架构与模块划分

### 2.1 模块结构（feature-first）

```
src/modules/
  editing-task/                 ← 任务实体 + 状态机
    schema.ts                   ← editing_task / editing_task_event drizzle 表
    types.ts                    ← Status / Event types
    actions.ts                  ← Server Actions: 新建 / 派单 / 审核 / ...
    server.ts                   ← server-only: state machine / event writer
    index.ts                    ← client-safe entry
  editing-storage/              ← NAS 文件存储抽象
    nas.ts                      ← upload / download / path naming
    server.ts                   ← server-only entry
    index.ts                    ← (空 client-safe)
  editing-editor/               ← 剪辑师视图（dingtalk_user 派生）
    queries.ts                  ← list editors (where position='剪辑')
    index.ts
  product-config/               ← 产品分类配置（live_account.product_category）
    schema.ts                   ← product_config 表
    queries.ts
    actions.ts
    index.ts
```

### 2.2 UI 路由

```
src/app/(dashboard)/
  editing/                       ← 模块入口
    page.tsx                    ← 默认 /editing → 看板视图
    table/page.tsx              ← /editing/table → 表格视图
    _components/
      board.tsx                 ← 看板（5 列 + 分组 + 浮动操作栏）
      board-card.tsx
      board-column.tsx
      board-group.tsx
      task-drawer.tsx           ← 任务详情抽屉（事件流时间线）
      new-task-dialog.tsx
      filter-bar.tsx
      assign-popover.tsx        ← 派单（单 + 批量复用）
      delete-confirm.tsx
      table-view.tsx
```

### 2.3 数据流总览

```
                              ┌──── 运营 ────┐
                              │  新建任务    │
                              │  上传素材    │
                              └──────┬───────┘
                                     ▼
   ┌────── editing_task ──────┐  ── event ──→  editing_task_event
   │  status = uploaded       │
   │  source_files[] / src_uploaded_at
   └──────┬───────────────────┘
          ▼
                              ┌── 运营/团长 ──┐
                              │   派单（单/批量）
                              └──────┬───────┘
                                     ▼
   status = editing  + editor_user_id + editing_started_at  ── event ──→ event 表
          ▼
                              ┌── 剪辑师 ────┐
                              │  下载素材    │
                              │  上传成品    │
                              └──────┬───────┘
                                     ▼
   status = review  + edited_files[] / edited_uploaded_at   ── event ──→ event 表
          ▼
                              ┌──── 审核 ────┐
                              │  通过 / 回退  │
                              └──┬────────┬──┘
                                 ▼        ▼
                       status=ready   status=editing (清 editor_user_id)
                                                   +event(回退 + reason)
          ▼ (ready)
                              ┌─── 发布人 ───┐
                              │  下载成品    │
                              │  标记已发布  │── 自动按账号+时间匹配抖音视频
                              └──────┬───────┘            ↓ 匹配失败手填
                                     ▼
   status = published  + published_at + published_by + video_id (可空)
```

---

## 3. 数据模型

### 3.1 `editing_task` 主表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `live_account_id` | bigint FK `live_account.id` | 账号（已含产品分类、运营归属）|
| `anchor_id` | bigint FK `anchor_profile.id` nullable | 主播（捕鱼系/单主播账号；多主播账号该任务可空再 3.1 接）|
| `material_date` | date | 素材日期（直播日期）|
| `status` | text enum: `uploaded` / `editing` / `review` / `ready` / `published` | 5 状态 |
| `source_remark` | text nullable | 剪辑要求（运营创建任务时填）|
| `source_files` | jsonb (string[]) | NAS 相对路径数组 |
| `source_file_names` | jsonb (string[]) | 原始文件名（用于下载时还原）|
| `source_uploaded_at` | timestamptz | |
| `editor_user_id` | text FK `dingtalk_user.userid` nullable | 剪辑师 |
| `editing_started_at` | timestamptz nullable | 派单 / 领取时间 |
| `edited_files` | jsonb (string[]) | |
| `edited_file_names` | jsonb (string[]) | |
| `edited_uploaded_at` | timestamptz nullable | |
| `reviewed_by_user_id` | text FK `dingtalk_user.userid` nullable | |
| `reviewed_at` | timestamptz nullable | |
| `published_by_user_id` | text FK `dingtalk_user.userid` nullable | |
| `published_at` | timestamptz nullable | |
| `video_id` | text nullable | 抖音视频 ID（自动绑定 or 手填）|
| `created_by_user_id` | text FK `dingtalk_user.userid` | |
| `created_at` | timestamptz default now() | |
| `updated_at` | timestamptz default now() | trigger 维护 |

索引：
- `(status, material_date desc)` — 看板按状态 + 日期主查
- `(live_account_id, material_date)` — 按账号查
- `(editor_user_id, status)` — 剪辑师"我的任务"
- `(video_id)` partial where video_id is not null — 抖音回流 join

### 3.2 `editing_task_event` 事件流表

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `task_id` | bigint FK `editing_task.id` ON DELETE CASCADE | |
| `event_type` | text enum | 见下表 |
| `actor_user_id` | text FK `dingtalk_user.userid` | 谁干的 |
| `payload` | jsonb | 事件相关元数据（from_status/to_status/reason/file_count/...）|
| `created_at` | timestamptz default now() | |

`event_type` 枚举：

| 值 | 含义 | payload 示例 |
|---|---|---|
| `created` | 任务创建 | `{live_account_id, material_date, source_remark}` |
| `source_uploaded` | 素材上传 | `{file_count, file_names}` |
| `assigned` | 派单 | `{from: 'unassigned', to: editor_user_id}` |
| `reassigned` | 改派 | `{from: prev_editor, to: new_editor}` |
| `editing_reset` | 剪辑中回退到待剪辑 | `{prev_editor, by: actor_user_id}` |
| `edited_uploaded` | 成品上传 | `{file_count}` |
| `review_approved` | 审核通过 | `{}` |
| `review_rejected` | 审核回退到剪辑中 | `{reason: text}` |
| `published` | 标记已发布 | `{video_id, auto_matched: boolean}` |
| `deleted` | 软删除（or 物理删除前留痕）| `{by: actor_user_id, last_status}` |

索引：
- `(task_id, created_at)` — 抽屉时间线主查
- `(event_type, created_at)` — 后续统计扩展点

### 3.3 `product_config` 表（新建）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `category_key` | text UNIQUE | 例：`buyu_dazuozhan` / `tuyou_doudizhu` / `sanguo_binghe` / `fuhao_majiang` / `dianwan_buyu` / `tuyou_xianxian_buyu` |
| `display_name` | text | 「捕鱼大作战」「途游斗地主」 |
| `accent_color` | text | hex，看板卡片产品 chip 用 |
| `created_at` | timestamptz | |

MVP 不做 UI 管理（直接 seed），UI 管理推 3.1。

### 3.4 `live_account` 表新增字段

```sql
ALTER TABLE live_account
  ADD COLUMN product_category text REFERENCES product_config(category_key);
```

历史数据 migration：按账号名规则填充（脚本）。允许 null（兜底未分类）。

### 3.5 NAS 存储路径约定

```
/mnt/qjhy-edit/
  source/                            ← 素材
    {product_category}/
      {YYYY-MM-DD}/
        task-{taskId}-{originalName}
  edited/                            ← 成品
    {product_category}/
      {YYYY-MM-DD}/
        task-{taskId}-{originalName}
```

理由：
- 按 product_category 一级分目录便于产品维度备份/迁移
- 按日期二级分目录控制单目录文件数
- 任务 ID 嵌入文件名解决同名冲突 + 反查方便
- 不再做 PRO3 那种「{主播}.ext + (2)(3)」追加（去除元数据耦合文件名）

---

## 4. 状态机

```
              [创建任务 → 自动上传素材]
                       │
                       ▼
   ┌─────────────  uploaded  ─────────────┐
   │                                      │
   │  派单（单/批量）                       │
   │  ▼                                   │
   │  editing                              │  ←──┐
   │    │   ↑ ── reset(回退)              │     │
   │    │                                  │     │ review_rejected
   │    │ 上传成品                          │     │ (reason 必填)
   │    ▼                                  │     │
   │    review ─── approve ──→ ready ──→ published
   │                                          + video_id 绑定
   │  delete (admin/创建人，仅未发布)         │
   └──────────────────────────────────────┘
```

允许转换：
| from | to | 触发 | 副作用 |
|---|---|---|---|
| `uploaded` | `editing` | 派单 | set editor_user_id + editing_started_at |
| `editing` | `uploaded` | reset 回退 | clear editor_user_id + editing_started_at |
| `editing` | `review` | 上传成品 | set edited_files + edited_uploaded_at |
| `review` | `ready` | 审核通过 | set reviewed_by + reviewed_at |
| `review` | `editing` | 审核回退 | event 写 reason，**不清** editor_user_id |
| `ready` | `published` | 发布 | set published_by + published_at + video_id（auto or 手填）|

任何状态都允许 `delete`（admin / 创建人，且 status != published）。

---

## 5. 功能清单（MVP）

### 5.1 看板视图 `/editing`

- 5 列：`待剪辑(uploaded) / 剪辑中(editing) / 审核(review) / 待发布(ready) / 已发布(published)`
- 列头：状态色 dot + 名称 + 计数（基于当前筛选）
- 列内按 `material_date` 分组：`今天 / 昨天 / 前天 / 更早`
  - 已发布列按 `published_at` 而非 material_date 分组（更符合发布动作时序）
  - 默认展开前两组，后两组折叠
- 单分组 >6 条时只展示前 6 + 「+ 查看其余 N 条」展开
- 默认时间窗：未完成列近 7 天 + 已发布列近 3 天，超出范围底部「显示近 30 天」/「去表格视图」
- 卡片信息：账号昵称（live_account.nickname）/ 主播名（anchor.name）/ 产品 chip（product_config.display_name + accent_color）/ 剪辑师头像+名 / 素材日期 / 当前状态停留时长
- 停留时长着色：>1d 黄、>2d 红（阈值常量化，未来按需调）
- 卡片 hover：上浮 1px + 蓝色 ring + 左上 checkbox 出现
- 卡片点击（非 checkbox 区域）：打开详情抽屉

### 5.2 顶部筛选条

- 产品分类（多选）/ 主播（搜索 + 多选）/ 剪辑师（多选）/ 日期范围
- 默认日期范围 = 近 7 天
- 多筛选 AND
- 当前生效的筛选 chip 高亮蓝

### 5.3 批量派单浮动栏

- 卡片左上 checkbox（hover 出现 / 选中固定）
- 任何选中 → 屏幕底部出现深色浮动栏：`已选 N 条 · 派给 [剪辑师下拉] · 确认派单 | 批量删除 | 取消`
- 派单：仅对 status=`uploaded` 的选中任务生效；混选时其他状态忽略并 Toast 提示
- 批量删除：仅对 status≠`published` 的选中任务生效，二次确认；admin/创建人区分见权限
- 取消：清空 selection state

### 5.4 任务详情抽屉

右侧抽屉（shadcn sheet），不阻塞看板，分块展示：

1. **顶栏**：账号 · 状态 chip · 操作菜单（重派 / 删除）
2. **基本信息**：素材日期 / 主播 / 产品 / 创建人 / 创建时间 / 剪辑要求
3. **素材区**：文件名列表 + 下载链接
4. **成品区**：文件名列表 + 下载链接（review 之后才有）
5. **抖音视频绑定**（published 才有）：video_id chip + 绑定方式（auto/手填）+ 跳转抖音链接
6. **事件流时间线**：倒序列出所有 event（图标 + 谁 + 做了什么 + 时间 + payload 关键字段如回退 reason）

### 5.5 表格视图 `/editing/table`

- shadcn table，列：账号 / 主播 / 产品 / 状态 / 剪辑师 / 素材日期 / 创建时间 / 停留时长 / 操作
- 列可排序（核心列）
- 顶部筛选复用看板的 filter-bar
- 行点击打开同一个详情抽屉
- 表格支持单选/多选 → 复用批量派单浮动栏

### 5.6 新建任务

模态对话框，字段：

- 账号（搜索 live_account，必填）
- 主播（基于账号联动：查 `account_anchor_default`（Phase 2.1 已存在），若该账号只映射到一个主播则自动选中并禁用；多个主播则下拉手选；无映射时下拉显示全量 anchor_profile）
- 素材日期（默认今天，不可早于 30 天前）
- 剪辑要求（textarea，可空）

提交：
- 创建 task（status=uploaded **前置态**：但 source_files 为空 → 在 spec 里需要决议是否允许"无素材入库")
- **决议**：不允许，**素材必须在新建时一起上传**（"新建并上传"按钮，单文件）
- 多文件上传留 3.2

### 5.7 上传/下载

- 上传：通过 Next.js Server Actions + `formData`，service 端写入 NAS 路径，DB 记录文件名 + 相对路径
- 下载：服务端读 NAS + stream 到 client，带原始文件名 header；权限校验先于 stream

### 5.8 派单（单 + 批量）

- 单：详情抽屉里 dropdown 选剪辑师 → 确认
- 批量：浮动栏（见 5.3）
- 改派：editing 状态下也允许改派（写 `reassigned` event）

### 5.9 上传成品（剪辑师视角）

- 抽屉内 / 卡片菜单：「上传成品」按钮 → 选文件 → 上传 → status 转 review

### 5.10 审核通过 / 审核回退

- 抽屉内 / 卡片菜单：「审核通过」 / 「审核回退（填原因）」
- 通过：status → ready，写 reviewed_by / at
- 回退：status → editing（editor_user_id 保持），event 写 reason

### 5.11 标记已发布 + 抖音视频自动绑定

- 抽屉内 / 卡片菜单：「标记已发布」
- 服务端逻辑：
  1. 查 `douyin_session`（或 `douyin_video` 表，按 Phase 2 现有命名）
  2. WHERE `douyin_account_id` 关联到 `live_account_id` AND `publish_time` BETWEEN (`edited_uploaded_at`, now())
  3. 取最近一条 → 写 `video_id` + event 标记 `auto_matched=true`
  4. 若 0 条匹配 → 返回前端提示「未匹配到抖音视频，请手填 video_id」→ 手填后再提交
- status → published

### 5.12 剪辑中回退到待剪辑（reset）

- 剪辑师在抽屉 / 卡片菜单：「回退到待剪辑」
- 清 editor_user_id + editing_started_at
- 写 `editing_reset` event

### 5.13 删除任务

- admin / 任务创建人可见入口；仅 status≠published
- 二次确认 → **物理删除 task + event 行**（cascade）
- 关联 NAS 文件**保留**不删（NAS 容量足够，避免误删；如 3.1 上线 cron 清理则改 30 天保留 + 标记软删）
- 删除前写 `deleted` event 到一张全局审计表 `audit_log`（已存在），便于事后追查

---

## 6. 权限设计

### 6.1 新增模块权限

`role_default_permission` 表新增 `editing_workflow` 模块，默认值：

| 岗位 | scope | can_edit | 含义 |
|---|---|---|---|
| 老板 | all | true | 全看全管 |
| 总监 | all | true | 全看全管 |
| 运营 | self | true | 看自己负责账号的任务；可创建/派单/审核（自己账号）|
| 剪辑 | self | true | 看派给自己的任务 + 看可领取的（uploaded）；可领取/上传成品/回退 |
| 主播 | self | false | 看自己作为主播的任务（只读）|
| 行政/财务 | none | false | 兜底无权限 |
| 其他 | none | false | 兜底无权限 |

### 6.2 数据可见性实现

| scope | 可见任务 |
|---|---|
| `all` | 全部 |
| `team` | 自己作为部门 leader 的部门下，运营负责的账号的任务 |
| `self` | 满足以下任一：① 自己创建的 ② 自己负责账号的 ③ 派给自己（剪辑师）的 ④ 自己作为主播的 |
| `none` | 模块入口 404 |

### 6.3 功能权限点

| 点 | 默认开放给 |
|---|---|
| 创建任务 | scope ≠ none |
| 派单（含批量）| 运营（自己账号）/ 团队负责人 / admin |
| 审核 | 运营（自己账号）/ 团队负责人 / admin |
| 上传成品 | 该任务的剪辑师 |
| 标记已发布 | 运营（自己账号）/ admin |
| 删除任务 | admin / 创建人 |

`auth_permission_override` 表可临时给个人开 / 关。

---

## 7. UI/UX

### 7.1 视觉

完全沿用 QJHY-Pro design tokens（Ant 蓝 #1677ff / PingFang SC / 磨砂浮卡 / shadow-card / 圆角 12px）。详见 `docs/design/mockups/2026-05-25-editing-board-v2.html`。

### 7.2 mockup 与本 spec 的差异

mockup 是设计稿，以下细节实施时按 spec 为准：

- 「剪辑师管理」按钮可去掉（剪辑师自动同步，无需管理 UI）
- 数据数量按真实分布动态展示
- 已发布列分组按 `published_at` 而非 `material_date`

### 7.3 关键交互

- **打开详情抽屉**：卡片任意非 checkbox 区域点击 / 表格行点击
- **批量操作**：选中 ≥1 张卡片 → 浮动栏出现；ESC 或「取消」清空 selection
- **筛选**：chip 点击展开多选下拉 / 日期范围 popover；筛选变化即时刷新（无需点「应用」）
- **看板列内拖拽**：MVP **不做**（推 3.1，避免误拖触发状态变更）

---

## 8. 文件存储：NAS 接入

### 8.1 部署

- Docker compose web 容器：volumes 挂 NAS `172.16.39.61:/qjhy-edit` → 容器 `/mnt/qjhy-edit`
- worker 容器同样挂载（未来 cron 清理用）
- 健康检查：启动时 `fs.statSync('/mnt/qjhy-edit')`，挂不上直接 fail-fast

### 8.2 抽象模块 `editing-storage`

```ts
// editing-storage/nas.ts
export async function uploadSource(taskId, file, productCategory, materialDate);
export async function uploadEdited(taskId, file, productCategory, materialDate);
export function getDownloadStream(relativePath: string);
```

不暴露原始路径给前端（防遍历），永远通过 `task_id + file_index` 鉴权再 stream。

---

## 9. 抖音视频回流自动绑定

### 9.1 触发

`标记已发布` action 触发，同步执行（非 cron）：

```ts
async function findMatchingDouyinVideo(task: EditingTask) {
  const account = await getLiveAccount(task.live_account_id);
  // douyin account 必须已与 live_account 关联（Phase 2 已实现）
  if (!account.douyin_account_id) return null;

  return db.douyin_video.findFirst({
    where: {
      douyin_account_id: account.douyin_account_id,
      publish_time: between(task.edited_uploaded_at, now()),
    },
    orderBy: { publish_time: 'desc' },
  });
}
```

### 9.2 兜底

- 找不到 → 前端弹窗提示，让运营选：① 手填 video_id（带格式校验） ② 跳过手填、video_id 留空（极端兜底，仅 admin 可跳过；运营必须填或撤销发布）
- 找到但已被其他 task 用过 → 提示「该视频已绑定到 task #N，是否覆盖？」（避免重复归因）

### 9.3 后续

抖音爬虫数据可能延迟到账（小时级），3.1 加 cron job 扫 `published AND video_id IS NULL AND published_at < now() - 24h` 兜底重试一次。

---

## 10. 剪辑师同步：dingtalk_user × 岗位「剪辑」

`editing-editor/queries.ts`：

```ts
export async function listEditors() {
  return db.dingtalk_user.findMany({
    where: {
      // 钉钉同步时 position 字段可能多值；用 LIKE 兜底
      position: { contains: '剪辑' },
      active: true,
    },
    orderBy: { name: 'asc' },
  });
}
```

新人入职 / 离职：钉钉同步 cron（已存在）自动覆盖；剪辑工作台无需独立管理 UI。

---

## 11. 推到后续 Phase

| Phase | 内容 |
|---|---|
| **3.1** | 优先级 + 紧急原因 + 钉钉加急通知 / 视频在线预览 / 不合格素材 / 看板卡片拖拽 / 任务详情封面图 / 抖音绑定兜底 cron / 文件 30 天清理 cron |
| **3.2** | MD5 去重 + 秒传 / 重复任务检测 / 多文件上传（合并 + 独立模式）/ 捕鱼系特殊命名规则 / `product_config` 管理 UI |
| **3.3** | 甘特图视图 / 统计视图 / 捕鱼系今日完成度（基于排班）/ 主播扣分系统 + 钉钉通知 / 看板今日统计面板 |

---

## 12. 验收标准（MVP）

### 12.1 端到端

1. 运营登录 → 新建任务并上传素材 → 任务出现在「待剪辑」列
2. 团队负责人选中 3 张「待剪辑」卡片 → 批量派给林涛 → 3 张卡片移到「剪辑中」并显示「林涛」头像
3. 林涛（剪辑师角色）登录 → 在自己「剪辑中」看到 3 张卡片 → 下载素材
4. 林涛上传成品 → 卡片移到「审核」
5. 运营审核回退（填原因「字幕有误」）→ 卡片回到「剪辑中」，详情抽屉时间线显示回退事件 + 原因
6. 林涛重传成品 → 「审核」→ 运营审核通过 → 「待发布」
7. 运营标记已发布 → 系统自动绑定抖音视频 ID（如果匹配到）→ 「已发布」
8. admin 删除一条 published 任务 → 应拦截（仅未发布可删）

### 12.2 收纳

1. 一天 50 条「待剪辑」任务时，看板默认显示今天 + 昨天展开 + 「+N 更多」收口，不卡顿、不滚动黑洞
2. 顶部筛选「产品 = 捕鱼大作战」→ 看板和列计数同步刷新
3. 「显示近 30 天」按钮可一键放宽未完成时间窗
4. 已发布列默认只显示近 3 天，「去表格视图」可看更早

### 12.3 权限

1. 主播角色登录 → 只能看到自己作为主播的任务（只读，无操作按钮）
2. 剪辑角色登录 → 看到所有 uploaded + 派给自己的，看不到别人剪辑师的 editing 任务
3. 运营 A → 只看 A 负责的账号；切到运营 B 不可见
4. admin override → 可临时给某剪辑师开 `team` scope

### 12.4 事件流完整性

1. 任一任务从创建到发布，事件流时间线 ≥ 6 条 event 完整可见
2. 审核回退 reason 在事件流可读
3. 改派 from/to 在事件流可读

### 12.5 NAS

1. 上传素材后文件路径 `/mnt/qjhy-edit/source/{product_category}/{date}/task-{id}-{name}` 存在
2. NAS 不可用时 web 容器健康检查 fail，上传操作返回 503 而非 500
3. 下载文件返回正确的 Content-Disposition 文件名

---

## 13. 风险与依赖

### 13.1 依赖

| 依赖 | 状态 |
|---|---|
| Phase 2.2 三层权限 | ✅ |
| Phase 2.1 live_account / anchor_profile | ✅ |
| Phase 1 dingtalk_user 同步 | ✅ |
| Phase 2 抖音爬虫 (`douyin_video` 表 + `live_account.douyin_account_id` 关联) | ⚠️ 需确认表名和关联字段 |
| 公司 NAS `172.16.39.61` 可写权限 | ⚠️ 需运维确认配额 + 备份策略 |

### 13.2 风险

1. **NAS 单点**：NAS 故障会让上传/下载全瘫。Phase 3.0 不做高可用，仅做健康检查 + 503 兜底。
2. **「剪辑」岗位字段污染**：钉钉 position 字段是自由文本，可能有「剪辑师 / 剪辑师助理 / 高级剪辑」等变体，`LIKE '%剪辑%'` 兜底。如发现污染，3.1 加白名单管理。
3. **抖音视频自动匹配假阳/假阴**：发布时间窗内可能有多个候选或一个都没有。MVP 采取「最近一条 + 失败手填」策略，3.1 加更严格匹配（成品文件 MD5 vs 抖音视频 MD5）。
4. **product_category 历史空值**：迁移脚本要尽量按账号名规则填，残留 null 的允许用户在新建任务时临时设置。

---

## 14. 开发顺序建议（给 writing-plans 参考）

1. 数据层：drizzle schema + migration + product_config seed + live_account.product_category 迁移
2. 权限层：role_default_permission 加 editing_workflow + scope 实现
3. 存储层：editing-storage 模块 + Docker NAS 挂载 + 健康检查
4. 核心模块 editing-task：state machine + event writer + Server Actions
5. 剪辑师 / 产品配置查询模块
6. UI：filter-bar → board-column → board-card → board-group → board → 浮动操作栏 → 详情抽屉 → 表格视图 → 新建任务对话框
7. 抖音视频自动绑定 service
8. e2e 集成测试（vitest + 真 DB）
9. seed 测试数据 + 手工冒烟
