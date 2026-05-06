# Phase 2.1: 直播账号 + 主播 + 默认排班 主数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 4 张新表（`live_room` / `live_account` / `live_anchor` / `account_anchor_default`）+ 3 个 feature 模块 + 3 个 UI 页面（账号列表 / 主播档案 / 排班矩阵）+ PRO3 数据迁移工具，让运营在新中台维护跨平台直播账号和默认排班。

**Architecture:** 沿用 qjhy-pro feature-first 规范。钉钉用户作为真人主表（已有），`live_anchor` 通过 `dingtalk_user_id` 主键扩展业务字段。账号 ↔ 主播是 N:M 关联（`account_anchor_default`），承载默认排班 + `effective_from/to` 历史区间。`live_account.platform` 字段实现跨平台（抖音/快手），与现有 `anchor_profile`（仅抖音爬虫数据）通过 `platform_account_id` ↔ `aweme_display_id` 反向 join。

**Tech Stack:** Next.js 16 + TypeScript strict + Drizzle ORM + PostgreSQL 16 + Zod + Vitest + shadcn/ui + Tailwind v4 + better-sqlite3（迁移工具读 PRO3 SQLite）。

**Reference:**
- Spec: `docs/superpowers/specs/2026-05-06-phase-2-1-live-account-anchor-design.md`
- 项目宪法: `CONTRIBUTING.md`
- 参考模块（permissions）: `src/modules/permissions/`（schema/actions/types/server.ts 双入口模式）
- PRO3 SQLite: `/Users/zhangjin/miracle-pro3/server/database.sqlite`
- PRO3 主播信息组件参考: `/Users/zhangjin/miracle-pro3/src/views/AnchorListView.jsx`

---

## File Structure (Phase 2.1)

### 新增文件

```
src/
├── db/
│   └── schema/
│       ├── live-room.ts                 ← live_room 表
│       ├── live-account.ts              ← live_account 表
│       ├── live-anchor.ts               ← live_anchor 表
│       └── account-anchor-default.ts    ← account_anchor_default 表
├── modules/
│   ├── live-room/
│   │   ├── schema.ts                    ← Zod 输入校验
│   │   ├── types.ts
│   │   ├── queries.ts                   ← list/get
│   │   ├── actions.ts                   ← create/update/delete server actions
│   │   ├── server.ts                    ← server-only 入口
│   │   ├── index.ts                     ← client-safe 入口
│   │   └── README.md
│   ├── live-account/
│   │   ├── schema.ts
│   │   ├── types.ts
│   │   ├── queries.ts
│   │   ├── actions.ts
│   │   ├── time-slots.ts                ← 跨日时段命中算法
│   │   ├── name-matcher.ts              ← 姓名 fuzzy match
│   │   ├── migration.ts                 ← PRO3 → qjhy-pro 迁移逻辑
│   │   ├── server.ts
│   │   ├── index.ts
│   │   └── README.md
│   └── live-anchor/
│       ├── schema.ts
│       ├── types.ts
│       ├── queries.ts
│       ├── actions.ts
│       ├── account-bindings.ts          ← 默认排班 CRUD
│       ├── server.ts
│       ├── index.ts
│       └── README.md
├── app/(dashboard)/
│   ├── live-accounts/
│   │   ├── page.tsx                     ← A 视角：账号列表（主入口）
│   │   ├── _components/
│   │   │   ├── account-table.tsx
│   │   │   ├── account-edit-drawer.tsx
│   │   │   ├── platform-badge.tsx
│   │   │   └── anchor-binding-form.tsx
│   │   └── schedule-overview/
│   │       ├── page.tsx                 ← C 视角：排班矩阵（只读）
│   │       └── _components/
│   │           └── schedule-matrix.tsx
│   ├── live-anchors/
│   │   ├── page.tsx                     ← B 视角：主播档案
│   │   └── _components/
│   │       ├── anchor-table.tsx
│   │       └── anchor-edit-drawer.tsx
│   └── live-account-migration/
│       ├── page.tsx                     ← 姓名匹配确认 UI
│       └── _components/
│           └── name-match-section.tsx
├── scripts/
│   └── migrate-pro3-accounts.ts         ← CLI 迁移脚本
└── tests/
    └── modules/
        ├── live-account/
        │   ├── name-matcher.test.ts
        │   ├── time-slots.test.ts
        │   └── migration.test.ts
        └── live-anchor/
            └── account-bindings.test.ts
```

### 修改文件

```
src/db/schema/index.ts                   ← export 4 张新表
src/db/schema/anchors.ts                 ← anchor_profile 加 dingtalk_user_id 列
src/modules/permissions/modules.ts       ← 加 live_account/live_anchor/live_room module key
package.json                              ← 加 better-sqlite3 / pinyin 依赖
CONTRIBUTING.md                           ← 第 8 节注册新模块
```

---

## Task 0: 准备依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 better-sqlite3（迁移工具读 PRO3）和 pinyin（姓名匹配）**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm add better-sqlite3 pinyin
pnpm add -D @types/better-sqlite3
```

- [ ] **Step 2: 验证安装**

Run: `pnpm typecheck`
Expected: PASS（无新错误）

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add better-sqlite3 and pinyin for PRO3 migration"
```

---

## Task 1: 创建 live_room schema

**Files:**
- Create: `src/db/schema/live-room.ts`

- [ ] **Step 1: 写 schema 文件**

```typescript
// src/db/schema/live-room.ts
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 线下直播间（物理工位）。
 * 跨平台共用：B17 既可以播抖音也可以播快手。
 * 来源：运营手维护 + PRO3 迁移自动建。
 */
export const live_room = pgTable(
  "live_room",
  {
    id: text("id").primaryKey(), // randomUUID
    room_no: text("room_no").notNull().unique(), // 'B17' / 'A20' / 'B区-09'
    location: text("location"), // 楼层/区域，可空
    status: text("status").notNull().default("active"), // 'active' | 'inactive'
    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_status: index("idx_live_room_status").on(t.status),
  }),
);
```

- [ ] **Step 2: 注册到 schema/index.ts**

修改 `src/db/schema/index.ts`，加一行：

```typescript
export * from "./live-room";
```

- [ ] **Step 3: 生成 migration**

Run: `pnpm db:generate`
Expected: 创建 `src/db/migrations/00XX_*.sql` 含 `CREATE TABLE live_room`

- [ ] **Step 4: 应用 migration（验证不冲突）**

Run: `pnpm db:migrate`
Expected: 成功；`docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt live_room"` 看到表

- [ ] **Step 5: Commit**

```bash
git add src/db/schema/live-room.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): add live_room schema for offline studio rooms"
```

---

## Task 2: 创建 live_account schema

**Files:**
- Create: `src/db/schema/live-account.ts`

- [ ] **Step 1: 写 schema**

```typescript
// src/db/schema/live-account.ts
import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";
import { live_room } from "./live-room";

/**
 * 直播账号（核心维度表，跨平台）。
 * 一个账号 = 一个平台直播间账号，有平台 UID、绑定手机、设备编号、所在物理直播间。
 * 来源：运营手维护 + PRO3 迁移导入。
 */
export const live_account = pgTable(
  "live_account",
  {
    id: text("id").primaryKey(),
    account_name: text("account_name").notNull(), // "三国冰河时代-财神"
    platform: text("platform").notNull(), // '抖音' | '快手' | 'B站' | '视频号'
    platform_account_id: text("platform_account_id"), // 抖音号 / 快手号
    platform_uid: text("platform_uid"), // 平台唯一 UID
    platform_real_name: text("platform_real_name"),

    phone: text("phone"),
    phone_index: text("phone_index"), // 'SJ-250421-011' 公司资产编号
    phone_real_name: text("phone_real_name"),

    room_id: text("room_id").references(() => live_room.id),
    game_account_1: text("game_account_1"),
    game_account_2: text("game_account_2"),
    game_account_3: text("game_account_3"),
    product: text("product").notNull(), // '捕鱼大作战' / '三国冰河时代' / ...

    agent_dingtalk_user_id: text("agent_dingtalk_user_id").references(() => dingtalk_user.user_id),

    placement_label: text("placement_label").unique(), // 投放标签 1:1
    live_status: text("live_status").notNull().default("unknown"), // 'living' | 'offline' | 'banned' | 'unknown'

    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_platform_uid: unique("uq_live_account_platform_uid").on(t.platform, t.platform_uid),
    idx_platform: index("idx_live_account_platform").on(t.platform),
    idx_product: index("idx_live_account_product").on(t.product),
    idx_agent: index("idx_live_account_agent").on(t.agent_dingtalk_user_id),
    idx_room: index("idx_live_account_room").on(t.room_id),
    idx_platform_account_id: index("idx_live_account_platform_account_id").on(
      t.platform_account_id,
    ),
  }),
);
```

- [ ] **Step 2: 注册 + 生成 + 应用 migration**

```bash
# 改 src/db/schema/index.ts 加 export * from "./live-account";
pnpm db:generate
pnpm db:migrate
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d live_account"  # 验证
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/live-account.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): add live_account schema for cross-platform live accounts"
```

---

## Task 3: 创建 live_anchor schema

**Files:**
- Create: `src/db/schema/live-anchor.ts`

- [ ] **Step 1: 写 schema**

```typescript
// src/db/schema/live-anchor.ts
import { date, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 主播业务扩展表。
 * 钉钉用户中，仅"主播角色"的子集在此有行（约 50 人）。
 * 表的存在本身就是"是否主播"的标记。
 */
export const live_anchor = pgTable(
  "live_anchor",
  {
    dingtalk_user_id: text("dingtalk_user_id")
      .primaryKey()
      .references(() => dingtalk_user.user_id),

    business_line: text("business_line").notNull(), // '捕鱼' | '斗地主' | '麻将'
    employment_type: text("employment_type").notNull(), // '正式' | '合作' | '试播'
    work_status: text("work_status").notNull().default("active"), // 'active' | 'rest' | 'leave'

    trial_start_date: date("trial_start_date"),
    contract_date: date("contract_date"),
    leave_date: date("leave_date"),

    external_name: text("external_name"), // 钉钉外合作主播兜底名

    raw: jsonb("raw").notNull().default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_business: index("idx_live_anchor_business").on(t.business_line),
    idx_status: index("idx_live_anchor_status").on(t.work_status),
  }),
);
```

- [ ] **Step 2: 注册 + 生成 + 应用 migration**

```bash
# 改 src/db/schema/index.ts 加 export * from "./live-anchor";
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/live-anchor.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): add live_anchor schema as dingtalk user extension"
```

---

## Task 4: 创建 account_anchor_default schema

**Files:**
- Create: `src/db/schema/account-anchor-default.ts`

- [ ] **Step 1: 写 schema**

```typescript
// src/db/schema/account-anchor-default.ts
import { date, index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { live_account } from "./live-account";
import { live_anchor } from "./live-anchor";
import { sql } from "drizzle-orm";

/**
 * 账号 ↔ 主播 N:M 默认排班关联表。
 * 1 行 = "某主播在某账号上的默认排班规则"。
 * 个播：1 行（1 主播 1 账号）。
 * 轮播：N 行（N 主播 1 账号，时段不同）。
 *
 * effective_from/to: 不直接 UPDATE 旧排班，新建一行 + 旧的设 effective_to。
 */
export const account_anchor_default = pgTable(
  "account_anchor_default",
  {
    id: text("id").primaryKey(),
    account_id: text("account_id")
      .notNull()
      .references(() => live_account.id, { onDelete: "cascade" }),
    dingtalk_user_id: text("dingtalk_user_id")
      .notNull()
      .references(() => live_anchor.dingtalk_user_id),

    time_slots: jsonb("time_slots").notNull().$type<Array<[string, string]>>(), // [["12:00","18:00"]]
    rest_days: jsonb("rest_days").notNull().default([]).$type<number[]>(), // [1, 3] ISO weekday
    remark: text("remark"),

    effective_from: date("effective_from").notNull().default(sql`CURRENT_DATE`),
    effective_to: date("effective_to"), // null = 持续生效

    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_acc_anchor_eff: unique("uq_account_anchor_default_eff").on(
      t.account_id,
      t.dingtalk_user_id,
      t.effective_from,
    ),
    idx_account: index("idx_account_anchor_default_account").on(t.account_id),
    idx_anchor: index("idx_account_anchor_default_anchor").on(t.dingtalk_user_id),
    idx_effective: index("idx_account_anchor_default_effective").on(
      t.effective_from,
      t.effective_to,
    ),
  }),
);
```

- [ ] **Step 2: 注册 + 生成 + 应用 migration**

```bash
# 改 src/db/schema/index.ts 加 export * from "./account-anchor-default";
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/account-anchor-default.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(db): add account_anchor_default for N:M default scheduling"
```

---

## Task 5: anchor_profile 加 dingtalk_user_id 列

**Files:**
- Modify: `src/db/schema/anchors.ts`

- [ ] **Step 1: 在 anchor_profile 定义里加列**

在 `src/db/schema/anchors.ts` 的 `anchor_profile` 表定义中，在 `is_archived` 行后加：

```typescript
    // 跨平台真人绑定（Phase 2.1 加列，不做 UI；后续按需绑）
    dingtalk_user_id: text("dingtalk_user_id"),
```

并在 indexes 部分加：

```typescript
    idx_dingtalk: index("idx_anchor_profile_dingtalk").on(t.dingtalk_user_id),
```

注意：**不加** `references()`，PRO3 历史数据可能不规范，nullable 即可（spec §3.5）。

- [ ] **Step 2: 生成 + 应用 migration**

```bash
pnpm db:generate
pnpm db:migrate
```

- [ ] **Step 3: 验证**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d anchor_profile" | grep dingtalk_user_id
```

Expected: 看到 `dingtalk_user_id | text | |` 一行

- [ ] **Step 4: Commit**

```bash
git add src/db/schema/anchors.ts src/db/migrations/
git commit -m "feat(db): add dingtalk_user_id column to anchor_profile (no UI)"
```

---

## Task 6: 注册 3 个 module key 到 permissions

**Files:**
- Modify: `src/modules/permissions/modules.ts`

- [ ] **Step 1: 加 module key**

```typescript
// src/modules/permissions/modules.ts
export const MODULE_KEYS = [
  "dashboard",
  "anchors",
  "crawler",
  "permissions",
  "live_account",
  "live_anchor",
  "live_room",
] as const;

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "工作台",
  anchors: "主播明细",
  crawler: "爬虫监控",
  permissions: "权限管理",
  live_account: "直播账号",
  live_anchor: "主播档案",
  live_room: "直播间",
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  dashboard: "业务看板 / 数据总览",
  anchors: "主播列表 / 编辑 / 导出",
  crawler: "抖音 / 快手数据爬取（仅 admin）",
  permissions: "用户角色与权限分配（仅 admin）",
  live_account: "直播账号档案 / 主播绑定 / 默认排班",
  live_anchor: "主播业务档案（钉钉用户的主播扩展）",
  live_room: "线下物理直播间管理",
};
```

- [ ] **Step 2: 验证 typecheck**

Run: `pnpm typecheck`
Expected: PASS（permissions 表的现有数据不受影响）

- [ ] **Step 3: Commit**

```bash
git add src/modules/permissions/modules.ts
git commit -m "feat(permissions): register live_account/live_anchor/live_room modules"
```

---

## Task 7: live-room 模块脚手架（schema + types + queries）

**Files:**
- Create: `src/modules/live-room/schema.ts`
- Create: `src/modules/live-room/types.ts`
- Create: `src/modules/live-room/queries.ts`
- Create: `src/modules/live-room/server.ts`
- Create: `src/modules/live-room/index.ts`
- Create: `src/modules/live-room/README.md`

- [ ] **Step 1: 写 Zod schema**

```typescript
// src/modules/live-room/schema.ts
import { z } from "zod";

export const RoomStatus = z.enum(["active", "inactive"]);
export type RoomStatus = z.infer<typeof RoomStatus>;

export const CreateRoomInput = z.object({
  room_no: z.string().min(1, "直播间编号不能为空"),
  location: z.string().optional(),
  status: RoomStatus.default("active"),
});
export type CreateRoomInput = z.infer<typeof CreateRoomInput>;

export const UpdateRoomInput = CreateRoomInput.extend({
  id: z.string().min(1),
});
export type UpdateRoomInput = z.infer<typeof UpdateRoomInput>;

export const DeleteRoomInput = z.object({
  id: z.string().min(1),
});
```

- [ ] **Step 2: 写 types.ts**

```typescript
// src/modules/live-room/types.ts
import type { live_room } from "@/db/schema";

export type LiveRoom = typeof live_room.$inferSelect;
```

- [ ] **Step 3: 写 queries.ts**

```typescript
// src/modules/live-room/queries.ts
import "server-only";
import { db } from "@/db/client";
import { live_room } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function listRooms() {
  return db.select().from(live_room).orderBy(live_room.room_no);
}

export async function getRoomById(id: string) {
  const rows = await db.select().from(live_room).where(eq(live_room.id, id)).limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 4: 写 server.ts**

```typescript
// src/modules/live-room/server.ts
import "server-only";
export { listRooms, getRoomById } from "./queries";
```

- [ ] **Step 5: 写 index.ts**

```typescript
// src/modules/live-room/index.ts
export type { LiveRoom } from "./types";
export {
  RoomStatus,
  CreateRoomInput,
  UpdateRoomInput,
  DeleteRoomInput,
} from "./schema";
export { createRoom, updateRoom, deleteRoom } from "./actions";
```

- [ ] **Step 6: 写 README.md**

```markdown
# live-room 模块

线下物理直播间（B17/A20/B 区-09）。

- 跨平台共用，不绑定具体平台
- 仅 admin / 直播部 leader 可 CRUD
- live_account 通过 room_id FK 关联

## 入口
- `index.ts` — Server Actions + Zod schema + types
- `server.ts` — DB queries（仅 RSC / Server Action 用）

## 依赖
- `@/db/schema` (live_room 表)
- `@/lib/admin-guard` (仅 admin 可写)
- `@/lib/audit` (操作审计)
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/live-room/
git commit -m "feat(live-room): scaffold module with schema/queries"
```

---

## Task 8: live-room actions

**Files:**
- Create: `src/modules/live-room/actions.ts`

- [ ] **Step 1: 写 actions**

```typescript
// src/modules/live-room/actions.ts
"use server";
import { db } from "@/db/client";
import { live_room } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { CreateRoomInput, UpdateRoomInput, DeleteRoomInput } from "./schema";

export async function createRoom(input: unknown) {
  const data = CreateRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const id = crypto.randomUUID();
  const [created] = await db
    .insert(live_room)
    .values({ id, ...data })
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_CREATED",
    target_type: "live_room",
    target_id: id,
    after: created,
  });

  return created;
}

export async function updateRoom(input: unknown) {
  const data = UpdateRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_room).where(eq(live_room.id, data.id));
  if (!before) throw new AppError("LIVE_ROOM_NOT_FOUND", "直播间不存在", 404);

  const [updated] = await db
    .update(live_room)
    .set({ room_no: data.room_no, location: data.location, status: data.status, updated_at: new Date() })
    .where(eq(live_room.id, data.id))
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_UPDATED",
    target_type: "live_room",
    target_id: data.id,
    before,
    after: updated,
  });

  return updated;
}

export async function deleteRoom(input: unknown) {
  const { id } = DeleteRoomInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_room).where(eq(live_room.id, id));
  if (!before) throw new AppError("LIVE_ROOM_NOT_FOUND", "直播间不存在", 404);

  await db.delete(live_room).where(eq(live_room.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ROOM_DELETED",
    target_type: "live_room",
    target_id: id,
    before,
  });

  return { ok: true } as const;
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/live-room/actions.ts
git commit -m "feat(live-room): add CRUD server actions"
```

---

## Task 9: live-anchor 模块脚手架 + queries

**Files:**
- Create: `src/modules/live-anchor/schema.ts`
- Create: `src/modules/live-anchor/types.ts`
- Create: `src/modules/live-anchor/queries.ts`
- Create: `src/modules/live-anchor/server.ts`
- Create: `src/modules/live-anchor/index.ts`
- Create: `src/modules/live-anchor/README.md`

- [ ] **Step 1: schema.ts**

```typescript
// src/modules/live-anchor/schema.ts
import { z } from "zod";

export const BusinessLine = z.enum(["捕鱼", "斗地主", "麻将"]);
export type BusinessLine = z.infer<typeof BusinessLine>;

export const EmploymentType = z.enum(["正式", "合作", "试播"]);
export type EmploymentType = z.infer<typeof EmploymentType>;

export const WorkStatus = z.enum(["active", "rest", "leave"]);
export type WorkStatus = z.infer<typeof WorkStatus>;

export const UpsertAnchorInput = z.object({
  dingtalk_user_id: z.string().min(1),
  business_line: BusinessLine,
  employment_type: EmploymentType,
  work_status: WorkStatus.default("active"),
  trial_start_date: z.string().date().optional().nullable(),
  contract_date: z.string().date().optional().nullable(),
  leave_date: z.string().date().optional().nullable(),
  external_name: z.string().optional().nullable(),
});
export type UpsertAnchorInput = z.infer<typeof UpsertAnchorInput>;

export const ListAnchorsInput = z.object({
  business_line: BusinessLine.optional(),
  work_status: WorkStatus.optional(),
});
```

- [ ] **Step 2: types.ts**

```typescript
// src/modules/live-anchor/types.ts
import type { live_anchor, dingtalk_user } from "@/db/schema";

export type LiveAnchor = typeof live_anchor.$inferSelect;
export type DingtalkUser = typeof dingtalk_user.$inferSelect;

export type AnchorWithDingtalk = LiveAnchor & {
  name: string;
  mobile: string | null;
  active: boolean;
  title: string | null;
};
```

- [ ] **Step 3: queries.ts（含 dingtalk join）**

```typescript
// src/modules/live-anchor/queries.ts
import "server-only";
import { db } from "@/db/client";
import { live_anchor, dingtalk_user } from "@/db/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { AnchorWithDingtalk } from "./types";

export interface ListAnchorsParams {
  business_line?: "捕鱼" | "斗地主" | "麻将";
  work_status?: "active" | "rest" | "leave";
}

export async function listAnchors(params: ListAnchorsParams = {}): Promise<AnchorWithDingtalk[]> {
  const conditions: SQL[] = [];
  if (params.business_line) {
    conditions.push(eq(live_anchor.business_line, params.business_line));
  }
  if (params.work_status) {
    conditions.push(eq(live_anchor.work_status, params.work_status));
  }

  const rows = await db
    .select({
      // anchor fields
      dingtalk_user_id: live_anchor.dingtalk_user_id,
      business_line: live_anchor.business_line,
      employment_type: live_anchor.employment_type,
      work_status: live_anchor.work_status,
      trial_start_date: live_anchor.trial_start_date,
      contract_date: live_anchor.contract_date,
      leave_date: live_anchor.leave_date,
      external_name: live_anchor.external_name,
      raw: live_anchor.raw,
      created_at: live_anchor.created_at,
      updated_at: live_anchor.updated_at,
      // dingtalk fields
      name: dingtalk_user.name,
      mobile: dingtalk_user.mobile,
      active: dingtalk_user.active,
      title: dingtalk_user.title,
    })
    .from(live_anchor)
    .innerJoin(dingtalk_user, eq(live_anchor.dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(dingtalk_user.name);

  return rows;
}

export async function getAnchorById(dingtalk_user_id: string): Promise<AnchorWithDingtalk | null> {
  const rows = await listAnchors();
  return rows.find((r) => r.dingtalk_user_id === dingtalk_user_id) ?? null;
}
```

- [ ] **Step 4: server.ts**

```typescript
// src/modules/live-anchor/server.ts
import "server-only";
export { listAnchors, getAnchorById, type ListAnchorsParams } from "./queries";
```

- [ ] **Step 5: index.ts**

```typescript
// src/modules/live-anchor/index.ts
export type { LiveAnchor, AnchorWithDingtalk } from "./types";
export {
  BusinessLine,
  EmploymentType,
  WorkStatus,
  UpsertAnchorInput,
  ListAnchorsInput,
} from "./schema";
export { upsertAnchor, deleteAnchor } from "./actions";
```

- [ ] **Step 6: README.md**

```markdown
# live-anchor 模块

主播业务扩展（钉钉用户的"主播角色"扩展）。

- 表的存在 = "是该用户是主播"的标记
- 钉钉同步覆盖 dingtalk_user 时**不会**动 live_anchor（业务字段隔离）
- 通过 account_anchor_default 关联多个 live_account（N:M）

## 入口
- `index.ts` — Server Actions + Zod schema + types
- `server.ts` — DB queries
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/live-anchor/
git commit -m "feat(live-anchor): scaffold module with queries (joins dingtalk_user)"
```

---

## Task 10: live-anchor actions

**Files:**
- Create: `src/modules/live-anchor/actions.ts`

- [ ] **Step 1: 写 actions**

```typescript
// src/modules/live-anchor/actions.ts
"use server";
import { db } from "@/db/client";
import { live_anchor } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { UpsertAnchorInput } from "./schema";

export async function upsertAnchor(input: unknown) {
  const data = UpsertAnchorInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db
    .select()
    .from(live_anchor)
    .where(eq(live_anchor.dingtalk_user_id, data.dingtalk_user_id));

  const values = {
    dingtalk_user_id: data.dingtalk_user_id,
    business_line: data.business_line,
    employment_type: data.employment_type,
    work_status: data.work_status,
    trial_start_date: data.trial_start_date ?? null,
    contract_date: data.contract_date ?? null,
    leave_date: data.leave_date ?? null,
    external_name: data.external_name ?? null,
    updated_at: new Date(),
  };

  const [upserted] = await db
    .insert(live_anchor)
    .values(values)
    .onConflictDoUpdate({
      target: live_anchor.dingtalk_user_id,
      set: {
        business_line: values.business_line,
        employment_type: values.employment_type,
        work_status: values.work_status,
        trial_start_date: values.trial_start_date,
        contract_date: values.contract_date,
        leave_date: values.leave_date,
        external_name: values.external_name,
        updated_at: values.updated_at,
      },
    })
    .returning();

  await writeAuditLog({
    user_id: userId,
    action: before ? "LIVE_ANCHOR_UPDATED" : "LIVE_ANCHOR_CREATED",
    target_type: "live_anchor",
    target_id: data.dingtalk_user_id,
    before: before ?? null,
    after: upserted,
  });

  return upserted;
}

export async function deleteAnchor(input: unknown) {
  const { dingtalk_user_id } = UpsertAnchorInput.pick({ dingtalk_user_id: true }).parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db
    .select()
    .from(live_anchor)
    .where(eq(live_anchor.dingtalk_user_id, dingtalk_user_id));
  if (!before) throw new AppError("LIVE_ANCHOR_NOT_FOUND", "主播档案不存在", 404);

  await db.delete(live_anchor).where(eq(live_anchor.dingtalk_user_id, dingtalk_user_id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ANCHOR_DELETED",
    target_type: "live_anchor",
    target_id: dingtalk_user_id,
    before,
  });

  return { ok: true } as const;
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/live-anchor/actions.ts
git commit -m "feat(live-anchor): add upsert/delete server actions"
```

---

## Task 11: time-slots 跨日时段命中算法 + 单测

**Files:**
- Create: `src/modules/live-account/time-slots.ts`
- Create: `tests/modules/live-account/time-slots.test.ts`

- [ ] **Step 1: 先写测试（TDD）**

```typescript
// tests/modules/live-account/time-slots.test.ts
import { describe, it, expect } from "vitest";
import { hourMatchesTimeSlots, isRestDay } from "@/modules/live-account/time-slots";

describe("hourMatchesTimeSlots", () => {
  it("匹配普通时段 12:00-18:00", () => {
    const slots: Array<[string, string]> = [["12:00", "18:00"]];
    expect(hourMatchesTimeSlots(slots, 12)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 17)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 18)).toBe(false); // end exclusive
    expect(hourMatchesTimeSlots(slots, 11)).toBe(false);
  });

  it("匹配跨日时段 22:00-03:00", () => {
    const slots: Array<[string, string]> = [["22:00", "03:00"]];
    expect(hourMatchesTimeSlots(slots, 22)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 23)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 0)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 2)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 3)).toBe(false);
    expect(hourMatchesTimeSlots(slots, 21)).toBe(false);
    expect(hourMatchesTimeSlots(slots, 5)).toBe(false);
  });

  it("匹配多段时段", () => {
    const slots: Array<[string, string]> = [
      ["09:00", "12:00"],
      ["14:00", "18:00"],
    ];
    expect(hourMatchesTimeSlots(slots, 10)).toBe(true);
    expect(hourMatchesTimeSlots(slots, 13)).toBe(false); // gap
    expect(hourMatchesTimeSlots(slots, 15)).toBe(true);
  });

  it("空时段不匹配任何小时", () => {
    expect(hourMatchesTimeSlots([], 12)).toBe(false);
  });
});

describe("isRestDay", () => {
  it("ISO weekday: 1=周一 ... 7=周日", () => {
    expect(isRestDay([1], new Date("2026-05-04"))).toBe(true); // 2026-05-04 是周一
    expect(isRestDay([1], new Date("2026-05-05"))).toBe(false); // 周二
    expect(isRestDay([7], new Date("2026-05-10"))).toBe(true); // 周日
  });

  it("rest_days 数组多日", () => {
    expect(isRestDay([1, 3], new Date("2026-05-06"))).toBe(true); // 周三
    expect(isRestDay([1, 3], new Date("2026-05-04"))).toBe(true); // 周一
    expect(isRestDay([1, 3], new Date("2026-05-05"))).toBe(false); // 周二
  });

  it("空 rest_days 总是 false", () => {
    expect(isRestDay([], new Date("2026-05-04"))).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `pnpm test tests/modules/live-account/time-slots.test.ts`
Expected: FAIL（模块文件不存在）

- [ ] **Step 3: 写实现**

```typescript
// src/modules/live-account/time-slots.ts
/**
 * 排班时段命中工具。
 * - time_slots 格式：[["12:00","18:00"], ...]，end 取开区间
 * - 跨日时段（end < start，如 22:00-03:00）按"或"逻辑命中
 * - rest_days 用 ISO weekday：1=周一 ... 7=周日
 */

function parseHour(timeStr: string): number {
  const [h] = timeStr.split(":").map(Number);
  return h;
}

export function hourMatchesTimeSlots(slots: Array<[string, string]>, hour: number): boolean {
  for (const [startStr, endStr] of slots) {
    const start = parseHour(startStr);
    const end = parseHour(endStr);
    if (end > start) {
      // 普通时段：[start, end)
      if (hour >= start && hour < end) return true;
    } else if (end < start) {
      // 跨日时段：22:00-03:00 → hour >= 22 OR hour < 3
      if (hour >= start || hour < end) return true;
    } else {
      // start === end，无意义，跳过
      continue;
    }
  }
  return false;
}

export function isRestDay(rest_days: number[], date: Date): boolean {
  // JS 的 getDay 是 0=周日 ... 6=周六
  // ISO weekday 是 1=周一 ... 7=周日
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return rest_days.includes(isoDay);
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `pnpm test tests/modules/live-account/time-slots.test.ts`
Expected: PASS（8 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/modules/live-account/time-slots.ts tests/modules/live-account/time-slots.test.ts
git commit -m "feat(live-account): add time-slots matching utils with cross-day support"
```

---

## Task 12: name-matcher fuzzy 匹配算法 + 单测

**Files:**
- Create: `src/modules/live-account/name-matcher.ts`
- Create: `tests/modules/live-account/name-matcher.test.ts`

- [ ] **Step 1: 先写测试**

```typescript
// tests/modules/live-account/name-matcher.test.ts
import { describe, it, expect } from "vitest";
import { matchName, type DingtalkCandidate } from "@/modules/live-account/name-matcher";

const candidates: DingtalkCandidate[] = [
  { user_id: "u_001", name: "邓明星", mobile: "13800000001" },
  { user_id: "u_002", name: "刘森", mobile: "13800000002" },
  { user_id: "u_003", name: "刘森林", mobile: "13800000003" },
  { user_id: "u_004", name: "李四", mobile: "13800000004" },
];

describe("matchName", () => {
  it("完全匹配 → exact", () => {
    const r = matchName("邓明星", candidates);
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.match.user_id).toBe("u_001");
  });

  it("去空格后完全匹配 → exact", () => {
    const r = matchName("  邓明星  ", candidates);
    expect(r.kind).toBe("exact");
  });

  it("包含匹配 → ambiguous", () => {
    const r = matchName("刘森", candidates);
    // "刘森" 完全匹配 u_002，但同时是 "刘森林" 子串 — exact 优先
    expect(r.kind).toBe("exact");
    if (r.kind === "exact") expect(r.match.user_id).toBe("u_002");
  });

  it("仅子串关系 → ambiguous", () => {
    const r = matchName("刘森林夫", candidates);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.candidates.map((c) => c.user_id);
      expect(ids).toContain("u_003"); // "刘森林" 是 "刘森林夫" 子串
    }
  });

  it("拼音首字母匹配 → ambiguous", () => {
    const r = matchName("LSL", candidates); // 刘森林 → LSL
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") {
      const ids = r.candidates.map((c) => c.user_id);
      expect(ids).toContain("u_003");
    }
  });

  it("无匹配 → none", () => {
    const r = matchName("张无忌", candidates);
    expect(r.kind).toBe("none");
  });

  it("空字符串 → none", () => {
    const r = matchName("", candidates);
    expect(r.kind).toBe("none");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test tests/modules/live-account/name-matcher.test.ts`
Expected: FAIL

- [ ] **Step 3: 写实现**

```typescript
// src/modules/live-account/name-matcher.ts
import pinyin from "pinyin";

export interface DingtalkCandidate {
  user_id: string;
  name: string;
  mobile: string | null;
}

export type MatchResult =
  | { kind: "exact"; match: DingtalkCandidate }
  | { kind: "ambiguous"; candidates: DingtalkCandidate[] }
  | { kind: "none" };

function getInitials(name: string): string {
  return pinyin(name, { style: pinyin.STYLE_FIRST_LETTER, heteronym: false })
    .map((arr) => arr[0]?.toUpperCase() ?? "")
    .join("");
}

export function matchName(input: string, candidates: DingtalkCandidate[]): MatchResult {
  const trimmed = input.trim();
  if (!trimmed) return { kind: "none" };

  // 1. 完全匹配
  const exact = candidates.find((c) => c.name.trim() === trimmed);
  if (exact) return { kind: "exact", match: exact };

  // 2. 包含匹配（双向）
  const containsMatches = candidates.filter(
    (c) => c.name.includes(trimmed) || trimmed.includes(c.name),
  );

  // 3. 拼音首字母匹配
  const upperInput = trimmed.toUpperCase();
  const pinyinMatches = candidates.filter((c) => {
    const initials = getInitials(c.name);
    return initials === upperInput;
  });

  // 合并 ambiguous 候选去重
  const candMap = new Map<string, DingtalkCandidate>();
  for (const c of [...containsMatches, ...pinyinMatches]) {
    candMap.set(c.user_id, c);
  }
  const merged = [...candMap.values()];

  if (merged.length === 0) return { kind: "none" };
  return { kind: "ambiguous", candidates: merged };
}
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test tests/modules/live-account/name-matcher.test.ts`
Expected: PASS（7 tests pass）

- [ ] **Step 5: Commit**

```bash
git add src/modules/live-account/name-matcher.ts tests/modules/live-account/name-matcher.test.ts
git commit -m "feat(live-account): add name fuzzy matcher (exact/contains/pinyin)"
```

---

## Task 13: live-account 模块脚手架（schema + types + queries）

**Files:**
- Create: `src/modules/live-account/schema.ts`
- Create: `src/modules/live-account/types.ts`
- Create: `src/modules/live-account/queries.ts`
- Create: `src/modules/live-account/server.ts`
- Create: `src/modules/live-account/index.ts`
- Create: `src/modules/live-account/README.md`

- [ ] **Step 1: schema.ts（含 platform/product 联动校验）**

```typescript
// src/modules/live-account/schema.ts
import { z } from "zod";

export const Platform = z.enum(["抖音", "快手", "B站", "视频号"]);
export type Platform = z.infer<typeof Platform>;

export const Product = z.enum([
  "捕鱼大作战",
  "三国冰河时代",
  "途游斗地主",
  "富豪麻将",
  "途游休闲捕鱼",
  "电玩捕鱼",
]);
export type Product = z.infer<typeof Product>;

export const LiveStatus = z.enum(["living", "offline", "banned", "unknown"]);
export type LiveStatus = z.infer<typeof LiveStatus>;

// platform-product 联动表（spec §5.2）
const PRODUCT_PLATFORMS: Record<z.infer<typeof Product>, Array<z.infer<typeof Platform>>> = {
  途游斗地主: ["抖音"],
  富豪麻将: ["抖音"],
  三国冰河时代: ["抖音"],
  捕鱼大作战: ["快手"],
  途游休闲捕鱼: ["快手"],
  电玩捕鱼: ["快手"],
};

export const UpsertAccountInput = z
  .object({
    id: z.string().optional(),
    account_name: z.string().min(1),
    platform: Platform,
    platform_account_id: z.string().optional().nullable(),
    platform_uid: z.string().optional().nullable(),
    platform_real_name: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    phone_index: z.string().optional().nullable(),
    phone_real_name: z.string().optional().nullable(),
    room_id: z.string().optional().nullable(),
    game_account_1: z.string().optional().nullable(),
    game_account_2: z.string().optional().nullable(),
    game_account_3: z.string().optional().nullable(),
    product: Product,
    agent_dingtalk_user_id: z.string().optional().nullable(),
    placement_label: z.string().optional().nullable(),
    live_status: LiveStatus.default("unknown"),
  })
  .refine((d) => PRODUCT_PLATFORMS[d.product].includes(d.platform), {
    message: "产品与平台不匹配（如 '捕鱼大作战' 仅支持快手）",
    path: ["product"],
  });
export type UpsertAccountInput = z.infer<typeof UpsertAccountInput>;

export const DeleteAccountInput = z.object({
  id: z.string().min(1),
});

export const ListAccountsInput = z.object({
  platform: Platform.optional(),
  product: Product.optional(),
});
```

- [ ] **Step 2: types.ts**

```typescript
// src/modules/live-account/types.ts
import type { live_account, live_room, dingtalk_user } from "@/db/schema";

export type LiveAccount = typeof live_account.$inferSelect;
export type LiveRoomLite = typeof live_room.$inferSelect;
export type DingtalkUserLite = typeof dingtalk_user.$inferSelect;

export type AccountWithRelations = LiveAccount & {
  room_no: string | null;
  agent_name: string | null;
};
```

- [ ] **Step 3: queries.ts**

```typescript
// src/modules/live-account/queries.ts
import "server-only";
import { db } from "@/db/client";
import { live_account, live_room, dingtalk_user } from "@/db/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { AccountWithRelations } from "./types";

export interface ListAccountsParams {
  platform?: "抖音" | "快手" | "B站" | "视频号";
  product?: string;
}

export async function listAccounts(
  params: ListAccountsParams = {},
): Promise<AccountWithRelations[]> {
  const conditions: SQL[] = [];
  if (params.platform) conditions.push(eq(live_account.platform, params.platform));
  if (params.product) conditions.push(eq(live_account.product, params.product));

  const rows = await db
    .select({
      id: live_account.id,
      account_name: live_account.account_name,
      platform: live_account.platform,
      platform_account_id: live_account.platform_account_id,
      platform_uid: live_account.platform_uid,
      platform_real_name: live_account.platform_real_name,
      phone: live_account.phone,
      phone_index: live_account.phone_index,
      phone_real_name: live_account.phone_real_name,
      room_id: live_account.room_id,
      game_account_1: live_account.game_account_1,
      game_account_2: live_account.game_account_2,
      game_account_3: live_account.game_account_3,
      product: live_account.product,
      agent_dingtalk_user_id: live_account.agent_dingtalk_user_id,
      placement_label: live_account.placement_label,
      live_status: live_account.live_status,
      raw: live_account.raw,
      created_at: live_account.created_at,
      updated_at: live_account.updated_at,
      room_no: live_room.room_no,
      agent_name: dingtalk_user.name,
    })
    .from(live_account)
    .leftJoin(live_room, eq(live_account.room_id, live_room.id))
    .leftJoin(dingtalk_user, eq(live_account.agent_dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(live_account.product, live_account.account_name);

  return rows;
}

export async function getAccountById(id: string): Promise<AccountWithRelations | null> {
  const all = await listAccounts();
  return all.find((a) => a.id === id) ?? null;
}
```

- [ ] **Step 4: server.ts**

```typescript
// src/modules/live-account/server.ts
import "server-only";
export { listAccounts, getAccountById, type ListAccountsParams } from "./queries";
```

- [ ] **Step 5: index.ts**

```typescript
// src/modules/live-account/index.ts
export type { LiveAccount, AccountWithRelations } from "./types";
export {
  Platform,
  Product,
  LiveStatus,
  UpsertAccountInput,
  DeleteAccountInput,
  ListAccountsInput,
} from "./schema";
export { upsertAccount, deleteAccount } from "./actions";
export { hourMatchesTimeSlots, isRestDay } from "./time-slots";
export { matchName, type MatchResult, type DingtalkCandidate } from "./name-matcher";
```

- [ ] **Step 6: README.md**

```markdown
# live-account 模块

跨平台直播账号档案。

- 第一公民：账号 = 账号；主播通过 account_anchor_default 关联
- 平台 ↔ 产品强校验（spec §5.2）
- 与 anchor_profile 通过 platform_account_id ↔ aweme_display_id 反向 join（不强制 FK）
- placement_label 1:1（投放归因，Phase 2.2 用）

## 子模块
- `name-matcher.ts` — 姓名 fuzzy 匹配（迁移用）
- `time-slots.ts` — 时段命中算法（排班归因用）
- `migration.ts` — PRO3 → qjhy-pro 迁移逻辑
```

- [ ] **Step 7: Commit**

```bash
git add src/modules/live-account/{schema,types,queries,server,index,README}.* 
git commit -m "feat(live-account): scaffold module with platform-product validation"
```

---

## Task 14: live-account actions

**Files:**
- Create: `src/modules/live-account/actions.ts`

- [ ] **Step 1: 写 actions**

```typescript
// src/modules/live-account/actions.ts
"use server";
import { db } from "@/db/client";
import { live_account } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq } from "drizzle-orm";
import { UpsertAccountInput, DeleteAccountInput } from "./schema";

export async function upsertAccount(input: unknown) {
  const data = UpsertAccountInput.parse(input);
  const { userId } = await requireAdmin();

  const id = data.id ?? crypto.randomUUID();
  const isUpdate = Boolean(data.id);

  let before = null as Awaited<ReturnType<typeof db.select>>[number] | null;
  if (isUpdate) {
    const rows = await db.select().from(live_account).where(eq(live_account.id, id));
    before = rows[0] ?? null;
    if (!before) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);
  }

  const values = {
    id,
    account_name: data.account_name,
    platform: data.platform,
    platform_account_id: data.platform_account_id ?? null,
    platform_uid: data.platform_uid ?? null,
    platform_real_name: data.platform_real_name ?? null,
    phone: data.phone ?? null,
    phone_index: data.phone_index ?? null,
    phone_real_name: data.phone_real_name ?? null,
    room_id: data.room_id ?? null,
    game_account_1: data.game_account_1 ?? null,
    game_account_2: data.game_account_2 ?? null,
    game_account_3: data.game_account_3 ?? null,
    product: data.product,
    agent_dingtalk_user_id: data.agent_dingtalk_user_id ?? null,
    placement_label: data.placement_label ?? null,
    live_status: data.live_status,
    updated_at: new Date(),
  };

  let result;
  if (isUpdate) {
    [result] = await db.update(live_account).set(values).where(eq(live_account.id, id)).returning();
  } else {
    [result] = await db.insert(live_account).values(values).returning();
  }

  await writeAuditLog({
    user_id: userId,
    action: isUpdate ? "LIVE_ACCOUNT_UPDATED" : "LIVE_ACCOUNT_CREATED",
    target_type: "live_account",
    target_id: id,
    before,
    after: result,
  });

  return result;
}

export async function deleteAccount(input: unknown) {
  const { id } = DeleteAccountInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db.select().from(live_account).where(eq(live_account.id, id));
  if (!before) throw new AppError("LIVE_ACCOUNT_NOT_FOUND", "直播账号不存在", 404);

  await db.delete(live_account).where(eq(live_account.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "LIVE_ACCOUNT_DELETED",
    target_type: "live_account",
    target_id: id,
    before,
  });

  return { ok: true } as const;
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/modules/live-account/actions.ts
git commit -m "feat(live-account): add upsert/delete server actions with audit"
```

---

## Task 15: account-bindings（默认排班 CRUD）

**Files:**
- Create: `src/modules/live-anchor/account-bindings.ts`
- Modify: `src/modules/live-anchor/index.ts`

- [ ] **Step 1: 写 schema 输入**

修改 `src/modules/live-anchor/schema.ts`，文件末尾追加：

```typescript
// 默认排班 binding
export const TimeSlot = z.tuple([
  z.string().regex(/^\d{2}:\d{2}$/, "时段格式必须为 HH:MM"),
  z.string().regex(/^\d{2}:\d{2}$/),
]);

export const UpsertBindingInput = z.object({
  id: z.string().optional(),
  account_id: z.string().min(1),
  dingtalk_user_id: z.string().min(1),
  time_slots: z.array(TimeSlot).min(1, "至少一个时段"),
  rest_days: z.array(z.number().int().min(1).max(7)).default([]),
  remark: z.string().optional().nullable(),
  effective_from: z.string().date().optional(),
  effective_to: z.string().date().optional().nullable(),
});
export type UpsertBindingInput = z.infer<typeof UpsertBindingInput>;

export const DeleteBindingInput = z.object({
  id: z.string().min(1),
});

export const ListBindingsInput = z.object({
  account_id: z.string().optional(),
  dingtalk_user_id: z.string().optional(),
});
```

- [ ] **Step 2: 写 account-bindings.ts**

```typescript
// src/modules/live-anchor/account-bindings.ts
"use server";
import { db } from "@/db/client";
import { account_anchor_default, live_account, dingtalk_user } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { requireAdmin } from "@/lib/admin-guard";
import { AppError } from "@/lib/errors";
import { eq, and, isNull, or, sql } from "drizzle-orm";
import {
  UpsertBindingInput,
  DeleteBindingInput,
  ListBindingsInput,
} from "./schema";

export async function listBindings(input: unknown) {
  const data = ListBindingsInput.parse(input);
  const conditions = [];
  if (data.account_id) conditions.push(eq(account_anchor_default.account_id, data.account_id));
  if (data.dingtalk_user_id) {
    conditions.push(eq(account_anchor_default.dingtalk_user_id, data.dingtalk_user_id));
  }

  const rows = await db
    .select({
      id: account_anchor_default.id,
      account_id: account_anchor_default.account_id,
      account_name: live_account.account_name,
      platform: live_account.platform,
      dingtalk_user_id: account_anchor_default.dingtalk_user_id,
      anchor_name: dingtalk_user.name,
      time_slots: account_anchor_default.time_slots,
      rest_days: account_anchor_default.rest_days,
      remark: account_anchor_default.remark,
      effective_from: account_anchor_default.effective_from,
      effective_to: account_anchor_default.effective_to,
    })
    .from(account_anchor_default)
    .leftJoin(live_account, eq(account_anchor_default.account_id, live_account.id))
    .leftJoin(dingtalk_user, eq(account_anchor_default.dingtalk_user_id, dingtalk_user.user_id))
    .where(conditions.length > 0 ? and(...conditions) : sql`true`)
    .orderBy(account_anchor_default.effective_from);

  return rows;
}

export async function upsertBinding(input: unknown) {
  const data = UpsertBindingInput.parse(input);
  const { userId } = await requireAdmin();

  const id = data.id ?? crypto.randomUUID();
  const isUpdate = Boolean(data.id);

  const [beforeRow] = isUpdate
    ? await db.select().from(account_anchor_default).where(eq(account_anchor_default.id, id))
    : [null];
  if (isUpdate && !beforeRow) {
    throw new AppError("BINDING_NOT_FOUND", "排班绑定不存在", 404);
  }

  const values = {
    id,
    account_id: data.account_id,
    dingtalk_user_id: data.dingtalk_user_id,
    time_slots: data.time_slots,
    rest_days: data.rest_days,
    remark: data.remark ?? null,
    ...(data.effective_from ? { effective_from: data.effective_from } : {}),
    effective_to: data.effective_to ?? null,
    updated_at: new Date(),
  };

  let result;
  if (isUpdate) {
    [result] = await db
      .update(account_anchor_default)
      .set(values)
      .where(eq(account_anchor_default.id, id))
      .returning();
  } else {
    [result] = await db.insert(account_anchor_default).values(values).returning();
  }

  await writeAuditLog({
    user_id: userId,
    action: isUpdate ? "BINDING_UPDATED" : "BINDING_CREATED",
    target_type: "account_anchor_default",
    target_id: id,
    before: beforeRow,
    after: result,
  });

  return result;
}

export async function deleteBinding(input: unknown) {
  const { id } = DeleteBindingInput.parse(input);
  const { userId } = await requireAdmin();

  const [before] = await db
    .select()
    .from(account_anchor_default)
    .where(eq(account_anchor_default.id, id));
  if (!before) throw new AppError("BINDING_NOT_FOUND", "排班绑定不存在", 404);

  await db.delete(account_anchor_default).where(eq(account_anchor_default.id, id));

  await writeAuditLog({
    user_id: userId,
    action: "BINDING_DELETED",
    target_type: "account_anchor_default",
    target_id: id,
    before,
  });

  return { ok: true } as const;
}

/**
 * 获取某账号当日有效的所有 bindings（用于排班矩阵 + 后续归因）。
 */
export async function getActiveBindingsForAccount(account_id: string, date: string) {
  return db
    .select()
    .from(account_anchor_default)
    .where(
      and(
        eq(account_anchor_default.account_id, account_id),
        sql`${account_anchor_default.effective_from} <= ${date}::date`,
        or(
          isNull(account_anchor_default.effective_to),
          sql`${account_anchor_default.effective_to} >= ${date}::date`,
        ),
      ),
    );
}
```

- [ ] **Step 3: 加到 index.ts export**

```typescript
// src/modules/live-anchor/index.ts (追加)
export {
  TimeSlot,
  UpsertBindingInput,
  DeleteBindingInput,
  ListBindingsInput,
} from "./schema";
export {
  listBindings,
  upsertBinding,
  deleteBinding,
  getActiveBindingsForAccount,
} from "./account-bindings";
```

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/live-anchor/account-bindings.ts src/modules/live-anchor/schema.ts src/modules/live-anchor/index.ts
git commit -m "feat(live-anchor): add account_anchor_default CRUD with effective_from/to"
```

---

## Task 16: PRO3 SQLite 解析器 + 字段映射

**Files:**
- Create: `src/modules/live-account/migration.ts`

- [ ] **Step 1: 写 migration.ts 主体**

```typescript
// src/modules/live-account/migration.ts
import "server-only";
import Database from "better-sqlite3";
import { db } from "@/db/client";
import {
  live_account,
  live_room,
  live_anchor,
  account_anchor_default,
  dingtalk_user,
  business_data as _ignore, // (we don't have business_data in qjhy-pro; this just makes import linter happy if needed)
} from "@/db/schema";
import { matchName, type DingtalkCandidate, type MatchResult } from "./name-matcher";

// PRO3 一行原始 JSON 的形状
export interface Pro3AccountRow {
  id?: string;
  accountName: string;
  platform?: string; // '抖音' | '快手' | ...
  status?: string;
  anchorName?: string;
  agent?: string;
  product?: string;
  platformAccountId?: string;
  uid?: string;
  platformRealName?: string;
  phone?: string;
  phoneIndex?: string;
  phoneRealName?: string;
  room?: string;
  gameAccount1?: string;
  gameAccount2?: string;
  gameAccount3?: string;
  schedule1?: string;
  schedule2?: string;
  schedule3?: string;
  restDay?: string;
  multiAnchor?: boolean;
  anchorList?: Array<{
    name: string;
    schedules?: string[];
    schedule?: string;
    restDay?: string;
    remark?: string;
  }>;
}

export interface Pro3StreamAccount {
  name: string;
  dataset_anchor_name: string | null;
}

export interface MigrationReport {
  totalRows: number;
  platformCounts: Record<string, number>;
  productCounts: Record<string, number>;
  rooms: { created: number; ids: string[] };
  accounts: { created: number; ids: string[] };
  anchors: {
    matched: Array<{ pro3_name: string; dingtalk_user_id: string }>;
    pending: Array<{ pro3_name: string; candidates: DingtalkCandidate[] }>;
    unmatched: string[];
  };
  bindings: { created: number };
  errors: Array<{ row: Pro3AccountRow; reason: string }>;
}

export interface MigrationOptions {
  pro3SqlitePath: string;
  dryRun: boolean;
}

/**
 * 解析"12:00-18:00" → ["12:00","18:00"]
 */
export function parseScheduleString(s: string | undefined): [string, string] | null {
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return [
    `${m[1].padStart(2, "0")}:${m[2]}`,
    `${m[3].padStart(2, "0")}:${m[4]}`,
  ];
}

/**
 * "1" / "周一" → 1; "" / "0" / "无" → null
 */
export function parseRestDay(s: string | undefined): number | null {
  if (!s) return null;
  const num = Number(s);
  if (Number.isInteger(num) && num >= 1 && num <= 7) return num;
  const map: Record<string, number> = {
    周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 7,
  };
  return map[s.trim()] ?? null;
}

/**
 * 读 PRO3 SQLite 中 business_data WHERE type='accounts' 的所有行
 */
export function readPro3Accounts(sqlitePath: string): Pro3AccountRow[] {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const rows = sqlite
      .prepare("SELECT content FROM business_data WHERE type = 'accounts'")
      .all() as Array<{ content: string }>;
    return rows.map((r) => JSON.parse(r.content) as Pro3AccountRow);
  } finally {
    sqlite.close();
  }
}

/**
 * 读 stream_accounts 表（投放标签映射）
 */
export function readPro3StreamAccounts(sqlitePath: string): Pro3StreamAccount[] {
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    return sqlite
      .prepare("SELECT name, dataset_anchor_name FROM stream_accounts")
      .all() as Pro3StreamAccount[];
  } finally {
    sqlite.close();
  }
}
```

- [ ] **Step 2: typecheck（migration.ts 还会报错没用到的 import，先忽略，下一个 task 补）**

Run: `pnpm typecheck`
Expected: 可能有 unused import 警告（migration 函数还没写完），先 commit

- [ ] **Step 3: Commit**

```bash
git add src/modules/live-account/migration.ts
git commit -m "feat(live-account): scaffold PRO3 migration parser + report types"
```

---

## Task 17: 迁移逻辑实现 — rooms / accounts / anchors / bindings

**Files:**
- Modify: `src/modules/live-account/migration.ts`

- [ ] **Step 1: 加 runMigration 主函数**

在 `src/modules/live-account/migration.ts` 末尾追加：

```typescript
/**
 * 主迁移函数。事务包裹，dryRun 模式仅算 report 不写库。
 */
export async function runMigration(opts: MigrationOptions): Promise<MigrationReport> {
  const rows = readPro3Accounts(opts.pro3SqlitePath);
  const streamAccounts = readPro3StreamAccounts(opts.pro3SqlitePath);
  const placementMap = new Map(streamAccounts.map((s) => [s.name, s.dataset_anchor_name]));

  const candidates: DingtalkCandidate[] = (await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name, mobile: dingtalk_user.mobile })
    .from(dingtalk_user)) as DingtalkCandidate[];

  const report: MigrationReport = {
    totalRows: rows.length,
    platformCounts: {},
    productCounts: {},
    rooms: { created: 0, ids: [] },
    accounts: { created: 0, ids: [] },
    anchors: { matched: [], pending: [], unmatched: [] },
    bindings: { created: 0 },
    errors: [],
  };

  const roomMap = new Map<string, string>(); // room_no -> live_room.id
  const matchedAnchors = new Map<string, string>(); // pro3_name -> dingtalk_user_id

  // 第一遍：统计 + 收集所有 room_no + 主播匹配
  for (const row of rows) {
    report.platformCounts[row.platform ?? "未知"] =
      (report.platformCounts[row.platform ?? "未知"] ?? 0) + 1;
    report.productCounts[row.product ?? "未知"] =
      (report.productCounts[row.product ?? "未知"] ?? 0) + 1;

    if (row.room && !roomMap.has(row.room)) {
      roomMap.set(row.room, crypto.randomUUID());
    }

    const anchorNamesInRow: string[] = [];
    if (row.anchorName) anchorNamesInRow.push(row.anchorName);
    if (row.anchorList) {
      for (const a of row.anchorList) if (a.name) anchorNamesInRow.push(a.name);
    }
    if (row.agent) anchorNamesInRow.push(row.agent);

    for (const name of anchorNamesInRow) {
      if (matchedAnchors.has(name)) continue;
      const result = matchName(name, candidates);
      if (result.kind === "exact") {
        matchedAnchors.set(name, result.match.user_id);
        if (!report.anchors.matched.find((m) => m.pro3_name === name)) {
          report.anchors.matched.push({ pro3_name: name, dingtalk_user_id: result.match.user_id });
        }
      } else if (result.kind === "ambiguous") {
        if (!report.anchors.pending.find((p) => p.pro3_name === name)) {
          report.anchors.pending.push({ pro3_name: name, candidates: result.candidates });
        }
      } else {
        if (!report.anchors.unmatched.includes(name)) {
          report.anchors.unmatched.push(name);
        }
      }
    }
  }

  if (opts.dryRun) {
    report.rooms.created = roomMap.size;
    report.rooms.ids = [...roomMap.values()];
    return report;
  }

  // 第二遍：写库（事务包裹）
  await db.transaction(async (tx) => {
    // rooms
    for (const [room_no, id] of roomMap) {
      await tx
        .insert(live_room)
        .values({ id, room_no, status: "active" })
        .onConflictDoNothing();
      report.rooms.created++;
      report.rooms.ids.push(id);
    }

    // accounts
    for (const row of rows) {
      try {
        const accId = crypto.randomUUID();
        const room_id = row.room ? (roomMap.get(row.room) ?? null) : null;
        const agent_dingtalk_user_id = row.agent ? (matchedAnchors.get(row.agent) ?? null) : null;
        const placement_label = placementMap.get(row.accountName) ?? null;

        await tx
          .insert(live_account)
          .values({
            id: accId,
            account_name: row.accountName,
            platform: row.platform ?? "抖音",
            platform_account_id: row.platformAccountId ?? null,
            platform_uid: row.uid ?? null,
            platform_real_name: row.platformRealName ?? null,
            phone: row.phone ?? null,
            phone_index: row.phoneIndex ?? null,
            phone_real_name: row.phoneRealName ?? null,
            room_id,
            game_account_1: row.gameAccount1 ?? null,
            game_account_2: row.gameAccount2 ?? null,
            game_account_3: row.gameAccount3 ?? null,
            product: row.product ?? "途游斗地主",
            agent_dingtalk_user_id,
            placement_label,
            live_status: row.status === "live" ? "living" : "unknown",
            raw: row as Record<string, unknown>,
          })
          .onConflictDoNothing();
        report.accounts.created++;
        report.accounts.ids.push(accId);

        // bindings — 个播 + 轮播
        const bindings: Array<{ name: string; slots: Array<[string, string]>; restDays: number[]; remark?: string }> =
          [];
        if (row.anchorList && row.anchorList.length > 0) {
          for (const a of row.anchorList) {
            const slots = (a.schedules ?? (a.schedule ? [a.schedule] : []))
              .map(parseScheduleString)
              .filter((s): s is [string, string] => s !== null);
            const rd = parseRestDay(a.restDay);
            bindings.push({
              name: a.name,
              slots,
              restDays: rd ? [rd] : [],
              remark: a.remark,
            });
          }
        } else if (row.anchorName) {
          const slots = [row.schedule1, row.schedule2, row.schedule3]
            .map(parseScheduleString)
            .filter((s): s is [string, string] => s !== null);
          const rd = parseRestDay(row.restDay);
          bindings.push({
            name: row.anchorName,
            slots,
            restDays: rd ? [rd] : [],
          });
        }

        for (const b of bindings) {
          if (b.slots.length === 0) continue; // 没有时段就不建 binding
          const dingId = matchedAnchors.get(b.name);
          if (!dingId) continue; // 没匹配上的主播跳过（在 report.anchors.unmatched 里）
          // 确保 live_anchor 存在（迁移时需要"自动建档"）
          await tx
            .insert(live_anchor)
            .values({
              dingtalk_user_id: dingId,
              business_line: inferBusinessLine(row.product),
              employment_type: "正式",
              work_status: "active",
            })
            .onConflictDoNothing();

          await tx
            .insert(account_anchor_default)
            .values({
              id: crypto.randomUUID(),
              account_id: accId,
              dingtalk_user_id: dingId,
              time_slots: b.slots,
              rest_days: b.restDays,
              remark: b.remark ?? null,
            })
            .onConflictDoNothing();
          report.bindings.created++;
        }
      } catch (e) {
        report.errors.push({ row, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  });

  return report;
}

function inferBusinessLine(product: string | undefined): "捕鱼" | "斗地主" | "麻将" {
  if (!product) return "斗地主";
  if (product.includes("捕鱼")) return "捕鱼";
  if (product.includes("麻将")) return "麻将";
  return "斗地主";
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: PASS（删除 Task 16 中故意保留的 unused import 占位）

- [ ] **Step 3: Commit**

```bash
git add src/modules/live-account/migration.ts
git commit -m "feat(live-account): implement PRO3 migration runner with txn rollback"
```

---

## Task 18: migration 单元测试

**Files:**
- Create: `tests/modules/live-account/migration.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// tests/modules/live-account/migration.test.ts
import { describe, it, expect } from "vitest";
import { parseScheduleString, parseRestDay } from "@/modules/live-account/migration";

describe("parseScheduleString", () => {
  it("解析 '12:00-18:00'", () => {
    expect(parseScheduleString("12:00-18:00")).toEqual(["12:00", "18:00"]);
  });

  it("解析含空格的 ' 9:00 - 18:00 '", () => {
    expect(parseScheduleString(" 9:00 - 18:00 ")).toEqual(["09:00", "18:00"]);
  });

  it("解析跨日 '22:00-03:00'", () => {
    expect(parseScheduleString("22:00-03:00")).toEqual(["22:00", "03:00"]);
  });

  it("无效格式返回 null", () => {
    expect(parseScheduleString("12:00")).toBeNull();
    expect(parseScheduleString("")).toBeNull();
    expect(parseScheduleString(undefined)).toBeNull();
  });
});

describe("parseRestDay", () => {
  it("数字字符串 '1'-'7' → 数字", () => {
    expect(parseRestDay("1")).toBe(1);
    expect(parseRestDay("7")).toBe(7);
  });

  it("中文 '周一'-'周日' → ISO weekday", () => {
    expect(parseRestDay("周一")).toBe(1);
    expect(parseRestDay("周日")).toBe(7);
  });

  it("空 / 0 / 无效 → null", () => {
    expect(parseRestDay("0")).toBeNull();
    expect(parseRestDay("")).toBeNull();
    expect(parseRestDay("无")).toBeNull();
    expect(parseRestDay(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm test tests/modules/live-account/migration.test.ts`
Expected: PASS（11 tests）

- [ ] **Step 3: Commit**

```bash
git add tests/modules/live-account/migration.test.ts
git commit -m "test(live-account): cover schedule/rest_day parsers"
```

---

## Task 19: CLI 迁移脚本

**Files:**
- Create: `src/scripts/migrate-pro3-accounts.ts`

- [ ] **Step 1: 写 CLI**

```typescript
// src/scripts/migrate-pro3-accounts.ts
import { runMigration } from "@/modules/live-account/migration";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface CliArgs {
  pro3Db: string;
  dryRun: boolean;
  outputReport: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pro3-db") args.pro3Db = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--output") args.outputReport = argv[++i];
  }
  if (!args.pro3Db) throw new Error("usage: migrate-pro3-accounts --pro3-db <path> [--dry-run] [--output <file>]");
  return {
    pro3Db: args.pro3Db,
    dryRun: args.dryRun ?? false,
    outputReport:
      args.outputReport ?? resolve(`migration-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[migrate] PRO3 SQLite: ${args.pro3Db}`);
  console.log(`[migrate] dry-run: ${args.dryRun}`);

  const report = await runMigration({ pro3SqlitePath: args.pro3Db, dryRun: args.dryRun });

  await writeFile(args.outputReport, JSON.stringify(report, null, 2));

  console.log("");
  console.log(`[migrate] 总行数 ${report.totalRows}`);
  console.log("[migrate] 平台分布", report.platformCounts);
  console.log("[migrate] 产品分布", report.productCounts);
  console.log(`[migrate] rooms 创建: ${report.rooms.created}`);
  console.log(`[migrate] accounts 创建: ${report.accounts.created}`);
  console.log(
    `[migrate] anchors 匹配: ${report.anchors.matched.length} / 待确认: ${report.anchors.pending.length} / 未匹配: ${report.anchors.unmatched.length}`,
  );
  console.log(`[migrate] bindings 创建: ${report.bindings.created}`);
  console.log(`[migrate] errors: ${report.errors.length}`);
  console.log(`[migrate] 详细报告写入: ${args.outputReport}`);

  if (args.dryRun) {
    console.log("[migrate] *** dry-run 模式：未写库 ***");
  }
}

main().catch((e) => {
  console.error("[migrate] 失败:", e);
  process.exit(1);
});
```

- [ ] **Step 2: 测试 dry-run（不写库）**

```bash
pnpm tsx --env-file=.env.local src/scripts/migrate-pro3-accounts.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --dry-run \
  --output /tmp/migration-dry-run.json
```

Expected: 控制台输出统计 + dry-run 报告 JSON 文件，**不**有数据进入数据库

- [ ] **Step 3: 检查报告 JSON 内容合理**

```bash
cat /tmp/migration-dry-run.json | head -60
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM live_account;"
```

Expected: 报告含 platformCounts/productCounts 等；live_account 表行数为 0

- [ ] **Step 4: Commit**

```bash
git add src/scripts/migrate-pro3-accounts.ts
git commit -m "feat(live-account): add CLI migrate-pro3-accounts script"
```

---

## Task 20: live-accounts 列表页（A 视角主入口）

**Files:**
- Create: `src/app/(dashboard)/live-accounts/page.tsx`
- Create: `src/app/(dashboard)/live-accounts/_components/account-table.tsx`
- Create: `src/app/(dashboard)/live-accounts/_components/platform-badge.tsx`

- [ ] **Step 1: 写 platform-badge.tsx**

```typescript
// src/app/(dashboard)/live-accounts/_components/platform-badge.tsx
import { cn } from "@/lib/utils";

const PLATFORM_STYLES: Record<string, string> = {
  抖音: "bg-pink-50 text-pink-700 border-pink-200",
  快手: "bg-orange-50 text-orange-700 border-orange-200",
  B站: "bg-cyan-50 text-cyan-700 border-cyan-200",
  视频号: "bg-green-50 text-green-700 border-green-200",
};

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border",
        PLATFORM_STYLES[platform] ?? "bg-slate-50 text-slate-700 border-slate-200",
      )}
    >
      {platform}
    </span>
  );
}
```

- [ ] **Step 2: 写 account-table.tsx**

```typescript
// src/app/(dashboard)/live-accounts/_components/account-table.tsx
"use client";
import type { AccountWithRelations } from "@/modules/live-account";
import { PlatformBadge } from "./platform-badge";
import { Button } from "@/components/ui/button";

interface Props {
  accounts: AccountWithRelations[];
  onEdit: (account: AccountWithRelations) => void;
  onDelete: (id: string) => void;
}

export function AccountTable({ accounts, onEdit, onDelete }: Props) {
  if (accounts.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">
        暂无账号，点击"新增账号"开始
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs">
          <tr>
            <th className="px-3 py-2 text-left">账号</th>
            <th className="px-3 py-2 text-left">平台</th>
            <th className="px-3 py-2 text-left">产品</th>
            <th className="px-3 py-2 text-left">绑定信息</th>
            <th className="px-3 py-2 text-left">直播间</th>
            <th className="px-3 py-2 text-left">运营</th>
            <th className="px-3 py-2 text-left">投放标签</th>
            <th className="px-3 py-2 text-left w-32">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accounts.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50/60">
              <td className="px-3 py-2">
                <div className="font-medium text-slate-800">{a.account_name}</div>
                <div className="text-xs text-slate-400 font-mono">
                  {a.platform_account_id ?? "-"} / UID: {a.platform_uid ?? "-"}
                </div>
              </td>
              <td className="px-3 py-2">
                <PlatformBadge platform={a.platform} />
              </td>
              <td className="px-3 py-2 text-slate-600">{a.product}</td>
              <td className="px-3 py-2 text-xs text-slate-500">
                <div>{a.phone ?? "-"}</div>
                <div className="font-mono text-amber-600">{a.phone_index ?? "-"}</div>
              </td>
              <td className="px-3 py-2 text-slate-600">{a.room_no ?? "-"}</td>
              <td className="px-3 py-2 text-slate-600">{a.agent_name ?? "-"}</td>
              <td className="px-3 py-2 font-mono text-xs text-purple-600">
                {a.placement_label ?? "-"}
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(a)}>
                    编辑
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(a.id)}>
                    删除
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 写 page.tsx**

```typescript
// src/app/(dashboard)/live-accounts/page.tsx
import { listAccounts } from "@/modules/live-account/server";
import { AccountTable } from "./_components/account-table";
import { AccountListClient } from "./_components/account-list-client";

export default async function LiveAccountsPage() {
  const accounts = await listAccounts();
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">直播账号</h1>
        <div className="text-sm text-slate-500">共 {accounts.length} 个账号</div>
      </div>
      <AccountListClient initial={accounts} />
    </div>
  );
}
```

- [ ] **Step 4: 写 account-list-client.tsx 包裹 client 交互**

```typescript
// src/app/(dashboard)/live-accounts/_components/account-list-client.tsx
"use client";
import { useState, useTransition } from "react";
import type { AccountWithRelations } from "@/modules/live-account";
import { AccountTable } from "./account-table";
import { deleteAccount } from "@/modules/live-account";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function AccountListClient({ initial }: { initial: AccountWithRelations[] }) {
  const [accounts, setAccounts] = useState(initial);
  const [_pending, start] = useTransition();
  const router = useRouter();

  // 简单的产品 tab + 平台筛选
  const [productFilter, setProductFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const filtered = accounts.filter(
    (a) =>
      (productFilter === "all" || a.product === productFilter) &&
      (platformFilter === "all" || a.platform === platformFilter),
  );

  const onDelete = async (id: string) => {
    if (!confirm("确定删除此账号？")) return;
    start(async () => {
      try {
        await deleteAccount({ id });
        toast.success("已删除");
        setAccounts((prev) => prev.filter((a) => a.id !== id));
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    });
  };

  // Task 21 会接入抽屉；本 task 仅提示
  const onEdit = (_a: AccountWithRelations) => {
    toast.info("编辑抽屉将在 Task 21 接入");
  };

  return (
    <div>
      <div className="mb-3 flex gap-2 flex-wrap">
        <select
          className="border border-slate-200 rounded px-2 py-1 text-sm"
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
        >
          <option value="all">全部产品</option>
          <option value="捕鱼大作战">捕鱼大作战</option>
          <option value="三国冰河时代">三国冰河时代</option>
          <option value="途游斗地主">途游斗地主</option>
          <option value="富豪麻将">富豪麻将</option>
          <option value="途游休闲捕鱼">途游休闲捕鱼</option>
          <option value="电玩捕鱼">电玩捕鱼</option>
        </select>
        <select
          className="border border-slate-200 rounded px-2 py-1 text-sm"
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="all">全部平台</option>
          <option value="抖音">抖音</option>
          <option value="快手">快手</option>
        </select>
      </div>
      <AccountTable accounts={filtered} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}
```

- [ ] **Step 5: 启动 dev 验证页面**

Run: `pnpm dev`，浏览器打开 `http://localhost:3000/live-accounts`
Expected: 看到列表（如果迁移已跑过则有数据；否则空）+ 产品/平台筛选下拉

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/
git commit -m "feat(ui): add live-accounts list page with product/platform filter"
```

---

## Task 21: live-accounts 编辑抽屉（基本信息）

**Files:**
- Create: `src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx`
- Modify: `src/app/(dashboard)/live-accounts/_components/account-list-client.tsx`

- [ ] **Step 1: 写抽屉**

```typescript
// src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx
"use client";
import { useState, useTransition } from "react";
import type { AccountWithRelations, LiveAccount } from "@/modules/live-account";
import { upsertAccount, Platform, Product, LiveStatus } from "@/modules/live-account";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  open: boolean;
  account: AccountWithRelations | null;
  onClose: () => void;
  onSaved: (acc: LiveAccount) => void;
}

const ALL_PLATFORMS = Platform.options;
const ALL_PRODUCTS = Product.options;

const PRODUCT_PLATFORMS: Record<string, string[]> = {
  途游斗地主: ["抖音"],
  富豪麻将: ["抖音"],
  三国冰河时代: ["抖音"],
  捕鱼大作战: ["快手"],
  途游休闲捕鱼: ["快手"],
  电玩捕鱼: ["快手"],
};

export function AccountEditDrawer({ open, account, onClose, onSaved }: Props) {
  const [_pending, start] = useTransition();
  const [form, setForm] = useState(() => ({
    id: account?.id,
    account_name: account?.account_name ?? "",
    platform: account?.platform ?? "抖音",
    platform_account_id: account?.platform_account_id ?? "",
    platform_uid: account?.platform_uid ?? "",
    platform_real_name: account?.platform_real_name ?? "",
    phone: account?.phone ?? "",
    phone_index: account?.phone_index ?? "",
    phone_real_name: account?.phone_real_name ?? "",
    room_id: account?.room_id ?? "",
    game_account_1: account?.game_account_1 ?? "",
    game_account_2: account?.game_account_2 ?? "",
    game_account_3: account?.game_account_3 ?? "",
    product: account?.product ?? "途游斗地主",
    agent_dingtalk_user_id: account?.agent_dingtalk_user_id ?? "",
    placement_label: account?.placement_label ?? "",
    live_status: (account?.live_status ?? "unknown") as "living" | "offline" | "banned" | "unknown",
  }));

  if (!open) return null;

  // 产品改了 → platform 自动同步到该产品允许的第一个 platform
  const onProductChange = (next: string) => {
    const allowed = PRODUCT_PLATFORMS[next] ?? ["抖音"];
    setForm((f) => ({
      ...f,
      product: next,
      platform: allowed.includes(f.platform) ? f.platform : allowed[0],
    }));
  };

  const onSubmit = () => {
    start(async () => {
      try {
        const saved = await upsertAccount({
          ...form,
          // 空字符串 → null
          ...Object.fromEntries(
            Object.entries(form).map(([k, v]) => [k, v === "" ? null : v]),
          ),
          // 必填项不能为 null
          account_name: form.account_name,
          platform: form.platform,
          product: form.product,
          live_status: form.live_status,
        });
        toast.success(form.id ? "已更新" : "已新增");
        onSaved(saved);
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-[600px] bg-white h-full overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-4">{form.id ? "编辑账号" : "新增账号"}</h2>

        <div className="grid grid-cols-2 gap-3">
          <Field label="账号昵称" value={form.account_name} onChange={(v) => setForm({ ...form, account_name: v })} required />
          <Field label="产品" type="select" options={ALL_PRODUCTS} value={form.product} onChange={onProductChange} />
          <Field
            label="平台"
            type="select"
            options={(PRODUCT_PLATFORMS[form.product] ?? ALL_PLATFORMS) as string[]}
            value={form.platform}
            onChange={(v) => setForm({ ...form, platform: v as typeof form.platform })}
          />
          <Field label="平台账号" value={form.platform_account_id} onChange={(v) => setForm({ ...form, platform_account_id: v })} />
          <Field label="平台 UID" value={form.platform_uid} onChange={(v) => setForm({ ...form, platform_uid: v })} />
          <Field label="平台实名" value={form.platform_real_name} onChange={(v) => setForm({ ...form, platform_real_name: v })} />
          <Field label="绑定手机" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field label="手机编号 (SJ-)" value={form.phone_index} onChange={(v) => setForm({ ...form, phone_index: v })} />
          <Field label="手机卡实名" value={form.phone_real_name} onChange={(v) => setForm({ ...form, phone_real_name: v })} />
          <Field label="直播间 ID" value={form.room_id} onChange={(v) => setForm({ ...form, room_id: v })} />
          <Field label="游戏账号 1" value={form.game_account_1} onChange={(v) => setForm({ ...form, game_account_1: v })} />
          <Field label="游戏账号 2" value={form.game_account_2} onChange={(v) => setForm({ ...form, game_account_2: v })} />
          <Field label="游戏账号 3" value={form.game_account_3} onChange={(v) => setForm({ ...form, game_account_3: v })} />
          <Field label="运营 user_id" value={form.agent_dingtalk_user_id} onChange={(v) => setForm({ ...form, agent_dingtalk_user_id: v })} />
          <Field label="投放标签" value={form.placement_label} onChange={(v) => setForm({ ...form, placement_label: v })} />
          <Field
            label="直播状态"
            type="select"
            options={LiveStatus.options}
            value={form.live_status}
            onChange={(v) => setForm({ ...form, live_status: v as typeof form.live_status })}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit}>保存</Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: "text" | "select";
  options?: readonly string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      {type === "select" ? (
        <select
          className="w-full border border-slate-200 rounded px-2 py-1 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="w-full border border-slate-200 rounded px-2 py-1 text-sm"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
```

- [ ] **Step 2: 接入 list-client**

修改 `account-list-client.tsx` 中：

```typescript
// 顶部加 import
import { AccountEditDrawer } from "./account-edit-drawer";

// 在组件内加状态
const [drawerOpen, setDrawerOpen] = useState(false);
const [editing, setEditing] = useState<AccountWithRelations | null>(null);

// 替换 onEdit
const onEdit = (a: AccountWithRelations) => {
  setEditing(a);
  setDrawerOpen(true);
};

// 加新增按钮 + 抽屉渲染
// 在 return 顶部加 "新增账号" Button
// 在 return 末尾加 <AccountEditDrawer open={drawerOpen} account={editing} onClose={()=>setDrawerOpen(false)} onSaved={onSaved} />

const onSaved = (saved: LiveAccount) => {
  setAccounts((prev) => {
    const idx = prev.findIndex((p) => p.id === saved.id);
    if (idx >= 0) {
      const copy = [...prev];
      copy[idx] = { ...prev[idx], ...saved };
      return copy;
    }
    return [{ ...saved, room_no: null, agent_name: null }, ...prev];
  });
};
```

(完整修改后的 client 文件请按上述补丁应用)

- [ ] **Step 3: 启动 dev 验证 CRUD**

Run: `pnpm dev`，访问 `/live-accounts`，点"编辑"打开抽屉、改字段、保存
Expected: 数据更新；切产品时平台自动联动

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/_components/
git commit -m "feat(ui): account edit drawer with product-platform sync"
```

---

## Task 22: 轮播主播绑定子表单（抽屉第 2 个 tab）

**Files:**
- Create: `src/app/(dashboard)/live-accounts/_components/anchor-binding-form.tsx`
- Modify: `src/app/(dashboard)/live-accounts/_components/account-edit-drawer.tsx`

- [ ] **Step 1: 写 binding 表单**

```typescript
// src/app/(dashboard)/live-accounts/_components/anchor-binding-form.tsx
"use client";
import { useState, useEffect, useTransition } from "react";
import { listBindings, upsertBinding, deleteBinding } from "@/modules/live-anchor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Binding {
  id: string;
  account_id: string;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: Array<[string, string]>;
  rest_days: number[];
  remark: string | null;
}

interface Props {
  accountId: string;
}

const WEEKDAY_LABEL = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function AnchorBindingForm({ accountId }: Props) {
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [_pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    listBindings({ account_id: accountId }).then((rows) => {
      if (alive) setBindings(rows as Binding[]);
    });
    return () => {
      alive = false;
    };
  }, [accountId]);

  const addRow = () => {
    setBindings((prev) => [
      ...prev,
      {
        id: "",
        account_id: accountId,
        dingtalk_user_id: "",
        anchor_name: "",
        time_slots: [["12:00", "18:00"]],
        rest_days: [],
        remark: "",
      },
    ]);
  };

  const onSaveRow = (row: Binding) => {
    start(async () => {
      try {
        const saved = await upsertBinding({
          ...(row.id ? { id: row.id } : {}),
          account_id: row.account_id,
          dingtalk_user_id: row.dingtalk_user_id,
          time_slots: row.time_slots,
          rest_days: row.rest_days,
          remark: row.remark,
        });
        toast.success("已保存");
        setBindings((prev) =>
          prev.map((b) => (b === row ? { ...b, id: (saved as { id: string }).id } : b)),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  const onDelete = (row: Binding) => {
    if (!row.id) {
      setBindings((prev) => prev.filter((b) => b !== row));
      return;
    }
    if (!confirm("确定删除此排班？")) return;
    start(async () => {
      try {
        await deleteBinding({ id: row.id });
        setBindings((prev) => prev.filter((b) => b.id !== row.id));
        toast.success("已删除");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "删除失败");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        默认排班 — 每行 1 个主播 × 该主播在此账号上的固定时段。捕鱼业务可加 N 行轮播；斗地主 1 行即可。
      </div>
      {bindings.map((b, idx) => (
        <div key={idx} className="border border-slate-200 rounded p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              <span className="text-xs text-slate-500">钉钉用户 ID</span>
              <input
                className="w-full border border-slate-200 rounded px-2 py-1"
                value={b.dingtalk_user_id}
                onChange={(e) => {
                  const v = e.target.value;
                  setBindings((prev) => prev.map((x) => (x === b ? { ...x, dingtalk_user_id: v } : x)));
                }}
              />
            </label>
            <label>
              <span className="text-xs text-slate-500">备注</span>
              <input
                className="w-full border border-slate-200 rounded px-2 py-1"
                value={b.remark ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setBindings((prev) => prev.map((x) => (x === b ? { ...x, remark: v } : x)));
                }}
              />
            </label>
          </div>
          <div>
            <span className="text-xs text-slate-500">时段（HH:MM-HH:MM，跨日支持，每行一个）</span>
            <textarea
              className="w-full border border-slate-200 rounded px-2 py-1 text-sm font-mono"
              rows={2}
              value={b.time_slots.map((s) => `${s[0]}-${s[1]}`).join("\n")}
              onChange={(e) => {
                const lines = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                const slots = lines
                  .map((l): [string, string] | null => {
                    const m = l.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
                    return m ? [m[1], m[2]] : null;
                  })
                  .filter((s): s is [string, string] => s !== null);
                setBindings((prev) => prev.map((x) => (x === b ? { ...x, time_slots: slots } : x)));
              }}
            />
          </div>
          <div className="text-xs">
            <span className="text-slate-500 mr-2">休息日：</span>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <label key={d} className="inline-flex items-center mr-2">
                <input
                  type="checkbox"
                  checked={b.rest_days.includes(d)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...b.rest_days, d]
                      : b.rest_days.filter((x) => x !== d);
                    setBindings((prev) => prev.map((x) => (x === b ? { ...x, rest_days: next } : x)));
                  }}
                />
                <span className="ml-1">{WEEKDAY_LABEL[d]}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => onDelete(b)}>删除</Button>
            <Button size="sm" onClick={() => onSaveRow(b)}>保存此行</Button>
          </div>
        </div>
      ))}
      <Button variant="outline" onClick={addRow}>+ 添加主播</Button>
    </div>
  );
}
```

- [ ] **Step 2: 抽屉加 tab 切换**

修改 `account-edit-drawer.tsx`：在抽屉顶部加 tab 切换，第 1 个 tab 是基本信息（已有），第 2 个 tab 是 `<AnchorBindingForm accountId={form.id!} />`（仅当 form.id 存在时显示，新建账号必须先保存基本信息）。

- [ ] **Step 3: 启动 dev 验证轮播绑定**

Run: `pnpm dev`，访问账号编辑抽屉的轮播 tab，加 1-4 个主播
Expected: 时段 / 休息日正确保存到 account_anchor_default 表

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/_components/anchor-binding-form.tsx
git add src/app/\(dashboard\)/live-accounts/_components/account-edit-drawer.tsx
git commit -m "feat(ui): account edit drawer adds anchor binding tab (multi-anchor)"
```

---

## Task 23: live-anchors 列表 + 编辑抽屉（B 视角辅助）

**Files:**
- Create: `src/app/(dashboard)/live-anchors/page.tsx`
- Create: `src/app/(dashboard)/live-anchors/_components/anchor-table.tsx`
- Create: `src/app/(dashboard)/live-anchors/_components/anchor-edit-drawer.tsx`

- [ ] **Step 1: page.tsx**

```typescript
// src/app/(dashboard)/live-anchors/page.tsx
import { listAnchors } from "@/modules/live-anchor/server";
import { AnchorListClient } from "./_components/anchor-list-client";

export default async function LiveAnchorsPage() {
  const anchors = await listAnchors();
  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">主播档案</h1>
        <div className="text-sm text-slate-500">共 {anchors.length} 位主播</div>
      </div>
      <AnchorListClient initial={anchors} />
    </div>
  );
}
```

- [ ] **Step 2: anchor-table.tsx**

```typescript
// src/app/(dashboard)/live-anchors/_components/anchor-table.tsx
"use client";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { Button } from "@/components/ui/button";

interface Props {
  anchors: AnchorWithDingtalk[];
  onEdit: (a: AnchorWithDingtalk) => void;
}

export function AnchorTable({ anchors, onEdit }: Props) {
  if (anchors.length === 0) {
    return <div className="text-center py-16 text-slate-400 text-sm">暂无主播</div>;
  }
  return (
    <table className="w-full text-sm border border-slate-200 rounded overflow-hidden">
      <thead className="bg-slate-50 text-slate-600 text-xs">
        <tr>
          <th className="px-3 py-2 text-left">姓名</th>
          <th className="px-3 py-2 text-left">业务线</th>
          <th className="px-3 py-2 text-left">雇佣类型</th>
          <th className="px-3 py-2 text-left">试播日</th>
          <th className="px-3 py-2 text-left">签约日</th>
          <th className="px-3 py-2 text-left">状态</th>
          <th className="px-3 py-2 text-left">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {anchors.map((a) => (
          <tr key={a.dingtalk_user_id} className="hover:bg-slate-50/60">
            <td className="px-3 py-2 font-medium">{a.name}</td>
            <td className="px-3 py-2">{a.business_line}</td>
            <td className="px-3 py-2">{a.employment_type}</td>
            <td className="px-3 py-2">{a.trial_start_date ?? "-"}</td>
            <td className="px-3 py-2">{a.contract_date ?? "-"}</td>
            <td className="px-3 py-2">{a.work_status}</td>
            <td className="px-3 py-2">
              <Button size="sm" variant="ghost" onClick={() => onEdit(a)}>
                编辑
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: anchor-list-client.tsx**

```typescript
// src/app/(dashboard)/live-anchors/_components/anchor-list-client.tsx
"use client";
import { useState } from "react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { AnchorTable } from "./anchor-table";
import { AnchorEditDrawer } from "./anchor-edit-drawer";

export function AnchorListClient({ initial }: { initial: AnchorWithDingtalk[] }) {
  const [anchors, setAnchors] = useState(initial);
  const [bizFilter, setBizFilter] = useState<string>("all");
  const [editing, setEditing] = useState<AnchorWithDingtalk | null>(null);

  const filtered = anchors.filter((a) => bizFilter === "all" || a.business_line === bizFilter);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <select
          className="border border-slate-200 rounded px-2 py-1 text-sm"
          value={bizFilter}
          onChange={(e) => setBizFilter(e.target.value)}
        >
          <option value="all">全部业务线</option>
          <option value="捕鱼">捕鱼</option>
          <option value="斗地主">斗地主</option>
          <option value="麻将">麻将</option>
        </select>
      </div>
      <AnchorTable anchors={filtered} onEdit={setEditing} />
      <AnchorEditDrawer
        open={!!editing}
        anchor={editing}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setAnchors((prev) =>
            prev.map((p) =>
              p.dingtalk_user_id === saved.dingtalk_user_id ? { ...p, ...saved } : p,
            ),
          );
          setEditing(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 4: anchor-edit-drawer.tsx**

```typescript
// src/app/(dashboard)/live-anchors/_components/anchor-edit-drawer.tsx
"use client";
import { useState, useTransition } from "react";
import type { AnchorWithDingtalk, LiveAnchor } from "@/modules/live-anchor";
import { upsertAnchor, BusinessLine, EmploymentType, WorkStatus } from "@/modules/live-anchor";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  open: boolean;
  anchor: AnchorWithDingtalk | null;
  onClose: () => void;
  onSaved: (a: LiveAnchor) => void;
}

export function AnchorEditDrawer({ open, anchor, onClose, onSaved }: Props) {
  const [_pending, start] = useTransition();
  const [form, setForm] = useState(() => ({
    dingtalk_user_id: anchor?.dingtalk_user_id ?? "",
    business_line: anchor?.business_line ?? "捕鱼",
    employment_type: anchor?.employment_type ?? "正式",
    work_status: anchor?.work_status ?? "active",
    trial_start_date: anchor?.trial_start_date ?? "",
    contract_date: anchor?.contract_date ?? "",
    leave_date: anchor?.leave_date ?? "",
    external_name: anchor?.external_name ?? "",
  }));

  if (!open || !anchor) return null;

  const onSubmit = () => {
    start(async () => {
      try {
        const saved = await upsertAnchor({
          ...form,
          trial_start_date: form.trial_start_date || null,
          contract_date: form.contract_date || null,
          leave_date: form.leave_date || null,
          external_name: form.external_name || null,
        });
        toast.success("已保存");
        onSaved(saved);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "保存失败");
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex justify-end" onClick={onClose}>
      <div className="w-[500px] bg-white h-full overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">编辑主播 — {anchor.name}</h2>

        <div className="mb-4 p-3 bg-slate-50 rounded text-sm space-y-1">
          <div>钉钉用户 ID: <span className="font-mono">{anchor.dingtalk_user_id}</span></div>
          <div>钉钉手机: {anchor.mobile ?? "-"}</div>
          <div>钉钉职位: {anchor.title ?? "-"}</div>
          <div>钉钉在职: {anchor.active ? "是" : "否"}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <SelectField label="业务线" value={form.business_line} options={BusinessLine.options as readonly string[]} onChange={(v) => setForm({ ...form, business_line: v as typeof form.business_line })} />
          <SelectField label="雇佣类型" value={form.employment_type} options={EmploymentType.options as readonly string[]} onChange={(v) => setForm({ ...form, employment_type: v as typeof form.employment_type })} />
          <SelectField label="状态" value={form.work_status} options={WorkStatus.options as readonly string[]} onChange={(v) => setForm({ ...form, work_status: v as typeof form.work_status })} />
          <DateField label="试播日" value={form.trial_start_date} onChange={(v) => setForm({ ...form, trial_start_date: v })} />
          <DateField label="签约日" value={form.contract_date} onChange={(v) => setForm({ ...form, contract_date: v })} />
          <DateField label="离职日" value={form.leave_date} onChange={(v) => setForm({ ...form, leave_date: v })} />
        </div>
        <div className="mt-3">
          <span className="text-xs text-slate-500">合作主播本名（钉钉外）</span>
          <input
            className="w-full border border-slate-200 rounded px-2 py-1 text-sm"
            value={form.external_name}
            onChange={(e) => setForm({ ...form, external_name: e.target.value })}
          />
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={onSubmit}>保存</Button>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <select className="w-full border border-slate-200 rounded px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      <span className="text-xs text-slate-500 block mb-1">{label}</span>
      <input type="date" className="w-full border border-slate-200 rounded px-2 py-1 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
```

- [ ] **Step 5: 启动 dev 验证 B 视角**

Run: `pnpm dev`，访问 `/live-anchors`
Expected: 看到主播列表（业务线 tab）+ 点击编辑可改业务字段

- [ ] **Step 6: Commit**

```bash
git add src/app/\(dashboard\)/live-anchors/
git commit -m "feat(ui): add live-anchors page (B view) with edit drawer"
```

---

## Task 24: schedule-overview 排班矩阵（C 视角只读）

**Files:**
- Create: `src/app/(dashboard)/live-accounts/schedule-overview/page.tsx`
- Create: `src/app/(dashboard)/live-accounts/schedule-overview/_components/schedule-matrix.tsx`

- [ ] **Step 1: page.tsx**

```typescript
// src/app/(dashboard)/live-accounts/schedule-overview/page.tsx
import { listAccounts } from "@/modules/live-account/server";
import { listBindings } from "@/modules/live-anchor/account-bindings";
import { ScheduleMatrix } from "./_components/schedule-matrix";

export default async function ScheduleOverviewPage() {
  const accounts = await listAccounts();
  const bindings = (await listBindings({})) as Array<{
    id: string;
    account_id: string;
    dingtalk_user_id: string;
    anchor_name: string | null;
    time_slots: Array<[string, string]>;
    rest_days: number[];
  }>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">默认排班矩阵</h1>
        <div className="text-sm text-slate-500">仅展示，编辑请去账号详情页</div>
      </div>
      <ScheduleMatrix accounts={accounts} bindings={bindings} />
    </div>
  );
}
```

- [ ] **Step 2: schedule-matrix.tsx**

```typescript
// src/app/(dashboard)/live-accounts/schedule-overview/_components/schedule-matrix.tsx
"use client";
import { useRouter } from "next/navigation";
import type { AccountWithRelations } from "@/modules/live-account";
import { hourMatchesTimeSlots } from "@/modules/live-account";
import { PlatformBadge } from "../../_components/platform-badge";

interface Binding {
  id: string;
  account_id: string;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: Array<[string, string]>;
  rest_days: number[];
}

interface Props {
  accounts: AccountWithRelations[];
  bindings: Binding[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const COLOR_PALETTE = [
  "bg-pink-100 text-pink-800",
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-amber-100 text-amber-800",
  "bg-purple-100 text-purple-800",
  "bg-cyan-100 text-cyan-800",
];

export function ScheduleMatrix({ accounts, bindings }: Props) {
  const router = useRouter();
  // anchor_name → 颜色
  const anchorColor = new Map<string, string>();
  for (const b of bindings) {
    const name = b.anchor_name ?? b.dingtalk_user_id;
    if (!anchorColor.has(name)) {
      anchorColor.set(name, COLOR_PALETTE[anchorColor.size % COLOR_PALETTE.length]);
    }
  }

  // group accounts by product
  const byProduct = accounts.reduce<Record<string, AccountWithRelations[]>>((m, a) => {
    (m[a.product] ??= []).push(a);
    return m;
  }, {});

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-slate-200">
        <thead className="bg-slate-50 sticky top-0">
          <tr>
            <th className="px-2 py-1 text-left border-r">账号</th>
            {HOURS.map((h) => (
              <th key={h} className="px-1 py-1 border-r w-8">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(byProduct).map(([product, accs]) => (
            <>
              <tr key={`g-${product}`}>
                <td colSpan={25} className="bg-slate-100 px-2 py-1 font-bold text-slate-600">
                  {product}（{accs.length}）
                </td>
              </tr>
              {accs.map((a) => {
                const accBindings = bindings.filter((b) => b.account_id === a.id);
                return (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-50/60 cursor-pointer"
                    onClick={() => router.push(`/live-accounts?edit=${a.id}`)}
                  >
                    <td className="px-2 py-1 border-r whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <PlatformBadge platform={a.platform} />
                        <span className="font-medium">{a.account_name}</span>
                      </div>
                    </td>
                    {HOURS.map((h) => {
                      const onDuty = accBindings.find((b) =>
                        hourMatchesTimeSlots(b.time_slots, h),
                      );
                      const name = onDuty?.anchor_name ?? "";
                      const color = name ? anchorColor.get(name) : "";
                      return (
                        <td
                          key={h}
                          className={`border-r text-center text-[10px] ${color}`}
                          title={name}
                        >
                          {name?.slice(0, 1) ?? ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-xs text-slate-400">
        点击行跳转到账号详情页编辑排班。颜色不持久化，每次刷新可能不同。
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 启动 dev 验证 C 视角**

Run: `pnpm dev`，访问 `/live-accounts/schedule-overview`
Expected: 24 列矩阵，每行账号 × 时段 × 主播首字色块；点行跳转编辑

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/live-accounts/schedule-overview/
git commit -m "feat(ui): add schedule overview matrix (read-only)"
```

---

## Task 25: 姓名匹配人工确认 UI

**Files:**
- Create: `src/app/(dashboard)/live-account-migration/page.tsx`
- Create: `src/app/(dashboard)/live-account-migration/_components/migration-client.tsx`
- Create: `src/app/(dashboard)/live-account-migration/_components/name-match-section.tsx`

- [ ] **Step 1: page.tsx — 触发 dry-run + 显示报告**

```typescript
// src/app/(dashboard)/live-account-migration/page.tsx
import { runMigration } from "@/modules/live-account/migration";
import { MigrationClient } from "./_components/migration-client";

export const dynamic = "force-dynamic";

const PRO3_DB = "/Users/zhangjin/miracle-pro3/server/database.sqlite";

export default async function MigrationPage() {
  let report;
  try {
    report = await runMigration({ pro3SqlitePath: PRO3_DB, dryRun: true });
  } catch (e) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-red-600">迁移分析失败</h1>
        <p className="text-sm text-slate-500 mt-2">{e instanceof Error ? e.message : String(e)}</p>
        <p className="text-xs text-slate-400 mt-4">PRO3 SQLite 路径: {PRO3_DB}</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">PRO3 数据迁移确认</h1>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <Stat label="待迁移行数" value={report.totalRows} />
        <Stat label="完全匹配" value={report.anchors.matched.length} color="text-green-600" />
        <Stat label="待人工确认" value={report.anchors.pending.length} color="text-amber-600" />
        <Stat label="未匹配" value={report.anchors.unmatched.length} color="text-red-600" />
      </div>
      <MigrationClient report={report} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border border-slate-200 rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${color ?? "text-slate-800"}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: name-match-section.tsx**

```typescript
// src/app/(dashboard)/live-account-migration/_components/name-match-section.tsx
"use client";
import type { DingtalkCandidate } from "@/modules/live-account";
import { useState } from "react";

interface PendingItem {
  pro3_name: string;
  candidates: DingtalkCandidate[];
}

interface Props {
  pending: PendingItem[];
  unmatched: string[];
  onConfirm: (pro3Name: string, dingtalkUserId: string | null) => void;
}

export function NameMatchSection({ pending, unmatched, onConfirm }: Props) {
  const [selected, setSelected] = useState<Record<string, string>>({});

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <h2 className="font-bold text-amber-700 mb-2">待人工确认（{pending.length}）</h2>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.pro3_name} className="border border-amber-200 rounded p-3 bg-amber-50/40">
                <div className="font-medium mb-2">PRO3 姓名：{p.pro3_name}</div>
                <div className="grid grid-cols-2 gap-2">
                  {p.candidates.map((c) => (
                    <label key={c.user_id} className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-white rounded">
                      <input
                        type="radio"
                        name={p.pro3_name}
                        value={c.user_id}
                        onChange={() => setSelected({ ...selected, [p.pro3_name]: c.user_id })}
                      />
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-slate-500">{c.mobile ?? "-"}</span>
                    </label>
                  ))}
                </div>
                <button
                  className="mt-2 px-3 py-1 bg-amber-500 text-white rounded text-sm disabled:bg-slate-300"
                  disabled={!selected[p.pro3_name]}
                  onClick={() => onConfirm(p.pro3_name, selected[p.pro3_name] ?? null)}
                >
                  确认绑定
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {unmatched.length > 0 && (
        <section>
          <h2 className="font-bold text-red-700 mb-2">未匹配（{unmatched.length}）</h2>
          <div className="space-y-2">
            {unmatched.map((name) => (
              <div key={name} className="border border-red-200 rounded p-3 bg-red-50/40 flex justify-between">
                <span>{name}</span>
                <button
                  className="text-xs text-blue-600 underline"
                  onClick={() => onConfirm(name, null)}
                >
                  跳过此主播
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            未匹配的主播在迁移时会被跳过（不创建 binding）。可以在迁移完成后手动建 stub dingtalk_user
            + live_anchor，再编辑账号绑定。
          </p>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: migration-client.tsx**

```typescript
// src/app/(dashboard)/live-account-migration/_components/migration-client.tsx
"use client";
import { useState } from "react";
import type { MigrationReport } from "@/modules/live-account/migration";
import { NameMatchSection } from "./name-match-section";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function MigrationClient({ report: initial }: { report: MigrationReport }) {
  const [report, _setReport] = useState(initial);
  const [executing, setExecuting] = useState(false);

  const onConfirm = (pro3Name: string, dingtalkUserId: string | null) => {
    toast.success(`已记录：${pro3Name} → ${dingtalkUserId ?? "跳过"}`);
    // 实际持久化在 Phase 2.1 不强求 — 运营在浏览器本地 confirmed，再走 CLI 实际执行
  };

  const onExecute = () => {
    if (!confirm("确定执行写库？此操作不可逆")) return;
    setExecuting(true);
    setTimeout(() => {
      toast.error("UI 仅展示报告，请运行 CLI: pnpm tsx src/scripts/migrate-pro3-accounts.ts --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite");
      setExecuting(false);
    }, 600);
  };

  return (
    <div className="space-y-6">
      <NameMatchSection
        pending={report.anchors.pending}
        unmatched={report.anchors.unmatched}
        onConfirm={onConfirm}
      />
      <div className="border-t pt-4">
        <Button disabled={executing} onClick={onExecute}>
          {executing ? "执行中..." : "执行迁移（写库）"}
        </Button>
        <p className="text-xs text-slate-500 mt-2">
          注意：当前 UI 仅展示 dry-run 报告。实际执行请运行 CLI。
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 启动 dev 验证**

Run: `pnpm dev`，访问 `/live-account-migration`
Expected: 看到 dry-run 报告 + 待确认列表 + 未匹配列表

- [ ] **Step 5: Commit**

```bash
git add src/app/\(dashboard\)/live-account-migration/
git commit -m "feat(ui): add migration confirmation page with name-match UI"
```

---

## Task 26: 跑实际迁移（手动验证）

**Files:** 无新代码，纯运维步骤

- [ ] **Step 1: dry-run 看报告**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm tsx --env-file=.env.local src/scripts/migrate-pro3-accounts.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --dry-run \
  --output /tmp/migration-dry-run.json
cat /tmp/migration-dry-run.json | jq '.platformCounts, .productCounts, .anchors | { matched: .matched|length, pending: .pending|length, unmatched: .unmatched|length }'
```

Expected: 平台分布抖音 ~37 / 快手 ~14；产品分布 6 个；matched + pending + unmatched 总数合理

- [ ] **Step 2: 实际执行（写库）**

```bash
pnpm tsx --env-file=.env.local src/scripts/migrate-pro3-accounts.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --output /tmp/migration-real.json
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*), platform FROM live_account GROUP BY platform;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM live_anchor;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM account_anchor_default;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM live_room;"
```

Expected: live_account ~53 行（抖音 ~37 / 快手 ~14）；live_room、live_anchor、account_anchor_default 都有数据

- [ ] **Step 3: 验证「邓明星」类的 1 真人 N 账号场景（如果有）**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT du.name, COUNT(DISTINCT aad.account_id) AS account_count FROM dingtalk_user du JOIN account_anchor_default aad ON aad.dingtalk_user_id = du.user_id GROUP BY du.name HAVING COUNT(DISTINCT aad.account_id) > 1;"
```

Expected: 列出有 ≥ 2 个绑定账号的真人（如有）

- [ ] **Step 4: Commit 实际迁移完成的 marker（无代码改动；可跳过 commit）**

```bash
# 如果要记录迁移完成时间戳，可以加一行到 docs/superpowers/plans/2026-05-06-phase-2-1-live-account-anchor.md 的"迁移完成日志"
echo "- 迁移完成: $(date '+%Y-%m-%d %H:%M:%S')" >> docs/superpowers/plans/2026-05-06-phase-2-1-live-account-anchor.md
git add docs/superpowers/plans/2026-05-06-phase-2-1-live-account-anchor.md
git commit -m "chore(migration): mark PRO3 accounts migration complete"
```

---

## Task 27: 抖音账号与 anchor_profile 反向 join 验收

**Files:** 无新代码，纯 SQL 验证

- [ ] **Step 1: 跑反向 join SQL**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "
SELECT la.account_name, la.platform_account_id, ap.nick_name AS profile_nickname
FROM live_account la
LEFT JOIN anchor_profile ap ON ap.aweme_display_id = la.platform_account_id
WHERE la.platform = '抖音'
ORDER BY la.account_name
LIMIT 10;
"
```

Expected: 至少部分行 profile_nickname 不为空（说明能与现有 anchor_profile 关联上）；不能关联的也是预期（PRO3 数据脏 - spec §3.5 已说明）

- [ ] **Step 2: 统计能关联率**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "
SELECT
  COUNT(*) AS total_douyin,
  COUNT(ap.anchor_id) AS matched_to_profile,
  ROUND(100.0 * COUNT(ap.anchor_id) / COUNT(*), 1) AS match_rate_pct
FROM live_account la
LEFT JOIN anchor_profile ap ON ap.aweme_display_id = la.platform_account_id
WHERE la.platform = '抖音';
"
```

Expected: 输出抖音账号关联率（无明确门槛，只要有数字即可，spec 不强求强 FK）

- [ ] **Step 3: Commit（无代码，仅记录验收完成）**

无需 commit。直接进入下一 task。

---

## Task 28: CONTRIBUTING.md 注册新模块 + tag

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: 在第 8 节"已注册模块清单"末尾追加 3 行**

```markdown
| live-room | `src/modules/live-room/` | 线下物理直播间管理 | Phase 2.1 (2026-05-06) |
| live-account | `src/modules/live-account/` | 跨平台直播账号 + 主播绑定 + 默认排班 + PRO3 迁移 | Phase 2.1 (2026-05-06) |
| live-anchor | `src/modules/live-anchor/` | 主播业务扩展（钉钉用户的主播角色）+ N:M 排班关联 | Phase 2.1 (2026-05-06) |
```

- [ ] **Step 2: 检查所有 lint / test / typecheck 通过**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 全部 PASS

- [ ] **Step 3: Commit + tag**

```bash
git add CONTRIBUTING.md
git commit -m "docs: register live-room/live-account/live-anchor modules (Phase 2.1)"
git tag v0.3.0-phase2.1 -m "Phase 2.1: 直播账号 + 主播 + 默认排班 主数据 完成"
```

- [ ] **Step 4: 验证 tag**

```bash
git tag --list | grep phase2
git log v0.2.0-phase1..HEAD --oneline | wc -l  # commit 数
```

Expected: 看到 `v0.3.0-phase2.1`；commit 数与 task 数（≈28）相当

---

## 完成标志

- ✅ 4 张新表 schema 落地，drizzle migrations 全部应用
- ✅ 3 个 feature 模块按 CLAUDE.md 规范创建
- ✅ 主入口 `/live-accounts`（A 视角）+ 辅助入口 `/live-anchors`（B 视角）+ 矩阵总览 `/live-accounts/schedule-overview`（C 视角）
- ✅ 迁移 CLI 跑通，PRO3 53 行入库，平台分布报告输出
- ✅ 姓名 fuzzy match 准确率 ≥ 80%（其余手工绑）
- ✅ time-slots 单测覆盖跨日时段
- ✅ name-matcher 单测覆盖 4 种 case
- ✅ tag `v0.3.0-phase2.1` 落地

**接下来**：Phase 2.2（投放迁移 + 排班 override + 投放主播效能）
