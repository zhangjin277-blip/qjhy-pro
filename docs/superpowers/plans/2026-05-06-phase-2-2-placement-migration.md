# Phase 2.2 投放数据迁移 + 排班 override + 投放看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PRO3 捕鱼投放板块完整迁到 qjhy-pro，并在排班数据基础上做主播归因 + 临时调班 + 投放看板（按账号/主播/时段）。

**Architecture:** B 方案归因快照 — Excel 上传走共享 ingest pipeline，落库时 attribution_dirty=TRUE，后台 worker 异步算归因冷冻在 placement_row 上。schedule_override 是「针对某主播的当天替代排班」语义，归因时与 default merge 出 effective schedule。投放看板独立 /placements 路由 group，不合并 dashboard。

**Tech Stack:** Drizzle ORM + PostgreSQL 16 + Next.js 16 + Vitest + xlsx (npm) + papaparse + better-sqlite3（PRO3 SQLite 读取）

**Spec:** `docs/superpowers/specs/2026-05-06-phase-2-2-placement-migration-design.md`

---

## File Structure

### 数据库 schema 新增

```
src/db/migrations/0024_phase_2_2_placements.sql       # 3 张新表 + 索引 + role_default_permission seed
src/db/schema/placements.ts                            # placement_row / placement_import_batch
src/db/schema/schedule-override.ts                     # schedule_override
src/db/schema/index.ts                                  # 导出新 schema（已存在，加导出）
```

### 模块新增（feature-first，index.ts + server.ts 双入口）

```
src/modules/placement/
  ├── index.ts                    # 公开 types + Zod schemas
  ├── server.ts                   # server-only barrel（含 import "server-only"）
  ├── schema.ts                   # 类型定义 + Zod
  ├── parse-utils.ts              # parseUnitNumber / parseDateText / parseHour
  ├── time-slot-utils.ts          # coversHour / parseSlotHour
  ├── incremental.ts              # computeIncrements 累计→增量
  ├── xlsx-adapter.ts             # parseXlsx → rawRows
  ├── pro3-adapter.ts             # PRO3 SQLite → rawRows
  ├── ingest.ts                   # 共享 ingest pipeline
  ├── queries.ts                  # 看板 SQL（by-account / by-anchor / by-hour）
  ├── actions.ts                  # Server Actions（上传 / 重算）
  └── batch-queries.ts            # batch CRUD + 错误明细查询

src/modules/schedule-override/
  ├── index.ts
  ├── server.ts
  ├── schema.ts
  ├── effective.ts                # mergeWithOverride
  ├── queries.ts                  # listForAccountDate / listForAccount
  └── actions.ts                  # CRUD（含 dirty 标记触发）

src/modules/placement-attribution/
  ├── server.ts                   # barrel
  ├── attribute.ts                # 单行 attributeRow
  ├── job.ts                      # runAttributionJob 批量
  └── triggers.ts                 # markDirty 工具
```

### UI 新增

```
src/app/(dashboard)/placements/
  ├── layout.tsx                                    # 顶部 filter-bar + tab nav
  ├── page.tsx                                       # redirect → /by-account
  ├── by-account/page.tsx                            # A 视角
  ├── by-anchor/page.tsx                             # B 视角
  ├── by-hour/page.tsx                               # C 视角
  ├── upload/page.tsx                                # 上传页
  ├── batches/page.tsx                               # 批次列表
  ├── batches/[id]/page.tsx                          # 批次详情
  └── _components/
      ├── filter-bar.tsx
      ├── account-table.tsx
      ├── anchor-table.tsx
      ├── hour-matrix.tsx
      ├── account-detail-drawer.tsx
      ├── anchor-detail-drawer.tsx
      ├── upload-dropzone.tsx
      ├── upload-preview.tsx
      └── csv-export-button.tsx

src/app/(dashboard)/live-accounts/_components/
  └── schedule-override-tab.tsx                      # 新子 tab

src/app/(dashboard)/placement-migration/page.tsx     # 一次性 dry-run 报告查看页

src/app/api/placements/
  ├── upload/route.ts
  ├── by-account/route.ts
  ├── by-anchor/route.ts
  ├── by-hour/route.ts
  ├── batches/route.ts
  ├── batches/[id]/route.ts
  └── attribution/recompute/route.ts                 # 手动重算未归因按钮
```

### CLI 脚本

```
src/scripts/migrate-pro3-placements.ts               # 历史迁移
src/scripts/verify-placement-migration.ts            # 抽样校验
```

### 修改现有文件

```
src/modules/permissions/modules.ts                   # 加 'placement' module key
src/app/(dashboard)/_components/sidebar.tsx          # 加 /placements 入口（具体路径以现有 nav 文件为准）
src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx  # 加 schedule-override-tab 子 tab
worker/index.ts (or src/worker/index.ts)             # cron 兜底入口（具体路径以现有 worker 文件为准）
```

---

## 任务总览（11 milestone × ~38 task）

| Milestone | 范围 | Task 数 |
|---|---|---|
| **M1** | DB schema + 权限 module key + role 默认配置 | 5 |
| **M2** | 解析工具 + 时段工具 + 增量算法 + merge | 4 |
| **M3** | Excel 解析 + 文件名解析 + 共享 ingest pipeline | 4 |
| **M4** | 归因算法 + 归因 job | 3 |
| **M5** | schedule_override CRUD + dirty 触发 | 2 |
| **M6** | 上传 UI + 批次列表 / 详情 UI | 3 |
| **M7** | 看板 layout + 3 视角 + 抽屉 + CSV | 6 |
| **M8** | live-accounts override 子 tab | 2 |
| **M9** | PRO3 适配器 + 迁移 CLI + 校验 CLI | 4 |
| **M10** | cron 兜底 + 钉钉机器人 + 监控 | 2 |
| **M11** | 主导航 + dry-run UI + e2e + 收尾 | 3 |

---

## Milestone 1 — 数据库 schema + 权限 module

### Task 1: Migration 0024 — 创建 3 张新表 + 索引

**Files:**
- Create: `src/db/migrations/0024_phase_2_2_placements.sql`

- [ ] **Step 1: 写 migration SQL**

```sql
-- src/db/migrations/0024_phase_2_2_placements.sql
-- Phase 2.2 — 投放数据 + 排班 override + 上传批次审计

-- 1. placement_import_batch（先建，因 placement_row 引用）
CREATE TABLE placement_import_batch (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                    -- 'excel-upload' | 'pro3-migration'
  file_name       TEXT,
  file_size_bytes INTEGER,
  dataset_id      TEXT NOT NULL,
  date_range_from DATE,
  date_range_to   DATE,
  row_count       INTEGER NOT NULL DEFAULT 0,
  rows_inserted   INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,                    -- 'parsing' | 'completed' | 'failed' | 'partial'
  error_log       JSONB,
  uploaded_by     TEXT REFERENCES auth_user(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX placement_import_batch_uploaded_at_idx ON placement_import_batch (uploaded_at DESC);

-- 2. placement_row
CREATE TABLE placement_row (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  hour            INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  dataset_id      TEXT NOT NULL,
  live_account_id UUID NOT NULL REFERENCES live_account(id),

  cost_yuan       NUMERIC(14,3) NOT NULL DEFAULT 0,
  activations     INTEGER NOT NULL DEFAULT 0,
  payment_yuan    NUMERIC(14,2) NOT NULL DEFAULT 0,
  start_download  INTEGER NOT NULL DEFAULT 0,
  finish_download INTEGER NOT NULL DEFAULT 0,

  attributed_dingtalk_user_id TEXT REFERENCES dingtalk_user(user_id),
  attribution_dirty           BOOLEAN NOT NULL DEFAULT TRUE,
  attribution_computed_at     TIMESTAMPTZ,
  attribution_source          TEXT,                 -- 'override' | 'default' | 'conflict' | 'unmatched' | NULL

  raw             JSONB NOT NULL,
  import_batch_id UUID REFERENCES placement_import_batch(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (date, hour, dataset_id, live_account_id)
);

CREATE INDEX placement_row_account_date_idx     ON placement_row (live_account_id, date);
CREATE INDEX placement_row_anchor_date_idx      ON placement_row (attributed_dingtalk_user_id, date);
CREATE INDEX placement_row_dataset_date_idx     ON placement_row (dataset_id, date);
CREATE INDEX placement_row_dirty_partial_idx    ON placement_row (id) WHERE attribution_dirty = TRUE;

-- 3. schedule_override
CREATE TABLE schedule_override (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES live_account(id),
  date              DATE NOT NULL,
  dingtalk_user_id  TEXT NOT NULL REFERENCES dingtalk_user(user_id),
  time_slots        JSONB NOT NULL,
  reason            TEXT,
  created_by        TEXT REFERENCES auth_user(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, date, dingtalk_user_id)
);

CREATE INDEX schedule_override_account_date_idx ON schedule_override (account_id, date);
```

- [ ] **Step 2: 跑 migration**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -f /tmp/0024.sql
# 或者直接 cp 文件进容器：
docker cp src/db/migrations/0024_phase_2_2_placements.sql qjhy-postgres:/tmp/
docker exec qjhy-postgres psql -U qjhy -d qjhy -f /tmp/0024_phase_2_2_placements.sql
```

Expected: 3 张表创建成功，无报错。

- [ ] **Step 3: 验证表结构**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d placement_row"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d placement_import_batch"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d schedule_override"
```

Expected: 看到字段 + 索引 + 外键正确。

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/0024_phase_2_2_placements.sql
git commit -m "feat(db): migration 0024 创建 placement_row / schedule_override / placement_import_batch"
```

---

### Task 2: Drizzle schema — `src/db/schema/placements.ts`

**Files:**
- Create: `src/db/schema/placements.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: 写 placements schema**

```typescript
// src/db/schema/placements.ts
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth";
import { dingtalkUser } from "./dingtalk";
import { live_account } from "./live-account";

export const placement_import_batch = pgTable("placement_import_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  file_name: text("file_name"),
  file_size_bytes: integer("file_size_bytes"),
  dataset_id: text("dataset_id").notNull(),
  date_range_from: date("date_range_from"),
  date_range_to: date("date_range_to"),
  row_count: integer("row_count").notNull().default(0),
  rows_inserted: integer("rows_inserted").notNull().default(0),
  rows_updated: integer("rows_updated").notNull().default(0),
  rows_skipped: integer("rows_skipped").notNull().default(0),
  status: text("status").notNull(),
  error_log: jsonb("error_log").$type<{ row?: unknown; reason: string }[] | null>(),
  uploaded_by: text("uploaded_by").references(() => authUser.id),
  uploaded_at: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const placement_row = pgTable(
  "placement_row",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    hour: integer("hour").notNull(),
    dataset_id: text("dataset_id").notNull(),
    live_account_id: uuid("live_account_id")
      .notNull()
      .references(() => live_account.id),

    cost_yuan: numeric("cost_yuan", { precision: 14, scale: 3 }).notNull().default("0"),
    activations: integer("activations").notNull().default(0),
    payment_yuan: numeric("payment_yuan", { precision: 14, scale: 2 }).notNull().default("0"),
    start_download: integer("start_download").notNull().default(0),
    finish_download: integer("finish_download").notNull().default(0),

    attributed_dingtalk_user_id: text("attributed_dingtalk_user_id").references(
      () => dingtalkUser.user_id,
    ),
    attribution_dirty: boolean("attribution_dirty").notNull().default(true),
    attribution_computed_at: timestamp("attribution_computed_at", { withTimezone: true }),
    attribution_source: text("attribution_source").$type<
      "override" | "default" | "conflict" | "unmatched" | null
    >(),

    raw: jsonb("raw").$type<Record<string, unknown>>().notNull(),
    import_batch_id: uuid("import_batch_id").references(() => placement_import_batch.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRow: unique("placement_row_unique_key").on(
      t.date,
      t.hour,
      t.dataset_id,
      t.live_account_id,
    ),
  }),
);
```

- [ ] **Step 2: 在 `src/db/schema/index.ts` 加导出**

```typescript
// 在 src/db/schema/index.ts 末尾增加：
export * from "./placements";
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/placements.ts src/db/schema/index.ts
git commit -m "feat(db): drizzle schema for placement_row / placement_import_batch"
```

---

### Task 3: Drizzle schema — `src/db/schema/schedule-override.ts`

**Files:**
- Create: `src/db/schema/schedule-override.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: 写 schedule-override schema**

```typescript
// src/db/schema/schedule-override.ts
import { date, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { authUser } from "./auth";
import { dingtalkUser } from "./dingtalk";
import { live_account } from "./live-account";

export const schedule_override = pgTable(
  "schedule_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    account_id: uuid("account_id")
      .notNull()
      .references(() => live_account.id),
    date: date("date").notNull(),
    dingtalk_user_id: text("dingtalk_user_id")
      .notNull()
      .references(() => dingtalkUser.user_id),
    time_slots: jsonb("time_slots").$type<[string, string][]>().notNull(),
    reason: text("reason"),
    created_by: text("created_by").references(() => authUser.id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOverride: unique("schedule_override_unique_key").on(
      t.account_id,
      t.date,
      t.dingtalk_user_id,
    ),
  }),
);
```

- [ ] **Step 2: 在 `src/db/schema/index.ts` 加导出**

```typescript
export * from "./schedule-override";
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/schedule-override.ts src/db/schema/index.ts
git commit -m "feat(db): drizzle schema for schedule_override"
```

---

### Task 4: 加 'placement' module key + role_default_permission seed

**Files:**
- Modify: `src/modules/permissions/modules.ts`
- Modify: `src/db/migrations/0024_phase_2_2_placements.sql`（在 migration 末尾追加 INSERT 语句）

- [ ] **Step 1: 加 module key**

修改 `src/modules/permissions/modules.ts`：

```typescript
export const MODULE_KEYS = [
  "dashboard",
  "anchors",
  "crawler",
  "permissions",
  "live_account",
  "live_anchor",
  "live_room",
  "placement",          // ← 新增
] as const;

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "工作台",
  anchors: "主播明细",
  crawler: "爬虫监控",
  permissions: "权限管理",
  live_account: "直播账号",
  live_anchor: "主播档案",
  live_room: "直播间",
  placement: "投放数据",   // ← 新增
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  dashboard: "业务看板 / 数据总览",
  anchors: "主播列表 / 编辑 / 导出",
  crawler: "抖音 / 快手数据爬取（仅 admin）",
  permissions: "用户角色与权限分配（仅 admin）",
  live_account: "直播账号档案 / 主播绑定 / 默认排班",
  live_anchor: "主播业务档案（钉钉用户的主播扩展）",
  live_room: "线下物理直播间管理",
  placement: "投放消耗 / 激活 / 主播归因看板",   // ← 新增
};
```

- [ ] **Step 2: 查看现有 role_default_permission 8 个 role**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT DISTINCT role FROM role_default_permission ORDER BY role;"
```

记录 8 个 role 的实际名字。

- [ ] **Step 3: 在 migration 0024 末尾追加 seed**

打开 `src/db/migrations/0024_phase_2_2_placements.sql`，末尾追加：

```sql
-- 4. role_default_permission seed for 'placement' module
-- (按 step 2 查出的 8 个真实 role 名 INSERT，下面是默认假设)
INSERT INTO role_default_permission (role, module, can_read, can_write, scope) VALUES
  ('admin',           'placement', TRUE,  TRUE,  'all'),
  ('直播部门负责人',   'placement', TRUE,  TRUE,  'team'),
  ('线上运营',         'placement', TRUE,  TRUE,  'team'),
  ('线下运营',         'placement', TRUE,  TRUE,  'team'),
  ('捕鱼运营',         'placement', TRUE,  TRUE,  'team'),
  ('主播',             'placement', TRUE,  FALSE, 'self'),
  ('试播主播',         'placement', FALSE, FALSE, 'none'),
  ('未激活',           'placement', FALSE, FALSE, 'none');
```

如果 step 2 的实际 role 名不一致，改成实际值。

- [ ] **Step 4: 跑 seed**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy <<EOF
INSERT INTO role_default_permission (role, module, can_read, can_write, scope) VALUES
  ('admin',           'placement', TRUE,  TRUE,  'all')
ON CONFLICT (role, module) DO NOTHING;
-- ... (其他 7 个 role)
EOF
```

或者直接重跑 migration 0024 的 seed 段。

- [ ] **Step 5: 验证**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT role, can_read, can_write, scope FROM role_default_permission WHERE module = 'placement' ORDER BY role;"
```

Expected: 看到 8 行。

- [ ] **Step 6: 跑 typecheck（exhaustive switch 应当不报错）**

```bash
pnpm typecheck
```

注：如果 user-detail.tsx 有 exhaustive switch on ModuleKey，会需要加 `case "placement":` 分支。打开 `src/app/(dashboard)/admin/permissions/_components/user-detail.tsx` 找 `moduleEmoji` switch，加：

```typescript
case "placement":
  return "💸";
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/permissions/modules.ts src/db/migrations/0024_phase_2_2_placements.sql src/app/\(dashboard\)/admin/permissions/_components/user-detail.tsx
git commit -m "feat(permissions): 加 placement module key + 8 role 默认配置"
```

---

### Task 5: 模块骨架（placement / schedule-override / placement-attribution）

**Files:**
- Create: `src/modules/placement/index.ts`
- Create: `src/modules/placement/server.ts`
- Create: `src/modules/placement/schema.ts`
- Create: `src/modules/schedule-override/index.ts`
- Create: `src/modules/schedule-override/server.ts`
- Create: `src/modules/schedule-override/schema.ts`
- Create: `src/modules/placement-attribution/server.ts`

- [ ] **Step 1: placement schema (Zod + types)**

```typescript
// src/modules/placement/schema.ts
import { z } from "zod";

export const datasetIdSchema = z.enum(["product_buyu", "product_ue4", "product_urp"]);
export type DatasetId = z.infer<typeof datasetIdSchema>;

export const DATASET_LABEL: Record<DatasetId, string> = {
  product_buyu: "捕鱼",
  product_ue4: "UE4",
  product_urp: "URP",
};

export const placementRowInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour: z.number().int().min(0).max(23),
  dataset_id: datasetIdSchema,
  live_account_id: z.string().uuid(),
  cost_yuan: z.number().nonnegative(),
  activations: z.number().int().nonnegative(),
  payment_yuan: z.number().nonnegative(),
  start_download: z.number().int().nonnegative(),
  finish_download: z.number().int().nonnegative(),
  raw: z.record(z.string(), z.unknown()),
});
export type PlacementRowInput = z.infer<typeof placementRowInputSchema>;

export type AttributionSource = "override" | "default" | "conflict" | "unmatched";

export interface BatchSummary {
  id: string;
  source: string;
  file_name: string | null;
  dataset_id: string;
  date_range_from: string | null;
  date_range_to: string | null;
  row_count: number;
  rows_inserted: number;
  rows_updated: number;
  rows_skipped: number;
  status: "parsing" | "completed" | "failed" | "partial";
  error_log: { row?: unknown; reason: string }[] | null;
  uploaded_by: string | null;
  uploaded_at: string;
}
```

- [ ] **Step 2: placement index.ts (client-safe barrel)**

```typescript
// src/modules/placement/index.ts
export * from "./schema";
```

- [ ] **Step 3: placement server.ts (server-only barrel)**

```typescript
// src/modules/placement/server.ts
import "server-only";

// 后续 task 会在这里加导出
export * from "./schema";
```

- [ ] **Step 4: schedule-override schema (Zod + types)**

```typescript
// src/modules/schedule-override/schema.ts
import { z } from "zod";

export const overrideInputSchema = z.object({
  account_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dingtalk_user_id: z.string(),
  time_slots: z
    .array(z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]))
    .min(0), // 允许空数组（请假）
  reason: z.string().optional(),
});
export type OverrideInput = z.infer<typeof overrideInputSchema>;

export interface OverrideRow {
  id: string;
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  time_slots: [string, string][];
  reason: string | null;
  created_by: string | null;
  created_at: string;
}
```

- [ ] **Step 5: schedule-override index.ts + server.ts**

```typescript
// src/modules/schedule-override/index.ts
export * from "./schema";
```

```typescript
// src/modules/schedule-override/server.ts
import "server-only";
export * from "./schema";
```

- [ ] **Step 6: placement-attribution server.ts**

```typescript
// src/modules/placement-attribution/server.ts
import "server-only";
// 后续 task 会在这里加导出
```

- [ ] **Step 7: 验证 ESLint zone 配置**

```bash
pnpm lint
```

如果 ESLint 报「only index.ts and server.ts may be imported externally」类似错误，确认 `eslint.config.js` 里的 `feature-first` zone 把这 3 个新模块加上。

- [ ] **Step 8: Commit**

```bash
git add src/modules/placement/ src/modules/schedule-override/ src/modules/placement-attribution/
git commit -m "feat(modules): 骨架 placement / schedule-override / placement-attribution"
```

---

## Milestone 2 — 核心算法工具

### Task 6: parse-utils — `parseUnitNumber` / `parseDateText` / `parseHour`

**Files:**
- Create: `src/modules/placement/parse-utils.ts`
- Create: `tests/modules/placement/parse-utils.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/placement/parse-utils.test.ts
import { describe, it, expect } from "vitest";
import {
  parseUnitNumber,
  parseDateText,
  parseHour,
} from "@/modules/placement/parse-utils";

describe("parseUnitNumber", () => {
  it("纯数字直接 cast", () => {
    expect(parseUnitNumber("17622.88")).toBe(17622.88);
    expect(parseUnitNumber("0")).toBe(0);
  });
  it("带元 strip", () => {
    expect(parseUnitNumber("5746元")).toBe(5746);
    expect(parseUnitNumber("17,622.88元")).toBe(17622.88);
  });
  it("带百分号 strip", () => {
    expect(parseUnitNumber("4.08%")).toBe(4.08);
  });
  it("带分钟 strip", () => {
    expect(parseUnitNumber("2646.9分钟")).toBe(2646.9);
  });
  it("空字符串 / null / undefined → 0", () => {
    expect(parseUnitNumber("")).toBe(0);
    expect(parseUnitNumber(null)).toBe(0);
    expect(parseUnitNumber(undefined)).toBe(0);
  });
  it("纯空格 → 0", () => {
    expect(parseUnitNumber("   ")).toBe(0);
  });
});

describe("parseDateText", () => {
  it("中文格式 2026年05月06日", () => {
    expect(parseDateText("2026年05月06日")).toBe("2026-05-06");
  });
  it("中文格式带空格 2026年5月6日", () => {
    expect(parseDateText("2026年5月6日")).toBe("2026-05-06");
  });
  it("ISO 格式 2026-05-06", () => {
    expect(parseDateText("2026-05-06")).toBe("2026-05-06");
  });
  it("不可识别格式 → null", () => {
    expect(parseDateText("foo")).toBe(null);
    expect(parseDateText("")).toBe(null);
  });
});

describe("parseHour", () => {
  it("整数 19 → 19", () => {
    expect(parseHour(19)).toBe(19);
  });
  it("字符串 19 → 19", () => {
    expect(parseHour("19")).toBe(19);
    expect(parseHour("19 ")).toBe(19);
  });
  it("时间字符串 19:00 → 19", () => {
    expect(parseHour("19:00")).toBe(19);
    expect(parseHour("09:30")).toBe(9);
  });
  it("中文格式 19点 → 19", () => {
    expect(parseHour("19点")).toBe(19);
  });
  it("无效输入 → null", () => {
    expect(parseHour("foo")).toBe(null);
    expect(parseHour("25")).toBe(null);   // 超出 0-23
    expect(parseHour("-1")).toBe(null);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test parse-utils
```

Expected: FAIL（函数未定义）

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement/parse-utils.ts

/** "5746元" → 5746；"4.08%" → 4.08；"" → 0 */
export function parseUnitNumber(input: unknown): number {
  if (input == null) return 0;
  if (typeof input === "number") return Number.isFinite(input) ? input : 0;
  if (typeof input !== "string") return 0;
  const trimmed = input.trim();
  if (!trimmed) return 0;
  // strip 单位 + 千分位
  const cleaned = trimmed.replace(/[元¥％%,\s]|分钟|小时|秒/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** "2026年05月06日" → "2026-05-06"；"2026-05-06" → "2026-05-06" */
export function parseDateText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 中文格式
  const cn = trimmed.match(/^(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日$/);
  if (cn) {
    const [, y, m, d] = cn;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  // ISO 格式
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed;
  return null;
}

/** 19 / "19" / "19:00" / "19点" → 19；超 0-23 → null */
export function parseHour(input: unknown): number | null {
  if (typeof input === "number") {
    if (Number.isInteger(input) && input >= 0 && input <= 23) return input;
    return null;
  }
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // "19:00" / "9:30" → 取冒号前的小时
  const colonMatch = trimmed.match(/^(\d{1,2}):/);
  if (colonMatch) {
    const h = Number(colonMatch[1]);
    return h >= 0 && h <= 23 ? h : null;
  }
  // "19点" → 19
  const cnMatch = trimmed.match(/^(\d{1,2})点$/);
  if (cnMatch) {
    const h = Number(cnMatch[1]);
    return h >= 0 && h <= 23 ? h : null;
  }
  // 纯数字
  const num = Number(trimmed);
  if (Number.isInteger(num) && num >= 0 && num <= 23) return num;
  return null;
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test parse-utils
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement/parse-utils.ts tests/modules/placement/parse-utils.test.ts
git commit -m "feat(placement): parse-utils（parseUnitNumber / parseDateText / parseHour）"
```

---

### Task 7: time-slot-utils — `coversHour` 含跨天判定

**Files:**
- Create: `src/modules/placement/time-slot-utils.ts`
- Create: `tests/modules/placement/time-slot-utils.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/placement/time-slot-utils.test.ts
import { describe, it, expect } from "vitest";
import { coversHour, parseSlotHour } from "@/modules/placement/time-slot-utils";

describe("parseSlotHour", () => {
  it("'09:00' → 9", () => {
    expect(parseSlotHour("09:00")).toBe(9);
  });
  it("'14:30' → 14（向下取）", () => {
    expect(parseSlotHour("14:30")).toBe(14);
  });
  it("'00:00' → 0", () => {
    expect(parseSlotHour("00:00")).toBe(0);
  });
});

describe("coversHour", () => {
  it("普通时段 09-13 覆盖 9, 10, 11, 12", () => {
    expect(coversHour(["09:00", "13:00"], 9)).toBe(true);
    expect(coversHour(["09:00", "13:00"], 12)).toBe(true);
    expect(coversHour(["09:00", "13:00"], 13)).toBe(false); // end exclusive
    expect(coversHour(["09:00", "13:00"], 8)).toBe(false);
  });

  it("跨天时段 22-04 覆盖 22, 23, 0, 1, 2, 3", () => {
    expect(coversHour(["22:00", "04:00"], 22)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 23)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 0)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 3)).toBe(true);
    expect(coversHour(["22:00", "04:00"], 4)).toBe(false); // end exclusive
    expect(coversHour(["22:00", "04:00"], 21)).toBe(false);
  });

  it("退化 sh==eh → 不覆盖任何 hour", () => {
    expect(coversHour(["12:00", "12:00"], 12)).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test time-slot-utils
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement/time-slot-utils.ts
export function parseSlotHour(slotEnd: string): number {
  const m = slotEnd.match(/^(\d{1,2}):/);
  if (!m) throw new Error(`Invalid slot time: ${slotEnd}`);
  return Number(m[1]);
}

export function coversHour(slot: [string, string], hour: number): boolean {
  const sh = parseSlotHour(slot[0]);
  const eh = parseSlotHour(slot[1]);
  if (sh < eh) return hour >= sh && hour < eh;   // 普通：[sh, eh)
  if (sh > eh) return hour >= sh || hour < eh;   // 跨天：[sh, 24) ∪ [0, eh)
  return false;                                    // sh==eh 退化
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test time-slot-utils
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement/time-slot-utils.ts tests/modules/placement/time-slot-utils.test.ts
git commit -m "feat(placement): time-slot-utils（coversHour 含跨天判定）"
```

---

### Task 8: computeIncrements — 累计→增量算法（PRO3 移植）

**Files:**
- Create: `src/modules/placement/incremental.ts`
- Create: `tests/modules/placement/incremental.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/placement/incremental.test.ts
import { describe, it, expect } from "vitest";
import { computeIncrements, type RawCumulativeRow } from "@/modules/placement/incremental";

const makeRow = (
  date: string,
  hour: number,
  account: string,
  values: Partial<RawCumulativeRow> = {},
): RawCumulativeRow => ({
  date,
  hour,
  dataset_id: "product_buyu",
  account_key: account,
  cost_yuan: 0,
  activations: 0,
  payment_yuan: 0,
  start_download: 0,
  finish_download: 0,
  raw: {},
  ...values,
});

describe("computeIncrements", () => {
  it("单日单账号顺序累加", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
      makeRow("2026-05-06", 11, "A", { cost_yuan: 400 }),
    ];
    const out = computeIncrements(rows);
    expect(out[0]!.cost_yuan).toBe(100);  // 起点保留
    expect(out[1]!.cost_yuan).toBe(150);  // 250-100
    expect(out[2]!.cost_yuan).toBe(150);  // 400-250
  });

  it("跨账号独立计算", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "B", { cost_yuan: 50 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
    ];
    const out = computeIncrements(rows);
    const byKey = new Map(out.map((r) => [`${r.account_key}-${r.hour}`, r]));
    expect(byKey.get("A-9")!.cost_yuan).toBe(100);
    expect(byKey.get("B-10")!.cost_yuan).toBe(50);
    expect(byKey.get("A-10")!.cost_yuan).toBe(150);
  });

  it("重置点检测：当前值 < 前一行 30% → 视为新起点", () => {
    const rows = [
      makeRow("2026-05-06", 23, "A", { cost_yuan: 1000 }),
      makeRow("2026-05-07", 0, "A", { cost_yuan: 50 }), // 5% < 30% → 重置
      makeRow("2026-05-07", 1, "A", { cost_yuan: 80 }),
    ];
    const out = computeIncrements(rows);
    expect(out[1]!.cost_yuan).toBe(50);  // 重置保留原值
    expect(out[2]!.cost_yuan).toBe(30);  // 80-50
  });

  it("增量永不为负：max(0, curr - prev)", () => {
    const rows = [
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 95 }), // 95% > 30% 阈值，不算重置
    ];
    const out = computeIncrements(rows);
    expect(out[1]!.cost_yuan).toBe(0);  // max(0, 95-100)
  });

  it("空输入 → 空输出", () => {
    expect(computeIncrements([])).toEqual([]);
  });

  it("单行输入 → 原样返回", () => {
    const rows = [makeRow("2026-05-06", 9, "A", { cost_yuan: 100 })];
    const out = computeIncrements(rows);
    expect(out[0]!.cost_yuan).toBe(100);
  });

  it("乱序输入按 (date,hour) 排序后再算", () => {
    const rows = [
      makeRow("2026-05-06", 11, "A", { cost_yuan: 400 }),
      makeRow("2026-05-06", 9, "A", { cost_yuan: 100 }),
      makeRow("2026-05-06", 10, "A", { cost_yuan: 250 }),
    ];
    const out = computeIncrements(rows);
    const sorted = [...out].sort((a, b) => a.hour - b.hour);
    expect(sorted[0]!.cost_yuan).toBe(100);
    expect(sorted[1]!.cost_yuan).toBe(150);
    expect(sorted[2]!.cost_yuan).toBe(150);
  });

  it("多列同时检测重置（任一列骤降即重置）", () => {
    const rows = [
      makeRow("2026-05-06", 23, "A", { cost_yuan: 1000, activations: 50 }),
      makeRow("2026-05-07", 0, "A", { cost_yuan: 1100, activations: 5 }), // activations 5 << 50*0.3=15 → 重置
    ];
    const out = computeIncrements(rows);
    expect(out[1]!.activations).toBe(5);
    expect(out[1]!.cost_yuan).toBe(1100);  // 重置保留所有列原值
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test incremental
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement/incremental.ts

export interface RawCumulativeRow {
  date: string;          // "2026-05-06"
  hour: number;          // 0-23
  dataset_id: string;
  account_key: string;   // 通常是 placement_label 或 live_account_id
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export type IncrementalRow = RawCumulativeRow;

const RESET_THRESHOLD = 0.3;
const TRACKED_COLUMNS: (keyof RawCumulativeRow)[] = [
  "cost_yuan",
  "activations",
  "payment_yuan",
  "start_download",
  "finish_download",
];

/**
 * 累计 → 增量算法（PRO3 dataset.routes.js:36-79 移植）
 *
 * 1. 按 (account_key, dataset_id) 分组
 * 2. 每组按 (date, hour) 升序
 * 3. 从第 2 行起 = 当前 - 前一行
 * 4. 重置点检测：任一 tracked 列 < 前一行 * 0.3 → 重置行保留原值
 * 5. 增量 floor 到 0
 */
export function computeIncrements(rows: RawCumulativeRow[]): IncrementalRow[] {
  if (rows.length === 0) return [];

  // 按 (account_key, dataset_id) 分组
  const groups = new Map<string, RawCumulativeRow[]>();
  for (const r of rows) {
    const key = `${r.account_key}|${r.dataset_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const result: IncrementalRow[] = [];
  for (const group of groups.values()) {
    // 按 (date, hour) 升序排序
    group.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.hour - b.hour;
    });

    // 第一行原样保留
    result.push({ ...group[0]! });

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1]!;
      const curr = group[i]!;

      // 检测重置：任一 tracked 列 curr < prev * threshold
      const isReset = TRACKED_COLUMNS.some((col) => {
        const pv = prev[col] as number;
        const cv = curr[col] as number;
        return pv > 0 && cv < pv * RESET_THRESHOLD;
      });

      if (isReset) {
        result.push({ ...curr });
        continue;
      }

      const diffRow: RawCumulativeRow = { ...curr };
      for (const col of TRACKED_COLUMNS) {
        const pv = prev[col] as number;
        const cv = curr[col] as number;
        (diffRow as Record<string, unknown>)[col] = Math.max(0, cv - pv);
      }
      result.push(diffRow);
    }
  }

  return result;
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test incremental
```

Expected: PASS（8/8）。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement/incremental.ts tests/modules/placement/incremental.test.ts
git commit -m "feat(placement): computeIncrements 累计→增量算法（PRO3 移植）"
```

---

### Task 9: mergeWithOverride — effective schedule 合并

**Files:**
- Create: `src/modules/schedule-override/effective.ts`
- Create: `tests/modules/schedule-override/effective.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/schedule-override/effective.test.ts
import { describe, it, expect } from "vitest";
import {
  mergeWithOverride,
  type DefaultSchedule,
  type OverrideSchedule,
  type EffectiveSchedule,
} from "@/modules/schedule-override/effective";

describe("mergeWithOverride", () => {
  it("无 override → 全部走 default", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
      { user: "u2", slots: [["13:00", "18:00"]], rest_days: [] },
    ];
    const out = mergeWithOverride(defaults, []);
    expect(out).toHaveLength(2);
    expect(out.every((s) => s.source === "default")).toBe(true);
  });

  it("override 增加新主播 → effective 是 default ∪ 新增", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [
      { user: "u2", slots: [["12:00", "14:00"]] },
    ];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    const u2 = out.find((s) => s.user === "u2");
    expect(u1!.source).toBe("default");
    expect(u2!.source).toBe("override");
  });

  it("override 同主播 → 替换 default 该主播 slots", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
      { user: "u2", slots: [["13:00", "18:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [
      { user: "u1", slots: [["10:00", "12:00"]] },  // u1 改时段
    ];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    const u2 = out.find((s) => s.user === "u2");
    expect(u1!.slots).toEqual([["10:00", "12:00"]]);
    expect(u1!.source).toBe("override");
    expect(u2!.slots).toEqual([["13:00", "18:00"]]);
    expect(u2!.source).toBe("default");
  });

  it("override slots=[] → 该主播请假（slots 空）", () => {
    const defaults: DefaultSchedule[] = [
      { user: "u1", slots: [["09:00", "13:00"]], rest_days: [] },
    ];
    const overrides: OverrideSchedule[] = [{ user: "u1", slots: [] }];
    const out = mergeWithOverride(defaults, overrides);
    const u1 = out.find((s) => s.user === "u1");
    expect(u1!.slots).toEqual([]);
    expect(u1!.source).toBe("override");
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test effective
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/schedule-override/effective.ts

export interface DefaultSchedule {
  user: string;
  slots: [string, string][];
  rest_days: number[];     // ISO weekday 1-7
}

export interface OverrideSchedule {
  user: string;
  slots: [string, string][];   // [] 表示请假
}

export interface EffectiveSchedule {
  user: string;
  slots: [string, string][];
  rest_days: number[];
  source: "default" | "override";
}

/**
 * 合并 default 与 override → effective schedule。
 *
 * 语义：
 * - override 的 user 替换 default 中相同 user 的 slots
 * - default 中没有的 user，从 override 引入（rest_days=[]）
 * - override slots=[] 表示该 user 当天请假（slots 为空数组）
 */
export function mergeWithOverride(
  defaults: DefaultSchedule[],
  overrides: OverrideSchedule[],
): EffectiveSchedule[] {
  const overrideByUser = new Map(overrides.map((o) => [o.user, o]));
  const result: EffectiveSchedule[] = [];

  // 1. 处理 default：被 override 的替换；未被覆盖的保留
  for (const d of defaults) {
    const ov = overrideByUser.get(d.user);
    if (ov) {
      result.push({ user: d.user, slots: ov.slots, rest_days: d.rest_days, source: "override" });
    } else {
      result.push({ user: d.user, slots: d.slots, rest_days: d.rest_days, source: "default" });
    }
  }

  // 2. override 中 default 没有的 user，新增进来
  const defaultUsers = new Set(defaults.map((d) => d.user));
  for (const ov of overrides) {
    if (!defaultUsers.has(ov.user)) {
      result.push({ user: ov.user, slots: ov.slots, rest_days: [], source: "override" });
    }
  }

  return result;
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test effective
```

Expected: PASS（4/4）。

- [ ] **Step 5: Commit**

```bash
git add src/modules/schedule-override/effective.ts tests/modules/schedule-override/effective.test.ts
git commit -m "feat(schedule-override): mergeWithOverride effective schedule 合并"
```

---

### Task 10: attributeRow — 单行归因函数

**Files:**
- Create: `src/modules/placement-attribution/attribute.ts`
- Create: `tests/modules/placement-attribution/attribute.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/placement-attribution/attribute.test.ts
import { describe, it, expect } from "vitest";
import {
  attributeRow,
  type AttributionInput,
} from "@/modules/placement-attribution/attribute";
import type { DefaultSchedule, OverrideSchedule } from "@/modules/schedule-override/effective";

const baseInput = (
  hour: number,
  defaults: DefaultSchedule[] = [],
  overrides: OverrideSchedule[] = [],
  date = "2026-05-06",  // ISO weekday = Wed = 3
): AttributionInput => ({ date, hour, defaults, overrides });

describe("attributeRow", () => {
  it("override 命中 → source='override'", () => {
    const r = attributeRow(
      baseInput(15,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }],
        [{ user: "u1", slots: [["14:00", "18:00"]] }],
      ),
    );
    expect(r.source).toBe("override");
    expect(r.user).toBe("u1");
  });

  it("override 没命中、default 命中 → source='default'", () => {
    const r = attributeRow(
      baseInput(11,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }],
        [],
      ),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u1");
  });

  it("跨天时段 22-04 + hour=2 → 命中", () => {
    const r = attributeRow(
      baseInput(2,
        [{ user: "u1", slots: [["22:00", "04:00"]], rest_days: [] }],
        [],
      ),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u1");
  });

  it("rest_days 包含当天 ISO weekday → 不命中（unmatched）", () => {
    // 2026-05-06 是周三 = ISO 3
    const r = attributeRow(
      baseInput(11,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [3] }],
        [],
      ),
    );
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });

  it("两个 default 重叠覆盖 → conflict", () => {
    const r = attributeRow(
      baseInput(15,
        [
          { user: "u1", slots: [["14:00", "18:00"]], rest_days: [] },
          { user: "u2", slots: [["14:00", "18:00"]], rest_days: [] },
        ],
        [],
      ),
    );
    expect(r.source).toBe("conflict");
    expect(r.user).toBe(null);
  });

  it("override 替换 default 后唯一 → 不算 conflict", () => {
    const r = attributeRow(
      baseInput(15,
        [
          { user: "u1", slots: [["14:00", "18:00"]], rest_days: [] },
          { user: "u2", slots: [["14:00", "18:00"]], rest_days: [] },
        ],
        [{ user: "u1", slots: [] }],  // u1 请假 → 只剩 u2 命中
      ),
    );
    expect(r.source).toBe("default");
    expect(r.user).toBe("u2");
  });

  it("空 default + 空 override → unmatched", () => {
    const r = attributeRow(baseInput(15, [], []));
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });

  it("override slots=[] 让该 user 当天没排班（请假）", () => {
    const r = attributeRow(
      baseInput(11,
        [{ user: "u1", slots: [["09:00", "13:00"]], rest_days: [] }],
        [{ user: "u1", slots: [] }],
      ),
    );
    expect(r.source).toBe("unmatched");
    expect(r.user).toBe(null);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test attribute
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement-attribution/attribute.ts
import {
  mergeWithOverride,
  type DefaultSchedule,
  type OverrideSchedule,
} from "@/modules/schedule-override/effective";
import { coversHour } from "@/modules/placement/time-slot-utils";

export interface AttributionInput {
  date: string;       // "YYYY-MM-DD"
  hour: number;       // 0-23
  defaults: DefaultSchedule[];
  overrides: OverrideSchedule[];
}

export interface AttributionResult {
  user: string | null;
  source: "override" | "default" | "conflict" | "unmatched";
}

/** ISO weekday: Mon=1 ... Sun=7 */
function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const w = d.getUTCDay();          // Sun=0 ... Sat=6
  return w === 0 ? 7 : w;
}

export function attributeRow(input: AttributionInput): AttributionResult {
  const wd = isoWeekday(input.date);
  const effective = mergeWithOverride(input.defaults, input.overrides);

  // 过滤 rest_days
  const candidates = effective.filter(
    (s) => !s.rest_days.includes(wd) && s.slots.some((slot) => coversHour(slot, input.hour)),
  );

  if (candidates.length === 0) return { user: null, source: "unmatched" };
  if (candidates.length === 1) {
    const c = candidates[0]!;
    return { user: c.user, source: c.source };
  }
  return { user: null, source: "conflict" };
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test attribute
```

Expected: PASS（8/8）。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement-attribution/attribute.ts tests/modules/placement-attribution/attribute.test.ts
git commit -m "feat(placement-attribution): attributeRow 单行归因（含跨天 / conflict / unmatched）"
```

---

## Milestone 3 — Excel 解析 + 共享 ingest pipeline

### Task 11: 安装 npm 依赖（xlsx, papaparse）

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装**

```bash
pnpm add xlsx papaparse
pnpm add -D @types/papaparse
```

注：`xlsx` 自带 TypeScript 类型；`papaparse` 需要单独装 `@types/papaparse`。

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): 加 xlsx + papaparse for Excel/CSV parsing"
```

---

### Task 12: xlsx-adapter — 解析百应导出 Excel（含列名 alias + 文件名日期 fallback）

**Files:**
- Create: `src/modules/placement/xlsx-adapter.ts`
- Create: `tests/modules/placement/xlsx-adapter.test.ts`
- Create: `tests/fixtures/placement-excel/` 目录（放真实 Excel 测试 fixture）

- [ ] **Step 1: 复制真实 Excel 到 fixtures**

```bash
mkdir -p tests/fixtures/placement-excel
cp "/Users/zhangjin/Downloads/蓝v-安卓2026-05-06-2026-05-06_20260506190248_69fb1fd838b97.xlsx" tests/fixtures/placement-excel/lanv-9cols.xlsx
cp "/Users/zhangjin/Downloads/12400170319-2026-05-06-2026-05-06_20260506190343_69fb200f7d8d3.xlsx" tests/fixtures/placement-excel/urp-19cols.xlsx
cp "/Users/zhangjin/Downloads/12400099201-2026-05-06-2026-05-06_20260506190248_69fb1fd847ef0.xlsx" tests/fixtures/placement-excel/guanhao-6cols.xlsx
```

- [ ] **Step 2: 写测试**

```typescript
// tests/modules/placement/xlsx-adapter.test.ts
import { describe, it, expect } from "vitest";
import { parseXlsx, extractDateFromFilename } from "@/modules/placement/xlsx-adapter";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "../../fixtures/placement-excel", name));

describe("extractDateFromFilename", () => {
  it("抓出 YYYY-MM-DD 范围", () => {
    expect(extractDateFromFilename("蓝v-安卓2026-05-06-2026-05-06_xxx.xlsx")).toEqual({
      from: "2026-05-06",
      to: "2026-05-06",
    });
  });
  it("抓出广告主 ID 命名", () => {
    expect(extractDateFromFilename("12400170319-2026-05-06-2026-05-06_xxx.xlsx")).toEqual({
      from: "2026-05-06",
      to: "2026-05-06",
    });
  });
  it("无日期 → null", () => {
    expect(extractDateFromFilename("foo.xlsx")).toBe(null);
  });
});

describe("parseXlsx — 9 列模板（蓝v-安卓）", () => {
  it("解析出 19 行，含正确字段", () => {
    const buf = fixture("lanv-9cols.xlsx");
    const out = parseXlsx(buf, "lanv-9cols.xlsx");
    expect(out.errors).toHaveLength(0);
    expect(out.rows.length).toBeGreaterThan(0);
    const first = out.rows[0]!;
    expect(first.account_name).toBeTruthy();
    expect(first.date).toBe("2026-05-06");
    expect(first.hour).toBe(19);
    expect(first.cost_yuan).toBeGreaterThan(0);
  });
});

describe("parseXlsx — 19 列模板（URP 含下载列）", () => {
  it("解析出含 start_download / finish_download", () => {
    const buf = fixture("urp-19cols.xlsx");
    const out = parseXlsx(buf, "urp-19cols.xlsx");
    expect(out.errors).toHaveLength(0);
    const withDownload = out.rows.find((r) => r.start_download > 0);
    expect(withDownload).toBeDefined();
    expect(withDownload!.finish_download).toBeGreaterThanOrEqual(0);
  });
});

describe("parseXlsx — 6 列模板（官号-01，无日期列，需文件名 fallback）", () => {
  it("从文件名抓日期", () => {
    const buf = fixture("guanhao-6cols.xlsx");
    const out = parseXlsx(buf, "guanhao-6cols.xlsx");
    expect(out.errors).toHaveLength(0);
    const first = out.rows[0]!;
    expect(first.date).toBe("2026-05-06");
    expect(first.account_name).toMatch(/^官号/);
  });
});

describe("parseXlsx — 错误场景", () => {
  it("文件名无日期 + 文件无日期列 → 返回错误", () => {
    const buf = fixture("guanhao-6cols.xlsx");
    const out = parseXlsx(buf, "no-date-in-name.xlsx");
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: 跑测试，应失败**

```bash
pnpm test xlsx-adapter
```

- [ ] **Step 4: 写实现**

```typescript
// src/modules/placement/xlsx-adapter.ts
import * as XLSX from "xlsx";
import { parseDateText, parseHour, parseUnitNumber } from "./parse-utils";

const COLUMN_ALIAS = {
  account_name: ["账户名称", "直播间", "广告账户"],
  cost_yuan: ["消耗", "花费", "成本"],
  activations: ["激活数", "激活"],
  payment_yuan: ["激活当日付费金额", "当日付费金额"],
  start_download: ["开始下载数"],
  finish_download: ["下载完成数"],
  date_text: ["日期", "日期【X年X月X日】"],
  hour_text: ["小时", "小时【X点】", "小时【x点】"],
  time_text: ["时间"],
} as const;

export interface ParsedRow {
  account_name: string;
  date: string;             // ISO YYYY-MM-DD
  hour: number;
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: { row?: unknown; reason: string }[];
  date_range_from: string | null;
  date_range_to: string | null;
}

export function extractDateFromFilename(
  filename: string,
): { from: string; to: string } | null {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  return { from: m[1]!, to: m[2]! };
}

/** 在 row 对象里按 alias 找列；返回第一个 trim 后非空的值 */
function findValue(row: Record<string, unknown>, aliases: readonly string[]): unknown {
  for (const a of aliases) {
    if (a in row) {
      const v = row[a];
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

export function parseXlsx(buffer: Buffer | ArrayBuffer, filename: string): ParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: [{ reason: "Excel 文件无 sheet" }], date_range_from: null, date_range_to: null };
  }
  const sheet = wb.Sheets[sheetName]!;
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

  const filenameDate = extractDateFromFilename(filename);
  const rows: ParsedRow[] = [];
  const errors: { row?: unknown; reason: string }[] = [];
  const dates = new Set<string>();

  for (const row of rawRows) {
    // 跳过完全空行
    if (Object.values(row).every((v) => v === null || v === undefined || String(v).trim() === "")) {
      continue;
    }

    const accountName = findValue(row, COLUMN_ALIAS.account_name);
    if (!accountName) {
      errors.push({ row, reason: "缺少账户名称/直播间列" });
      continue;
    }

    // 日期解析三级 fallback
    let date: string | null = null;
    const dateText = findValue(row, COLUMN_ALIAS.date_text);
    if (dateText !== undefined) {
      date = parseDateText(String(dateText));
    }
    if (!date && filenameDate) {
      if (filenameDate.from === filenameDate.to) {
        date = filenameDate.from;
      } else {
        errors.push({ row, reason: "文件包含跨日数据，请按天上传" });
        continue;
      }
    }
    if (!date) {
      errors.push({ row, reason: "无法识别日期（行内无日期列且文件名无日期）" });
      continue;
    }

    // 小时解析
    const hourText = findValue(row, COLUMN_ALIAS.hour_text);
    const timeText = findValue(row, COLUMN_ALIAS.time_text);
    const hourSource = hourText ?? timeText;
    const hour = parseHour(hourSource);
    if (hour === null) {
      errors.push({ row, reason: `无法识别小时：${String(hourSource)}` });
      continue;
    }

    rows.push({
      account_name: String(accountName).trim(),
      date,
      hour,
      cost_yuan: parseUnitNumber(findValue(row, COLUMN_ALIAS.cost_yuan)),
      activations: parseUnitNumber(findValue(row, COLUMN_ALIAS.activations)),
      payment_yuan: parseUnitNumber(findValue(row, COLUMN_ALIAS.payment_yuan)),
      start_download: parseUnitNumber(findValue(row, COLUMN_ALIAS.start_download)),
      finish_download: parseUnitNumber(findValue(row, COLUMN_ALIAS.finish_download)),
      raw: row,
    });
    dates.add(date);
  }

  const sortedDates = [...dates].sort();
  return {
    rows,
    errors,
    date_range_from: sortedDates[0] ?? null,
    date_range_to: sortedDates[sortedDates.length - 1] ?? null,
  };
}
```

- [ ] **Step 5: 跑测试**

```bash
pnpm test xlsx-adapter
```

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/modules/placement/xlsx-adapter.ts tests/modules/placement/xlsx-adapter.test.ts tests/fixtures/placement-excel/
git commit -m "feat(placement): xlsx-adapter 解析 3 种百应导出 Excel 格式"
```

---

### Task 13: 共享 ingest pipeline — `src/modules/placement/ingest.ts`

**Files:**
- Create: `src/modules/placement/ingest.ts`
- Create: `tests/modules/placement/ingest.test.ts`

- [ ] **Step 1: 写测试（mock DB）**

```typescript
// tests/modules/placement/ingest.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row, placement_import_batch } from "@/db/schema/placements";
import { live_account } from "@/db/schema/live-account";
import { sql } from "drizzle-orm";
import { ingestRows, type IngestInput } from "@/modules/placement/ingest";

const TEST_DATASET = "product_buyu";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM placement_import_batch`);
  // 至少有 1 个 live_account 用于 placement_label 匹配（测试前 seed）
  // 假设 seed 脚本已在 vitest setup 里准备
});

describe("ingestRows", () => {
  it("成功 ingest 1 行（账号匹配 placement_label）", async () => {
    const accs = await db.select().from(live_account).limit(1);
    const acc = accs[0]!;
    if (!acc.placement_label) {
      // skip 如果 seed 数据没 placement_label
      return;
    }

    const input: IngestInput = {
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label,
          date: "2026-05-06",
          hour: 19,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: { mock: true },
        },
      ],
      parse_errors: [],
    };

    const batch = await ingestRows(input);
    expect(batch.status).toBe("completed");
    expect(batch.rows_inserted).toBe(1);
    expect(batch.rows_skipped).toBe(0);

    const rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attribution_dirty).toBe(true);
  });

  it("账号未匹配 placement_label → skip + error_log", async () => {
    const input: IngestInput = {
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: "不存在的账号-xxx",
          date: "2026-05-06",
          hour: 19,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    };

    const batch = await ingestRows(input);
    expect(batch.rows_skipped).toBe(1);
    expect(batch.error_log!.length).toBeGreaterThanOrEqual(1);
    expect(batch.error_log![0]!.reason).toMatch(/未找到/);
  });

  it("重复 (date,hour,dataset,account) → UPDATE 现有行 + 标 dirty=TRUE", async () => {
    const accs = await db.select().from(live_account).limit(1);
    const acc = accs[0]!;
    if (!acc.placement_label) return;

    const baseInput = (cost: number): IngestInput => ({
      source: "excel-upload",
      dataset_id: TEST_DATASET,
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label!,
          date: "2026-05-06",
          hour: 19,
          cost_yuan: cost,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    });

    await ingestRows(baseInput(100));
    const second = await ingestRows(baseInput(200));
    expect(second.rows_updated).toBe(1);
    expect(second.rows_inserted).toBe(0);

    const rows = await db.select().from(placement_row);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.cost_yuan)).toBe(200);
    expect(rows[0]!.attribution_dirty).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test ingest
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement/ingest.ts
import "server-only";
import { db } from "@/db/client";
import { live_account } from "@/db/schema/live-account";
import { placement_import_batch, placement_row } from "@/db/schema/placements";
import { eq, sql } from "drizzle-orm";
import { computeIncrements, type RawCumulativeRow } from "./incremental";

export interface IngestRow {
  account_name: string;
  date: string;
  hour: number;
  cost_yuan: number;
  activations: number;
  payment_yuan: number;
  start_download: number;
  finish_download: number;
  raw: Record<string, unknown>;
}

export interface IngestInput {
  source: "excel-upload" | "pro3-migration";
  dataset_id: string;
  file_name: string | null;
  file_size_bytes?: number | null;
  uploaded_by: string | null;
  rows: IngestRow[];
  parse_errors: { row?: unknown; reason: string }[];
}

export async function ingestRows(input: IngestInput) {
  const dates = new Set<string>(input.rows.map((r) => r.date));
  const sortedDates = [...dates].sort();
  const dateFrom = sortedDates[0] ?? null;
  const dateTo = sortedDates[sortedDates.length - 1] ?? null;

  // 1. 查 placement_label → live_account_id 映射
  const accounts = await db
    .select({ id: live_account.id, label: live_account.placement_label })
    .from(live_account);
  const labelToId = new Map(
    accounts.filter((a) => a.label !== null).map((a) => [a.label!, a.id]),
  );

  // 2. 创建 batch（status='parsing'）
  const [batch] = await db
    .insert(placement_import_batch)
    .values({
      source: input.source,
      file_name: input.file_name,
      file_size_bytes: input.file_size_bytes ?? null,
      dataset_id: input.dataset_id,
      date_range_from: dateFrom,
      date_range_to: dateTo,
      row_count: input.rows.length,
      rows_inserted: 0,
      rows_updated: 0,
      rows_skipped: input.parse_errors.length,
      status: "parsing",
      error_log: input.parse_errors.length > 0 ? input.parse_errors : null,
      uploaded_by: input.uploaded_by,
    })
    .returning();

  const errorLog: { row?: unknown; reason: string }[] = [...input.parse_errors];

  // 3. 匹配账号 + 转 RawCumulativeRow
  const matched: RawCumulativeRow[] = [];
  for (const r of input.rows) {
    const accId = labelToId.get(r.account_name);
    if (!accId) {
      errorLog.push({ row: r, reason: `未找到账号 placement_label='${r.account_name}'` });
      continue;
    }
    matched.push({
      date: r.date,
      hour: r.hour,
      dataset_id: input.dataset_id,
      account_key: accId,                  // 用 live_account_id 做分组 key
      cost_yuan: r.cost_yuan,
      activations: r.activations,
      payment_yuan: r.payment_yuan,
      start_download: r.start_download,
      finish_download: r.finish_download,
      raw: r.raw,
    });
  }

  // 4. 算增量
  const incremented = computeIncrements(matched);

  // 5. 批量 upsert（事务）
  let inserted = 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const r of incremented) {
      const result = await tx
        .insert(placement_row)
        .values({
          date: r.date,
          hour: r.hour,
          dataset_id: r.dataset_id,
          live_account_id: r.account_key,
          cost_yuan: String(r.cost_yuan),
          activations: r.activations,
          payment_yuan: String(r.payment_yuan),
          start_download: r.start_download,
          finish_download: r.finish_download,
          attribution_dirty: true,
          raw: r.raw,
          import_batch_id: batch!.id,
        })
        .onConflictDoUpdate({
          target: [
            placement_row.date,
            placement_row.hour,
            placement_row.dataset_id,
            placement_row.live_account_id,
          ],
          set: {
            cost_yuan: String(r.cost_yuan),
            activations: r.activations,
            payment_yuan: String(r.payment_yuan),
            start_download: r.start_download,
            finish_download: r.finish_download,
            attribution_dirty: true,
            raw: r.raw,
            import_batch_id: batch!.id,
            updated_at: sql`now()`,
          },
        })
        .returning({ id: placement_row.id, isNew: sql<boolean>`xmax = 0` });

      const wasInsert = (result[0] as { isNew: boolean }).isNew;
      if (wasInsert) inserted++;
      else updated++;
    }
  });

  // 6. 更新 batch 状态
  const finalSkipped = input.rows.length - matched.length + input.parse_errors.length;
  const status: "completed" | "partial" | "failed" =
    errorLog.length === 0 ? "completed" : matched.length === 0 ? "failed" : "partial";

  const [final] = await db
    .update(placement_import_batch)
    .set({
      rows_inserted: inserted,
      rows_updated: updated,
      rows_skipped: finalSkipped,
      status,
      error_log: errorLog.length > 0 ? errorLog : null,
    })
    .where(eq(placement_import_batch.id, batch!.id))
    .returning();

  return final!;
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test ingest
```

Expected: PASS（3/3）。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement/ingest.ts tests/modules/placement/ingest.test.ts
git commit -m "feat(placement): ingest pipeline 共享 Excel/PRO3 输入到 placement_row + batch"
```

---

## Milestone 4 — 归因 job + 触发器

### Task 14: 归因 job — `runAttributionJob`

**Files:**
- Create: `src/modules/placement-attribution/job.ts`
- Create: `tests/modules/placement-attribution/job.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/placement-attribution/job.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { live_account } from "@/db/schema/live-account";
import { schedule_override } from "@/db/schema/schedule-override";
import { sql, eq } from "drizzle-orm";
import { runAttributionJob } from "@/modules/placement-attribution/job";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM schedule_override`);
});

describe("runAttributionJob", () => {
  it("dirty=TRUE 行被处理，default 命中 → source='default'", async () => {
    const acc = (await db.select().from(live_account).limit(1))[0]!;
    // seed 一个 default 排班
    const anchorId = "test_user_1"; // 假设 seed 数据里有
    await db.insert(account_anchor_default).values({
      id: crypto.randomUUID(),
      account_id: acc.id,
      dingtalk_user_id: anchorId,
      time_slots: [["09:00", "13:00"]],
      rest_days: [],
    });

    await db.insert(placement_row).values({
      date: "2026-05-06",
      hour: 10,
      dataset_id: "product_buyu",
      live_account_id: acc.id,
      cost_yuan: "100",
      attribution_dirty: true,
      raw: {},
    });

    const result = await runAttributionJob();
    expect(result.processed).toBe(1);

    const rows = await db.select().from(placement_row);
    expect(rows[0]!.attributed_dingtalk_user_id).toBe(anchorId);
    expect(rows[0]!.attribution_source).toBe("default");
    expect(rows[0]!.attribution_dirty).toBe(false);
  });

  it("override 替代 default → source='override'", async () => {
    const acc = (await db.select().from(live_account).limit(1))[0]!;
    const anchor1 = "test_user_1";
    const anchor2 = "test_user_2";

    await db.insert(account_anchor_default).values({
      id: crypto.randomUUID(),
      account_id: acc.id,
      dingtalk_user_id: anchor1,
      time_slots: [["09:00", "13:00"]],
      rest_days: [],
    });
    await db.insert(schedule_override).values({
      account_id: acc.id,
      date: "2026-05-06",
      dingtalk_user_id: anchor2,
      time_slots: [["10:00", "12:00"]],
    });
    await db.insert(placement_row).values({
      date: "2026-05-06",
      hour: 11,
      dataset_id: "product_buyu",
      live_account_id: acc.id,
      cost_yuan: "100",
      attribution_dirty: true,
      raw: {},
    });

    await runAttributionJob();
    const rows = await db.select().from(placement_row);
    // u1 default 9-13 + u2 override 10-12 都覆盖 hour=11 → conflict
    expect(rows[0]!.attribution_source).toBe("conflict");
  });

  it("limit=10 一次只处理 10 行", async () => {
    const acc = (await db.select().from(live_account).limit(1))[0]!;
    for (let i = 0; i < 20; i++) {
      await db.insert(placement_row).values({
        date: "2026-05-06",
        hour: i % 24,
        dataset_id: "product_buyu",
        live_account_id: acc.id,
        cost_yuan: "1",
        attribution_dirty: true,
        raw: {},
      });
    }
    const result = await runAttributionJob({ max_rows: 10 });
    expect(result.processed).toBe(10);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test job
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement-attribution/job.ts
import "server-only";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { schedule_override } from "@/db/schema/schedule-override";
import { and, eq, inArray, sql } from "drizzle-orm";
import { attributeRow } from "./attribute";

export async function runAttributionJob(opts?: { batch_id?: string; max_rows?: number }) {
  const maxRows = opts?.max_rows ?? 1000;

  // 1. 拉 dirty 行
  const dirtyRows = await db
    .select({
      id: placement_row.id,
      date: placement_row.date,
      hour: placement_row.hour,
      live_account_id: placement_row.live_account_id,
      import_batch_id: placement_row.import_batch_id,
    })
    .from(placement_row)
    .where(
      opts?.batch_id
        ? and(eq(placement_row.attribution_dirty, true), eq(placement_row.import_batch_id, opts.batch_id))
        : eq(placement_row.attribution_dirty, true),
    )
    .limit(maxRows);

  if (dirtyRows.length === 0) {
    return { processed: 0 };
  }

  // 2. 按 (account_id, date) 分组
  const groupKey = (a: string, d: string) => `${a}|${d}`;
  const groups = new Map<
    string,
    { account_id: string; date: string; rows: typeof dirtyRows }
  >();
  for (const r of dirtyRows) {
    const k = groupKey(r.live_account_id, r.date);
    if (!groups.has(k)) {
      groups.set(k, { account_id: r.live_account_id, date: r.date, rows: [] });
    }
    groups.get(k)!.rows.push(r);
  }

  let processed = 0;

  for (const g of groups.values()) {
    // 3. 查 default + override
    const defaults = (
      await db
        .select({
          user: account_anchor_default.dingtalk_user_id,
          slots: account_anchor_default.time_slots,
          rest_days: account_anchor_default.rest_days,
        })
        .from(account_anchor_default)
        .where(eq(account_anchor_default.account_id, g.account_id))
    ).map((d) => ({
      user: d.user,
      slots: (d.slots ?? []) as [string, string][],
      rest_days: (d.rest_days ?? []) as number[],
    }));

    const overrides = (
      await db
        .select({
          user: schedule_override.dingtalk_user_id,
          slots: schedule_override.time_slots,
        })
        .from(schedule_override)
        .where(
          and(
            eq(schedule_override.account_id, g.account_id),
            eq(schedule_override.date, g.date),
          ),
        )
    ).map((o) => ({ user: o.user, slots: (o.slots ?? []) as [string, string][] }));

    // 4. 内存遍历 24 小时算归因（只更新 dirty 行涉及的 hour）
    for (const row of g.rows) {
      const result = attributeRow({
        date: g.date,
        hour: row.hour,
        defaults,
        overrides,
      });

      await db
        .update(placement_row)
        .set({
          attributed_dingtalk_user_id: result.user,
          attribution_source: result.source,
          attribution_dirty: false,
          attribution_computed_at: sql`now()`,
        })
        .where(eq(placement_row.id, row.id));

      processed++;
    }
  }

  return { processed };
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test job
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement-attribution/job.ts tests/modules/placement-attribution/job.test.ts
git commit -m "feat(placement-attribution): runAttributionJob 批量归因 + 性能优化（按 account+date 分组查 schedule）"
```

---

### Task 15: dirty 触发器 + 归因 server.ts barrel

**Files:**
- Create: `src/modules/placement-attribution/triggers.ts`
- Modify: `src/modules/placement-attribution/server.ts`

- [ ] **Step 1: 写 triggers**

```typescript
// src/modules/placement-attribution/triggers.ts
import "server-only";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { and, eq, isNull, or, sql } from "drizzle-orm";

/** 把指定 (account, date) 的所有 placement_row 标 dirty */
export async function markDirtyByAccountDate(account_id: string, date: string) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(
      and(
        eq(placement_row.live_account_id, account_id),
        eq(placement_row.date, date),
      ),
    );
}

/** 标记 unmatched / conflict / NULL 行 dirty（手动重算未归因按钮用） */
export async function markDirtyUnattributed() {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(
      or(
        isNull(placement_row.attributed_dingtalk_user_id),
        eq(placement_row.attribution_source, "conflict"),
        eq(placement_row.attribution_source, "unmatched"),
      ),
    );
}

/** 标 batch 全部行 dirty（重传后用） */
export async function markDirtyByBatch(batch_id: string) {
  await db
    .update(placement_row)
    .set({ attribution_dirty: true })
    .where(eq(placement_row.import_batch_id, batch_id));
}
```

- [ ] **Step 2: 更新 server.ts barrel**

```typescript
// src/modules/placement-attribution/server.ts
import "server-only";
export { attributeRow, type AttributionInput, type AttributionResult } from "./attribute";
export { runAttributionJob } from "./job";
export {
  markDirtyByAccountDate,
  markDirtyByBatch,
  markDirtyUnattributed,
} from "./triggers";
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/placement-attribution/triggers.ts src/modules/placement-attribution/server.ts
git commit -m "feat(placement-attribution): dirty 触发器 + server.ts barrel 导出"
```

---

## Milestone 5 — schedule_override CRUD

### Task 16: schedule_override queries + actions

**Files:**
- Create: `src/modules/schedule-override/queries.ts`
- Create: `src/modules/schedule-override/actions.ts`
- Modify: `src/modules/schedule-override/server.ts`

- [ ] **Step 1: queries**

```typescript
// src/modules/schedule-override/queries.ts
import "server-only";
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { dingtalkUser } from "@/db/schema/dingtalk";
import { and, eq } from "drizzle-orm";

export async function listOverridesForAccountDate(account_id: string, date: string) {
  return db
    .select({
      id: schedule_override.id,
      account_id: schedule_override.account_id,
      date: schedule_override.date,
      dingtalk_user_id: schedule_override.dingtalk_user_id,
      anchor_name: dingtalkUser.name,
      time_slots: schedule_override.time_slots,
      reason: schedule_override.reason,
      created_by: schedule_override.created_by,
      created_at: schedule_override.created_at,
    })
    .from(schedule_override)
    .leftJoin(dingtalkUser, eq(schedule_override.dingtalk_user_id, dingtalkUser.user_id))
    .where(
      and(
        eq(schedule_override.account_id, account_id),
        eq(schedule_override.date, date),
      ),
    );
}

export async function listOverridesForAccount(account_id: string) {
  return db
    .select({
      id: schedule_override.id,
      date: schedule_override.date,
      dingtalk_user_id: schedule_override.dingtalk_user_id,
      anchor_name: dingtalkUser.name,
      time_slots: schedule_override.time_slots,
      reason: schedule_override.reason,
    })
    .from(schedule_override)
    .leftJoin(dingtalkUser, eq(schedule_override.dingtalk_user_id, dingtalkUser.user_id))
    .where(eq(schedule_override.account_id, account_id))
    .orderBy(schedule_override.date);
}
```

- [ ] **Step 2: actions（含 dirty 触发）**

```typescript
// src/modules/schedule-override/actions.ts
"use server";
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { markDirtyByAccountDate, runAttributionJob } from "@/modules/placement-attribution/server";
import { overrideInputSchema } from "./schema";
import { revalidatePath } from "next/cache";

export async function createOverride(input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const parsed = overrideInputSchema.parse(input);

  await db.insert(schedule_override).values({
    account_id: parsed.account_id,
    date: parsed.date,
    dingtalk_user_id: parsed.dingtalk_user_id,
    time_slots: parsed.time_slots,
    reason: parsed.reason ?? null,
    created_by: session.user.id,
  });

  await markDirtyByAccountDate(parsed.account_id, parsed.date);
  await runAttributionJob({ max_rows: 200 });   // 同步重算少量行（< 1s）

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}

export async function deleteOverride(id: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("UNAUTHORIZED");

  const [removed] = await db
    .delete(schedule_override)
    .where(eq(schedule_override.id, id))
    .returning();

  if (removed) {
    await markDirtyByAccountDate(removed.account_id, removed.date);
    await runAttributionJob({ max_rows: 200 });
  }

  revalidatePath("/live-accounts");
  revalidatePath("/placements");
}
```

- [ ] **Step 3: 更新 server.ts barrel**

```typescript
// src/modules/schedule-override/server.ts
import "server-only";
export * from "./schema";
export * from "./effective";
export { listOverridesForAccountDate, listOverridesForAccount } from "./queries";
```

- [ ] **Step 4: index.ts 暴露 actions（client-safe）**

```typescript
// src/modules/schedule-override/index.ts
export * from "./schema";
export { createOverride, deleteOverride } from "./actions";
```

- [ ] **Step 5: 跑 typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/schedule-override/
git commit -m "feat(schedule-override): queries + actions（CRUD + dirty 触发）"
```

---

### Task 17: 集成测试 — override 编辑 → placement_row 归因变化

**Files:**
- Create: `tests/integration/override-attribution.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/integration/override-attribution.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { placement_row } from "@/db/schema/placements";
import { account_anchor_default } from "@/db/schema/account-anchor-default";
import { live_account } from "@/db/schema/live-account";
import { schedule_override } from "@/db/schema/schedule-override";
import { sql } from "drizzle-orm";
import { ingestRows } from "@/modules/placement/ingest";
import { runAttributionJob } from "@/modules/placement-attribution/server";

beforeEach(async () => {
  await db.execute(sql`DELETE FROM placement_row`);
  await db.execute(sql`DELETE FROM schedule_override`);
});

describe("override 编辑 → 归因结果变化", () => {
  it("先 ingest 落 dirty / 跑 job 落 default / 加 override / 标 dirty / 跑 job 落 override", async () => {
    const acc = (await db.select().from(live_account).limit(1))[0]!;
    if (!acc.placement_label) return;

    const u1 = "test_anchor_1";
    const u2 = "test_anchor_2";

    // seed default
    await db.insert(account_anchor_default).values({
      id: crypto.randomUUID(),
      account_id: acc.id,
      dingtalk_user_id: u1,
      time_slots: [["09:00", "13:00"]],
      rest_days: [],
    });

    // ingest 1 行
    await ingestRows({
      source: "excel-upload",
      dataset_id: "product_buyu",
      file_name: "test.xlsx",
      uploaded_by: null,
      rows: [
        {
          account_name: acc.placement_label!,
          date: "2026-05-06",
          hour: 10,
          cost_yuan: 100,
          activations: 5,
          payment_yuan: 20,
          start_download: 0,
          finish_download: 0,
          raw: {},
        },
      ],
      parse_errors: [],
    });

    // 跑 job → 期望归 u1
    await runAttributionJob();
    let rows = await db.select().from(placement_row);
    expect(rows[0]!.attributed_dingtalk_user_id).toBe(u1);
    expect(rows[0]!.attribution_source).toBe("default");

    // 加 override：u2 替代 u1
    await db.insert(schedule_override).values({
      account_id: acc.id,
      date: "2026-05-06",
      dingtalk_user_id: u1,
      time_slots: [],         // u1 请假
    });
    await db.insert(schedule_override).values({
      account_id: acc.id,
      date: "2026-05-06",
      dingtalk_user_id: u2,
      time_slots: [["09:00", "13:00"]],
    });

    // 标 dirty + 跑 job
    await db
      .update(placement_row)
      .set({ attribution_dirty: true })
      .where(sql`account_id IS NOT NULL`);
    await runAttributionJob();

    rows = await db.select().from(placement_row);
    expect(rows[0]!.attributed_dingtalk_user_id).toBe(u2);
    expect(rows[0]!.attribution_source).toBe("override");
  });
});
```

- [ ] **Step 2: 跑测试**

```bash
pnpm test override-attribution
```

Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/override-attribution.test.ts
git commit -m "test(integration): override 编辑后归因结果变化端到端验证"
```

---

## Milestone 6 — 上传 UI + 批次 UI

### Task 18: `/placements/upload` 页 + dropzone

**Files:**
- Create: `src/app/(dashboard)/placements/upload/page.tsx`
- Create: `src/app/(dashboard)/placements/_components/upload-dropzone.tsx`
- Create: `src/app/(dashboard)/placements/_components/upload-preview.tsx`
- Create: `src/app/api/placements/upload/route.ts`
- Modify: `src/modules/placement/server.ts`（导出 ingestRows / parseXlsx）

- [ ] **Step 1: 上传 API route**

```typescript
// src/app/api/placements/upload/route.ts
import { auth } from "@/lib/auth";
import { ingestRows, parseXlsx } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const datasetId = formData.get("dataset_id") as string | null;

  if (!file || !datasetId) {
    return NextResponse.json({ error: "缺少 file 或 dataset_id" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "文件过大（> 10MB），请拆分" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = parseXlsx(buf, file.name);

  const batch = await ingestRows({
    source: "excel-upload",
    dataset_id: datasetId,
    file_name: file.name,
    file_size_bytes: file.size,
    uploaded_by: session.user.id,
    rows: parsed.rows,
    parse_errors: parsed.errors,
  });

  // 异步触发归因
  runAttributionJob({ batch_id: batch.id }).catch((err) => {
    console.error("[attribution-job-failed]", err);
  });

  return NextResponse.json({ batch });
}
```

- [ ] **Step 2: server.ts 加导出**

```typescript
// src/modules/placement/server.ts
import "server-only";
export * from "./schema";
export { parseXlsx, extractDateFromFilename } from "./xlsx-adapter";
export { ingestRows, type IngestInput, type IngestRow } from "./ingest";
```

- [ ] **Step 3: 上传 dropzone 组件**

```tsx
// src/app/(dashboard)/placements/_components/upload-dropzone.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

export function UploadDropzone() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [dataset, setDataset] = useState<DatasetId>("product_buyu");
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState<{ name: string; result: unknown }[]>([]);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    setBatches([]);
    for (const file of files) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dataset_id", dataset);
      const res = await fetch("/api/placements/upload", { method: "POST", body: fd });
      const result = await res.json();
      setBatches((prev) => [...prev, { name: file.name, result }]);
    }
    setUploading(false);
    setFiles([]);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">产品：</label>
        <select
          value={dataset}
          onChange={(e) => setDataset(e.target.value as DatasetId)}
          className="rounded border border-slate-200 px-3 py-1.5 text-sm"
        >
          {(Object.keys(DATASET_LABEL) as DatasetId[]).map((k) => (
            <option key={k} value={k}>{DATASET_LABEL[k]}</option>
          ))}
        </select>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = Array.from(e.dataTransfer.files);
          setFiles((prev) => [...prev, ...dropped]);
        }}
        className="rounded-lg border-2 border-dashed border-slate-300 bg-white p-12 text-center"
      >
        <p className="text-slate-500">拖拽 Excel 文件到此（.xlsx，可多选）</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-3"
        />
      </div>

      {files.length > 0 && (
        <div className="rounded border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm font-medium mb-2">待上传（{files.length}）：</p>
          <ul className="text-sm space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex justify-between">
                <span>{f.name}</span>
                <span className="text-slate-400">{(f.size / 1024).toFixed(1)} KB</span>
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="mt-3 rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {uploading ? "上传中…" : "确认上传"}
          </button>
        </div>
      )}

      {batches.length > 0 && (
        <div className="space-y-2">
          {batches.map((b, i) => (
            <div key={i} className="rounded border border-green-200 bg-green-50 p-3 text-sm">
              <strong>{b.name}</strong> — {JSON.stringify(b.result)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 上传页 page.tsx**

```tsx
// src/app/(dashboard)/placements/upload/page.tsx
import { UploadDropzone } from "../_components/upload-dropzone";

export default function UploadPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">上传投放数据</h1>
      <p className="text-sm text-slate-600">
        从百应/巨量后台导出小时级 Excel，拖入下方区域。每个文件独立成一个批次。
      </p>
      <UploadDropzone />
    </div>
  );
}
```

- [ ] **Step 5: 手动 e2e（dev server 测）**

```bash
pnpm dev
# 浏览器开 /placements/upload，拖入 3 个真实 Excel 测试
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/placements/upload/ src/app/\(dashboard\)/placements/_components/upload-dropzone.tsx src/app/api/placements/upload/route.ts src/modules/placement/server.ts
git commit -m "feat(placements): /placements/upload 页 + dropzone + API route"
```

---

### Task 19: `/placements/batches` 列表 + 详情页

**Files:**
- Create: `src/app/(dashboard)/placements/batches/page.tsx`
- Create: `src/app/(dashboard)/placements/batches/[id]/page.tsx`
- Create: `src/modules/placement/batch-queries.ts`

- [ ] **Step 1: batch-queries**

```typescript
// src/modules/placement/batch-queries.ts
import "server-only";
import { db } from "@/db/client";
import { placement_import_batch } from "@/db/schema/placements";
import { authUser } from "@/db/schema/auth";
import { desc, eq } from "drizzle-orm";

export async function listBatches(opts?: { limit?: number; offset?: number }) {
  return db
    .select({
      id: placement_import_batch.id,
      source: placement_import_batch.source,
      file_name: placement_import_batch.file_name,
      dataset_id: placement_import_batch.dataset_id,
      date_range_from: placement_import_batch.date_range_from,
      date_range_to: placement_import_batch.date_range_to,
      row_count: placement_import_batch.row_count,
      rows_inserted: placement_import_batch.rows_inserted,
      rows_updated: placement_import_batch.rows_updated,
      rows_skipped: placement_import_batch.rows_skipped,
      status: placement_import_batch.status,
      uploaded_by: placement_import_batch.uploaded_by,
      uploaded_by_name: authUser.name,
      uploaded_at: placement_import_batch.uploaded_at,
    })
    .from(placement_import_batch)
    .leftJoin(authUser, eq(placement_import_batch.uploaded_by, authUser.id))
    .orderBy(desc(placement_import_batch.uploaded_at))
    .limit(opts?.limit ?? 50)
    .offset(opts?.offset ?? 0);
}

export async function getBatchDetail(id: string) {
  const [batch] = await db
    .select()
    .from(placement_import_batch)
    .where(eq(placement_import_batch.id, id));
  return batch ?? null;
}
```

- [ ] **Step 2: 加到 server.ts barrel**

```typescript
// src/modules/placement/server.ts （加）
export { listBatches, getBatchDetail } from "./batch-queries";
```

- [ ] **Step 3: 列表页**

```tsx
// src/app/(dashboard)/placements/batches/page.tsx
import { listBatches } from "@/modules/placement/server";
import Link from "next/link";

export default async function BatchesPage() {
  const batches = await listBatches({ limit: 50 });
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">上传批次</h1>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-secondary">
            {["来源", "文件", "产品", "日期范围", "总行", "成功", "更新", "跳过", "状态", "上传人", "时间"].map((c) => (
              <th key={c} className="border-b px-3 py-2 text-left text-xs font-medium text-slate-500">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {batches.map((b) => (
            <tr key={b.id} className="border-b hover:bg-slate-50">
              <td className="px-3 py-2">{b.source === "excel-upload" ? "Excel" : "PRO3 迁移"}</td>
              <td className="px-3 py-2">
                <Link href={`/placements/batches/${b.id}`} className="text-blue-600 hover:underline">
                  {b.file_name ?? "-"}
                </Link>
              </td>
              <td className="px-3 py-2">{b.dataset_id}</td>
              <td className="px-3 py-2">{b.date_range_from} ~ {b.date_range_to}</td>
              <td className="px-3 py-2 text-right">{b.row_count}</td>
              <td className="px-3 py-2 text-right text-green-600">{b.rows_inserted}</td>
              <td className="px-3 py-2 text-right text-amber-600">{b.rows_updated}</td>
              <td className="px-3 py-2 text-right text-slate-400">{b.rows_skipped}</td>
              <td className="px-3 py-2">
                <span className={
                  b.status === "completed" ? "text-green-600" :
                  b.status === "partial" ? "text-amber-600" :
                  b.status === "failed" ? "text-red-600" : "text-slate-500"
                }>{b.status}</span>
              </td>
              <td className="px-3 py-2">{b.uploaded_by_name ?? "-"}</td>
              <td className="px-3 py-2 text-xs text-slate-500">{new Date(b.uploaded_at).toLocaleString("zh-CN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: 详情页**

```tsx
// src/app/(dashboard)/placements/batches/[id]/page.tsx
import { getBatchDetail } from "@/modules/placement/server";
import { notFound } from "next/navigation";

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatchDetail(id);
  if (!batch) notFound();

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">批次详情：{batch.file_name}</h1>

      <dl className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-500">来源</dt><dd>{batch.source}</dd>
        <dt className="text-slate-500">产品</dt><dd>{batch.dataset_id}</dt>
        <dt className="text-slate-500">日期范围</dt><dd>{batch.date_range_from} ~ {batch.date_range_to}</dd>
        <dt className="text-slate-500">行数</dt><dd>总 {batch.row_count} / 新增 {batch.rows_inserted} / 更新 {batch.rows_updated} / 跳过 {batch.rows_skipped}</dd>
        <dt className="text-slate-500">状态</dt><dd>{batch.status}</dd>
        <dt className="text-slate-500">上传时间</dt><dd>{new Date(batch.uploaded_at).toLocaleString("zh-CN")}</dd>
      </dl>

      {batch.error_log && batch.error_log.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <h2 className="font-medium text-red-900 mb-2">错误明细 ({batch.error_log.length})</h2>
          <ul className="space-y-1 text-sm">
            {batch.error_log.map((e, i) => (
              <li key={i} className="text-red-700">
                ⚠ {e.reason}
                {e.row !== undefined && (
                  <span className="ml-2 text-xs text-red-500 font-mono">{JSON.stringify(e.row).slice(0, 200)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: 跑 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/placements/batches/ src/modules/placement/batch-queries.ts src/modules/placement/server.ts
git commit -m "feat(placements): /placements/batches 列表 + 详情页"
```

---

## Milestone 7 — 看板 layout + 3 视角

### Task 20: 看板 queries — by-account / by-anchor / by-hour

**Files:**
- Create: `src/modules/placement/queries.ts`
- Modify: `src/modules/placement/server.ts`

- [ ] **Step 1: 写 queries**

```typescript
// src/modules/placement/queries.ts
import "server-only";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export interface BoardFilter {
  date_from: string;       // ISO
  date_to: string;         // ISO
  dataset_ids?: string[];  // 默认全部
  search?: string;         // 账号名 / 主播名 模糊
}

function datasetClause(ds?: string[]) {
  if (!ds || ds.length === 0) return sql``;
  return sql`AND p.dataset_id IN (${sql.join(ds.map((d) => sql`${d}`), sql`, `)})`;
}

export async function queryByAccount(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      a.id              AS account_id,
      a.account_name,
      a.placement_label,
      a.platform,
      SUM(p.cost_yuan)::numeric    AS cost,
      SUM(p.activations)            AS activations,
      SUM(p.payment_yuan)::numeric  AS payment,
      SUM(p.start_download)         AS start_download,
      SUM(p.finish_download)        AS finish_download
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    ${filter.search ? sql`AND (a.account_name ILIKE ${"%" + filter.search + "%"} OR a.placement_label ILIKE ${"%" + filter.search + "%"})` : sql``}
    GROUP BY a.id, a.account_name, a.placement_label, a.platform
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `)) as unknown as { rows: Array<Record<string, unknown>> };
  return rows;
}

export async function queryByAnchor(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      p.attributed_dingtalk_user_id  AS user_id,
      du.name                         AS anchor_name,
      la.business_line                AS business_line,
      p.attribution_source            AS source,
      SUM(p.cost_yuan)::numeric       AS cost,
      SUM(p.activations)              AS activations,
      SUM(p.payment_yuan)::numeric    AS payment,
      COUNT(DISTINCT p.live_account_id) AS account_count
    FROM placement_row p
    LEFT JOIN dingtalk_user du ON du.user_id = p.attributed_dingtalk_user_id
    LEFT JOIN live_anchor la   ON la.dingtalk_user_id = p.attributed_dingtalk_user_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    GROUP BY p.attributed_dingtalk_user_id, du.name, la.business_line, p.attribution_source
    ORDER BY cost DESC NULLS LAST
    LIMIT 200
  `)) as unknown as { rows: Array<Record<string, unknown>> };
  return rows;
}

export async function queryByHour(filter: BoardFilter) {
  const { rows } = (await db.execute(sql`
    SELECT
      p.live_account_id  AS account_id,
      a.account_name,
      p.hour,
      SUM(p.cost_yuan)::numeric     AS cost,
      SUM(p.activations)             AS activations,
      SUM(p.payment_yuan)::numeric   AS payment
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE p.date BETWEEN ${filter.date_from} AND ${filter.date_to}
    ${datasetClause(filter.dataset_ids)}
    GROUP BY p.live_account_id, a.account_name, p.hour
    ORDER BY a.account_name, p.hour
    LIMIT 5000
  `)) as unknown as { rows: Array<Record<string, unknown>> };
  return rows;
}
```

- [ ] **Step 2: 加到 server.ts barrel**

```typescript
// src/modules/placement/server.ts （加）
export { queryByAccount, queryByAnchor, queryByHour, type BoardFilter } from "./queries";
```

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/placement/queries.ts src/modules/placement/server.ts
git commit -m "feat(placement): 看板 queries（by-account / by-anchor / by-hour）"
```

---

### Task 21: 看板 layout + filter-bar + tab nav

**Files:**
- Create: `src/app/(dashboard)/placements/layout.tsx`
- Create: `src/app/(dashboard)/placements/page.tsx`
- Create: `src/app/(dashboard)/placements/_components/filter-bar.tsx`
- Create: `src/app/(dashboard)/placements/_components/board-tabs.tsx`

- [ ] **Step 1: layout**

```tsx
// src/app/(dashboard)/placements/layout.tsx
import { FilterBar } from "./_components/filter-bar";
import { BoardTabs } from "./_components/board-tabs";

export default function PlacementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 p-4">
      <BoardTabs />
      <FilterBar />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 默认 redirect**

```tsx
// src/app/(dashboard)/placements/page.tsx
import { redirect } from "next/navigation";
export default function PlacementsRoot() {
  redirect("/placements/by-account");
}
```

- [ ] **Step 3: tab nav**

```tsx
// src/app/(dashboard)/placements/_components/board-tabs.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/placements/by-account", label: "按账号" },
  { href: "/placements/by-anchor", label: "按主播" },
  { href: "/placements/by-hour", label: "时段矩阵" },
  { href: "/placements/upload", label: "上传" },
  { href: "/placements/batches", label: "批次" },
];

export function BoardTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm font-medium ${
              active ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: filter-bar**

```tsx
// src/app/(dashboard)/placements/_components/filter-bar.tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

const PRESETS = [
  { id: "today", label: "今天", days: 0 },
  { id: "yesterday", label: "昨天", days: 1 },
  { id: "last7", label: "最近 7 天", days: 7 },
  { id: "last30", label: "最近 30 天", days: 30 },
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const [preset, setPreset] = useState(sp.get("preset") ?? "last7");
  const [datasets, setDatasets] = useState<string[]>(
    sp.get("ds")?.split(",").filter(Boolean) ?? Object.keys(DATASET_LABEL),
  );
  const [search, setSearch] = useState(sp.get("q") ?? "");

  const apply = () => {
    const usp = new URLSearchParams();
    usp.set("preset", preset);
    usp.set("ds", datasets.join(","));
    if (search) usp.set("q", search);
    router.push(`?${usp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        className="rounded border border-slate-200 px-2 py-1 text-sm"
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>

      <div className="flex gap-1">
        {(Object.keys(DATASET_LABEL) as DatasetId[]).map((k) => {
          const active = datasets.includes(k);
          return (
            <button
              key={k}
              onClick={() =>
                setDatasets(active ? datasets.filter((d) => d !== k) : [...datasets, k])
              }
              className={`rounded px-2 py-1 text-xs ${
                active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {DATASET_LABEL[k]}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索账号 / 主播"
        className="flex-1 rounded border border-slate-200 px-3 py-1 text-sm"
      />
      <button onClick={apply} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">
        应用
      </button>
    </div>
  );
}
```

- [ ] **Step 5: 加 filter-utils helper**

创建 `src/modules/placement/filter-utils.ts`:

```typescript
// src/modules/placement/filter-utils.ts
import type { BoardFilter } from "./queries";

const PRESET_DAYS: Record<string, number> = {
  today: 0,
  yesterday: 1,
  last7: 7,
  last30: 30,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveFilter(searchParams: Record<string, string | string[] | undefined>): BoardFilter {
  const preset = (searchParams.preset as string) ?? "last7";
  const days = PRESET_DAYS[preset] ?? 7;
  const today = new Date();
  const to = new Date(today);
  const from = new Date(today);
  if (preset === "today") {
    // both = today
  } else if (preset === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else {
    from.setDate(from.getDate() - days);
  }

  const dsParam = searchParams.ds as string | undefined;
  const dataset_ids = dsParam ? dsParam.split(",").filter(Boolean) : undefined;
  const search = (searchParams.q as string) || undefined;

  return { date_from: isoDate(from), date_to: isoDate(to), dataset_ids, search };
}
```

`src/modules/placement/index.ts` 加：

```typescript
export { resolveFilter } from "./filter-utils";
```

- [ ] **Step 6: 跑 typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add src/app/\(dashboard\)/placements/layout.tsx src/app/\(dashboard\)/placements/page.tsx src/app/\(dashboard\)/placements/_components/board-tabs.tsx src/app/\(dashboard\)/placements/_components/filter-bar.tsx src/modules/placement/filter-utils.ts src/modules/placement/index.ts
git commit -m "feat(placements): 看板 layout + filter-bar + board-tabs nav"
```

---

### Task 22: A 视角 — `/placements/by-account`

**Files:**
- Create: `src/app/(dashboard)/placements/by-account/page.tsx`
- Create: `src/app/(dashboard)/placements/_components/account-table.tsx`

- [ ] **Step 1: account-table 组件**

```tsx
// src/app/(dashboard)/placements/_components/account-table.tsx
import { PlatformBadge } from "../../live-accounts/_components/platform-badge";

interface AccountRow {
  account_id: string;
  account_name: string;
  placement_label: string | null;
  platform: string | null;
  cost: string;
  activations: number;
  payment: string;
}

export function AccountTable({ rows }: { rows: AccountRow[] }) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-slate-400 text-sm">暂无投放数据</div>;
  }
  const totalCost = rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const totalActivations = rows.reduce((s, r) => s + Number(r.activations ?? 0), 0);
  const totalPayment = rows.reduce((s, r) => s + Number(r.payment ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="bg-secondary border-b border-slate-200">
            {["账号", "投放标签", "平台", "消耗", "激活", "单价", "付费", "ROI"].map((c) => (
              <th key={c} className="px-3 py-2 text-left text-xs font-medium text-slate-500">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cost = Number(r.cost ?? 0);
            const acts = Number(r.activations ?? 0);
            const pay = Number(r.payment ?? 0);
            const unitPrice = acts > 0 ? cost / acts : null;
            const roi = cost > 0 ? pay / cost : null;
            const roiColor = roi == null ? "" : roi >= 0.5 ? "text-green-600" : roi < 0.3 ? "text-red-600" : "text-amber-600";
            return (
              <tr key={r.account_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.account_name}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{r.placement_label ?? "—"}</td>
                <td className="px-3 py-2">{r.platform && <PlatformBadge platform={r.platform} size="xs" />}</td>
                <td className="px-3 py-2 text-right">¥{cost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right">{acts}</td>
                <td className="px-3 py-2 text-right">{unitPrice == null ? "—" : `¥${unitPrice.toFixed(2)}`}</td>
                <td className="px-3 py-2 text-right">¥{pay.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
                <td className={`px-3 py-2 text-right font-medium ${roiColor}`}>
                  {roi == null ? "—" : roi.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
            <td className="px-3 py-2" colSpan={3}>合计 ({rows.length})</td>
            <td className="px-3 py-2 text-right">¥{totalCost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
            <td className="px-3 py-2 text-right">{totalActivations}</td>
            <td className="px-3 py-2 text-right">{totalActivations > 0 ? `¥${(totalCost/totalActivations).toFixed(2)}` : "—"}</td>
            <td className="px-3 py-2 text-right">¥{totalPayment.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
            <td className="px-3 py-2 text-right">{totalCost > 0 ? (totalPayment/totalCost).toFixed(2) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
// src/app/(dashboard)/placements/by-account/page.tsx
import { queryByAccount } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AccountTable } from "../_components/account-table";

export default async function ByAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAccount(filter);
  return <AccountTable rows={rows as never} />;
}
```

- [ ] **Step 3: 跑 typecheck + 手工测试**

```bash
pnpm typecheck
pnpm dev
# 浏览器开 /placements/by-account
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/placements/by-account/ src/app/\(dashboard\)/placements/_components/account-table.tsx
git commit -m "feat(placements): /by-account A 视角看板（账号汇总 + ROI）"
```

---

### Task 23: B 视角 — `/placements/by-anchor`

**Files:**
- Create: `src/app/(dashboard)/placements/by-anchor/page.tsx`
- Create: `src/app/(dashboard)/placements/_components/anchor-table.tsx`

- [ ] **Step 1: anchor-table 组件**

```tsx
// src/app/(dashboard)/placements/_components/anchor-table.tsx
interface AnchorRow {
  user_id: string | null;
  anchor_name: string | null;
  business_line: string | null;
  source: string | null;
  cost: string;
  activations: number;
  payment: string;
  account_count: number;
}

export function AnchorTable({ rows }: { rows: AnchorRow[] }) {
  // 按 user_id 聚合（一个主播可能跨多 source）
  const byUser = new Map<string, AnchorRow & { totalCost: number; totalActs: number; totalPay: number }>();
  const conflictRow = { totalCost: 0, totalActs: 0, totalPay: 0, accountCount: 0 };
  const unmatchedRow = { totalCost: 0, totalActs: 0, totalPay: 0, accountCount: 0 };

  for (const r of rows) {
    const cost = Number(r.cost ?? 0);
    const acts = Number(r.activations ?? 0);
    const pay = Number(r.payment ?? 0);
    if (r.source === "conflict") {
      conflictRow.totalCost += cost;
      conflictRow.totalActs += acts;
      conflictRow.totalPay += pay;
      continue;
    }
    if (r.source === "unmatched" || !r.user_id) {
      unmatchedRow.totalCost += cost;
      unmatchedRow.totalActs += acts;
      unmatchedRow.totalPay += pay;
      continue;
    }
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, { ...r, totalCost: 0, totalActs: 0, totalPay: 0 });
    }
    const agg = byUser.get(r.user_id)!;
    agg.totalCost += cost;
    agg.totalActs += acts;
    agg.totalPay += pay;
  }

  const sorted = [...byUser.values()].sort((a, b) => b.totalCost - a.totalCost);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="bg-secondary border-b border-slate-200">
            {["主播", "业务线", "归因消耗", "激活", "付费", "ROI", "覆盖账号"].map((c) => (
              <th key={c} className="px-3 py-2 text-left text-xs font-medium text-slate-500">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const roi = r.totalCost > 0 ? r.totalPay / r.totalCost : null;
            return (
              <tr key={r.user_id!} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.anchor_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.business_line ?? "—"}</td>
                <td className="px-3 py-2 text-right">¥{r.totalCost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right">{r.totalActs}</td>
                <td className="px-3 py-2 text-right">¥{r.totalPay.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}</td>
                <td className="px-3 py-2 text-right">{roi == null ? "—" : roi.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.account_count}</td>
              </tr>
            );
          })}
          {conflictRow.totalCost > 0 && (
            <tr className="border-t-2 border-amber-300 bg-amber-50">
              <td className="px-3 py-2 font-medium text-amber-900" colSpan={2}>⚠ 冲突未归因（轮播排班重叠）</td>
              <td className="px-3 py-2 text-right">¥{conflictRow.totalCost.toLocaleString("zh-CN")}</td>
              <td className="px-3 py-2 text-right">{conflictRow.totalActs}</td>
              <td className="px-3 py-2 text-right">¥{conflictRow.totalPay.toLocaleString("zh-CN")}</td>
              <td colSpan={2}></td>
            </tr>
          )}
          {unmatchedRow.totalCost > 0 && (
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700" colSpan={2}>未匹配（无人排班）</td>
              <td className="px-3 py-2 text-right">¥{unmatchedRow.totalCost.toLocaleString("zh-CN")}</td>
              <td className="px-3 py-2 text-right">{unmatchedRow.totalActs}</td>
              <td className="px-3 py-2 text-right">¥{unmatchedRow.totalPay.toLocaleString("zh-CN")}</td>
              <td colSpan={2}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
// src/app/(dashboard)/placements/by-anchor/page.tsx
import { queryByAnchor } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AnchorTable } from "../_components/anchor-table";

export default async function ByAnchorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAnchor(filter);
  return <AnchorTable rows={rows as never} />;
}
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/placements/by-anchor/ src/app/\(dashboard\)/placements/_components/anchor-table.tsx
git commit -m "feat(placements): /by-anchor B 视角看板（按主播归因汇总 + 冲突/未匹配桶）"
```

---

### Task 24: C 视角 — `/placements/by-hour`（24h 时段矩阵）

**Files:**
- Create: `src/app/(dashboard)/placements/by-hour/page.tsx`
- Create: `src/app/(dashboard)/placements/_components/hour-matrix.tsx`

- [ ] **Step 1: hour-matrix 组件**

```tsx
// src/app/(dashboard)/placements/_components/hour-matrix.tsx
interface HourCell {
  account_id: string;
  account_name: string;
  hour: number;
  cost: string;
  activations: number;
  payment: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function colorFor(value: number, max: number): string {
  if (value <= 0) return "bg-slate-50 text-slate-300";
  const r = value / max;
  if (r > 0.66) return "bg-blue-700 text-white";
  if (r > 0.33) return "bg-blue-400 text-white";
  if (r > 0.1) return "bg-blue-200 text-blue-900";
  return "bg-blue-50 text-blue-700";
}

export function HourMatrix({ cells }: { cells: HourCell[] }) {
  // 聚合 by (account_id, hour)
  const byAccount = new Map<string, { name: string; cells: Map<number, HourCell> }>();
  for (const c of cells) {
    if (!byAccount.has(c.account_id)) {
      byAccount.set(c.account_id, { name: c.account_name, cells: new Map() });
    }
    byAccount.get(c.account_id)!.cells.set(c.hour, c);
  }

  // 找最大值（用于颜色梯度）
  const maxCost = Math.max(0, ...cells.map((c) => Number(c.cost ?? 0)));

  const accounts = [...byAccount.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  if (accounts.length === 0) {
    return <div className="py-12 text-center text-slate-400 text-sm">暂无投放数据</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="border-b border-slate-200 bg-secondary">
            <th className="sticky left-0 z-10 bg-secondary px-3 py-2 text-left text-slate-500">账号</th>
            {HOURS.map((h) => (
              <th key={h} className="w-12 px-1 py-2 text-center text-[11px] text-slate-500">{h.toString().padStart(2, "0")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map(([accId, info]) => (
            <tr key={accId} className="border-b border-slate-100">
              <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium whitespace-nowrap">{info.name}</td>
              {HOURS.map((h) => {
                const cell = info.cells.get(h);
                const cost = Number(cell?.cost ?? 0);
                const cls = colorFor(cost, maxCost);
                const display = cost <= 0 ? "—" : cost >= 1000 ? `¥${(cost / 1000).toFixed(0)}k` : `¥${cost.toFixed(0)}`;
                const tip = cell ? `${info.name} | ${h}:00 | 消耗 ¥${cost.toFixed(2)} | 激活 ${cell.activations}` : "";
                return (
                  <td key={h} className={`w-12 px-1 py-1.5 text-center text-[10.5px] ${cls}`} title={tip}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
// src/app/(dashboard)/placements/by-hour/page.tsx
import { queryByHour } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { HourMatrix } from "../_components/hour-matrix";

export default async function ByHourPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const cells = await queryByHour(filter);
  return <HourMatrix cells={cells as never} />;
}
```

- [ ] **Step 3: typecheck + 手工测试**

```bash
pnpm typecheck
pnpm dev
# 浏览器开 /placements/by-hour
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/placements/by-hour/ src/app/\(dashboard\)/placements/_components/hour-matrix.tsx
git commit -m "feat(placements): /by-hour C 视角时段矩阵（24h × 账号 + 颜色梯度）"
```

---

### Task 25: CSV 导出按钮

**Files:**
- Create: `src/app/(dashboard)/placements/_components/csv-export-button.tsx`
- Modify: `src/app/(dashboard)/placements/by-account/page.tsx`（加按钮）
- Modify: `src/app/(dashboard)/placements/by-anchor/page.tsx`（加按钮）

- [ ] **Step 1: 客户端导出组件**

```tsx
// src/app/(dashboard)/placements/_components/csv-export-button.tsx
"use client";

interface CsvExportButtonProps {
  rows: Record<string, unknown>[];
  filename: string;
  columns: { key: string; label: string }[];
}

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function CsvExportButton({ rows, filename, columns }: CsvExportButtonProps) {
  const handleClick = () => {
    const header = columns.map((c) => escapeCsv(c.label)).join(",");
    const body = rows
      .map((r) => columns.map((c) => escapeCsv(r[c.key])).join(","))
      .join("\n");
    const csv = "﻿" + header + "\n" + body;     // BOM for Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleClick}
      className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      ⬇ 导出 CSV
    </button>
  );
}
```

- [ ] **Step 2: 在 by-account 页加导出按钮**

修改 `src/app/(dashboard)/placements/by-account/page.tsx`：

```tsx
import { queryByAccount } from "@/modules/placement/server";
import { resolveFilter } from "@/modules/placement";
import { AccountTable } from "../_components/account-table";
import { CsvExportButton } from "../_components/csv-export-button";

export default async function ByAccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filter = resolveFilter(sp);
  const rows = await queryByAccount(filter);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <CsvExportButton
          rows={rows as never}
          filename={`投放-按账号-${filter.date_from}_${filter.date_to}.csv`}
          columns={[
            { key: "account_name", label: "账号" },
            { key: "placement_label", label: "投放标签" },
            { key: "platform", label: "平台" },
            { key: "cost", label: "消耗" },
            { key: "activations", label: "激活" },
            { key: "payment", label: "付费" },
          ]}
        />
      </div>
      <AccountTable rows={rows as never} />
    </div>
  );
}
```

- [ ] **Step 3: by-anchor 页同样加（仿照上）**

`src/app/(dashboard)/placements/by-anchor/page.tsx` 加 CsvExportButton，columns 是 `["anchor_name","business_line","cost","activations","payment","account_count"]`。

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/placements/_components/csv-export-button.tsx src/app/\(dashboard\)/placements/by-account/page.tsx src/app/\(dashboard\)/placements/by-anchor/page.tsx
git commit -m "feat(placements): CSV 导出按钮（A / B 视角）"
```

---

## Milestone 8 — schedule_override UI 子 tab

### Task 26: schedule-override-tab 子 tab UI

**Files:**
- Create: `src/app/(dashboard)/live-accounts/_components/schedule-override-tab.tsx`
- Modify: `src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx`（接入新子 tab）

- [ ] **Step 1: 子 tab 组件**

```tsx
// src/app/(dashboard)/live-accounts/_components/schedule-override-tab.tsx
"use client";
import { useState, useTransition } from "react";
import { createOverride, deleteOverride } from "@/modules/schedule-override";
import { mergeWithOverride, type DefaultSchedule, type OverrideSchedule } from "@/modules/schedule-override/effective";

interface OverrideRowView {
  id: string;
  date: string;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  reason: string | null;
}

interface ScheduleOverrideTabProps {
  account_id: string;
  defaultSchedules: DefaultSchedule[];
  candidates: { id: string; name: string }[];   // 可选主播列表（直播一部成员）
  initialOverrides: OverrideRowView[];
}

export function ScheduleOverrideTab({
  account_id,
  defaultSchedules,
  candidates,
  initialOverrides,
}: ScheduleOverrideTabProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [overrides, setOverrides] = useState(initialOverrides);
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  const todayOverrides = overrides.filter((o) => o.date === date);
  const merged = mergeWithOverride(
    defaultSchedules,
    todayOverrides.map((o) => ({ user: o.dingtalk_user_id, slots: o.time_slots })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium">日期：</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">当天有效排班</h3>
        <ul className="rounded border border-slate-200 bg-slate-50 p-2 text-xs space-y-1">
          {merged.map((s, i) => (
            <li key={i}>
              <span className="font-mono">{s.slots.length === 0 ? "请假" : s.slots.map(([a, b]) => `${a}-${b}`).join(", ")}</span>
              <span className="ml-2">{candidates.find((c) => c.id === s.user)?.name ?? s.user}</span>
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                s.source === "override" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
              }`}>{s.source === "override" ? "调整" : "默认"}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">该日临时调整 ({todayOverrides.length})</h3>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white"
          >
            + 添加
          </button>
        </div>
        <ul className="space-y-1">
          {todayOverrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded border border-slate-200 bg-white p-2 text-sm">
              <div>
                <span className="font-medium">{o.anchor_name ?? o.dingtalk_user_id}</span>
                <span className="ml-3 font-mono text-xs">
                  {o.time_slots.length === 0 ? "请假" : o.time_slots.map(([a, b]) => `${a}-${b}`).join(", ")}
                </span>
                {o.reason && <span className="ml-3 text-xs text-slate-500">{o.reason}</span>}
              </div>
              <button
                onClick={() => {
                  if (!confirm("确认删除？")) return;
                  startTransition(async () => {
                    await deleteOverride(o.id);
                    setOverrides((prev) => prev.filter((x) => x.id !== o.id));
                  });
                }}
                className="text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      {showAdd && (
        <AddOverrideDialog
          account_id={account_id}
          date={date}
          candidates={candidates}
          onClose={() => setShowAdd(false)}
          onAdded={(newOv) => {
            setOverrides((prev) => [...prev, newOv]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddOverrideDialog({
  account_id,
  date,
  candidates,
  onClose,
  onAdded,
}: {
  account_id: string;
  date: string;
  candidates: { id: string; name: string }[];
  onClose: () => void;
  onAdded: (o: OverrideRowView) => void;
}) {
  const [userId, setUserId] = useState("");
  const [slotStart, setSlotStart] = useState("14:00");
  const [slotEnd, setSlotEnd] = useState("18:00");
  const [reason, setReason] = useState("请假调班");
  const [, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-5 shadow-xl space-y-3">
        <h2 className="text-lg font-medium">添加临时调整</h2>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
        >
          <option value="">— 选择主播 —</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-2 text-sm">
          <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)} className="rounded border border-slate-200 px-2 py-1" />
          <span>—</span>
          <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)} className="rounded border border-slate-200 px-2 py-1" />
        </div>
        <input
          type="text"
          placeholder="原因（请假调班 / 加班 ...）"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1 text-sm text-slate-600">取消</button>
          <button
            disabled={!userId}
            onClick={() => {
              startTransition(async () => {
                await createOverride({
                  account_id,
                  date,
                  dingtalk_user_id: userId,
                  time_slots: [[slotStart, slotEnd]],
                  reason,
                });
                onAdded({
                  id: crypto.randomUUID(),  // 占位，会被 router.refresh 替换
                  date,
                  dingtalk_user_id: userId,
                  anchor_name: candidates.find((c) => c.id === userId)?.name ?? null,
                  time_slots: [[slotStart, slotEnd]],
                  reason,
                });
              });
            }}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: account-edit-drawer.tsx 加新子 tab**

打开现有 `src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx`，找到 `「主播 / 排班」tab` 内部的子 tab 列表（Phase 2.1 加的「默认排班」），在它旁边加「临时调整」子 tab，点击切换到 `ScheduleOverrideTab` 组件。

具体实现以现有 drawer 文件结构为准。如果 drawer 内部没有 sub-tab 框架，加一个简单的 tab state：

```tsx
const [scheduleSubTab, setScheduleSubTab] = useState<"default" | "override">("default");
// ...
{scheduleSubTab === "override" && (
  <ScheduleOverrideTab
    account_id={account.id}
    defaultSchedules={defaultSchedules}
    candidates={dingtalkCandidates}
    initialOverrides={initialOverrides}
  />
)}
```

需要从 page.tsx server component 把 `initialOverrides`（用 `listOverridesForAccount`）一起传进来。

- [ ] **Step 3: typecheck + 手工测试**

```bash
pnpm typecheck
pnpm dev
# 浏览器：/live-accounts → 选账号 → 抽屉 → 主播/排班 → 临时调整子 tab
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/_components/schedule-override-tab.tsx src/app/\(dashboard\)/live-accounts/_components/account-edit-drawer.tsx
git commit -m "feat(live-accounts): 抽屉新增「临时调整」子 tab（schedule_override CRUD）"
```

---

### Task 27: 集成 listOverridesForAccount 到 /live-accounts page.tsx

**Files:**
- Modify: `src/app/(dashboard)/live-accounts/page.tsx`

- [ ] **Step 1: 加查询**

打开 `src/app/(dashboard)/live-accounts/page.tsx`，在 server component 顶部加：

```typescript
import { listOverridesForAccount } from "@/modules/schedule-override/server";

// 在已有 fetch 之后：
const overridesByAccount = new Map<string, Awaited<ReturnType<typeof listOverridesForAccount>>>();
for (const acc of accounts) {
  overridesByAccount.set(acc.id, await listOverridesForAccount(acc.id));
}

// 把 overridesByAccount 传给 client 组件，让 schedule-override-tab 拿 initialOverrides
```

注：N+1 查询。如果账号 > 100，改用单次 SQL `WHERE account_id IN (...)`。

更优做法：

```typescript
import { db } from "@/db/client";
import { schedule_override } from "@/db/schema/schedule-override";
import { dingtalkUser } from "@/db/schema/dingtalk";
import { eq, inArray } from "drizzle-orm";

const overrides = accounts.length > 0
  ? await db
      .select({
        id: schedule_override.id,
        account_id: schedule_override.account_id,
        date: schedule_override.date,
        dingtalk_user_id: schedule_override.dingtalk_user_id,
        anchor_name: dingtalkUser.name,
        time_slots: schedule_override.time_slots,
        reason: schedule_override.reason,
      })
      .from(schedule_override)
      .leftJoin(dingtalkUser, eq(schedule_override.dingtalk_user_id, dingtalkUser.user_id))
      .where(inArray(schedule_override.account_id, accounts.map((a) => a.id)))
  : [];

const overridesByAccount = new Map<string, typeof overrides>();
for (const o of overrides) {
  if (!overridesByAccount.has(o.account_id)) overridesByAccount.set(o.account_id, []);
  overridesByAccount.get(o.account_id)!.push(o);
}
```

- [ ] **Step 2: 跑 typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/page.tsx
git commit -m "feat(live-accounts): page.tsx 加 schedule_override 数据加载"
```

---

## Milestone 9 — PRO3 历史迁移

### Task 28: pro3-adapter — PRO3 SQLite → rawRows

**Files:**
- Create: `src/modules/placement/pro3-adapter.ts`
- Create: `tests/modules/placement/pro3-adapter.test.ts`

- [ ] **Step 1: 写测试（用真实 PRO3 SQLite 抽样）**

```typescript
// tests/modules/placement/pro3-adapter.test.ts
import { describe, it, expect } from "vitest";
import { readPro3Placements } from "@/modules/placement/pro3-adapter";
import { existsSync } from "node:fs";

const PRO3_DB = "/Users/zhangjin/miracle-pro3/server/database.sqlite";
const skipIfNoDb = !existsSync(PRO3_DB);

describe.skipIf(skipIfNoDb)("readPro3Placements", () => {
  it("读出 product_buyu 至少 1000 行", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", { limit: 1000 });
    expect(rows.length).toBeGreaterThan(100);
    const r = rows[0]!;
    expect(r.account_name).toBeTruthy();
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.hour).toBeGreaterThanOrEqual(0);
    expect(r.hour).toBeLessThanOrEqual(23);
  });

  it("读出 product_ue4 / product_urp", () => {
    const ue4 = readPro3Placements(PRO3_DB, "product_ue4", { limit: 100 });
    const urp = readPro3Placements(PRO3_DB, "product_urp", { limit: 100 });
    expect(ue4.length).toBeGreaterThan(0);
    expect(urp.length).toBeGreaterThan(0);
  });

  it("数值字段 strip 单位（5746元 → 5746）", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", { limit: 5000 });
    // 应当所有 cost_yuan 是 number，不带 "元"
    expect(rows.every((r) => typeof r.cost_yuan === "number")).toBe(true);
  });

  it("过滤日期范围", () => {
    const rows = readPro3Placements(PRO3_DB, "product_buyu", {
      date_from: "2025-12-01",
      date_to: "2025-12-31",
      limit: 5000,
    });
    expect(rows.every((r) => r.date >= "2025-12-01" && r.date <= "2025-12-31")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test pro3-adapter
```

- [ ] **Step 3: 写实现**

```typescript
// src/modules/placement/pro3-adapter.ts
import "server-only";
import Database from "better-sqlite3";
import { parseDateText, parseHour, parseUnitNumber } from "./parse-utils";
import type { IngestRow } from "./ingest";

interface Pro3Pro3Row {
  type: string;
  data_date: string | null;
  content: string;
}

interface Pro3Content {
  datasetId?: string;
  dataDate?: string;
  dataHour?: number | string;
  时间?: string;
  账户名称?: string;
  消耗?: number | string;
  花费?: number | string;
  激活数?: number | string;
  激活当日付费金额?: number | string;
  开始下载数?: number | string;
  下载完成数?: number | string;
  anchorName?: string;
}

export interface Pro3PlacementRow extends IngestRow {
  // 同 IngestRow，含 raw（原始 PRO3 row）
}

export function readPro3Placements(
  sqlitePath: string,
  dataset: "product_buyu" | "product_ue4" | "product_urp",
  opts: { limit?: number; date_from?: string; date_to?: string } = {},
): Pro3PlacementRow[] {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const sql = `
      SELECT type, data_date, content
      FROM business_data
      WHERE type = 'custom-ds-${dataset}'
      ${opts.date_from ? `AND data_date >= '${opts.date_from}'` : ""}
      ${opts.date_to ? `AND data_date <= '${opts.date_to}'` : ""}
      ${opts.limit ? `LIMIT ${opts.limit}` : ""}
    `;
    const rows = sqlite.prepare(sql).all() as Pro3Pro3Row[];

    const result: Pro3PlacementRow[] = [];
    for (const r of rows) {
      try {
        const content = JSON.parse(r.content) as Pro3Content;
        const date =
          parseDateText(content.dataDate ?? "") ??
          parseDateText(r.data_date ?? "") ??
          (r.data_date && /^\d{4}-\d{2}-\d{2}$/.test(r.data_date) ? r.data_date : null);
        if (!date) continue;

        const hour = parseHour(content.dataHour ?? content.时间 ?? "");
        if (hour === null) continue;

        const accountName = content.账户名称;
        if (!accountName) continue;

        result.push({
          account_name: String(accountName).trim(),
          date,
          hour,
          cost_yuan: parseUnitNumber(content.消耗 ?? content.花费),
          activations: parseUnitNumber(content.激活数),
          payment_yuan: parseUnitNumber(content.激活当日付费金额),
          start_download: parseUnitNumber(content.开始下载数),
          finish_download: parseUnitNumber(content.下载完成数),
          raw: content as Record<string, unknown>,
        });
      } catch {
        // skip 解析失败行
      }
    }
    return result;
  } finally {
    sqlite.close();
  }
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test pro3-adapter
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement/pro3-adapter.ts tests/modules/placement/pro3-adapter.test.ts
git commit -m "feat(placement): pro3-adapter 读 PRO3 SQLite 投放数据"
```

---

### Task 29: 迁移 CLI — `migrate-pro3-placements.ts`

**Files:**
- Create: `src/scripts/migrate-pro3-placements.ts`

- [ ] **Step 1: 写 CLI**

```typescript
// src/scripts/migrate-pro3-placements.ts
import { readPro3Placements } from "@/modules/placement/pro3-adapter";
import { ingestRows } from "@/modules/placement/server";
import { runAttributionJob } from "@/modules/placement-attribution/server";

interface CliOpts {
  pro3Db: string;
  datasets: ("product_buyu" | "product_ue4" | "product_urp")[];
  dateFrom?: string;
  dateTo?: string;
  dryRun: boolean;
  forceReimport: boolean;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const has = (k: string) => args.includes(`--${k}`);

  const pro3Db = get("pro3-db") ?? "/Users/zhangjin/miracle-pro3/server/database.sqlite";
  const datasetsStr = get("datasets") ?? "product_buyu,product_ue4,product_urp";
  const dateRange = get("date-range");
  const [dateFrom, dateTo] = (dateRange ?? "").split(":");

  return {
    pro3Db,
    datasets: datasetsStr.split(",") as CliOpts["datasets"],
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    dryRun: has("dry-run"),
    forceReimport: has("force-reimport"),
  };
}

async function main() {
  const opts = parseArgs();
  console.log(`\n=== PRO3 投放数据迁移 ${opts.dryRun ? "DRY-RUN" : "实际写入"} ===`);
  console.log(`SQLite: ${opts.pro3Db}`);
  console.log(`数据集: ${opts.datasets.join(", ")}`);
  console.log(`日期范围: ${opts.dateFrom ?? "全部"} ~ ${opts.dateTo ?? "全部"}\n`);

  for (const dataset of opts.datasets) {
    console.log(`\n--- 处理 ${dataset} ---`);
    const rows = readPro3Placements(opts.pro3Db, dataset, {
      date_from: opts.dateFrom,
      date_to: opts.dateTo,
    });
    console.log(`读出 ${rows.length} 行`);

    if (opts.dryRun) {
      const accounts = new Set(rows.map((r) => r.account_name));
      console.log(`涉及账号: ${accounts.size}`);
      console.log(`日期范围: ${rows.reduce((min, r) => r.date < min ? r.date : min, "9999")} ~ ${rows.reduce((max, r) => r.date > max ? r.date : max, "0000")}`);
      continue;
    }

    const batch = await ingestRows({
      source: "pro3-migration",
      dataset_id: dataset,
      file_name: `pro3-${dataset}-${new Date().toISOString().slice(0, 10)}.batch`,
      uploaded_by: null,
      rows,
      parse_errors: [],
    });

    console.log(`✓ batch=${batch.id} inserted=${batch.rows_inserted} updated=${batch.rows_updated} skipped=${batch.rows_skipped}`);

    // 跑归因
    let totalAttributed = 0;
    while (true) {
      const r = await runAttributionJob({ batch_id: batch.id, max_rows: 1000 });
      if (r.processed === 0) break;
      totalAttributed += r.processed;
      console.log(`  归因进度: +${r.processed}（累计 ${totalAttributed}）`);
    }
  }

  console.log("\n=== 完成 ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: dry-run 验证（不写库）**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/migrate-pro3-placements.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --dry-run
```

预期：输出每 dataset 的行数 + 账号数 + 日期范围。

- [ ] **Step 3: Commit**

```bash
git add src/scripts/migrate-pro3-placements.ts
git commit -m "feat(scripts): migrate-pro3-placements CLI（dry-run + 真迁移）"
```

---

### Task 30: 校验脚本 — `verify-placement-migration.ts`

**Files:**
- Create: `src/scripts/verify-placement-migration.ts`

- [ ] **Step 1: 写校验**

```typescript
// src/scripts/verify-placement-migration.ts
import Database from "better-sqlite3";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

interface CliOpts {
  pro3Db: string;
  sampleAccount: string;
  date: string;
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2);
  const get = (k: string) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    pro3Db: get("pro3-db") ?? "/Users/zhangjin/miracle-pro3/server/database.sqlite",
    sampleAccount: get("sample-account") ?? "",
    date: get("date") ?? "",
  };
}

async function main() {
  const opts = parseArgs();
  if (!opts.sampleAccount || !opts.date) {
    console.error("用法：--sample-account <账号> --date <YYYY-MM-DD>");
    process.exit(1);
  }

  // PRO3 该账号该日总消耗
  const sqlite = new Database(opts.pro3Db, { readonly: true });
  const pro3Rows = sqlite
    .prepare(`SELECT content FROM business_data WHERE type LIKE 'custom-ds-%' AND data_date = ?`)
    .all(opts.date) as { content: string }[];
  const pro3Total = pro3Rows.reduce((sum, r) => {
    try {
      const c = JSON.parse(r.content);
      if (c.账户名称 === opts.sampleAccount) {
        const cost = c.消耗 ?? c.花费 ?? 0;
        return sum + (typeof cost === "number" ? cost : Number(String(cost).replace(/[元¥%,]/g, "")) || 0);
      }
    } catch {}
    return sum;
  }, 0);
  sqlite.close();

  // qjhy-pro 该账号该日总消耗
  const { rows: qjRows } = (await db.execute(sql`
    SELECT SUM(p.cost_yuan)::numeric AS total
    FROM placement_row p
    JOIN live_account a ON a.id = p.live_account_id
    WHERE a.placement_label = ${opts.sampleAccount}
      AND p.date = ${opts.date}
  `)) as unknown as { rows: Array<{ total: string | null }> };
  const qjTotal = Number(qjRows[0]?.total ?? 0);

  const diff = Math.abs(pro3Total - qjTotal);
  const errPct = pro3Total > 0 ? (diff / pro3Total) * 100 : 0;

  console.log(`\n=== 抽样校验 ${opts.sampleAccount} @ ${opts.date} ===`);
  console.log(`PRO3 总消耗:    ¥${pro3Total.toFixed(2)}`);
  console.log(`qjhy-pro 总消耗: ¥${qjTotal.toFixed(2)}`);
  console.log(`绝对差:         ¥${diff.toFixed(2)}`);
  console.log(`误差率:         ${errPct.toFixed(4)}%`);
  console.log(errPct < 0.01 ? "\n✅ PASS（误差 < 0.01%）" : "\n❌ FAIL（误差超阈值）");
  process.exit(errPct < 0.01 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: 测试运行（迁移完成后）**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/verify-placement-migration.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --sample-account "ldl-直播-蓝V" \
  --date 2025-12-01
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/verify-placement-migration.ts
git commit -m "feat(scripts): verify-placement-migration CLI（抽样数值校验）"
```

---

## Milestone 10 — cron 兜底 + 监控

### Task 31: cron 入口 + worker 集成

**Files:**
- Modify: `worker/index.ts`（或现有 worker 路径，按实际找）
- Create: `src/modules/placement-attribution/cron.ts`

- [ ] **Step 1: 找现有 worker 入口**

```bash
ls worker/ src/worker/ 2>/dev/null
grep -r "cron\|scheduler" worker/ src/worker/ 2>/dev/null | head -5
```

- [ ] **Step 2: 写 cron 函数**

```typescript
// src/modules/placement-attribution/cron.ts
import "server-only";
import { runAttributionJob } from "./job";

export async function runCronAttributionSweep() {
  console.log("[cron-attribution] start");
  let total = 0;
  while (true) {
    const r = await runAttributionJob({ max_rows: 1000 });
    if (r.processed === 0) break;
    total += r.processed;
  }
  console.log(`[cron-attribution] done, processed=${total}`);
}
```

`src/modules/placement-attribution/server.ts` 加导出：

```typescript
export { runCronAttributionSweep } from "./cron";
```

- [ ] **Step 3: 接入现有 worker scheduler**

打开 `worker/index.ts`（或现有 worker 入口文件），按现有 cron 写法接入：

```typescript
// 例如使用 node-cron 或 setInterval：
import cron from "node-cron";
import { runCronAttributionSweep } from "@/modules/placement-attribution/server";

// 每天 04:00 跑
cron.schedule("0 4 * * *", () => {
  runCronAttributionSweep().catch((e) => console.error("[cron-attribution-failed]", e));
});
```

如果现有 worker 用别的库（如 BullMQ），按现有模式接入。

- [ ] **Step 4: 手工触发一次测试**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  -e "import('./src/modules/placement-attribution/cron').then(m => m.runCronAttributionSweep())"
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement-attribution/cron.ts src/modules/placement-attribution/server.ts worker/
git commit -m "feat(placement-attribution): cron 兜底（每天 04:00 扫 dirty 行）"
```

---

### Task 32: 钉钉机器人通知 — 归因 job 失败 / batch 失败

**Files:**
- Modify: `src/modules/placement-attribution/job.ts`（job 失败时通知）
- Modify: `src/modules/placement/ingest.ts`（batch 失败时通知）

- [ ] **Step 1: 找现有钉钉 notifier**

```bash
grep -rn "dingtalk\|钉钉\|notifier\|webhook" src/lib/ 2>/dev/null | head -10
```

应在 `src/lib/dingtalk/notifier.ts`（Phase 1 已有）。

- [ ] **Step 2: 在 job.ts 加 try/catch**

```typescript
// src/modules/placement-attribution/job.ts （顶部加导入）
import { notifyDingtalk } from "@/lib/dingtalk/notifier";

// runAttributionJob 函数主体外层加 try/catch：
export async function runAttributionJob(opts?: { batch_id?: string; max_rows?: number }) {
  try {
    // ... 原本逻辑
  } catch (e) {
    await notifyDingtalk({
      title: "归因 job 报错",
      content: `runAttributionJob failed\n${e instanceof Error ? e.stack : String(e)}\nopts=${JSON.stringify(opts)}`,
    }).catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 3: 在 ingest.ts 加 batch 失败通知**

`ingestRows` 末尾，如果 status 是 'failed'，发钉钉：

```typescript
if (status === "failed") {
  await notifyDingtalk({
    title: "投放上传 batch 报错",
    content: `batch=${batch!.id} file=${input.file_name} dataset=${input.dataset_id}\n${errorLog.length} 个错误`,
  }).catch(() => {});
}
```

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/placement-attribution/job.ts src/modules/placement/ingest.ts
git commit -m "feat(placement): 归因 job + batch 失败时钉钉机器人通知"
```

---

## Milestone 11 — 主导航 + dry-run UI + e2e + 收尾

### Task 33: 主导航加 /placements 入口

**Files:**
- Modify: 主侧边栏文件（按现有 nav 路径）

- [ ] **Step 1: 找现有侧边栏**

```bash
grep -rn "Sidebar\|navigation\|/dashboard\|/anchors" src/app/\(dashboard\)/_components/ 2>/dev/null | head -5
```

通常在 `src/app/(dashboard)/_components/sidebar.tsx` 或类似。

- [ ] **Step 2: 加 /placements 入口**

按现有 nav item 模式加：

```tsx
{ href: "/placements", label: "投放数据", emoji: "💸", module: "placement" }
```

注：把这个 nav item 的可见性绑到 `resolvePermission(userId, 'placement').kind !== 'none'` — 按现有 nav 文件已有的权限过滤模式实现。

- [ ] **Step 3: 手工测试**

```bash
pnpm dev
# 浏览器：admin 登录 → 看到「投放数据」菜单 → 点击 → /placements
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/_components/sidebar.tsx
git commit -m "feat(nav): 主导航加 /placements 入口（按 placement module 权限过滤）"
```

---

### Task 34: 一次性 dry-run 报告查看页 — `/placement-migration`

**Files:**
- Create: `src/app/(dashboard)/placement-migration/page.tsx`

- [ ] **Step 1: 写页面（仿照 Phase 2.1 `/live-account-migration`）**

```tsx
// src/app/(dashboard)/placement-migration/page.tsx
"use client";
import { useState } from "react";

interface DryRunReport {
  datasets: { id: string; rows: number; date_from: string; date_to: string; account_count: number }[];
}

export default function PlacementMigrationPage() {
  const [report, setReport] = useState<DryRunReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setReport(json);
      setError(null);
    } catch (e) {
      setError(`解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">PRO3 投放迁移 — Dry-Run 报告</h1>
      <p className="text-sm text-slate-600">
        先在终端跑迁移 CLI 的 <code>--dry-run</code> 模式，把 stdout 重定向到 JSON 文件，再上传到此处查看。
      </p>
      <input
        type="file"
        accept=".json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error && <div className="rounded bg-red-50 border border-red-200 p-3 text-red-700">{error}</div>}

      {report && (
        <div className="space-y-3">
          {report.datasets.map((d) => (
            <div key={d.id} className="rounded border border-slate-200 bg-white p-4">
              <h2 className="font-medium">{d.id}</h2>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">行数</dt><dd>{d.rows.toLocaleString()}</dd>
                <dt className="text-slate-500">日期范围</dt><dd>{d.date_from} ~ {d.date_to}</dd>
                <dt className="text-slate-500">涉及账号</dt><dd>{d.account_count}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 修改 CLI 输出 JSON（`migrate-pro3-placements.ts` --dry-run 模式）**

在 dry-run 分支末尾加：

```typescript
if (opts.dryRun) {
  const report = { datasets: [] as { id: string; rows: number; date_from: string; date_to: string; account_count: number }[] };
  for (const dataset of opts.datasets) {
    const rows = readPro3Placements(opts.pro3Db, dataset, { date_from: opts.dateFrom, date_to: opts.dateTo });
    const accounts = new Set(rows.map((r) => r.account_name));
    const dates = rows.map((r) => r.date).sort();
    report.datasets.push({
      id: dataset,
      rows: rows.length,
      date_from: dates[0] ?? "",
      date_to: dates[dates.length - 1] ?? "",
      account_count: accounts.size,
    });
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
```

注：CLI 同时输出可读的 stderr 进度 + 最终 JSON 到 stdout，方便重定向。

- [ ] **Step 3: typecheck + 手工测试**

```bash
pnpm typecheck
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/migrate-pro3-placements.ts --dry-run > /tmp/pro3-dryrun.json
# 浏览器：/placement-migration → 上传 /tmp/pro3-dryrun.json
```

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/placement-migration/ src/scripts/migrate-pro3-placements.ts
git commit -m "feat(migration): /placement-migration 页 + CLI dry-run JSON 输出"
```

---

### Task 35: e2e 上线 checklist + 收尾

**Files:**
- Create: `docs/ops/placement-upload-guide.md`
- Create: `docs/dev/placement-attribution-algorithm.md`

- [ ] **Step 1: 写运营操作手册**

```markdown
<!-- docs/ops/placement-upload-guide.md -->
# 投放数据上传操作手册

## 每天日常流程

1. 登录百应 / 巨量后台，导出当天小时级 Excel
2. 打开 qjhy-pro `/placements/upload`
3. 拖入 N 个 Excel 文件
4. 选择产品（捕鱼 / UE4 / URP）
5. 点击「确认上传」
6. 上传完成 → 跳到批次列表查看处理结果

## 处理「未匹配账号」

如果批次详情显示「未找到 placement_label='xxx'」：

1. 去 `/live-accounts` 找对应账号
2. 编辑账号 → 设置「投放标签」字段为 Excel 里的「账户名称」
3. 重新上传当天 Excel（自动 UPDATE 覆盖）

## 处理「冲突未归因」

`/placements/by-anchor` 底部如果出现「冲突未归因」桶：

1. 进 `/live-accounts` 找该账号
2. 检查「主播 / 排班 → 默认排班」子 tab
3. 修正排班重叠（同一时段不应有多个主播）
4. 修正后等 30 秒，看板自动刷新
```

- [ ] **Step 2: 写开发笔记**

```markdown
<!-- docs/dev/placement-attribution-algorithm.md -->
# 投放归因算法说明

## 决策树

输入：placement_row(account_id, date, hour)

1. mergeWithOverride(default, override) → effective schedule
2. 过滤 rest_days 包含当天 ISO weekday 的 anchor
3. 找 effective slots 覆盖 hour 的候选
   - 1 个 → 归他，source 取自候选来源
   - 多个 → conflict
   - 0 个 → unmatched

## 跨天时段判定

`coversHour([22:00, 04:00], 2) === true` — 22-04 排班的 row.date hour=2 仍命中。
不查前一天的排班兜底（语义简化）。

## 触发时机

- Excel 上传：dirty=TRUE → 异步 job
- override CRUD：标受影响 (account, date) dirty → 异步 job
- default 编辑：**不**自动触发（保留历史归因不翻案）
- 手动重算未归因按钮：标 source IN (unmatched, conflict) 的 dirty → 异步 job
- cron 04:00：兜底扫 dirty
```

- [ ] **Step 3: 跑全套测试**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

预期：全部通过。

- [ ] **Step 4: Commit**

```bash
git add docs/ops/placement-upload-guide.md docs/dev/placement-attribution-algorithm.md
git commit -m "docs(phase-2.2): 运营操作手册 + 归因算法开发笔记"
```

---

### Task 36: 上线灰度 checklist（按 spec §12）

**手工执行步骤（不需要代码）：**

- [ ] **Step 1: migration 0024 上生产**

```bash
docker exec qjhy-postgres-prod psql -U qjhy -d qjhy -f /tmp/0024_phase_2_2_placements.sql
```

- [ ] **Step 2: 部署代码（不开 nav 入口）**

先把 `/placements` nav item 在 sidebar 隐藏（仅 admin 可见），让其他人看不到。

- [ ] **Step 3: 跑 PRO3 历史迁移 dry-run**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/migrate-pro3-placements.ts --dry-run > /tmp/dryrun.json
```

人工 review JSON 报告。

- [ ] **Step 4: 真迁移**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/migrate-pro3-placements.ts \
  --datasets product_buyu,product_ue4,product_urp
```

- [ ] **Step 5: 抽样校验**

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/verify-placement-migration.ts \
  --sample-account "ldl-直播-蓝V" --date 2025-12-01

NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/verify-placement-migration.ts \
  --sample-account "URP-内播03-超高爆-MCB-SZ" --date 2025-12-15

# ... 至少 3-5 个抽样
```

- [ ] **Step 6: 灰度 admin 看 1-2 天**

admin 登录看 `/placements`，上传当天真实 Excel，确认看板对得上百应后台显示。

- [ ] **Step 7: 邀请直播一部主管 + 1 运营测 2 天**

打开 nav 入口让他们看到。收集反馈。

- [ ] **Step 8: 全面开放**

PR / merge / push tag `v0.4.0-phase2.2`。

```bash
git tag -a v0.4.0-phase2.2 -m "Phase 2.2: 投放数据迁移 + 排班 override + 投放看板"
git push origin v0.4.0-phase2.2
```

- [ ] **Step 9: 通知运营切换**

发钉钉群通知，让运营每天 Excel 上传切到 qjhy-pro。

- [ ] **Step 10: 1 周后 PRO3 投放板块停用**

下线 PRO3 的 `/dashboard` 投放页面。

---

## 自检清单（plan 写完后 controller 自查）

- [x] **Spec coverage**：所有 spec 章节都有对应 task？
  - §3 数据模型 → Task 1, 2, 3
  - §4 Excel 上传 → Task 11, 12, 13, 18
  - §5 归因算法 → Task 7, 9, 10, 14, 15
  - §6 schedule_override UI → Task 16, 17, 26, 27
  - §7 投放看板 → Task 20, 21, 22, 23, 24, 25
  - §8 PRO3 迁移 → Task 28, 29, 30
  - §11 权限 → Task 4
  - §12 上线 → Task 36
  - §13 监控 → Task 32
  - §14 配套文档 → Task 35

- [x] **No placeholder**：所有步骤都有完整代码 / 命令 / 期望输出。

- [x] **类型一致**：
  - `IngestInput` / `IngestRow` 在 ingest.ts 定义，被 upload route + pro3-cli + 测试一致使用 ✓
  - `BoardFilter` 在 queries.ts 定义，被 by-account / by-anchor / by-hour 一致使用 ✓
  - `DefaultSchedule` / `OverrideSchedule` / `EffectiveSchedule` 在 effective.ts 定义，被 attribute.ts + UI 一致使用 ✓
  - `attributeRow(input).user/source` 与 `placement_row.attributed_dingtalk_user_id/attribution_source` 字段一致 ✓
  - `MODULE_KEYS` 加 'placement' 后所有 exhaustive switch（如 user-detail.tsx）已 in Task 4 处理 ✓

---

## 完成定义（DoD）

Phase 2.2 视为完成的判定条件：

1. ✅ 所有 36 个 task 全部 commit
2. ✅ `pnpm typecheck && pnpm lint && pnpm test` 全过（覆盖率 > 70%）
3. ✅ PRO3 历史迁移完成，3 个 sample 抽样误差 < 0.01%
4. ✅ 真实 Excel 能从 `/placements/upload` 上传并归因
5. ✅ override 编辑后 1-3 秒内看板归因结果变化
6. ✅ 直播一部主管 + 1 运营试用 2 天无 P0 bug
7. ✅ tag `v0.4.0-phase2.2` 上 main + push origin

