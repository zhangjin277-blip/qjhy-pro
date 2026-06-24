# 素材库（Material Library）设计 Spec

> 日期：2026-06-24
> 状态：设计稿，待 plan
> 关联原型：`_prototypes/material-library/素材库 v1.html`

## 1. 背景与目标

剪辑师在剪游戏直播切片时，反复需要一批「通用游戏素材」——爆奖高光片段、开场片头、转场特效、BGM/音效、关注引导贴纸、字幕条模板等。目前这些素材散落在各人电脑/NAS 角落，无法检索复用，重复劳动严重。

**目标**：建一个常驻的、可检索、可复用的素材资产库。剪辑师上传通用素材，按游戏/用途归档，其他剪辑师能快速找到并下载复用。

**与剪辑任务（editing_task）的区别**：`editing_task` 是「一次性任务流水」（上传→剪辑→审核→发布，发完归档）；素材库是「常驻可复用资产」，核心诉求是**检索 + 反复取用**。两者独立建模。

**MVP 边界决策（2026-06-24 与用户确认）**：
1. **目录组织 = 自由嵌套文件夹树**（非固定两层分类）。管理员可自建/改名/移动目录，支持多层嵌套。表用 `parent_id` 自关联。
2. **MVP 先独立上线，不打通剪辑任务**。MVP 只做素材库本身：上传 / 分类 / 检索 / 标签 / 收藏 / 下载。剪辑师从库里下载后自己拖进剪辑软件。「使用次数」MVP 先按**下载次数**统计。与 editing_task 的「引用 / 被哪些任务用过」打通留二期。

## 2. 数据模型

三张新表，命名遵循项目 snake_case + Drizzle 风格（参考 `src/db/schema/editing.ts`）。

### 2.1 `material_folder`（目录树）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `name` | text NOT NULL | 目录名 |
| `parent_id` | bigint → material_folder.id | 父目录，NULL = 顶层 |
| `sort_order` | int default 0 | 同级排序 |
| `cover_asset_id` | bigint | 封面素材 id（可空，做文件夹卡片缩略图）|
| `created_by_user_id` | text → dingtalk_user.user_id | |
| `created_at` / `updated_at` | timestamp defaultNow | |
| `deleted_at` | timestamp | 软删 |

索引：`idx_parent`(parent_id)。

> 删目录策略：MVP 仅允许删**空目录**（无子目录、无素材），避免级联误删。非空目录前端禁删并提示先移空。

### 2.2 `material_asset`（素材）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `folder_id` | bigint → material_folder.id | 归属目录，NULL = 未分类 |
| `name` | text NOT NULL | 素材名，默认取文件名，可改 |
| `type` | enum('video'\|'audio'\|'image') | 素材类型 |
| `nas_path` | text NOT NULL | NAS 相对路径（物理位置）|
| `file_name` | text NOT NULL | 原始文件名 |
| `file_hash` | text NOT NULL | MD5，去重用 |
| `file_size` | bigint | 字节 |
| `format` | text | 容器/扩展名，如 mp4 / wav / png |
| `duration_sec` | int | 视频/音频时长（图片为 NULL）|
| `width` / `height` | int | 视频/图片尺寸（音频为 NULL）|
| `cover_path` | text | 缩略图/封面相对路径（可空，二期生成，MVP 前端兜底）|
| `tags` | jsonb`<string[]>` | 标签数组（MVP 不单建标签表）|
| `download_count` | int default 0 | 「使用次数」= 累计下载次数 |
| `uploaded_by_user_id` | text → dingtalk_user.user_id | 上传人 |
| `created_at` / `updated_at` | timestamp defaultNow | |
| `deleted_at` | timestamp | 软删 |

索引：`idx_folder`(folder_id, type)、`idx_type`(type)、`idx_hash`(file_hash)。

> **物理路径与逻辑目录解耦**：`nas_path` 用扁平规则 `素材库/{type}/{yyyymm}/{assetId}-{md5前8}-{filename}`，**不**跟 folder 逻辑路径耦合。这样移动/改名目录只改 DB，不动 NAS 文件。去重：上传时按 `file_hash` 查重，命中则提示「已存在」并定位到已有素材。

### 2.3 `material_favorite`（收藏，user × asset 多对多）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | bigserial PK | |
| `asset_id` | bigint → material_asset.id (cascade) | |
| `user_id` | text → dingtalk_user.user_id | |
| `created_at` | timestamp defaultNow | |

唯一约束：`uq_fav`(asset_id, user_id)。

## 3. 模块结构

新建模块 `src/modules/material-library/`，遵循双入口约定（`index.ts` client-safe / `server.ts` server-only，ESLint zone 同步注册）。

```
material-library/
  index.ts          # 客户端：types + Zod schemas + Server Actions
  server.ts         # server-only：queries + scope + 路径生成
  schema.ts         # Zod 输入校验
  queries.ts        # 树/列表/详情/收藏 查询
  authz.ts          # requireMaterialWriter / requireMaterialAdmin
  scope.ts          # 可见性（MVP：全员可见，预留 scope 钩子）
  actions/
    create-folder.ts / rename-folder.ts / move-folder.ts / delete-folder.ts
    update-asset.ts    # 改名 / 改标签 / 移动目录
    delete-asset.ts
    toggle-favorite.ts
  storage.ts        # 调用 editing-storage 的流式上传 + 生成 material NAS 路径
```

**复用 editing-storage**：流式上传（`parseUploadToTemp` + `moveTempWithSeq` + MD5、峰值 ~64KB 内存）已在 `editing-storage/server.ts` 打磨过，直接复用。在 `editing-storage` 暴露一个通用「上传到指定相对目录」的底层能力，`material-library/storage.ts` 拼好 `素材库/{type}/{yyyymm}/` 路径后调用。下载也复用其 Range 下载能力。

## 4. NAS 存储约定

复用 `EDITING_NAS_PATH` 挂载点（本地开发 `./tmp/editing-nas`，生产 NFS）。新增根目录 `素材库/`：

```
素材库/video/202606/{assetId}-{md5前8}-{原文件名}
素材库/audio/202606/{assetId}-{md5前8}-{原文件名}
素材库/image/202606/{assetId}-{md5前8}-{原文件名}
```

封面（二期生成）：`素材库/_cover/{assetId}.jpg`。

## 5. 权限

新增 permission module key `material_library`，沿用三层权限体系（scope / can_edit / can_export / can_admin）。

| 操作 | 要求 |
|---|---|
| 浏览 / 搜索 / 下载 | 所有登录内部用户（素材是公司通用资产，MVP 不按 scope 限制可见范围）|
| 上传素材 | `can_edit`（剪辑师「后期」部门 + 有 editing 权限者，沿用 editing-editor 的识别规则）|
| 改素材元信息（名/标签/移动目录）| 上传者本人 或 `can_admin` |
| 删素材 | 上传者本人 或 `can_admin` |
| 建 / 改名 / 移动 / 删目录 | `can_admin`（目录结构是全局共享资产，限管理员维护）|
| 收藏 / 取消收藏 | 所有登录用户（针对自己）|

role-defaults 里给「剪辑」岗位默认 `material_library: { scope: 'all', can_edit: true }`，管理员 `can_admin: true`。

## 6. 页面与 UI

路由 `/materials`（app router），`layout.tsx` 做权限检查（无 material_library 浏览权限则拦截）。视觉沿用 QJHY 现有 token（毛玻璃 workspace-shell、字节蓝、12px 圆角浮卡、PingFang SC），见原型 `_prototypes/material-library/素材库 v1.html`。

**布局**（左 + 主 + 抽屉/弹窗）：
- **左栏**：快捷入口（全部素材 / 我的收藏 / 我的上传 / 最近使用）+ 文件夹树（可展开、显示每目录素材数）+ 标签管理入口。
- **主区**：面包屑 + 「上传素材」主按钮；工具条（类型 tab 全部/视频/音频/图片 + 搜索框 + 标签筛选 + 排序）；子文件夹封面卡片行 + 素材网格。
- **素材卡片**：缩略区（视频带播放图标+时长角标 / 音频波形 / 图片缩略）+ 类型标签 + 收藏星 + hover 预览/下载 + 名称 + 标签 chips + 上传人 + 使用次数。
- **详情抽屉**（点卡片右侧滑出）：大预览 + 元信息（类型/目录/格式/尺寸/时长/大小/上传人/上传时间/使用次数）+ 标签编辑 + 下载/删除按钮。（「使用记录」二期，MVP 抽屉不展示任务关联）
- **上传弹窗**：拖拽区（视频/音频/图片混传）+ 选归属目录 + 填标签 + 进度反馈（复用 editing 的逐文件进度模式）。

**预览策略（MVP，不做后台转码）**：图片直接 `<img>` 取下载流；视频用 `<video preload="metadata">`（可选 poster 空，前端首帧）；音频用静态波形占位 + 可播放。`cover_path` 字段留好，缩略图后台生成留二期。

## 7. 接口清单

**Server Actions**（`index.ts` 导出，Zod 校验 + authz + scope）：
- `createFolder` / `renameFolder` / `moveFolder` / `deleteFolder`（admin）
- `updateAsset`（改名/标签/移动目录；本人或 admin）
- `deleteAsset`（本人或 admin）
- `toggleFavorite`

**Queries**（`server.ts`，server-only）：
- `listFolderTree()` — 返回目录树 + 每节点素材计数
- `listAssets({ folderId?, type?, tag?, keyword?, scope?, page })` — 主网格，分页
- `getAsset(id)` — 详情
- `listFavorites(userId)` / `listMyUploads(userId)` / `listRecent(userId)`

**API Routes**（流式，避免 server action body 限制）：
- `POST /api/materials/upload` — 流式上传（复用 editing-storage），落 `material_asset`，MD5 去重
- `GET /api/materials/download/[id]` — Range 下载，`download_count++`

## 8. 测试（Vitest）

- folder：建/改名/移动/删（含「非空目录禁删」）
- asset：上传落库、MD5 去重命中、改元信息、软删
- favorite：toggle 幂等、唯一约束
- authz：非 writer 不能上传、非 admin 不能管目录、非本人不能删他人素材
- query：树计数、按 type/tag/keyword 过滤、分页

## 9. 非目标（YAGNI / 二期）

- 与 editing_task 打通：剪辑任务里「引用素材库素材」+「被哪些任务用过」统计
- 批量操作（多选移动/删除/打标签）
- 后台转码：视频雪碧图缩略、统一封面生成
- 独立「标签管理」页（MVP 用 jsonb tags + distinct 聚合）
- 素材版本管理
- 上传审核流（MVP 上传即入库）

## 10. 交付物

- 3 张表 + Drizzle schema + migration
- `material-library` 模块（双入口 + ESLint zone 注册）
- editing-storage 复用扩展
- permission module `material_library` 注册 + role-defaults
- `/materials` 页面 + 组件（左树 / 网格 / 详情抽屉 / 上传弹窗）
- 上传 / 下载 API route
- Vitest 测试
- CLAUDE.md 模块清单 + 表清单更新
