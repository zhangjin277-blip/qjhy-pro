# 软件库板块设计（2026-07-09）

## 背景与目标

团队需要一个集中的地方上传/下载工作软件（直播工具、办公软件、剪辑软件、驱动等安装包）。
当前只能靠网盘/群文件传递，找不到、版本乱。新增「软件库」板块：

- 全员可浏览、下载
- 管理员（总监/老板，或被单独授权者）可上传、编辑、删除、管理分类
- 软件名称可自定义（不受原始文件名限制），附版本号 + 说明备注
- 扁平自定义分类（可新建/改名/删除）

## 决策记录（用户已确认）

| 决策点 | 结论 |
|---|---|
| 权限 | 全员可下载；上传/管理需 can_edit（默认总监/老板）；独立 `software_library` 权限模块 |
| 分类 | 扁平一层自定义分类，非嵌套目录树 |
| 条目字段 | 自定义名称 + 分类 + 版本号（选填）+ 说明备注（选填）+ 自动记录大小/上传人/时间/下载次数 |
| 导航 | 顶层独立入口「软件库」，位于「短视频」与「运营管理」之间 |
| 实现路线 | 方案 A：独立模块 `software-library`，复用 `editing-storage` 底层 |

### 方案对比（为何选 A）

- **A（选定）独立模块 + 复用 editing-storage**：流式上传（峰值内存 ~64KB）、MD5 去重、
  流式下载全部现成；表结构与权限独立，不碰稳定的素材库。
- B 扩展素材库：权限绑死 `editing_workflow`（剪辑师），与全员可下载冲突；侵入现有模块。
- C 文件进 Postgres：安装包几百 MB～几 GB，不现实。

## 数据库（1 个 migration，2 张新表 + 权限种子）

### software_category

| 列 | 类型 | 说明 |
|---|---|---|
| id | bigserial PK | |
| name | text notNull | 分类名，业务上唯一（action 层校验） |
| sort_order | integer notNull default 0 | |
| created_at / updated_at | timestamptz | |

无软删。删除分类时若仍有未删软件挂在下面 → 拒绝（避免悬空引用）。

### software_item

| 列 | 类型 | 说明 |
|---|---|---|
| id | bigserial PK | |
| category_id | bigint → software_category.id，可空 | 空 = 未分类 |
| name | text notNull | 自定义软件名，默认取文件名，可改 |
| version | text | 版本号，选填（如 v5.2.1） |
| note | text | 一句话说明，选填 |
| nas_path | text notNull | NAS 相对路径（物理位置） |
| file_name | text notNull | 原始文件名 |
| file_hash | text notNull | MD5，去重用 |
| file_size | bigint notNull | 字节 |
| download_count | integer notNull default 0 | |
| uploaded_by_user_id | text → dingtalk_user.user_id | |
| created_at / updated_at | timestamptz | |
| deleted_at | timestamptz | 软删 |

索引：category_id、file_hash。

### 权限种子（同一 migration）

`role_default_permission` 插入 `module='software_library'` 行（`ON CONFLICT DO NOTHING`，
照 0022 migration 的写法）：

- 所有岗位 scope = 'all'（全员可见可下载；本模块无数据范围概念，非 none 即可见）
- 仅 总监/老板：can_edit = true, can_admin = true
- 其余岗位 can_edit/can_export/can_admin = false

## 权限

- `src/modules/permissions/modules.ts`：`MODULE_KEYS` 加 `software_library`，
  label「软件库」，desc「工作软件上传下载 / 分类管理」。
- `role-defaults.ts`：`ROLE_DEFAULTS_SEED` 对 `software_library` 特例 scope='all'
  （保证全新部署与存量库行为一致）。
- 模块内 `authz.ts`（照素材库模式）：
  - `requireSoftwareViewer`：scope !== 'none' → 浏览/下载
  - `requireSoftwareWriter`：can_edit → 上传/编辑/删除/分类管理
- 加入权限模块后，管理员可在权限页给任意人开 can_edit override（单独授权上传）。

## 存储

- 复用 `EDITING_NAS_PATH` 根目录，dev/生产零新增配置。
- 物理路径：`软件库/{yyyymm}/{md5前12}-{安全文件名}`，与「素材库/」平级。
  物理路径与逻辑分类解耦——改分类只改 DB，不动文件。
- MD5 去重：命中未删条目 → 删临时文件，复用已有条目（返回 deduped=true）。
- DB 写失败补偿删除刚落盘的正式文件（照 `ingestMaterial` 模式）。

## API（照 materials 路由模式）

- `POST /api/software/upload`：runtime nodejs，maxDuration 600。
  先 `requireSoftwareWriter` 再 `parseUploadToTemp`（未授权不落盘）→ ingest（去重）。
  form fields：file / name / categoryId / version / note。
- `GET /api/software/download?id=`：`requireSoftwareViewer` → 流式 attachment 返回，
  支持 Range（大文件断点续传），Content-Type 固定 application/octet-stream，
  下载计数 +1。无 inline 预览需求。

## 模块结构（标准双入口）

```
src/modules/software-library/
  index.ts      # client-safe：types + Zod schemas + actions 再导出
  server.ts     # server-only：authz / storage / queries
  types.ts
  schema.ts     # Zod
  authz.ts
  storage.ts    # buildSoftwarePath / ingestSoftware
  queries.ts    # listCategories / listItems（分类筛选 + 关键字）
  actions/
    create-category.ts / rename-category.ts / delete-category.ts
    update-item.ts     # 改名称/分类/版本/说明
    delete-item.ts     # 软删
```

ESLint zone 注册一行（`eslint.config.mjs`，只许从 index/server 入口 import）。

## 页面 `/software`

- `src/app/(dashboard)/software/page.tsx`：server component，
  `requireUser` + `resolvePermission('software_library')`；scope none → 提示无权限；
  把 canEdit 传给 client 组件。
- `_components/software-library.tsx`（client）：
  - 左侧分类栏：全部 / 未分类 / 自定义分类列表；canEdit 可新建/改名/删除分类
  - 右侧表格：名称 / 分类 / 版本 / 说明 / 大小 / 上传人 / 上传时间 / 下载次数 / 操作
  - 顶部搜索框：按名称/原始文件名过滤
  - 上传弹窗（canEdit）：选文件 + 自定义名称（默认文件名）+ 分类 + 版本 + 说明，
    XHR `upload.onprogress` 进度条（安装包大，进度反馈必要）
  - 行操作：下载（全员）；编辑信息 / 删除（canEdit）
- 表格样式遵循项目数据表格偏好：大小用人类可读缩写、文本左对齐。

## 导航

`src/lib/nav.ts`：顶层 single 项，key `software`，label「软件库」，
icon lucide `HardDriveDownload`，href `/software`，module `software_library`，
插在「短视频」section 之后、「运营管理」之前。

## 错误处理

- 上传：未授权 403（先于落盘）；multipart 解析失败 400；ingest 失败删临时文件兜底。
- 下载：条目不存在/已软删 404；NAS 文件丢失 404「文件不存在」。
- 删除分类：仍有软件 → 业务错误提示「分类下还有 N 个软件，先移走或删除」。
- 分类重名：拒绝并提示。

## 测试（Vitest）

- storage 纯函数：`buildSoftwarePath`（yyyymm / md5 前缀 / 安全文件名）
- 分类删除保护、分类重名校验逻辑
- Zod schema 边界（名称必填、version/note 可空）

## 不做（YAGNI）

- 不做嵌套目录、收藏、缩略图、在线预览
- 不做同一软件多版本聚合视图（新版本 = 再传一条，旧的可删）
- 不做 audit_log（素材库同样未做，保持一致）
- 不做平台标记（Windows/Mac）——用户未选该项
