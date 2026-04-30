---
title: QJHY-Pro 新中台设计
date: 2026-04-30
status: 待用户评审
version: V1.0
---

# QJHY-Pro 新中台设计 V1.0

## 0. 文档说明

本文档是 QJHY-Pro（新中台）的**整体设计 spec**，由 brainstorming 阶段产出。
- 后续将基于此文档生成 implementation plan（writing-plans 阶段）
- 实施过程中如发生设计变更，应回头更新此文档并 commit
- 本文档与 `CONTRIBUTING.md` 共同构成项目的"宪法"——所有代码必须遵守

---

## 1. 项目背景与目标

### 1.1 老中台问题（屎山病根）

现存中台（pro3）的根本问题不是技术问题，而是**抽象问题**：

1. **数据接口乱**：每个功能字段命名各成一派，没有统一规范
2. **规划不清楚**：业务需求堆砌，没有清晰的模块边界
3. **加新功能要重新引导**：每加一个东西都要"再讲一遍业务"，因为没有可复用的规范
4. **翻译层泛滥**：平台原始字段（如抖音的 `total_diamond_count`）被翻译成自造术语（如 `liushui`），导致每改一个字段都要改 schema、改代码、改翻译

**核心诊断：** 老中台造了一套"自己的语言"，平台来的数据要先翻译成自己的话再存。每加一个平台、每改一次平台字段，翻译层就要改一次。久而久之翻译层就成了屎山的核心。

### 1.2 新中台核心命题

> **新中台的根基是一套定义清楚、可扩展、可被 AI / 前端 / 外部系统稳定调用的数据模型和接口规范。业务功能在它之上长出来，而不是反过来。**

### 1.3 MVP 范围（必须严格收敛）

**MVP = 钉钉同步组织架构 + 主播实体（最小字段）+ 直播数据（抖音/快手）**

不在 MVP 中的内容：
- 主播档案扩展（人设、绩效、试岗节点、培训）
- 数据导出
- 自动日报推送
- 老中台业务模块迁移

**老中台继续运行，承载其他业务。新中台只做"地基 + 主播这一块"，后续每加一个功能都按规范来。**

### 1.4 战略路径

```
现在        Phase 0 完成      Phase 1 完成     Phase 2 完成     未来
  │             │                │                │            │
  └─ 老中台跑全部业务 ──────────────────────────────┐
                                                  │
                  新中台起步 ─────────────────────────────────────→
                                                  │
                                  Phase 2 后业务功能逐步迁移
```

---

## 2. 核心设计原则

### 2.1 屎山治疗三原则

| 原则 | 意义 | 物理实现 |
|---|---|---|
| **数据原始性** | 平台原始字段为第一公民，不自造、不翻译 | `raw: jsonb` 全量存平台返回 |
| **接口规范化** | 所有接口必须 Zod 校验，前后端共用 schema | Zod + Server Actions + TypeScript |
| **模块边界化** | 业务按 feature-first 分文件夹，模块只暴露 `index.ts` | ESLint `import/no-restricted-paths` 强制 |

### 2.2 数据原始性原则（详细）

**禁止：** 在数据落库时做字段翻译/重命名/换算。

**允许：** 落库时仅添加：
- 主键 (`id`)
- 关联键 (`anchor_id` / `platform_account_id`)
- 时间戳 (`crawled_at` / `created_at`)
- 平台标识 (`platform: 'douyin' | 'kuaishou'`)

**示例对比：**

```typescript
// ❌ 老中台（屎山）
{
  liushui: 38520,           // 翻译自 total_diamond_count
  guanzhong_renshu: 5234,   // 翻译自 audience_count
  song_li_renshu: 342,      // 翻译自 gift_user_count
}

// ✅ 新中台
{
  raw: {                              // 原样存平台返回
    total_diamond_count: 38520,
    audience_count: 5234,
    gift_user_count: 342,
    // ... 其他几十个字段都在
  },
  session_id: "...",                  // 加索引用
  platform_account_id: "...",         // 加关联用
  crawled_at: "2026-04-30T03:00Z",    // 加追溯用
}
```

### 2.3 自定义口径在展示层

老中台把字段翻译写进数据库 schema → 改不动。
新中台把字段翻译写进 `field_alias` 配置文件 → 随时可改，不影响数据。

---

## 3. 整体架构

### 3.1 项目结构（feature-first + 薄共享层）

```
qjhy-pro/
├── src/
│   ├── app/                      ← Next.js App Router
│   │   ├── (auth)/               ← 登录页
│   │   ├── (dashboard)/          ← 主播管理 / 直播数据 / 报表
│   │   └── api/                  ← 对外开放接口（Route Handlers）
│   ├── modules/                  ← 业务模块（feature-first 主线）
│   │   ├── crawler/
│   │   │   ├── douyin/
│   │   │   ├── kuaishou/
│   │   │   └── shared/
│   │   ├── dingtalk-sync/
│   │   ├── anchor/
│   │   ├── live-data/
│   │   ├── permissions/
│   │   └── admin/
│   ├── db/                       ← 数据库定义（共享）
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── client.ts
│   ├── lib/                      ← 共享工具
│   │   ├── auth/
│   │   ├── zod/
│   │   ├── field-alias/
│   │   ├── errors/
│   │   └── utils/
│   ├── components/ui/            ← shadcn/ui 组件
│   └── worker/                   ← Worker 进程入口
│       ├── index.ts
│       ├── jobs/
│       │   ├── crawl-douyin.ts
│       │   ├── crawl-kuaishou.ts
│       │   └── sync-dingtalk.ts
│       └── scheduler.ts
├── docs/
│   ├── superpowers/specs/        ← 设计文档
│   ├── raw-samples/              ← 平台原始 JSON 样本
│   └── api/                      ← API 文档（自动生成）
├── docker-compose.yml
├── Dockerfile
├── CONTRIBUTING.md               ← 开发规范（强制）
├── .env.example
└── package.json
```

### 3.2 进程拓扑

```
Web 容器 (Next.js)        Worker 容器 (Node + cron)        Postgres 容器
  ├ 登录                     ├ 爬虫（每天 03:00）             └ 数据库
  ├ 主播管理                  ├ 钉钉同步（每天 02:00）
  ├ 直播数据看板              └ 日志清理（每小时）
  ├ 权限管理
  └ 字段别名管理
        ↓                          ↓                            ↑
        └─────────共享 schema / lib（同一仓库）─────────────────┘
```

**两个进程独立容器，独立重启，但代码在同一 monorepo。** Web 不会被爬虫长任务卡。

### 3.3 用户访问路径

```
钉钉工作台 / 浏览器
       ↓
https://qjhy.your-domain.com    （公网域名）
       ↓
Next.js Web 进程（Docker 容器）
       ↓
钉钉 OAuth 登录 / 应急后门密码
       ↓
根据 dingtalk_user.position + dept_leader + override → 计算权限
       ↓
进入对应权限范围的页面
```

---

## 4. 数据模型

### 4.1 表的全貌（三层职责分离）

```
┌────────────────────────────────────────────────────────────┐
│  钉钉同步层（钉钉为权威源，定时拉取，本地只读）                │
├────────────────────────────────────────────────────────────┤
│  • dingtalk_dept       (部门)                              │
│  • dingtalk_user       (人员)                              │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  业务扩展层（在钉钉之上扩展业务字段）                          │
├────────────────────────────────────────────────────────────┤
│  • anchor_profile      (主播扩展信息)                       │
│  • anchor_operator     (主播 ↔ 运营 关联)                   │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  事实数据层（爬虫产物，原始字段，不翻译）                      │
├────────────────────────────────────────────────────────────┤
│  • douyin_session      (抖音单场)                          │
│  • douyin_daily        (抖音日聚合，可选)                   │
│  • kuaishou_session    (快手单场)                          │
│  • kuaishou_daily      (快手日聚合，可选)                   │
│  • crawl_log           (爬取日志)                          │
│  • sync_log            (同步日志)                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│  系统层（auth / 权限 / 配置）                                │
├────────────────────────────────────────────────────────────┤
│  • auth_user           (better-auth 用户)                  │
│  • auth_session        (登录会话)                          │
│  • dept_leader         (部门负责人，新中台自管)             │
│  • role_default_permission (岗位默认权限映射)              │
│  • auth_permission_override (个体权限覆盖)                 │
│  • audit_log           (操作审计)                          │
│  • field_alias         (字段中文别名，可在 UI 改)           │
│  • app_config          (其他配置)                          │
└────────────────────────────────────────────────────────────┘
```

### 4.2 关键表 schema

#### 4.2.1 `dingtalk_user`

```typescript
export const dingtalk_user = pgTable('dingtalk_user', {
  user_id: text('user_id').primaryKey(),
  name: text('name').notNull(),
  mobile: text('mobile'),
  position: text('position'),                       // 钉钉岗位字符串
  dept_ids: jsonb('dept_ids').$type<string[]>(),   // 钉钉允许多部门
  active: boolean('active').notNull().default(true),
  raw: jsonb('raw').notNull(),                      // ★ 钉钉返回的原始 JSON
  synced_at: timestamp('synced_at').notNull().defaultNow(),
});
```

#### 4.2.2 `anchor_profile`（MVP 最小字段集）

```typescript
export const anchor_profile = pgTable('anchor_profile', {
  id: serial('id').primaryKey(),
  user_id: text('user_id').notNull()
    .references(() => dingtalk_user.user_id),
  platform: text('platform', { enum: ['douyin', 'kuaishou'] }).notNull(),
  platform_account_id: text('platform_account_id').notNull(),
  platform_room_id: text('platform_room_id'),
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  unique_user_platform: unique().on(t.user_id, t.platform),
}));
```

#### 4.2.3 `anchor_operator`（主播 ↔ 运营 多对多）

```typescript
export const anchor_operator = pgTable('anchor_operator', {
  id: serial('id').primaryKey(),
  anchor_profile_id: integer('anchor_profile_id').notNull()
    .references(() => anchor_profile.id),
  operator_user_id: text('operator_user_id').notNull()
    .references(() => dingtalk_user.user_id),
  role: text('role', { enum: ['primary', 'secondary', 'support'] })
    .notNull().default('primary'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  unique_anchor_operator_role: unique()
    .on(t.anchor_profile_id, t.operator_user_id, t.role),
}));
```

#### 4.2.4 `douyin_session`（事实数据示例）

```typescript
export const douyin_session = pgTable('douyin_session', {
  // 我们加的"骨架"字段（4个）
  id: serial('id').primaryKey(),
  platform_account_id: text('platform_account_id').notNull(),
  crawled_at: timestamp('crawled_at').notNull().defaultNow(),
  raw: jsonb('raw').notNull(),                  // ★ 原样落 JSON

  // 从 raw extract 出来的索引字段（保持平台原文命名）
  session_id: text('session_id').notNull().unique(),
  start_time: timestamp('start_time').notNull(),
  end_time: timestamp('end_time'),

  // ❌ 严禁出现 liushui / total_amount / gift_income 等翻译字段
}, (t) => ({
  idx_account_time: index().on(t.platform_account_id, t.start_time),
}));
```

> **快手字段会和抖音不同——这是正常的，每平台一张表，各自尊重原生字段。具体字段在 Phase 0 拉取真实样本后敲定。**

#### 4.2.5 `dept_leader`

```typescript
export const dept_leader = pgTable('dept_leader', {
  id: serial('id').primaryKey(),
  dept_id: text('dept_id').notNull().references(() => dingtalk_dept.dept_id),
  user_id: text('user_id').notNull().references(() => dingtalk_user.user_id),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  unique_dept_user: unique().on(t.dept_id, t.user_id),
}));
```

#### 4.2.6 `role_default_permission`（岗位默认权限，可在 UI 修改）

```typescript
export const role_default_permission = pgTable('role_default_permission', {
  position: text('position').primaryKey(),
  scope: text('scope', { enum: ['none', 'self', 'team', 'all'] }).notNull(),
  can_edit: boolean('can_edit').notNull().default(false),
  can_export: boolean('can_export').notNull().default(false),
  can_admin: boolean('can_admin').notNull().default(false),
  description: text('description'),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});
```

**初始 seed：**

| position | scope | can_edit | can_export | can_admin | 说明 |
|---|---|---|---|---|---|
| 总监 | all | true | true | true | 看所有数据 |
| 老板 | all | true | true | true | 同上 |
| 运营 | self | true | false | false | 看自己负责主播 |
| 主播 | self | false | false | false | 看自己作为主播的数据 |
| 剪辑 | self | false | false | false | 看自己负责主播 |
| 行政 | none | false | false | false | 默认无权限 |
| 财务 | none | false | true | false | 默认无权限，按需开导出 |
| 其他 | none | false | false | false | 兜底 |

未来加新岗位（客服、技术、人事）通过管理后台直接添加即可，无需发版本。

#### 4.2.7 `auth_permission_override`（个体覆盖）

```typescript
export const auth_permission_override = pgTable('auth_permission_override', {
  user_id: text('user_id').primaryKey()
    .references(() => dingtalk_user.user_id),
  scope: text('scope', { enum: ['none', 'self', 'team', 'all'] }),
  can_edit: boolean('can_edit'),
  can_export: boolean('can_export'),
  can_admin: boolean('can_admin'),
  reason: text('reason').notNull(),  // 必须填理由
  expires_at: timestamp('expires_at'),
  created_by: text('created_by'),
  created_at: timestamp('created_at').notNull().defaultNow(),
});
```

#### 4.2.8 `audit_log`（操作审计）

```typescript
export const audit_log = pgTable('audit_log', {
  id: serial('id').primaryKey(),
  user_id: text('user_id'),                      // 操作人
  action: text('action').notNull(),              // 'PERMISSION_CHANGE' / 'EMERGENCY_LOGIN' / ...
  target_type: text('target_type'),              // 操作对象类型
  target_id: text('target_id'),                  // 操作对象 ID
  before: jsonb('before'),                       // 变更前
  after: jsonb('after'),                         // 变更后
  ip: text('ip'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  idx_user_time: index().on(t.user_id, t.created_at),
  idx_action_time: index().on(t.action, t.created_at),
}));
```

### 4.3 字段别名（展示层翻译）

```typescript
// src/lib/field-alias/config.ts
export const FIELD_ALIAS = {
  douyin_session: {
    'total_diamond_count': '直播流水（钻石）',
    'audience_count': '观看人数',
    'gift_user_count': '送礼人数',
    // ...
  },
  kuaishou_session: {
    'gift_ks_coin': '直播流水（K币）',
    // ...
  },
};
```

**或者放到数据库（`field_alias` 表）让管理员在 UI 修改。** Phase 2 实施时根据用户偏好决定文件 vs 数据库。

---

## 5. 权限系统

### 5.1 两层身份

| 身份层 | 来源 | 可改吗 |
|---|---|---|
| **岗位**（position）| 钉钉同步 | 中台不可改 |
| **团队负责人**（dept_leader）| 中台手动设置 | 中台可改 |

### 5.2 数据范围权限（4 级）

```
NONE   < SELF   < TEAM   < ALL
```

| Scope | 含义 |
|---|---|
| `NONE` | 看不到任何主播/直播数据 |
| `SELF` | 看与自己有关的数据（含义见下） |
| `TEAM` | 看自己管理的部门（含子部门）成员的数据 |
| `ALL` | 看全部数据 |

### 5.3 SELF 的双重含义

`SELF` 对不同身份是不同含义，**系统自动 union**：

| 用户身份 | "自己的数据" |
|---|---|
| 主播本人（`anchor_profile.user_id` = 当前用户）| 看自己作为主播的直播数据 |
| 运营/剪辑（在 `anchor_operator` 里关联了若干主播）| 看负责的主播的数据 |
| 同时是主播又是运营 | 两者 union |

```sql
-- SELF scope 自动展开
WHERE anchor.user_id = :current_user_id
   OR anchor.id IN (
     SELECT anchor_profile_id FROM anchor_operator
     WHERE operator_user_id = :current_user_id
   )
```

> **⚠️ MVP 前提：所有主播必须有钉钉账号**（即在 `dingtalk_user` 表里有记录，`anchor_profile.user_id` 才能引用到）。
> 
> **如果未来出现外包/临时合作主播无钉钉账号的情况**，方案：单独建主播登录通道（手机号 + 验证码），加 `anchor_login` 表关联 `anchor_profile`。**此场景不在 MVP 范围，列为 Phase 3 待评估项。**

### 5.4 权限三层叠加

```
最终权限 = MAX(
  岗位默认 (role_default_permission),
  是否 dept_leader (是→TEAM, 否→NONE),
  override (auth_permission_override)
)
```

`MAX` 在 scope 序上：`NONE < SELF < TEAM < ALL`。

### 5.5 权限实现的统一 helper

```typescript
// src/modules/permissions/apply-scope.ts
export function applyScopeFilter<T>(
  query: T,
  user: AuthenticatedUser,
  permission: ResolvedPermission,
): T {
  switch (permission.scope) {
    case 'all':
      return query;
    case 'team':
      return query.where(belongsToManagedDepts(user));
    case 'self':
      return query.where(or(
        eq(anchor.user_id, user.id),
        inArray(anchor.id, getOperatorAnchorIds(user.id)),
      ));
    case 'none':
      return query.where(sql`false`);
  }
}
```

**所有数据查询都必须经过这个 helper**，禁止裸查询绕过权限。

### 5.6 统一管理员页面（一站式 UX）

权限管理整合在 **一个 `/admin/permissions` 页面** 内完成。

**设计动机：** 老中台 PRO3 把"组织同步"和"权限架构"分成两个页面，导致管理员要看一个用户的完整权限信息时必须**切来切去**——既费事，又容易遗漏。新中台把所有权限相关操作整合到同一视图，所有上下文在同一画面里。

**页面布局：**

```
/admin/permissions   ← 唯一权限管理入口

顶部 Tab：[按用户管理]  |  [岗位默认权限]  |  [审计日志]

═════════════════════════════════════════════════════════
【按用户管理】Tab（默认进入）
  ┌─ 左栏：用户列表
  │    - 搜索（姓名 / 手机 / 钉钉ID）
  │    - 筛选（按部门 / 岗位 / 最终权限范围）
  │    - 列表项：姓名 + 岗位 + 部门 + 当前 scope 彩标
  │
  └─ 右栏：选中用户详情（all-in-one）
       ├ 钉钉信息（只读，灰底标"来自钉钉同步"）
       ├ 团队负责人设置（添加/移除该用户管的部门）
       ├ 岗位默认权限（显示，可点击跳转到"岗位默认"Tab）
       ├ 个体覆盖（编辑，必填变更理由 + 可设过期时间）
       ├ 最终生效权限（彩色卡片，计算自三层叠加）
       └ 该用户的最近审计记录（最近 5 条）

═════════════════════════════════════════════════════════
【岗位默认权限】Tab
  - role_default_permission 表的可视化 CRUD
  - 添加新岗位（剪辑 / 客服 / ...）
  - 修改默认前提示"影响 N 个无 override 用户"
  - 删除前警告"影响 N 人"

═════════════════════════════════════════════════════════
【审计日志】Tab
  - audit_log 全表查询 + 筛选（操作人 / 时间 / 动作类型）
  - 应急登录（EMERGENCY_LOGIN）单独高亮
  - 支持导出 CSV（仅 can_export 用户可见按钮）
```

**核心 UX 原则：**

| 一个页面同时解决 | 替代以前的 |
|---|---|
| 看一个用户当前权限 | 切换到"组织"页面 |
| 调一个用户的权限 | 切换到"权限"页面 |
| 看一个用户管什么部门 | 切换到"组织架构"页面 |
| 看一个用户的权限变更历史 | 切换到"日志"页面 |

**实现提示：** 参考 PRO3 现有权限系统的业务逻辑（路径待用户确认），但 UI 必须重做成单页面。

---

## 6. 接口规范（强制）

### 6.1 必须做（MUST） / 严禁做（MUST NOT）

| MUST | MUST NOT |
|---|---|
| 新功能 = 新建 `modules/[name]/` 文件夹 | ❌ 在 `app/` 里直接写业务逻辑 |
| 所有 Server Action 入参必须 `Schema.parse()` | ❌ 用 `any` 类型绕过 Zod |
| 模块之间只能 `import` 对方的 `index.ts` | ❌ 跨模块 `import` 内部文件 |
| 爬虫数据原样落 `raw: jsonb` | ❌ 落库前做字段重命名/翻译 |
| 字段中文显示走 `field-alias` 配置 | ❌ 在数据库 schema 改字段名 |
| 错误必须 `throw new AppError(code, msg)` | ❌ `throw new Error('xxx')` |
| 数据库 schema 改动必须走 migration | ❌ 直接改 schema 不生成 migration |
| 数据查询必须经过 `applyScopeFilter` | ❌ 裸查询绕过权限 |
| 提交前 typecheck + lint 必须通过 | ❌ 用 `--no-verify` 绕过 hook |

### 6.2 自动化强制（机器代替人）

| 规则 | 强制方式 |
|---|---|
| 跨模块 import 内部文件 | ESLint/Biome `import/no-restricted-paths` |
| 没用 Zod 的 Server Action | 自定义 lint 规则扫描 `'use server'` |
| Type 不通过 | TypeScript strict + pre-commit hook |
| Schema 改动没走 migration | Drizzle `db:check` + CI |
| 表缺少 `raw: jsonb` | schema 单元测试 |
| commit message 不规范 | commitlint + husky |

### 6.3 加新功能的标准动作

```bash
# 1. 创建模块
mkdir src/modules/[feature]
cd src/modules/[feature]

# 2. 标准文件
touch schema.ts          # Zod 规则
touch actions.ts         # Server Actions
mkdir components         # 前端组件
touch index.ts           # 对外 export

# 3. 数据库 migration（如果有新表）
src/db/schema/[feature].ts
pnpm db:generate
pnpm db:migrate

# 4. 在导航/路由加入口
src/app/(dashboard)/[feature]/page.tsx

# 5. 在 CONTRIBUTING.md 列表里登记新模块
```

### 6.4 一次完整的"创建主播"功能示例

```typescript
// src/modules/anchor/schema.ts
export const CreateAnchorInput = z.object({
  user_id: z.string().min(1),
  platform: z.enum(['douyin', 'kuaishou']),
  platform_account_id: z.string().min(1),
  platform_room_id: z.string().optional(),
});
export type CreateAnchorInput = z.infer<typeof CreateAnchorInput>;
```

```typescript
// src/modules/anchor/actions.ts
'use server';
export async function createAnchor(input: unknown) {
  const data = CreateAnchorInput.parse(input);
  await assertPermission(currentUser(), 'can_edit');
  const [created] = await db.insert(anchor_profile).values(data).returning();
  await writeAuditLog('CREATE_ANCHOR', null, created);
  return created;
}
```

```typescript
// src/modules/anchor/components/CreateAnchorForm.tsx
const form = useForm<CreateAnchorInput>({
  resolver: zodResolver(CreateAnchorInput),
});
const onSubmit = async (data: CreateAnchorInput) => {
  await createAnchor(data);
};
```

### 6.5 错误码规范

格式：`{模块}_{类型}_{原因}`

| 错误码 | HTTP Status | 含义 |
|---|---|---|
| `ANCHOR_NOT_FOUND` | 404 | 主播不存在 |
| `ANCHOR_DUPLICATE_ACCOUNT` | 409 | 平台账号已被绑定 |
| `DINGTALK_SYNC_FAILED` | 500 | 钉钉同步失败 |
| `CRAWLER_DOUYIN_RATE_LIMITED` | 429 | 抖音限流 |
| `AUTH_INVALID_TOKEN` | 401 | Token 无效 |
| `AUTH_FORBIDDEN_SCOPE` | 403 | 权限不足 |
| `VALIDATION_FAILED` | 400 | Zod 校验失败 |

---

## 7. 关键流程

### 7.1 登录流程

```
访问 https://qjhy.your-domain.com
  ↓ 未登录
跳 /login
  ↓
[钉钉扫码] 路径：
  钉钉 OAuth → 拿 user_id → 查 dingtalk_user → 存 session → 跳 /dashboard
  
[应急后门] 路径（仅生产保留，强约束）：
  env 配置的 ADMIN_PASSWORD（32 位 + 二步验证）
  → 钉钉机器人通知"应急账号登录"
  → 写 audit_log（标记 EMERGENCY_LOGIN）
  → 跳 /dashboard（拥有 ALL 权限）
```

### 7.2 钉钉同步流程（每天 02:00）

```
worker/jobs/sync-dingtalk.ts
  ↓
1. 钉钉 API 拉部门 → upsert dingtalk_dept（raw 全存）
2. 钉钉 API 拉人员 → upsert dingtalk_user（raw 全存）
3. 不在最新列表的 user → active = false（不删除）
4. 写 sync_log
  ↓
失败 → AppError → 钉钉机器人通知（含"报错"关键词）+ Sentry 上报（生产）
```

**复用提示：** Phase 1 实施时参考老中台 pro3 的钉钉同步实现，拆出"原始字段输出"层（不再做翻译）。

### 7.3 直播数据爬取流程（每天 03:00）

```
worker/jobs/crawl-douyin.ts
  ↓
1. 查 anchor_profile WHERE platform='douyin' AND user.active=true
2. 对每个主播账号：
   a. 调爬虫拉昨天的所有单场数据
   b. 对每条数据按 session_id upsert 到 douyin_session
   c. 整条 JSON 落 raw 字段
3. 写 crawl_log
  ↓
失败的账号 → 重试 3 次 → 仍失败 → 钉钉机器人通知
```

**幂等性保证：** `session_id` 是抖音返回的唯一标识，作为 unique key，重复爬取自动跳过。

**爬虫复用：** 复用老中台 pro3 的爬虫核心，但落库改为 `raw: jsonb`。新增爬取板块（用户提到"抖音数据被拆到很多板块"）按需追加。

### 7.4 数据看板查询

```
浏览器访问 /dashboard/live-data
  ↓
Next.js Server Component（SSR）
  ↓
当前用户 → 计算最终权限（三层叠加）
  ↓
查询 douyin_session / kuaishou_session
  ↓ 必须经过
applyScopeFilter(query, user, permission)
  ↓ 自动注入 WHERE 条件
  ↓
从 raw 中 extract 字段 + field_alias 翻译
  ↓
渲染 HTML 返回浏览器
```

### 7.5 错误通知（钉钉机器人）

```typescript
// src/lib/notify/dingtalk-bot.ts
export async function notifyError(err: AppError, context: object) {
  const message = `【报错】${err.code}\n详情：${err.message}\n上下文：${JSON.stringify(context)}`;
  // ↑ "报错" 是机器人配置的关键词
  await fetch(process.env.DINGTALK_BOT_WEBHOOK, {
    method: 'POST',
    body: JSON.stringify({ msgtype: 'text', text: { content: message } }),
  });
}
```

**配置项**（`.env`）：
```
DINGTALK_BOT_WEBHOOK=https://oapi.dingtalk.com/robot/send?access_token=***
```

**禁止：** 把 webhook 真实 token 写进任何代码文件、文档或 git commit。

---

## 8. 技术栈

### 8.1 MVP 必上骨架

| 层 | 选型 | 理由 |
|---|---|---|
| 前端框架 | Next.js 15 (App Router + RSC + Server Actions) | 单体最佳载体 |
| 语言 | TypeScript strict mode | 类型即接口契约 |
| 样式 | Tailwind v4 | 主流 |
| UI 组件 | shadcn/ui | 源码可改不被锁 |
| 数据库 | PostgreSQL（自建，不用 Neon/Supabase） | 国内 + jsonb 神器 |
| ORM | Drizzle | SQL 风格 AI 友好 |
| 校验 | Zod（前后端共用 schema） | 接口规范化的核心 |
| 鉴权 | better-auth（钉钉 OAuth + 后门） | 自托管 |
| 包管理 | pnpm（不上 Turborepo） | 单仓库够用 |

### 8.2 MVP 推荐加（写第一个表单/页面就要用）

| 层 | 选型 |
|---|---|
| 表单 | React Hook Form + Zod resolver |
| 数据获取 | TanStack Query |
| 图表 | Tremor + Recharts |

### 8.3 MVP 暂缓

| 层 | 选型 | 原因 |
|---|---|---|
| 测试 | Vitest + Playwright | 先有功能再补 |
| Linter | Biome 替代 ESLint+Prettier | 可以但不急，先用主流 |
| 监控 | Sentry | 跑起来再加 |
| 对象存储 | 阿里云 OSS / 腾讯云 COS | 暂时不存文件 |

### 8.4 不要碰

Clerk（国外 SaaS，钉钉集成不友好）、Vercel（国内访问差、爬虫跑不了）、Neon/Supabase（国内访问问题）、Cloudflare R2（国内不稳）、Resend（不发邮件）。

---

## 9. MVP 实施分期

### 9.1 Phase 0：地基（写业务代码之前必须完成）

| 任务 | 完成标志 |
|---|---|
| 初始化 Next.js 15 + pnpm + TS strict | `pnpm dev` 能跑 |
| 安装 Tailwind v4 + shadcn/ui | 几个示例组件能渲染 |
| 配置 ESLint/Biome + 跨模块 import 限制 | 故意写违规代码会报红 |
| pre-commit hook（typecheck + lint + format） | 不通过不能提交 |
| Docker Compose 三容器（postgres + web + worker 占位）| `docker-compose up` 三个容器都起 |
| Drizzle 接 Postgres + 第一个 migration（建占位表）| `pnpm db:migrate` 可跑 |
| 写 `CONTRIBUTING.md`（含本 spec 第6章规范） | 内容包含 MUST / MUST NOT 表 |
| 钉钉机器人通知封装（含"报错"关键词，token 走 env） | 测试函数能收到钉钉通知 |
| better-auth + 钉钉 OAuth + 应急后门账号 | 两种方式都能登录 |
| 探查抖音/快手平台数据样本（拉真实 JSON 落到 docs/raw-samples/） | 有样本指导后续 schema |
| commitlint + 提交规范 | 不规范 commit 被拒 |

**Phase 0 完成 = 任何模块都能基于一致的规范开始写。**

### 9.2 Phase 1：组织架构 + 权限基础

**复用提示：钉钉同步参考 pro3 项目实现，但拆出"原始字段输出"层。**

| 任务 | 完成标志 |
|---|---|
| Schema：`dingtalk_dept` / `dingtalk_user` / `dept_leader` / `role_default_permission` / `auth_permission_override` / `audit_log` | migration 跑完 |
| Worker job：每天 02:00 同步钉钉 | 跑一次能看到表里有数据 |
| `modules/permissions/`：权限计算（三层叠加）+ `applyScopeFilter` | 单元测试覆盖各角色组合 |
| 页面 `/admin/permissions`（**统一管理**，含三 Tab）| 详见 5.6：按用户管理 / 岗位默认权限 / 审计日志 |
| ⤷ 子功能：用户列表 + 详情面板（左右栏） | 一个用户的所有权限信息一屏可见 |
| ⤷ 子功能：团队负责人设置（在用户详情里） | 添加/移除该用户管理的部门 |
| ⤷ 子功能：个体权限覆盖（在用户详情里） | 必填理由 + 可设过期时间 |
| ⤷ 子功能：岗位默认权限编辑（独立 Tab） | 加新岗位 / 改默认 |
| ⤷ 子功能：审计日志查询（独立 Tab） | 应急登录单独高亮 |
| 页面 `/profile` | 当前用户看自己权限来源 |

**Phase 1 完成 = 系统知道"谁能看什么"，但还没业务数据。**

### 9.3 Phase 2：直播数据 MVP

**复用提示：爬虫核心来自 pro3，但落库改为 `raw: jsonb`，新增板块按需追加。**

| 任务 | 完成标志 |
|---|---|
| Schema：`anchor_profile` / `anchor_operator` / `douyin_session` / `kuaishou_session` / `crawl_log` | migration 跑完 |
| `modules/anchor/`：主播 CRUD + 关联运营 | 页面创建/编辑/关联 |
| `modules/crawler/douyin/`：抖音爬虫，原样落 raw | 凌晨 03:00 自动跑 |
| `modules/crawler/kuaishou/` | 同上 |
| `modules/live-data/`：看板（带权限过滤） | 不同 scope 看不同范围 |
| `field_alias` 配置 + 展示层翻译 | 页面显示中文，数据库英文 |
| 页面 `/dashboard/live-data` | 列表 + 筛选 + 详情 |
| 页面 `/admin/crawl-status` | 显示爬虫运行状态 |
| 页面 `/admin/field-alias`（可选）| UI 编辑字段别名 |
| 失败时钉钉机器人通知 | 故意制造失败可收到 |

**Phase 2 完成 = 新中台的核心 MVP 交付，可投入使用。**

### 9.4 Phase 3（路线图，不在 MVP）

仅作为方向参考，**不在第一版交付范围**：

- 主播扩展字段（人设 / 试岗节点 / 绩效 / 培训）
- 数据导出（Excel / CSV）
- 自动日报推送钉钉
- 老中台业务模块逐步迁移
- 性能优化（数据多了再看）
- 移动端独立 H5（如果 PC 响应式不够用）

### 9.5 时间预估（粗）

| Phase | 工作量（多 agent 协作）| 备注 |
|---|---|---|
| Phase 0 | 3-5 天 | 全 AI 协作 |
| Phase 1 | 5-7 天 | 钉钉对接是最大不确定性 |
| Phase 2 | 10-14 天 | 爬虫整改 + 看板是大头 |
| **合计** | **3-4 周** | 多 agent 并行可压缩 |

---

## 10. 开发规范（CONTRIBUTING.md 内容）

> 本节内容会单独输出为 `CONTRIBUTING.md` 放在仓库根目录。所有贡献者（包括 AI agent）必须先阅读。

### 10.1 命名规范

- **文件名：** kebab-case（`anchor-profile.ts`）
- **变量/函数：** camelCase
- **类/类型：** PascalCase
- **常量：** SCREAMING_SNAKE_CASE
- **数据库表/列：** snake_case
- **错误码：** SCREAMING_SNAKE_CASE 格式 `{MODULE}_{TYPE}_{REASON}`

### 10.2 文件结构规则

- 一个业务功能 = 一个 `src/modules/[feature]/` 文件夹
- 每个模块必须有 `index.ts` 暴露公开 API
- 模块之间只能 `import` 对方的 `index.ts`
- 不允许在 `src/app/` 里直接写业务逻辑（仅用作页面/路由）

### 10.3 类型 / Zod 规则

- TypeScript strict mode 必开
- 严禁 `any`（除非有 `// eslint-disable` + 理由）
- 所有 Server Action / Route Handler 必须 `Schema.parse(input)`
- TypeScript 类型从 Zod 推导（`z.infer`），不重复定义

### 10.4 数据库 / Migration 规则

- 任何 schema 改动必须走 Drizzle migration
- 事实数据表必须有 `raw: jsonb` 字段（爬虫表强制，业务表非强制）
- 落库时禁止字段重命名、翻译、换算
- 数据查询必须经过 `applyScopeFilter`（除明确的管理员接口）

### 10.5 错误处理规则

- 不允许 `throw new Error(...)`，必须 `throw new AppError(code, message, httpStatus)`
- 错误码格式 `{MODULE}_{TYPE}_{REASON}`
- 关键错误必须发钉钉机器人通知（含"报错"关键词）

### 10.6 Git / Commit 规则

- Conventional Commits（`feat:` / `fix:` / `chore:` / ...）
- 一个 commit 一个目的，不混合修改
- 严禁 `git commit --no-verify` 绕过 pre-commit hook
- 严禁把 secret（token / 密码 / webhook）写进代码或 commit

### 10.7 Code Review 检查清单

- [ ] 新增功能是否在 `src/modules/[feature]/`？
- [ ] 是否所有 Server Action 都 `Schema.parse()`？
- [ ] 是否有跨模块 import 内部文件？
- [ ] 是否有 `any` / `as any` 偷懒？
- [ ] 数据查询是否经过 `applyScopeFilter`？
- [ ] 错误是否用 `AppError`？
- [ ] commit message 是否规范？

---

## 11. 风险与开放问题

### 11.1 已知风险

| 风险 | 缓解 |
|---|---|
| 抖音/快手平台改版导致爬虫失效 | crawl_log + 钉钉机器人通知，人工介入 |
| 钉钉 API 变更 | sync_log + 监控 |
| Phase 0 规范不到位导致后续破窗 | 自动化检查（lint/CI/hook）覆盖 |
| 应急后门被泄露 | env 32位密码 + 二步验证 + audit_log |
| Postgres 备份缺失 | Phase 0 配置 docker volume + 定时 dump |

### 11.2 待 Phase 0 解决的探查项

1. **抖音数据样本**：拉一次老爬虫的真实输出，落到 `docs/raw-samples/douyin-session-sample.json`
2. **快手数据样本**：同上 `docs/raw-samples/kuaishou-session-sample.json`
3. **pro3 钉钉同步代码定位**：找出 pro3 项目里钉钉同步的实现路径，文档化
3a. **pro3 权限系统代码定位**：用户提示 PRO3 也有完整权限系统实现（钉钉同步 + 权限分页两块），新中台参考其业务逻辑但 UI 整合到单页面（详见 5.6）
4. **新增爬取板块清单**：用户提到"抖音数据被拆到很多板块需要切换"——具体哪些板块要拉，Phase 0 列清单
5. **公网部署目标确认**：云服务器 / NAS+域名 / 其他？影响 Docker Compose 配置

### 11.3 待 Phase 1 决策的细节

- TEAM scope 是否包含子部门（递归）？默认应该包含——用 PostgreSQL recursive CTE 实现。
- 应急后门的"二步验证"用什么方式？短信？钉钉机器人发码？
- field_alias 放配置文件还是数据库？文件简单，数据库灵活——MVP 先文件，Phase 2 末根据使用情况决定迁移到数据库。

### 11.4 待 Phase 2 决策的细节

- 是否做日聚合表 `*_daily`？看 session 表查询性能。
- 爬虫失败 3 次后的"人工介入"流程怎么定义？

---

## 12. 参考资料

- 老中台项目（pro3）：`/Users/zhangjin/miracle-pro3`
  - 技术栈：React + Express + SQLite（database.sqlite 已达 636MB，证明了 SQLite 性能瓶颈）
  - 钉钉同步 + 权限系统都有现成实现
  - **复用范围**：业务逻辑（同步流程、权限计算逻辑）
  - **不复用**：UI（pro3 是分两个页面，新中台整合到单页面，详见 5.6）
  - **不复用**：数据 schema（pro3 字段被翻译过，新中台必须以平台原始字段为准）
  - 具体钉钉同步代码 / 权限系统代码的文件路径，由 Phase 1 实施 agent 通过 grep 在 `/Users/zhangjin/miracle-pro3` 中定位
- 钉钉机器人 webhook：env 配置 `DINGTALK_BOT_WEBHOOK`，关键词 "报错"
- 设计决策对话日期：2026-04-30
- 多 agent 协作：feature-first 架构天然支持，每个 `modules/` 是独立工作单元

---

## 13. 评审记录

- V1.0 (2026-04-30)：初版，基于完整 brainstorming 对话产出，待用户评审
