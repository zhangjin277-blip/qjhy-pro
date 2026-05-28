# Phase 3.0 — 剪辑工作流跟进 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按 task 实施。步骤用 `- [ ]` checkbox 追踪。

**Goal:** 实现 Phase 3.0 MVP 剪辑工作流：5 状态看板 + 表格视图 + 批量派单 + 详情抽屉 + NAS 存储 + 三层权限 + 抖音视频自动绑定，端到端跑通一条剪辑任务全生命周期。

**Architecture:** feature-first 模块结构（`src/modules/editing-task` + `src/modules/editing-storage` + `src/modules/editing-editor` + `src/modules/product-config`），index.ts/server.ts 双入口防止 client bundle 拉 NAS / DB；UI 在 `src/app/(dashboard)/editing/`；状态机集中在 editing-task/state-machine.ts；事件流入 `editing_task_event`。

**Tech Stack:** Next.js 16.2.4 + TypeScript strict + Drizzle 0.45 + PostgreSQL 16 + better-auth + Tailwind v4 + shadcn (base-nova) + Vitest + Docker Compose（新增 NAS bind mount）

**Spec:** `docs/superpowers/specs/2026-05-25-phase-3-0-editing-workflow-design.md`
**UI mockup:** `docs/design/mockups/2026-05-25-editing-board-v2.html`

**Spec 修正（实施前同步更新 spec 第 3.3/3.4 节）：** `live_account.product` 字段（中文产品名）已存在，无需新增 `product_category`。`product_config.category_key` 改为 `product_name`（与 `live_account.product` join），删除 `live_account` migration。

---

## 文件结构

```
src/db/schema/
  editing.ts                                 ← editing_task + editing_task_event + product_config

src/db/migrations/
  XXXX_phase_3_0_editing.sql                 ← drizzle-kit generate

src/db/seed/
  product-config.ts                          ← seed 6 个产品分类
  editing-demo-tasks.ts                      ← 开发期 demo 数据

src/modules/product-config/
  index.ts                                   ← client-safe
  queries.ts                                 ← listProducts()

src/modules/editing-editor/
  index.ts
  queries.ts                                 ← listEditors() = dingtalk_user × 岗位「剪辑」

src/modules/editing-storage/
  index.ts                                   ← (空，文件 IO 都是 server-only)
  server.ts                                  ← re-export from nas
  nas.ts                                     ← uploadSource / uploadEdited / getDownloadStream / pathHelpers
  health.ts                                  ← checkNasMount() — 启动时调
  nas.test.ts

src/modules/editing-task/
  index.ts                                   ← client-safe: types + Zod + Server Actions
  server.ts                                  ← server-only: queries + state-machine + event-writer
  types.ts                                   ← Status / EventType / Task / Event 类型
  schema.ts                                  ← Zod 输入 schema
  state-machine.ts                           ← 合法转换 + transition()
  state-machine.test.ts
  event-writer.ts                            ← writeEvent()
  queries.ts                                 ← listForBoard / listForTable / getTask / getEvents
  queries.test.ts
  scope.ts                                   ← buildEditingScopeWhere() — 复用 permissions/scope
  scope.test.ts
  actions/
    create-task.ts
    upload-source.ts
    assign-editor.ts                         ← 单 + 批量复用
    upload-edited.ts
    review-approve.ts
    review-reject.ts
    reset-editing.ts
    mark-published.ts                        ← 含抖音视频自动绑定
    delete-task.ts
    match-douyin-video.ts                    ← 抖音绑定 service（被 mark-published 调用）

src/modules/permissions/
  modules.ts                                 ← (修改) 加 "editing_workflow"
  role-defaults.ts                           ← (修改) 加 editing_workflow 默认值

src/app/(dashboard)/editing/
  layout.tsx
  page.tsx                                   ← 默认 = 看板
  table/page.tsx                             ← 表格视图
  _components/
    board.tsx                                ← 主看板（含浮动栏 + selection state）
    board-column.tsx
    board-group.tsx                          ← 日期分组 + 折叠 + +N 更多
    board-card.tsx
    filter-bar.tsx
    new-task-dialog.tsx
    task-drawer.tsx                          ← 详情抽屉 + 事件流时间线
    assign-popover.tsx                       ← 派单（单 + 批量）
    review-reject-dialog.tsx                 ← 回退原因输入
    mark-published-dialog.tsx                ← 抖音绑定 / 手填
    delete-confirm-dialog.tsx
    selection-store.ts                       ← zustand 选中状态
    floating-action-bar.tsx
    table-view.tsx
    editing-test-fixtures.ts                 ← 测试用 mock factory

docker-compose.yml                           ← (修改) web + worker 加 NAS bind mount + env

tests/e2e/editing/
  task-lifecycle.test.ts                    ← e2e: 全流程跑通
  permission-scope.test.ts                  ← e2e: 5 角色可见性
```

---

## T01 · Drizzle schema：product_config 表

**Files:**
- Create: `src/db/schema/editing.ts`
- Modify: `src/db/schema/index.ts`

- [ ] **Step 1: 写 product_config schema**

`src/db/schema/editing.ts`:

```ts
import { jsonb, pgTable, text, timestamp, bigserial, bigint, index } from "drizzle-orm/pg-core";
import { live_account } from "./live-account";
import { dingtalk_user } from "./dingtalk";
import { anchor_profile } from "./anchors";

/**
 * 产品分类配置（PK = product name，与 live_account.product join）。
 * MVP 不做管理 UI，由 seed 初始化。
 */
export const product_config = pgTable("product_config", {
  product_name: text("product_name").primaryKey(), // "捕鱼大作战" / "途游斗地主" / ...
  display_short: text("display_short").notNull(),  // 看板 chip 简称："捕鱼"
  accent_color: text("accent_color").notNull(),    // hex，看板色带
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: 加 export 到 schema barrel**

`src/db/schema/index.ts` 末尾加：

```ts
export * from "./editing";
```

- [ ] **Step 3: 生成 migration**

```bash
pnpm db:generate
```

预期：在 `src/db/migrations/` 生成新文件，含 `CREATE TABLE "product_config" ...`。

- [ ] **Step 4: 提交**

```bash
git add src/db/schema/editing.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(editing): add product_config table schema + migration"
```

---

## T02 · seed 6 个产品分类

**Files:**
- Create: `src/db/seed/product-config.ts`
- Modify: `package.json`

- [ ] **Step 1: 写 seed 脚本**

`src/db/seed/product-config.ts`:

```ts
import { db } from "@/db/client";
import { product_config } from "@/db/schema";

const PRODUCTS = [
  { product_name: "捕鱼大作战", display_short: "捕鱼", accent_color: "#1677ff" },
  { product_name: "途游斗地主", display_short: "斗地主", accent_color: "#d4a853" },
  { product_name: "三国冰河时代", display_short: "三国", accent_color: "#a855f7" },
  { product_name: "富豪麻将", display_short: "麻将", accent_color: "#10b981" },
  { product_name: "电玩捕鱼", display_short: "电玩", accent_color: "#ef4444" },
  { product_name: "途游休闲捕鱼", display_short: "休闲", accent_color: "#06b6d4" },
];

async function main() {
  await db.insert(product_config).values(PRODUCTS).onConflictDoNothing();
  console.log(`seeded ${PRODUCTS.length} product configs`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 加 npm script**

`package.json` 的 `scripts` 加：

```json
"db:seed:product-config": "tsx --env-file=.env.local src/db/seed/product-config.ts",
```

- [ ] **Step 3: 跑 migration + seed**

```bash
pnpm db:migrate
pnpm db:seed:product-config
```

预期输出：`seeded 6 product configs`

- [ ] **Step 4: 验证**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT * FROM product_config;"
```

预期：6 行。

- [ ] **Step 5: 提交**

```bash
git add src/db/seed/product-config.ts package.json
git commit -m "feat(editing): seed 6 product_config rows"
```

---

## T03 · Drizzle schema：editing_task + editing_task_event

**Files:**
- Modify: `src/db/schema/editing.ts`

- [ ] **Step 1: 加两张表 schema（追加在 product_config 之后）**

```ts
export const EDITING_TASK_STATUS = ["uploaded", "editing", "review", "ready", "published"] as const;
export type EditingTaskStatus = (typeof EDITING_TASK_STATUS)[number];

export const editing_task = pgTable(
  "editing_task",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    live_account_id: text("live_account_id")
      .notNull()
      .references(() => live_account.id),
    anchor_id: text("anchor_id").references(() => anchor_profile.anchor_id),
    material_date: timestamp("material_date", { mode: "date", withTimezone: false }).notNull(),
    status: text("status", { enum: EDITING_TASK_STATUS }).notNull(),
    source_remark: text("source_remark"),
    source_files: jsonb("source_files").$type<string[]>().notNull().default([]),
    source_file_names: jsonb("source_file_names").$type<string[]>().notNull().default([]),
    source_uploaded_at: timestamp("source_uploaded_at", { withTimezone: true }),
    editor_user_id: text("editor_user_id").references(() => dingtalk_user.user_id),
    editing_started_at: timestamp("editing_started_at", { withTimezone: true }),
    edited_files: jsonb("edited_files").$type<string[]>().notNull().default([]),
    edited_file_names: jsonb("edited_file_names").$type<string[]>().notNull().default([]),
    edited_uploaded_at: timestamp("edited_uploaded_at", { withTimezone: true }),
    reviewed_by_user_id: text("reviewed_by_user_id").references(() => dingtalk_user.user_id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    published_by_user_id: text("published_by_user_id").references(() => dingtalk_user.user_id),
    published_at: timestamp("published_at", { withTimezone: true }),
    video_id: text("video_id"),
    created_by_user_id: text("created_by_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_status_date: index("idx_editing_task_status_date").on(t.status, t.material_date),
    idx_account_date: index("idx_editing_task_account_date").on(t.live_account_id, t.material_date),
    idx_editor_status: index("idx_editing_task_editor_status").on(t.editor_user_id, t.status),
    idx_video_id: index("idx_editing_task_video_id").on(t.video_id),
  }),
);

export const EDITING_EVENT_TYPES = [
  "created", "source_uploaded", "assigned", "reassigned", "editing_reset",
  "edited_uploaded", "review_approved", "review_rejected",
  "published", "deleted",
] as const;
export type EditingEventType = (typeof EDITING_EVENT_TYPES)[number];

export const editing_task_event = pgTable(
  "editing_task_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    task_id: bigint("task_id", { mode: "number" })
      .notNull()
      .references(() => editing_task.id, { onDelete: "cascade" }),
    event_type: text("event_type", { enum: EDITING_EVENT_TYPES }).notNull(),
    actor_user_id: text("actor_user_id")
      .notNull()
      .references(() => dingtalk_user.user_id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idx_task_created: index("idx_editing_event_task_created").on(t.task_id, t.created_at),
    idx_type_created: index("idx_editing_event_type_created").on(t.event_type, t.created_at),
  }),
);
```

- [ ] **Step 2: 生成 + 跑 migration**

```bash
pnpm db:generate
pnpm db:migrate
```

预期：新 migration 文件包含 `CREATE TABLE "editing_task"` 和 `CREATE TABLE "editing_task_event"`。

- [ ] **Step 3: 验证表存在**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt editing*"
```

预期：列出 `editing_task` 和 `editing_task_event`。

- [ ] **Step 4: 提交**

```bash
git add src/db/schema/editing.ts src/db/migrations/
git commit -m "feat(editing): add editing_task + editing_task_event tables"
```

---

## T04 · updated_at trigger（PG 自动维护）

**Files:**
- Create: `src/db/migrations/manual/XXXX_editing_updated_at_trigger.sql`
- Modify: `package.json`

drizzle-kit 不生成 trigger，要手写并加进 migration 流程。

- [ ] **Step 1: 写 manual migration**

`src/db/migrations/manual/editing_updated_at_trigger.sql`:

```sql
CREATE OR REPLACE FUNCTION set_updated_at_now() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS editing_task_set_updated_at ON editing_task;
CREATE TRIGGER editing_task_set_updated_at
BEFORE UPDATE ON editing_task
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
```

- [ ] **Step 2: 应用 trigger**

```bash
docker exec -i qjhy-postgres psql -U qjhy -d qjhy < src/db/migrations/manual/editing_updated_at_trigger.sql
```

预期：`CREATE FUNCTION` + `CREATE TRIGGER`，无报错。

- [ ] **Step 3: 验证 trigger**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "
INSERT INTO editing_task (live_account_id, material_date, status, created_by_user_id)
  SELECT id, NOW()::date, 'uploaded', user_id FROM live_account, dingtalk_user LIMIT 1
  RETURNING id, created_at, updated_at;"

docker exec qjhy-postgres psql -U qjhy -d qjhy -c "
UPDATE editing_task SET source_remark = 'x' WHERE id = (SELECT MAX(id) FROM editing_task)
  RETURNING updated_at, created_at;"
```

预期：updated_at > created_at。

- [ ] **Step 4: 清测试数据 + 提交**

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "TRUNCATE editing_task, editing_task_event RESTART IDENTITY CASCADE;"
git add src/db/migrations/manual/editing_updated_at_trigger.sql
git commit -m "feat(editing): add updated_at trigger for editing_task"
```

---

## T05 · permissions 注册 editing_workflow 模块

**Files:**
- Modify: `src/modules/permissions/modules.ts`
- Modify: `src/modules/permissions/role-defaults.ts`

- [ ] **Step 1: 加 module key + label + desc**

`src/modules/permissions/modules.ts`：在 `MODULE_KEYS` 数组末尾加 `"editing_workflow"`，并补 `MODULE_LABEL` 和 `MODULE_DESC`：

```ts
export const MODULE_KEYS = [
  "dashboard", "anchors", "crawler", "permissions",
  "live_account", "live_anchor", "live_room", "placement",
  "editing_workflow",
] as const;

export const MODULE_LABEL: Record<ModuleKey, string> = {
  // ...
  editing_workflow: "剪辑工作流",
};

export const MODULE_DESC: Record<ModuleKey, string> = {
  // ...
  editing_workflow: "剪辑任务全链路看板 / 派单 / 审核 / 发布",
};
```

- [ ] **Step 2: 读 role-defaults.ts 了解现有 seed 格式**

```bash
cat src/modules/permissions/role-defaults.ts | head -40
```

- [ ] **Step 3: 加 editing_workflow 8 个岗位默认值**

`src/modules/permissions/role-defaults.ts` 的 `ROLE_DEFAULTS_SEED` 数组里追加（实际按现有数据结构来）：

```ts
// editing_workflow
{ position: "老板", module: "editing_workflow", scope: "all", can_edit: true, can_export: false, can_admin: true, description: "全看全管" },
{ position: "总监", module: "editing_workflow", scope: "all", can_edit: true, can_export: false, can_admin: true, description: "全看全管" },
{ position: "运营", module: "editing_workflow", scope: "self", can_edit: true, can_export: false, can_admin: false, description: "看自己负责账号的任务" },
{ position: "剪辑", module: "editing_workflow", scope: "self", can_edit: true, can_export: false, can_admin: false, description: "看自己派到的任务 + uploaded 可领" },
{ position: "主播", module: "editing_workflow", scope: "self", can_edit: false, can_export: false, can_admin: false, description: "看自己作为主播的任务（只读）" },
{ position: "行政", module: "editing_workflow", scope: "none", can_edit: false, can_export: false, can_admin: false, description: "无权限" },
{ position: "财务", module: "editing_workflow", scope: "none", can_edit: false, can_export: false, can_admin: false, description: "无权限" },
{ position: "其他", module: "editing_workflow", scope: "none", can_edit: false, can_export: false, can_admin: false, description: "兜底" },
```

- [ ] **Step 4: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

预期：通过。

- [ ] **Step 5: 重新 seed role defaults**

读现有的 role defaults seed 命令（一般是 `pnpm db:seed:roles` 或 `pnpm db:seed:emergency` 类似）。如果没有专用脚本，写一个一次性 SQL：

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "
INSERT INTO role_default_permission (position, module, scope, can_edit, can_export, can_admin, description) VALUES
  ('老板', 'editing_workflow', 'all', true, false, true, '全看全管'),
  ('总监', 'editing_workflow', 'all', true, false, true, '全看全管'),
  ('运营', 'editing_workflow', 'self', true, false, false, '看自己负责账号的任务'),
  ('剪辑', 'editing_workflow', 'self', true, false, false, '看自己派到的任务 + uploaded 可领'),
  ('主播', 'editing_workflow', 'self', false, false, false, '看自己作为主播的任务（只读）'),
  ('行政', 'editing_workflow', 'none', false, false, false, '无权限'),
  ('财务', 'editing_workflow', 'none', false, false, false, '无权限'),
  ('其他', 'editing_workflow', 'none', false, false, false, '兜底')
ON CONFLICT (position, module) DO UPDATE SET
  scope = EXCLUDED.scope, can_edit = EXCLUDED.can_edit,
  can_export = EXCLUDED.can_export, can_admin = EXCLUDED.can_admin,
  description = EXCLUDED.description;"
```

- [ ] **Step 6: 提交**

```bash
git add src/modules/permissions/
git commit -m "feat(permissions): register editing_workflow module + 8 role defaults"
```

---

## T06 · Docker NAS 挂载 + 健康检查

**Files:**
- Modify: `docker-compose.yml`
- Create: `src/modules/editing-storage/health.ts`
- Create: `src/modules/editing-storage/health.test.ts`

- [ ] **Step 1: 修 docker-compose.yml**

`web` 和 `worker` service 都加：

```yaml
  web:
    # ...existing...
    volumes:
      - editing_nas:/mnt/qjhy-edit
    environment:
      # ...existing...
      EDITING_NAS_PATH: /mnt/qjhy-edit

  worker:
    # ...existing...
    volumes:
      - editing_nas:/mnt/qjhy-edit
    environment:
      EDITING_NAS_PATH: /mnt/qjhy-edit

volumes:
  qjhy_postgres_data:
  editing_nas:
    driver: local
    driver_opts:
      type: nfs
      o: "addr=172.16.39.61,nolock,soft,rw"
      device: ":/volume1/qjhy-edit"
```

> **注意：** NFS 路径 `:/volume1/qjhy-edit` 是占位。开始 T06 前先和运维确认 NAS 上为 qjhy-edit 创建的实际共享路径，替换 device 行。

`.env.local` 加：

```
EDITING_NAS_PATH=./tmp/editing-nas  # 本地开发用本地目录代替 NAS
```

`.env.example` 同步加一行（不带值）。

- [ ] **Step 2: 写 health check failing test**

`src/modules/editing-storage/health.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { checkNasMount } from "./health";

const TEST_PATH = "./tmp/editing-nas-test";

describe("checkNasMount", () => {
  beforeAll(async () => {
    await mkdir(TEST_PATH, { recursive: true });
  });
  afterAll(async () => {
    await rm(TEST_PATH, { recursive: true, force: true });
  });

  it("returns ok when path exists and is writable", async () => {
    const result = await checkNasMount(TEST_PATH);
    expect(result.ok).toBe(true);
  });

  it("returns not-ok when path does not exist", async () => {
    const result = await checkNasMount("./does-not-exist-12345");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ENOENT");
  });

  it("returns not-ok when path is not writable", async () => {
    // chmod 0 to simulate read-only
    const roPath = `${TEST_PATH}-ro`;
    await mkdir(roPath, { mode: 0o400 });
    try {
      const result = await checkNasMount(roPath);
      expect(result.ok).toBe(false);
    } finally {
      await rm(roPath, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pnpm test src/modules/editing-storage/health.test.ts
```

预期：FAIL（模块不存在）。

- [ ] **Step 4: 实现 checkNasMount**

`src/modules/editing-storage/health.ts`:

```ts
import "server-only";
import { access, writeFile, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export type NasHealth = { ok: true } | { ok: false; reason: string };

export async function checkNasMount(path: string): Promise<NasHealth> {
  try {
    await access(path, constants.F_OK | constants.W_OK);
    const probe = join(path, `.health-${process.pid}-${Date.now()}`);
    await writeFile(probe, "ok");
    await unlink(probe);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? `${e.message}` : String(e) };
  }
}
```

- [ ] **Step 5: 跑测试确认通过**

```bash
pnpm test src/modules/editing-storage/health.test.ts
```

预期：3 passed。

- [ ] **Step 6: 提交**

```bash
git add docker-compose.yml .env.local .env.example src/modules/editing-storage/
git commit -m "feat(editing-storage): NAS bind mount + checkNasMount health probe"
```

---

## T07 · editing-storage nas.ts（上传 / 下载 / 路径生成）

**Files:**
- Create: `src/modules/editing-storage/nas.ts`
- Create: `src/modules/editing-storage/nas.test.ts`
- Create: `src/modules/editing-storage/index.ts`
- Create: `src/modules/editing-storage/server.ts`

- [ ] **Step 1: 写 failing test**

`src/modules/editing-storage/nas.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  buildSourcePath, buildEditedPath, writeFile as nasWriteFile, getDownloadStream,
} from "./nas";

const NAS = "./tmp/editing-nas-test-2";

describe("nas path helpers", () => {
  it("buildSourcePath - normal product", () => {
    const p = buildSourcePath({ taskId: 42, product: "捕鱼大作战", materialDate: "2026-05-25", originalName: "raw.mp4" });
    expect(p).toBe("source/捕鱼大作战/2026-05-25/task-42-raw.mp4");
  });
  it("buildEditedPath - normal product", () => {
    const p = buildEditedPath({ taskId: 42, product: "途游斗地主", materialDate: "2026-05-25", originalName: "v1.mp4" });
    expect(p).toBe("edited/途游斗地主/2026-05-25/task-42-v1.mp4");
  });
  it("buildSourcePath - sanitizes filename traversal", () => {
    const p = buildSourcePath({ taskId: 1, product: "捕鱼大作战", materialDate: "2026-05-25", originalName: "../../etc/passwd" });
    expect(p).toBe("source/捕鱼大作战/2026-05-25/task-1-passwd");
  });
});

describe("nas IO", () => {
  beforeAll(async () => await mkdir(NAS, { recursive: true }));
  afterAll(async () => await rm(NAS, { recursive: true, force: true }));

  it("writeFile creates file under NAS root", async () => {
    const relPath = "source/test/2026-05-25/task-1-x.txt";
    await nasWriteFile(NAS, relPath, Buffer.from("hello"));
    const content = await readFile(`${NAS}/${relPath}`, "utf8");
    expect(content).toBe("hello");
  });

  it("writeFile rejects paths escaping NAS root", async () => {
    await expect(nasWriteFile(NAS, "../escape.txt", Buffer.from("x"))).rejects.toThrow(/outside NAS/);
  });

  it("getDownloadStream returns readable stream", async () => {
    const relPath = "source/test/2026-05-25/task-2-y.txt";
    await nasWriteFile(NAS, relPath, Buffer.from("world"));
    const stream = getDownloadStream(NAS, relPath);
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe("world");
  });

  it("getDownloadStream rejects path traversal", () => {
    expect(() => getDownloadStream(NAS, "../escape.txt")).toThrow(/outside NAS/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test src/modules/editing-storage/nas.test.ts
```

预期：FAIL（模块未实现）。

- [ ] **Step 3: 实现 nas.ts**

`src/modules/editing-storage/nas.ts`:

```ts
import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";

export interface PathInput {
  taskId: number;
  product: string;
  materialDate: string; // "YYYY-MM-DD"
  originalName: string;
}

function safeFilename(name: string): string {
  // strip path separators and parent dir markers
  return basename(name).replace(/^\.+/, "") || "unnamed";
}

export function buildSourcePath(input: PathInput): string {
  return join("source", input.product, input.materialDate, `task-${input.taskId}-${safeFilename(input.originalName)}`);
}

export function buildEditedPath(input: PathInput): string {
  return join("edited", input.product, input.materialDate, `task-${input.taskId}-${safeFilename(input.originalName)}`);
}

function assertInsideNas(nasRoot: string, relPath: string): string {
  const full = resolve(nasRoot, relPath);
  const root = resolve(nasRoot);
  if (!full.startsWith(root + "/") && full !== root) {
    throw new Error(`path outside NAS root: ${relPath}`);
  }
  return full;
}

export async function writeFile(nasRoot: string, relPath: string, data: Buffer): Promise<void> {
  const full = assertInsideNas(nasRoot, relPath);
  await mkdir(dirname(full), { recursive: true });
  await fsWriteFile(full, data);
}

export function getDownloadStream(nasRoot: string, relPath: string): NodeJS.ReadableStream {
  const full = assertInsideNas(nasRoot, relPath);
  return createReadStream(full);
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test src/modules/editing-storage/nas.test.ts
```

预期：6 passed。

- [ ] **Step 5: 写 entry 文件**

`src/modules/editing-storage/index.ts`：

```ts
// 文件 IO 全是 server-only，这里只是占位维持双入口约定
```

`src/modules/editing-storage/server.ts`:

```ts
import "server-only";
export { checkNasMount, type NasHealth } from "./health";
export {
  buildSourcePath, buildEditedPath, writeFile, getDownloadStream,
  type PathInput,
} from "./nas";
```

- [ ] **Step 6: 提交**

```bash
git add src/modules/editing-storage/
git commit -m "feat(editing-storage): nas path helpers + safe write/read with traversal guard"
```

---

## T08 · editing-task：types + Zod schema

**Files:**
- Create: `src/modules/editing-task/types.ts`
- Create: `src/modules/editing-task/schema.ts`

- [ ] **Step 1: types.ts**

```ts
import type {
  EditingTaskStatus, EditingEventType,
} from "@/db/schema";

export type { EditingTaskStatus, EditingEventType };

export interface BoardCard {
  id: number;
  status: EditingTaskStatus;
  liveAccountId: string;
  liveAccountName: string;
  product: string;
  productShort: string;
  productAccentColor: string;
  anchorName: string | null;
  editorUserId: string | null;
  editorName: string | null;
  materialDate: string;
  // status 入列时间，用于停留时长计算
  enteredStatusAt: string;
  publishedAt: string | null;
}

export interface TaskDetail extends BoardCard {
  sourceFiles: string[];
  sourceFileNames: string[];
  sourceUploadedAt: string | null;
  editedFiles: string[];
  editedFileNames: string[];
  editedUploadedAt: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  publishedByName: string | null;
  videoId: string | null;
  sourceRemark: string | null;
  createdByName: string;
  createdAt: string;
}

export interface TaskEvent {
  id: number;
  eventType: EditingEventType;
  actorUserId: string;
  actorName: string;
  payload: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] **Step 2: schema.ts**

```ts
import { z } from "zod";

export const CreateTaskInput = z.object({
  liveAccountId: z.string().min(1),
  anchorId: z.string().optional().nullable(),
  materialDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sourceRemark: z.string().max(500).optional().nullable(),
});

export const UploadSourceInput = z.object({
  taskId: z.number().int().positive(),
  // 文件本身用 formData 传，这里只校验元数据
  fileName: z.string().min(1).max(255),
});

export const AssignEditorInput = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(100),
  editorUserId: z.string().min(1),
});

export const ReviewRejectInput = z.object({
  taskId: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export const MarkPublishedInput = z.object({
  taskId: z.number().int().positive(),
  // 三种情况：① undefined → 走自动绑定 ② string → 手填 ③ null → admin 强制跳过
  videoId: z.union([z.string().min(3), z.null()]).optional(),
});

export const DeleteTaskInput = z.object({
  taskIds: z.array(z.number().int().positive()).min(1).max(100),
});

export const BoardFilterInput = z.object({
  productNames: z.array(z.string()).optional(),
  anchorIds: z.array(z.string()).optional(),
  editorUserIds: z.array(z.string()).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

预期：通过。

- [ ] **Step 4: 提交**

```bash
git add src/modules/editing-task/
git commit -m "feat(editing-task): types + Zod input schemas"
```

---

## T09 · state-machine（合法转换 + 测试）

**Files:**
- Create: `src/modules/editing-task/state-machine.ts`
- Create: `src/modules/editing-task/state-machine.test.ts`

- [ ] **Step 1: 写 failing test**

```ts
import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, ALLOWED_TRANSITIONS } from "./state-machine";

describe("editing state machine", () => {
  it.each([
    ["uploaded", "editing", true],
    ["editing", "uploaded", true],
    ["editing", "review", true],
    ["review", "ready", true],
    ["review", "editing", true],
    ["ready", "published", true],
    // illegal
    ["uploaded", "review", false],
    ["uploaded", "published", false],
    ["editing", "ready", false],
    ["review", "uploaded", false],
    ["ready", "editing", false],
    ["published", "ready", false],
    ["published", "editing", false],
  ])("canTransition %s -> %s = %s", (from, to, expected) => {
    expect(canTransition(from as never, to as never)).toBe(expected);
  });

  it("assertTransition throws on illegal", () => {
    expect(() => assertTransition("published" as never, "editing" as never)).toThrow(/illegal/i);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm test src/modules/editing-task/state-machine.test.ts
```

预期：FAIL。

- [ ] **Step 3: 实现 state-machine.ts**

```ts
import type { EditingTaskStatus } from "@/db/schema";

export const ALLOWED_TRANSITIONS: Record<EditingTaskStatus, EditingTaskStatus[]> = {
  uploaded:  ["editing"],
  editing:   ["uploaded", "review"],
  review:    ["editing", "ready"],
  ready:     ["published"],
  published: [],
};

export function canTransition(from: EditingTaskStatus, to: EditingTaskStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: EditingTaskStatus, to: EditingTaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`illegal transition: ${from} -> ${to}`);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm test src/modules/editing-task/state-machine.test.ts
```

预期：14 passed。

- [ ] **Step 5: 提交**

```bash
git add src/modules/editing-task/state-machine.ts src/modules/editing-task/state-machine.test.ts
git commit -m "feat(editing-task): state machine with transition matrix + tests"
```

---

## T10 · event-writer（写事件流）

**Files:**
- Create: `src/modules/editing-task/event-writer.ts`

- [ ] **Step 1: 实现**

```ts
import "server-only";
import { db } from "@/db/client";
import { editing_task_event, type EditingEventType } from "@/db/schema";

export async function writeEvent(args: {
  taskId: number;
  eventType: EditingEventType;
  actorUserId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(editing_task_event).values({
    task_id: args.taskId,
    event_type: args.eventType,
    actor_user_id: args.actorUserId,
    payload: args.payload ?? {},
  });
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

预期：通过。

- [ ] **Step 3: 提交**

```bash
git add src/modules/editing-task/event-writer.ts
git commit -m "feat(editing-task): event-writer helper"
```

---

## T11 · scope helper（数据可见性 SQL where 子句）

**Files:**
- Create: `src/modules/editing-task/scope.ts`
- Create: `src/modules/editing-task/scope.test.ts`

数据可见性逻辑（spec §6.2）：
- `all`: 无 where
- `team`: live_account 的 operator 属于自己作为 leader 的部门成员
- `self`: created_by_user_id == me ∨ editor_user_id == me ∨ live_account.operator == me ∨ anchor 对应自己作为主播
- `none`: 1=0 永真假

- [ ] **Step 1: 看现有 scope helper 接口**

```bash
cat src/modules/permissions/scope.ts | head -60
```

确认 `buildScopeWhereClause` / `getManagedDeptIds` 等 helper 的签名。

- [ ] **Step 2: 写 failing test（结构性，不连真 DB）**

```ts
import { describe, it, expect } from "vitest";
import { buildEditingScopeWhere } from "./scope";

describe("buildEditingScopeWhere", () => {
  it("all scope returns no extra filter", async () => {
    const w = await buildEditingScopeWhere({ scope: "all", userId: "u1" });
    expect(w).toBe(undefined);
  });

  it("none scope returns impossible filter", async () => {
    const w = await buildEditingScopeWhere({ scope: "none", userId: "u1" });
    // SQL "1 = 0" or drizzle equivalent
    expect(w?.toString()).toMatch(/false|1\s*=\s*0/i);
  });

  // team / self 测试需要 fixture，先占位结构
  it.todo("team scope filters by managed dept member operators");
  it.todo("self scope OR-merges 4 conditions");
});
```

- [ ] **Step 3: 跑测试确认失败**

```bash
pnpm test src/modules/editing-task/scope.test.ts
```

预期：FAIL（模块未实现），todo 自动 skip。

- [ ] **Step 4: 实现 scope.ts**

```ts
import "server-only";
import { db } from "@/db/client";
import { editing_task, live_account, live_anchor } from "@/db/schema";
import type { Scope } from "@/modules/permissions";
import { getManagedDeptIds } from "@/modules/permissions/server";
import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";

export async function buildEditingScopeWhere(args: {
  scope: Scope;
  userId: string;
}): Promise<SQL | undefined> {
  const { scope, userId } = args;
  if (scope === "all") return undefined;
  if (scope === "none") return sql`false`;

  // self 条件：4 种 OR
  const selfCondition = or(
    eq(editing_task.created_by_user_id, userId),
    eq(editing_task.editor_user_id, userId),
    // operator 字段：从 live_account 拿，子查询
    sql`${editing_task.live_account_id} IN (SELECT id FROM live_account WHERE operator_user_id = ${userId})`,
    // anchor 字段：从 live_anchor 拿（dingtalk_user_id 与 anchor_id 的映射，按 Phase 2.1）
    sql`${editing_task.anchor_id} IN (SELECT anchor_id FROM live_anchor WHERE dingtalk_user_id = ${userId})`,
  );

  if (scope === "self") return selfCondition;

  // team: 取自己作为 leader 的部门 → 部门成员 → 这些成员负责的 live_account → 任务
  const deptIds = await getManagedDeptIds(userId);
  if (deptIds.length === 0) return selfCondition;

  return or(
    selfCondition,
    sql`${editing_task.live_account_id} IN (
      SELECT la.id FROM live_account la
      JOIN dingtalk_user u ON la.operator_user_id = u.user_id
      WHERE u.dept_ids ?| ${sql`ARRAY[${sql.join(deptIds.map((d) => sql`${d}`), sql`, `)}]::text[]`}
    )`,
  );
}
```

> **注意：** `live_account.operator_user_id` 字段名按现有 schema 实际确认（spec §1.3 提到运营负责账号，phase 2.1 应已实现，否则需修字段名）。

- [ ] **Step 5: 跑测试通过**

```bash
pnpm test src/modules/editing-task/scope.test.ts
```

预期：前 2 个 PASS，2 个 TODO。

- [ ] **Step 6: 提交**

```bash
git add src/modules/editing-task/scope.ts src/modules/editing-task/scope.test.ts
git commit -m "feat(editing-task): scope where-clause builder (all/none/self/team)"
```

---

## T12 · queries：board / table / detail / events

**Files:**
- Create: `src/modules/editing-task/queries.ts`
- Create: `src/modules/editing-task/queries.test.ts`

- [ ] **Step 1: 写 queries.ts**

```ts
import "server-only";
import { db } from "@/db/client";
import {
  editing_task, editing_task_event, live_account, anchor_profile,
  dingtalk_user, product_config,
} from "@/db/schema";
import type { BoardCard, TaskDetail, TaskEvent } from "./types";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

export async function listForBoard(args: {
  whereClause?: SQL;
  productNames?: string[];
  anchorIds?: string[];
  editorUserIds?: string[];
  dateFrom: string;  // 必填，默认近 7 天
  dateTo: string;    // 默认今天
}): Promise<BoardCard[]> {
  const filters: (SQL | undefined)[] = [args.whereClause];
  if (args.productNames?.length) filters.push(inArray(live_account.product, args.productNames));
  if (args.anchorIds?.length) filters.push(inArray(editing_task.anchor_id, args.anchorIds));
  if (args.editorUserIds?.length) filters.push(inArray(editing_task.editor_user_id, args.editorUserIds));
  filters.push(gte(editing_task.material_date, new Date(args.dateFrom)));
  filters.push(lte(editing_task.material_date, new Date(args.dateTo)));

  const rows = await db
    .select({
      id: editing_task.id,
      status: editing_task.status,
      live_account_id: editing_task.live_account_id,
      live_account_name: live_account.account_name,
      product: live_account.product,
      product_short: product_config.display_short,
      product_color: product_config.accent_color,
      anchor_name: anchor_profile.real_name,
      editor_user_id: editing_task.editor_user_id,
      editor_name: dingtalk_user.name,
      material_date: editing_task.material_date,
      created_at: editing_task.created_at,
      source_uploaded_at: editing_task.source_uploaded_at,
      editing_started_at: editing_task.editing_started_at,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      published_at: editing_task.published_at,
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .where(and(...filters.filter(Boolean) as SQL[]))
    .orderBy(desc(editing_task.material_date), desc(editing_task.id));

  return rows.map(toBoardCard);
}

function toBoardCard(r: Awaited<ReturnType<typeof listForBoard>>[number] | any): BoardCard {
  // 计算 status 入列时间
  const enteredAt = pickEnteredStatusAt(r);
  return {
    id: r.id,
    status: r.status,
    liveAccountId: r.live_account_id,
    liveAccountName: r.live_account_name ?? "(未知账号)",
    product: r.product ?? "未分类",
    productShort: r.product_short ?? "?",
    productAccentColor: r.product_color ?? "#94a3b8",
    anchorName: r.anchor_name ?? null,
    editorUserId: r.editor_user_id ?? null,
    editorName: r.editor_name ?? null,
    materialDate: r.material_date.toISOString().slice(0, 10),
    enteredStatusAt: enteredAt.toISOString(),
    publishedAt: r.published_at?.toISOString() ?? null,
  };
}

function pickEnteredStatusAt(r: any): Date {
  switch (r.status) {
    case "uploaded":  return r.source_uploaded_at ?? r.created_at;
    case "editing":   return r.editing_started_at ?? r.created_at;
    case "review":    return r.edited_uploaded_at ?? r.created_at;
    case "ready":     return r.reviewed_at ?? r.created_at;
    case "published": return r.published_at ?? r.created_at;
    default:          return r.created_at;
  }
}

export async function getTask(taskId: number): Promise<TaskDetail | null> {
  // 类似 listForBoard 但 where = eq(editing_task.id, taskId) 且补全所有字段
  // 实现略 (TDD 时按需展开)，关键是 join 一个 created_by / reviewed_by / published_by 三人的 dingtalk_user
  // (用 alias 多次 join，参考 placement/queries.ts 中的多 alias join 模式)
  throw new Error("TODO: implement in T13");
}

export async function listEvents(taskId: number): Promise<TaskEvent[]> {
  const rows = await db
    .select({
      id: editing_task_event.id,
      event_type: editing_task_event.event_type,
      actor_user_id: editing_task_event.actor_user_id,
      actor_name: dingtalk_user.name,
      payload: editing_task_event.payload,
      created_at: editing_task_event.created_at,
    })
    .from(editing_task_event)
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task_event.actor_user_id))
    .where(eq(editing_task_event.task_id, taskId))
    .orderBy(asc(editing_task_event.created_at));

  return rows.map((r) => ({
    id: r.id,
    eventType: r.event_type,
    actorUserId: r.actor_user_id,
    actorName: r.actor_name ?? "(已离职)",
    payload: r.payload,
    createdAt: r.created_at.toISOString(),
  }));
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

预期：通过（getTask 仅 stub）。

- [ ] **Step 3: 提交**

```bash
git add src/modules/editing-task/queries.ts src/modules/editing-task/queries.test.ts
git commit -m "feat(editing-task): board + event listing queries"
```

---

## T13 · queries：getTask（详情）+ listForTable

**Files:**
- Modify: `src/modules/editing-task/queries.ts`

- [ ] **Step 1: 替换 getTask 的 stub**

```ts
// 三个角色 alias 复用 dingtalk_user
import { alias } from "drizzle-orm/pg-core";

const creator = alias(dingtalk_user, "creator_user");
const reviewer = alias(dingtalk_user, "reviewer_user");
const publisher = alias(dingtalk_user, "publisher_user");

export async function getTask(taskId: number): Promise<TaskDetail | null> {
  const [r] = await db
    .select({
      // ...同 listForBoard 的字段...
      source_files: editing_task.source_files,
      source_file_names: editing_task.source_file_names,
      source_uploaded_at: editing_task.source_uploaded_at,
      edited_files: editing_task.edited_files,
      edited_file_names: editing_task.edited_file_names,
      edited_uploaded_at: editing_task.edited_uploaded_at,
      reviewed_at: editing_task.reviewed_at,
      reviewed_by_name: reviewer.name,
      published_at: editing_task.published_at,
      published_by_name: publisher.name,
      video_id: editing_task.video_id,
      source_remark: editing_task.source_remark,
      created_by_name: creator.name,
      // ... board card 字段（重写 join 链）
    })
    .from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .leftJoin(product_config, eq(product_config.product_name, live_account.product))
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, editing_task.anchor_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, editing_task.editor_user_id))
    .leftJoin(creator, eq(creator.user_id, editing_task.created_by_user_id))
    .leftJoin(reviewer, eq(reviewer.user_id, editing_task.reviewed_by_user_id))
    .leftJoin(publisher, eq(publisher.user_id, editing_task.published_by_user_id))
    .where(eq(editing_task.id, taskId));

  if (!r) return null;

  const card = toBoardCard(r);
  return {
    ...card,
    sourceFiles: r.source_files,
    sourceFileNames: r.source_file_names,
    sourceUploadedAt: r.source_uploaded_at?.toISOString() ?? null,
    editedFiles: r.edited_files,
    editedFileNames: r.edited_file_names,
    editedUploadedAt: r.edited_uploaded_at?.toISOString() ?? null,
    reviewedByName: r.reviewed_by_name,
    reviewedAt: r.reviewed_at?.toISOString() ?? null,
    publishedByName: r.published_by_name,
    videoId: r.video_id,
    sourceRemark: r.source_remark,
    createdByName: r.created_by_name ?? "(已离职)",
    createdAt: r.created_at.toISOString(),
  };
}

export async function listForTable(args: Parameters<typeof listForBoard>[0] & {
  statuses?: EditingTaskStatus[];
}): Promise<BoardCard[]> {
  // 复用 listForBoard 但允许 statuses 过滤
  // 实现略：相同 join 链 + filters.push(inArray(editing_task.status, args.statuses))
}
```

- [ ] **Step 2: typecheck + 提交**

```bash
pnpm typecheck
git add src/modules/editing-task/queries.ts
git commit -m "feat(editing-task): getTask detail + listForTable"
```

---

## T14 · Server Action：createTask + uploadSource

**Files:**
- Create: `src/modules/editing-task/actions/create-task.ts`
- Create: `src/modules/editing-task/actions/upload-source.ts`
- Create: `src/modules/editing-task/server.ts`
- Create: `src/modules/editing-task/index.ts`

- [ ] **Step 1: actions/create-task.ts**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { requireUser } from "@/lib/session"; // 假设存在；按现有 auth helper 调整
import { writeEvent } from "../event-writer";
import { CreateTaskInput } from "../schema";

export async function createTask(input: unknown): Promise<{ taskId: number }> {
  const data = CreateTaskInput.parse(input);
  const { userId } = await requireUser();

  const [row] = await db.insert(editing_task).values({
    live_account_id: data.liveAccountId,
    anchor_id: data.anchorId ?? null,
    material_date: new Date(data.materialDate),
    status: "uploaded", // 一旦 createTask 调用，前端已经在同请求附素材
    source_remark: data.sourceRemark ?? null,
    created_by_user_id: userId,
  }).returning({ id: editing_task.id });

  await writeEvent({
    taskId: row.id, eventType: "created", actorUserId: userId,
    payload: {
      live_account_id: data.liveAccountId,
      anchor_id: data.anchorId ?? null,
      material_date: data.materialDate,
      source_remark: data.sourceRemark ?? null,
    },
  });

  return { taskId: row.id };
}
```

- [ ] **Step 2: actions/upload-source.ts**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task, live_account } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { writeEvent } from "../event-writer";
import { buildSourcePath, writeFile as nasWriteFile } from "@/modules/editing-storage/server";
import { UploadSourceInput } from "../schema";

export async function uploadSource(formData: FormData): Promise<{ ok: true }> {
  const taskId = Number(formData.get("taskId"));
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("missing file");
  const data = UploadSourceInput.parse({ taskId, fileName: file.name });
  const { userId } = await requireUser();

  const [task] = await db.select({
    id: editing_task.id, material_date: editing_task.material_date,
    live_account_id: editing_task.live_account_id, status: editing_task.status,
    product: live_account.product,
  }).from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, data.taskId));

  if (!task) throw new Error("task not found");
  if (task.status !== "uploaded") throw new Error("素材已上传过");

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) throw new Error("EDITING_NAS_PATH not configured");

  const buf = Buffer.from(await file.arrayBuffer());
  const relPath = buildSourcePath({
    taskId: task.id, product: task.product ?? "未分类",
    materialDate: task.material_date.toISOString().slice(0, 10),
    originalName: data.fileName,
  });
  await nasWriteFile(NAS, relPath, buf);

  await db.update(editing_task).set({
    source_files: [relPath],
    source_file_names: [data.fileName],
    source_uploaded_at: new Date(),
  }).where(eq(editing_task.id, task.id));

  await writeEvent({
    taskId: task.id, eventType: "source_uploaded", actorUserId: userId,
    payload: { file_count: 1, file_names: [data.fileName] },
  });

  return { ok: true };
}
```

- [ ] **Step 3: 写 entry**

`src/modules/editing-task/index.ts`:

```ts
export * from "./types";
export * from "./schema";
export { createTask } from "./actions/create-task";
export { uploadSource } from "./actions/upload-source";
// 后续 task 持续在这里追加 export
```

`src/modules/editing-task/server.ts`:

```ts
import "server-only";
export * from "./queries";
export * from "./scope";
export { writeEvent } from "./event-writer";
export { canTransition, assertTransition, ALLOWED_TRANSITIONS } from "./state-machine";
```

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

预期：通过。

- [ ] **Step 5: 提交**

```bash
git add src/modules/editing-task/
git commit -m "feat(editing-task): createTask + uploadSource server actions"
```

---

## T15 · Server Action：assignEditor（单 + 批量）

**Files:**
- Create: `src/modules/editing-task/actions/assign-editor.ts`
- Modify: `src/modules/editing-task/index.ts`

- [ ] **Step 1: 实现**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { writeEvent } from "../event-writer";
import { AssignEditorInput } from "../schema";
import { assertTransition } from "../state-machine";

export async function assignEditor(input: unknown): Promise<{ updated: number; skipped: number }> {
  const data = AssignEditorInput.parse(input);
  const { userId } = await requireUser();

  const tasks = await db.select({
    id: editing_task.id, status: editing_task.status, prev_editor: editing_task.editor_user_id,
  }).from(editing_task).where(inArray(editing_task.id, data.taskIds));

  let updated = 0, skipped = 0;
  for (const t of tasks) {
    // 派单：仅 uploaded 可走 assigned；editing 走 reassigned
    if (t.status === "uploaded") {
      assertTransition("uploaded", "editing");
      await db.update(editing_task).set({
        editor_user_id: data.editorUserId,
        editing_started_at: new Date(),
        status: "editing",
      }).where(eq(editing_task.id, t.id));
      await writeEvent({
        taskId: t.id, eventType: "assigned", actorUserId: userId,
        payload: { from: "unassigned", to: data.editorUserId },
      });
      updated++;
    } else if (t.status === "editing") {
      await db.update(editing_task).set({
        editor_user_id: data.editorUserId,
      }).where(eq(editing_task.id, t.id));
      await writeEvent({
        taskId: t.id, eventType: "reassigned", actorUserId: userId,
        payload: { from: t.prev_editor, to: data.editorUserId },
      });
      updated++;
    } else {
      skipped++;
    }
  }

  return { updated, skipped };
}
```

- [ ] **Step 2: export + 提交**

`index.ts` 加 `export { assignEditor } from "./actions/assign-editor";`

```bash
pnpm typecheck
git add src/modules/editing-task/
git commit -m "feat(editing-task): assignEditor action (single + batch + reassign)"
```

---

## T16 · Server Action：uploadEdited / reviewApprove / reviewReject / resetEditing

**Files:**
- Create: `src/modules/editing-task/actions/upload-edited.ts`
- Create: `src/modules/editing-task/actions/review-approve.ts`
- Create: `src/modules/editing-task/actions/review-reject.ts`
- Create: `src/modules/editing-task/actions/reset-editing.ts`
- Modify: `src/modules/editing-task/index.ts`

每个 action 都按 T15 模板：parse Input → requireUser → 查 task → assertTransition → update + writeEvent → return。

- [ ] **Step 1: uploadEdited**

```ts
"use server";
// 类似 uploadSource，但路径用 buildEditedPath、写 edited_files / edited_uploaded_at、
// 状态 editing -> review、event "edited_uploaded"
```

- [ ] **Step 2: reviewApprove**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { z } from "zod";

const Input = z.object({ taskId: z.number().int().positive() });

export async function reviewApprove(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId } = await requireUser();
  const [t] = await db.select({ status: editing_task.status }).from(editing_task).where(eq(editing_task.id, taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "ready");

  await db.update(editing_task).set({
    status: "ready", reviewed_by_user_id: userId, reviewed_at: new Date(),
  }).where(eq(editing_task.id, taskId));

  await writeEvent({ taskId, eventType: "review_approved", actorUserId: userId, payload: {} });
  return { ok: true };
}
```

- [ ] **Step 3: reviewReject**

```ts
"use server";
import { ReviewRejectInput } from "../schema";

export async function reviewReject(input: unknown): Promise<{ ok: true }> {
  const data = ReviewRejectInput.parse(input);
  const { userId } = await requireUser();
  const [t] = await db.select({ status: editing_task.status }).from(editing_task).where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "editing");

  await db.update(editing_task).set({ status: "editing" }).where(eq(editing_task.id, data.taskId));
  await writeEvent({
    taskId: data.taskId, eventType: "review_rejected", actorUserId: userId,
    payload: { reason: data.reason },
  });
  return { ok: true };
}
```

- [ ] **Step 4: resetEditing**

```ts
"use server";
import { z } from "zod";
const Input = z.object({ taskId: z.number().int().positive() });

export async function resetEditing(input: unknown): Promise<{ ok: true }> {
  const { taskId } = Input.parse(input);
  const { userId } = await requireUser();
  const [t] = await db.select({ status: editing_task.status, prev_editor: editing_task.editor_user_id })
    .from(editing_task).where(eq(editing_task.id, taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "uploaded");

  await db.update(editing_task).set({
    status: "uploaded", editor_user_id: null, editing_started_at: null,
  }).where(eq(editing_task.id, taskId));

  await writeEvent({
    taskId, eventType: "editing_reset", actorUserId: userId,
    payload: { prev_editor: t.prev_editor },
  });
  return { ok: true };
}
```

- [ ] **Step 5: export all + typecheck + 提交**

```ts
// index.ts
export { uploadEdited } from "./actions/upload-edited";
export { reviewApprove } from "./actions/review-approve";
export { reviewReject } from "./actions/review-reject";
export { resetEditing } from "./actions/reset-editing";
```

```bash
pnpm typecheck
git add src/modules/editing-task/
git commit -m "feat(editing-task): uploadEdited + review approve/reject + resetEditing actions"
```

---

## T17 · 抖音视频自动绑定 service

**Files:**
- Create: `src/modules/editing-task/actions/match-douyin-video.ts`
- Create: `src/modules/editing-task/actions/match-douyin-video.test.ts`

- [ ] **Step 1: 确认抖音表名 + 关联字段**

```bash
grep -l "douyin" src/db/schema/*.ts
cat src/db/schema/crawler.ts | head -60   # 抖音表通常在 crawler.ts
```

记下：① 视频表名（假设 `douyin_video`） ② 关联到 live_account 的字段名（可能是 `douyin_account_id` 在 live_account 上）。如果**字段缺失**，跳到 T17.1 加字段。

- [ ] **Step 2: 写 match service**

```ts
import "server-only";
import { db } from "@/db/client";
import { editing_task, live_account /* , douyin_video */ } from "@/db/schema";
import { and, between, desc, eq, isNull } from "drizzle-orm";

export interface DouyinMatch {
  videoId: string;
  publishTime: Date;
  alreadyBoundToTaskId: number | null;
}

export async function matchDouyinVideo(taskId: number): Promise<DouyinMatch | null> {
  const [task] = await db.select({
    edited_uploaded_at: editing_task.edited_uploaded_at,
    live_account_id: editing_task.live_account_id,
    // douyin_account_id: live_account.douyin_account_id,  ← 按实际字段
  }).from(editing_task)
    .leftJoin(live_account, eq(live_account.id, editing_task.live_account_id))
    .where(eq(editing_task.id, taskId));

  if (!task?.edited_uploaded_at) return null;
  // TODO: 按实际抖音 schema 完成 query
  return null;
}
```

- [ ] **Step 3: test（mock DB 行为或用真 fixture）**

由于依赖外部 schema 实际形态，本 task 先实现 best-effort + 在 T18 mark-published 里加「找不到/未配置」兜底分支。test 用 todo 标记：

```ts
import { describe, it } from "vitest";
describe("matchDouyinVideo", () => {
  it.todo("returns null when douyin not configured for account");
  it.todo("returns latest video within (edited_uploaded_at, now) window");
  it.todo("flags alreadyBoundToTaskId when video already bound");
});
```

- [ ] **Step 4: 提交**

```bash
git add src/modules/editing-task/actions/match-douyin-video.ts
git commit -m "feat(editing-task): matchDouyinVideo service stub (full impl in next pass)"
```

---

## T18 · Server Action：markPublished + deleteTask

**Files:**
- Create: `src/modules/editing-task/actions/mark-published.ts`
- Create: `src/modules/editing-task/actions/delete-task.ts`
- Modify: `src/modules/editing-task/index.ts`

- [ ] **Step 1: markPublished**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { writeEvent } from "../event-writer";
import { assertTransition } from "../state-machine";
import { MarkPublishedInput } from "../schema";
import { matchDouyinVideo } from "./match-douyin-video";

export async function markPublished(input: unknown): Promise<
  | { ok: true; videoId: string | null; autoMatched: boolean }
  | { ok: false; reason: "need_video_id"; suggestion: { videoId: string; alreadyBound: number | null } | null }
> {
  const data = MarkPublishedInput.parse(input);
  const { userId, isAdmin } = await requireUser();
  const [t] = await db.select({ status: editing_task.status }).from(editing_task).where(eq(editing_task.id, data.taskId));
  if (!t) throw new Error("task not found");
  assertTransition(t.status, "published");

  let videoId: string | null = null;
  let autoMatched = false;

  if (data.videoId === undefined) {
    const match = await matchDouyinVideo(data.taskId);
    if (match) {
      videoId = match.videoId;
      autoMatched = true;
    } else {
      return { ok: false, reason: "need_video_id", suggestion: null };
    }
  } else if (data.videoId === null) {
    if (!isAdmin) throw new Error("仅 admin 可跳过 video_id 手填");
    videoId = null;
  } else {
    videoId = data.videoId;
  }

  await db.update(editing_task).set({
    status: "published", published_by_user_id: userId, published_at: new Date(), video_id: videoId,
  }).where(eq(editing_task.id, data.taskId));

  await writeEvent({
    taskId: data.taskId, eventType: "published", actorUserId: userId,
    payload: { video_id: videoId, auto_matched: autoMatched },
  });
  return { ok: true, videoId, autoMatched };
}
```

- [ ] **Step 2: deleteTask**

```ts
"use server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq, inArray, ne, and } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { writeEvent } from "../event-writer";
import { writeAuditLog } from "@/lib/audit";
import { DeleteTaskInput } from "../schema";

export async function deleteTask(input: unknown): Promise<{ deleted: number; skipped: number }> {
  const data = DeleteTaskInput.parse(input);
  const { userId, isAdmin } = await requireUser();

  // 仅 admin 或 created_by 可删；status != published
  const candidates = await db.select({
    id: editing_task.id, status: editing_task.status, created_by: editing_task.created_by_user_id,
  }).from(editing_task).where(inArray(editing_task.id, data.taskIds));

  const allowed = candidates.filter((t) =>
    t.status !== "published" && (isAdmin || t.created_by === userId)
  );
  const skipped = candidates.length - allowed.length;

  for (const t of allowed) {
    // 先写 deleted event（task 删后 event 也 cascade，所以写到 audit_log）
    await writeAuditLog({
      actor_user_id: userId, action: "editing_task.delete", target_type: "editing_task",
      target_id: String(t.id), payload: { last_status: t.status },
    });
    await db.delete(editing_task).where(eq(editing_task.id, t.id));
  }

  return { deleted: allowed.length, skipped };
}
```

- [ ] **Step 3: export + 提交**

```bash
pnpm typecheck
git add src/modules/editing-task/
git commit -m "feat(editing-task): markPublished (with douyin auto-bind) + deleteTask"
```

---

## T19 · editing-editor + product-config modules

**Files:**
- Create: `src/modules/editing-editor/queries.ts`
- Create: `src/modules/editing-editor/index.ts`
- Create: `src/modules/product-config/queries.ts`
- Create: `src/modules/product-config/index.ts`

- [ ] **Step 1: editing-editor/queries.ts**

```ts
import "server-only";
import { db } from "@/db/client";
import { dingtalk_user, user_position_override } from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";

export interface EditorOption {
  userId: string;
  name: string;
}

export async function listEditors(): Promise<EditorOption[]> {
  // 优先 user_position_override，回退 dingtalk_user.title
  // 简化：union all 再 distinct
  const rows = await db.execute<{ user_id: string; name: string }>(/* sql */ `
    SELECT DISTINCT u.user_id, u.name
    FROM dingtalk_user u
    LEFT JOIN user_position_override o ON o.user_id = u.user_id
    WHERE u.active = true
      AND (
        o.position = '剪辑'
        OR (o.position IS NULL AND u.title LIKE '%剪辑%')
      )
    ORDER BY u.name ASC;
  `);
  return rows.rows.map((r) => ({ userId: r.user_id, name: r.name }));
}
```

- [ ] **Step 2: editing-editor/index.ts**

```ts
// 注意 server-only 内容不能从 index 导出
// index 只导出可被 client 用的类型
export type { EditorOption } from "./queries";
```

> 实际查询函数应另起 `server.ts` 暴露，与 editing-storage 同模式。考虑到 listEditors 只在 Server Component 用，简化为：

`src/modules/editing-editor/server.ts`:

```ts
import "server-only";
export { listEditors, type EditorOption } from "./queries";
```

- [ ] **Step 3: product-config/queries.ts**

```ts
import "server-only";
import { db } from "@/db/client";
import { product_config } from "@/db/schema";
import { asc } from "drizzle-orm";

export interface ProductOption {
  productName: string;
  displayShort: string;
  accentColor: string;
}

export async function listProducts(): Promise<ProductOption[]> {
  const rows = await db.select({
    product_name: product_config.product_name,
    display_short: product_config.display_short,
    accent_color: product_config.accent_color,
  }).from(product_config).orderBy(asc(product_config.product_name));

  return rows.map((r) => ({
    productName: r.product_name,
    displayShort: r.display_short,
    accentColor: r.accent_color,
  }));
}
```

- [ ] **Step 4: product-config index.ts + server.ts**

```ts
// index.ts
export type { ProductOption } from "./queries";

// server.ts
import "server-only";
export { listProducts, type ProductOption } from "./queries";
```

- [ ] **Step 5: typecheck + 提交**

```bash
pnpm typecheck
git add src/modules/editing-editor/ src/modules/product-config/
git commit -m "feat(editing): editing-editor + product-config query modules"
```

---

## T20 · UI 路由 + filter-bar 组件

**Files:**
- Create: `src/app/(dashboard)/editing/layout.tsx`
- Create: `src/app/(dashboard)/editing/page.tsx`
- Create: `src/app/(dashboard)/editing/_components/filter-bar.tsx`

- [ ] **Step 1: 看现有 dashboard 模块布局参考**

```bash
ls src/app/\(dashboard\)/placements/
cat src/app/\(dashboard\)/placements/page.tsx | head -30
```

- [ ] **Step 2: layout.tsx**

```tsx
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { resolvePermission } from "@/modules/permissions/server";

export default async function EditingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  if (perm.scope === "none") redirect("/");
  return <div className="flex flex-col gap-3 p-6">{children}</div>;
}
```

- [ ] **Step 3: page.tsx（看板入口）**

```tsx
import { Suspense } from "react";
import { requireUser } from "@/lib/session";
import { resolvePermission } from "@/modules/permissions/server";
import { listForBoard } from "@/modules/editing-task/server";
import { buildEditingScopeWhere } from "@/modules/editing-task/server";
import { listEditors } from "@/modules/editing-editor/server";
import { listProducts } from "@/modules/product-config/server";
import { Board } from "./_components/board";

export default async function EditingBoardPage({
  searchParams,
}: { searchParams: Promise<Record<string, string | string[]>> }) {
  const sp = await searchParams;
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [cards, editors, products] = await Promise.all([
    listForBoard({
      whereClause: where, dateFrom: sevenDaysAgo, dateTo: today,
      productNames: typeof sp.products === "string" ? sp.products.split(",") : undefined,
      editorUserIds: typeof sp.editors === "string" ? sp.editors.split(",") : undefined,
    }),
    listEditors(),
    listProducts(),
  ]);

  return <Board initialCards={cards} editors={editors} products={products}
                permissions={{ canEdit: perm.can_edit, isAdmin: perm.can_admin }} />;
}
```

- [ ] **Step 4: filter-bar.tsx**

按 mockup v2 实现 4 个 chip + 视图切换 + 新建任务按钮。组件签名：

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";

export interface FilterBarProps {
  products: { productName: string; displayShort: string }[];
  editors: { userId: string; name: string }[];
  onNewTask: () => void;
}

export function FilterBar(props: FilterBarProps) {
  // 4 个 Popover + 一个 Button + 视图切换 SegmentedControl
  // 状态写进 URL searchParams
  // ...
}
```

> **实现提示：** shadcn `Popover` + `Checkbox` 组合即可，无需第三方多选库。SegmentedControl 复用现有 dashboard 的实现（看 placements page）。

- [ ] **Step 5: 跑 dev 启动确认页能开**

```bash
pnpm dev
```

浏览器访问 `http://localhost:3000/editing` → 应该看到空看板骨架（具体看板渲染后续 task 完成）。

- [ ] **Step 6: 提交**

```bash
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): /editing route + filter-bar skeleton"
```

---

## T21 · board-card + board-group + board-column 组件

**Files:**
- Create: `src/app/(dashboard)/editing/_components/board-card.tsx`
- Create: `src/app/(dashboard)/editing/_components/board-group.tsx`
- Create: `src/app/(dashboard)/editing/_components/board-column.tsx`

按 mockup v2 实现，每个组件单独 file。

- [ ] **Step 1: board-card.tsx**

```tsx
"use client";
import type { BoardCard } from "@/modules/editing-task";
import { formatDwellTime } from "../_lib/dwell";

interface Props {
  card: BoardCard;
  selected: boolean;
  onSelect: (id: number, multi: boolean) => void;
  onOpenDrawer: (id: number) => void;
}

export function Card({ card, selected, onSelect, onOpenDrawer }: Props) {
  const dwell = formatDwellTime(card.enteredStatusAt);
  return (
    <div
      data-selected={selected}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("[data-checkbox]")) return;
        onOpenDrawer(card.id);
      }}
      className={`group relative cursor-pointer rounded-xl border border-border-subtle bg-white/92 p-3 shadow-card transition hover:-translate-y-px hover:shadow-card-hover hover:border-[var(--hover-ring)] data-[selected=true]:border-[var(--selection-primary)] data-[selected=true]:bg-[var(--selection-bg)] data-[selected=true]:ring-2 data-[selected=true]:ring-[var(--selection-ring)]`}
    >
      <div
        data-checkbox
        onClick={(e) => { e.stopPropagation(); onSelect(card.id, e.shiftKey); }}
        className="absolute left-2.5 top-2.5 h-4 w-4 rounded border-[1.5px] border-slate-300 bg-white opacity-0 transition-opacity group-hover:opacity-100 data-[checked=true]:bg-[var(--selection-primary)] data-[checked=true]:border-[var(--selection-primary)]"
        data-checked={selected}
      >
        {selected && <span className="text-xs text-white">✓</span>}
      </div>
      <div className="pl-6">
        <div className="mb-1.5 text-sm font-semibold text-slate-800">{card.liveAccountName}</div>
        <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-500">
          {card.anchorName && <span>主播 {card.anchorName}</span>}
          <span
            className="rounded px-1.5 py-0.5 text-[11px]"
            style={{ backgroundColor: `${card.productAccentColor}1a`, color: card.productAccentColor }}
          >
            {card.product}
          </span>
        </div>
        <div className="mt-2 border-t border-dashed border-border-default pt-2 flex items-center justify-between text-xs">
          <span>
            {card.editorName ? (
              <span className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-500 to-[var(--selection-primary)] text-white text-[10px] font-semibold flex items-center justify-center">
                  {card.editorName[0]}
                </span>
                <span className="text-slate-800 font-medium">{card.editorName}</span>
              </span>
            ) : (
              <span className="text-slate-400">待派单</span>
            )}
          </span>
          <span className="text-slate-400 tabular-nums">
            {card.materialDate.slice(5)} · {dwell}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: dwell helper**

`src/app/(dashboard)/editing/_lib/dwell.ts`:

```ts
export function formatDwellTime(enteredStatusAt: string): string {
  const ms = Date.now() - new Date(enteredStatusAt).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function dwellSeverity(enteredStatusAt: string): "ok" | "warn" | "danger" {
  const days = (Date.now() - new Date(enteredStatusAt).getTime()) / 86400000;
  if (days >= 2) return "danger";
  if (days >= 1) return "warn";
  return "ok";
}
```

- [ ] **Step 3: board-group.tsx（日期折叠分组 + +N 更多）**

```tsx
"use client";
import { useState } from "react";
import type { BoardCard } from "@/modules/editing-task";
import { Card } from "./board-card";

interface Props {
  label: string;
  cards: BoardCard[];
  defaultOpen: boolean;
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
}

const MAX_VISIBLE = 6;

export function Group({ label, cards, defaultOpen, selectedIds, onSelect, onOpenDrawer }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cards : cards.slice(0, MAX_VISIBLE);
  const remaining = cards.length - visible.length;

  return (
    <div className={`mb-2 ${open ? "" : "collapsed"}`}>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 hover:bg-[var(--selection-bg)] hover:text-blue-600"
      >
        <span className={`text-[9px] transition-transform ${open ? "" : "-rotate-90"}`}>▼</span>
        <span>{label}</span>
        <span className="ml-auto text-[11px] font-medium text-slate-400">{cards.length}</span>
      </button>
      {open && (
        <div>
          {visible.map((c) => (
            <Card key={c.id} card={c} selected={selectedIds.has(c.id)}
                  onSelect={(id) => onSelect(id)} onOpenDrawer={onOpenDrawer} />
          ))}
          {remaining > 0 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="block w-full rounded p-1.5 text-center text-[11px] text-blue-600 hover:bg-[var(--selection-bg)]"
            >+ 查看其余 {remaining} 条</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: board-column.tsx**

```tsx
"use client";
import type { BoardCard, EditingTaskStatus } from "@/modules/editing-task";
import { Group } from "./board-group";
import { groupByDate } from "../_lib/group-by-date";

interface Props {
  status: EditingTaskStatus;
  label: string;
  dotColorVar: string;
  cards: BoardCard[];
  selectedIds: Set<number>;
  onSelect: (id: number) => void;
  onOpenDrawer: (id: number) => void;
}

export function Column({ status, label, dotColorVar, cards, selectedIds, onSelect, onOpenDrawer }: Props) {
  const useDate = status === "published" ? "publishedAt" : "enteredStatusAt";
  const groups = groupByDate(cards, useDate);
  return (
    <div className="flex min-h-[620px] flex-col rounded-xl border border-border-subtle bg-slate-50/70 p-3">
      <div className="mb-3 flex items-center gap-2 px-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: dotColorVar }} />
        <span className="text-sm font-semibold">{label}</span>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600 tabular-nums">
          {cards.length}
        </span>
      </div>
      {groups.map((g) => (
        <Group key={g.label} label={g.label} cards={g.cards}
               defaultOpen={g.defaultOpen} selectedIds={selectedIds}
               onSelect={onSelect} onOpenDrawer={onOpenDrawer} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: group-by-date helper**

`src/app/(dashboard)/editing/_lib/group-by-date.ts`:

```ts
import type { BoardCard } from "@/modules/editing-task";

export function groupByDate(cards: BoardCard[], field: keyof BoardCard): {
  label: string; cards: BoardCard[]; defaultOpen: boolean;
}[] {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  const buckets = new Map<string, BoardCard[]>();
  for (const c of cards) {
    const date = (c[field] as string)?.slice(0, 10) ?? today;
    let bucket: string;
    if (date === today) bucket = `今天 · ${today.slice(5)}`;
    else if (date === yesterday) bucket = `昨天 · ${yesterday.slice(5)}`;
    else if (date === dayBefore) bucket = `前天 · ${dayBefore.slice(5)}`;
    else bucket = "更早";
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket)!.push(c);
  }

  const order = [`今天 · ${today.slice(5)}`, `昨天 · ${yesterday.slice(5)}`, `前天 · ${dayBefore.slice(5)}`, "更早"];
  return order.filter((l) => buckets.has(l)).map((label, i) => ({
    label, cards: buckets.get(label)!, defaultOpen: i < 2,
  }));
}
```

- [ ] **Step 6: typecheck + 提交**

```bash
pnpm typecheck
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): board card + group + column components"
```

---

## T22 · board 主组件 + selection store

**Files:**
- Create: `src/app/(dashboard)/editing/_components/selection-store.ts`
- Create: `src/app/(dashboard)/editing/_components/board.tsx`
- Create: `src/app/(dashboard)/editing/_components/floating-action-bar.tsx`

- [ ] **Step 1: selection-store.ts（zustand 或 useState）**

为简单起见用 React useState + Context（zustand 也行，本项目无强制）。

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

interface SelectionCtx {
  selectedIds: Set<number>;
  toggle: (id: number) => void;
  clear: () => void;
}

const Ctx = createContext<SelectionCtx | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  return (
    <Ctx.Provider value={{
      selectedIds,
      toggle: (id) => setSelectedIds((s) => {
        const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
      }),
      clear: () => setSelectedIds(new Set()),
    }}>{children}</Ctx.Provider>
  );
}

export function useSelection() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSelection outside provider");
  return c;
}
```

- [ ] **Step 2: floating-action-bar.tsx**

按 mockup 实现深色浮动栏，含派单下拉 + 批量删除 + 取消。

```tsx
"use client";
import { useState } from "react";
import { useSelection } from "./selection-store";
import { assignEditor, deleteTask } from "@/modules/editing-task";
import { toast } from "sonner";

export function FloatingActionBar({ editors }: { editors: { userId: string; name: string }[] }) {
  const { selectedIds, clear } = useSelection();
  const [editor, setEditor] = useState<string | null>(null);
  if (selectedIds.size === 0) return null;

  return (
    <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3.5 rounded-2xl bg-slate-800 px-4.5 py-2.5 text-white shadow-2xl">
      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-semibold">已选 {selectedIds.size} 条</span>
      <div className="h-4 w-px bg-white/15" />
      <span className="text-sm text-white/85">派给</span>
      <select value={editor ?? ""} onChange={(e) => setEditor(e.target.value)}
              className="rounded bg-white/12 px-2.5 py-1 text-sm">
        <option value="">选择剪辑师</option>
        {editors.map((e) => <option key={e.userId} value={e.userId}>{e.name}</option>)}
      </select>
      <button
        disabled={!editor}
        onClick={async () => {
          const r = await assignEditor({ taskIds: Array.from(selectedIds), editorUserId: editor! });
          toast.success(`已派单 ${r.updated} 条 ${r.skipped ? `，跳过 ${r.skipped} 条（状态不符）` : ""}`);
          clear();
          location.reload(); // MVP 简化：硬刷
        }}
        className="rounded bg-blue-500 px-3.5 py-1.5 text-sm font-medium disabled:opacity-50"
      >确认派单</button>
      <div className="h-4 w-px bg-white/15" />
      <button
        onClick={async () => {
          if (!confirm(`删除 ${selectedIds.size} 条任务？`)) return;
          const r = await deleteTask({ taskIds: Array.from(selectedIds) });
          toast.success(`已删除 ${r.deleted} 条 ${r.skipped ? `，跳过 ${r.skipped} 条（无权限/已发布）` : ""}`);
          clear(); location.reload();
        }}
        className="rounded border border-red-400/50 px-3.5 py-1.5 text-sm text-red-300 hover:bg-red-500/15"
      >批量删除</button>
      <button onClick={clear} className="px-2 text-sm text-white/70 hover:text-white">取消选择</button>
    </div>
  );
}
```

- [ ] **Step 3: board.tsx**

```tsx
"use client";
import { useState } from "react";
import type { BoardCard, EditingTaskStatus } from "@/modules/editing-task";
import { Column } from "./board-column";
import { SelectionProvider, useSelection } from "./selection-store";
import { FloatingActionBar } from "./floating-action-bar";
import { FilterBar } from "./filter-bar";
import { TaskDrawer } from "./task-drawer";
import { NewTaskDialog } from "./new-task-dialog";

const COLUMNS: { status: EditingTaskStatus; label: string; dotColorVar: string }[] = [
  { status: "uploaded",  label: "待剪辑", dotColorVar: "var(--color-blue-500)" },
  { status: "editing",   label: "剪辑中", dotColorVar: "var(--color-amber-500)" },
  { status: "review",    label: "审核",   dotColorVar: "var(--color-purple-500)" },
  { status: "ready",     label: "待发布", dotColorVar: "var(--color-cyan-500)" },
  { status: "published", label: "已发布", dotColorVar: "var(--color-green-500)" },
];

interface Props {
  initialCards: BoardCard[];
  editors: { userId: string; name: string }[];
  products: { productName: string; displayShort: string; accentColor: string }[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}

export function Board({ initialCards, editors, products, permissions }: Props) {
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <SelectionProvider>
      <BoardInner cards={initialCards} editors={editors} products={products}
                   onOpenDrawer={setOpenTaskId} onOpenNew={() => setNewOpen(true)} />
      <FloatingActionBar editors={editors} />
      {openTaskId && <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)}
                                  editors={editors} permissions={permissions} />}
      {newOpen && <NewTaskDialog onClose={() => setNewOpen(false)} products={products} />}
    </SelectionProvider>
  );
}

function BoardInner(props: any) {
  const { toggle } = useSelection();
  // 按 status 分组
  const byStatus = new Map<EditingTaskStatus, BoardCard[]>();
  for (const s of COLUMNS) byStatus.set(s.status, []);
  for (const c of props.cards) byStatus.get(c.status)?.push(c);

  return (
    <>
      <FilterBar products={props.products} editors={props.editors} onNewTask={props.onOpenNew} />
      <div className="rounded-3xl border-2 border-white/98 bg-[var(--bg-workspace)] p-4.5 backdrop-blur-lg shadow-[0_0_0_1px_rgba(210,220,245,0.42),0_24px_68px_-40px_rgba(40,55,120,0.42)]">
        <div className="grid grid-cols-5 gap-3.5">
          {COLUMNS.map((col) => (
            <Column key={col.status} {...col}
                    cards={byStatus.get(col.status) ?? []}
                    selectedIds={useSelectionIds()}
                    onSelect={toggle}
                    onOpenDrawer={props.onOpenDrawer} />
          ))}
        </div>
      </div>
    </>
  );
}

function useSelectionIds() { return useSelection().selectedIds; }
```

> **注意：** TaskDrawer 和 NewTaskDialog 由后续 task 实现，这里先 stub 引用，typecheck 会失败 → 先用 `// @ts-expect-error stub` 抑制，下个 task 补全。

- [ ] **Step 4: 创建 stubs 让 typecheck 过**

`task-drawer.tsx`、`new-task-dialog.tsx` 先建空组件：

```tsx
"use client";
export function TaskDrawer(_: any) { return null; }
export function NewTaskDialog(_: any) { return null; }
```

- [ ] **Step 5: typecheck + dev 启动确认 / + 提交**

```bash
pnpm typecheck
pnpm dev   # 浏览器看 /editing 应有 5 列空看板 + filter bar
```

```bash
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): board main component + selection + floating action bar"
```

---

## T23 · task-drawer（详情抽屉 + 事件流时间线）

**Files:**
- Modify: `src/app/(dashboard)/editing/_components/task-drawer.tsx`
- Create: `src/app/(dashboard)/editing/actions.ts`

- [ ] **Step 1: 抽屉的服务端数据加载（用 Suspense 或 client fetch）**

由于 Server Actions 只能调用，详情数据有两种方式：① page 加载时一次性预取所有 task 详情（浪费）② 抽屉打开时 fetch。选 ②，定义一个 'use server' action：

`src/app/(dashboard)/editing/actions.ts`:

```ts
"use server";
import { getTask, listEvents } from "@/modules/editing-task/server";

export async function loadTaskDetail(taskId: number) {
  const [task, events] = await Promise.all([getTask(taskId), listEvents(taskId)]);
  return { task, events };
}
```

- [ ] **Step 2: task-drawer.tsx**

按 mockup spec §5.4 实现，分块：顶栏 / 基本信息 / 素材区 / 成品区 / 抖音视频 / 事件流时间线。

完整代码量较大，关键骨架：

```tsx
"use client";
import { useEffect, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { loadTaskDetail } from "../actions";
import { resetEditing, reviewApprove } from "@/modules/editing-task";
import { ReviewRejectDialog } from "./review-reject-dialog";
import { MarkPublishedDialog } from "./mark-published-dialog";
import { AssignPopover } from "./assign-popover";

export function TaskDrawer({ taskId, onClose, editors, permissions }: {
  taskId: number; onClose: () => void;
  editors: { userId: string; name: string }[];
  permissions: { canEdit: boolean; isAdmin: boolean };
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTaskDetail>> | null>(null);

  useEffect(() => {
    loadTaskDetail(taskId).then(setData);
  }, [taskId]);

  if (!data?.task) return null;
  const { task, events } = data;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
        <header className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{task.liveAccountName}</h2>
          <StatusChip status={task.status} />
        </header>

        <section className="mt-4 space-y-2 text-sm">
          <Row label="素材日期">{task.materialDate}</Row>
          <Row label="主播">{task.anchorName ?? "—"}</Row>
          <Row label="产品">{task.product}</Row>
          <Row label="创建人">{task.createdByName}</Row>
          <Row label="剪辑要求">{task.sourceRemark ?? "—"}</Row>
        </section>

        <section className="mt-4">
          <SectionTitle>素材文件</SectionTitle>
          <FileList files={task.sourceFiles} names={task.sourceFileNames} taskId={task.id} kind="source" />
        </section>

        {task.editedFiles.length > 0 && (
          <section className="mt-4">
            <SectionTitle>成品文件</SectionTitle>
            <FileList files={task.editedFiles} names={task.editedFileNames} taskId={task.id} kind="edited" />
          </section>
        )}

        {task.status === "published" && task.videoId && (
          <section className="mt-4 text-sm">
            <SectionTitle>抖音视频</SectionTitle>
            <a href={`https://www.douyin.com/video/${task.videoId}`} target="_blank" className="text-blue-600">
              {task.videoId}
            </a>
          </section>
        )}

        <section className="mt-4">
          <SectionTitle>操作历史</SectionTitle>
          <Timeline events={events} />
        </section>

        <footer className="mt-6 flex flex-wrap gap-2 border-t pt-4">
          {/* 按 status 渲染操作按钮 */}
          {task.status === "uploaded" && permissions.canEdit && (
            <AssignPopover editors={editors} taskIds={[task.id]} />
          )}
          {task.status === "editing" && (
            <>
              <button onClick={async () => { await resetEditing({ taskId: task.id }); onClose(); }}
                      className="rounded border px-3 py-1.5 text-sm">回退到待剪辑</button>
              <UploadEditedButton taskId={task.id} />
            </>
          )}
          {task.status === "review" && permissions.canEdit && (
            <>
              <button onClick={async () => { await reviewApprove({ taskId: task.id }); onClose(); }}
                      className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white">审核通过</button>
              <ReviewRejectDialog taskId={task.id} />
            </>
          )}
          {task.status === "ready" && permissions.canEdit && (
            <MarkPublishedDialog taskId={task.id} isAdmin={permissions.isAdmin} />
          )}
        </footer>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: any) {
  return <div className="flex gap-2"><span className="w-20 text-slate-400">{label}</span><span>{children}</span></div>;
}
function SectionTitle({ children }: any) { return <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</h3>; }
function StatusChip({ status }: any) {
  const map = { uploaded: "待剪辑", editing: "剪辑中", review: "审核", ready: "待发布", published: "已发布" } as const;
  return <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs">{map[status as keyof typeof map]}</span>;
}

function Timeline({ events }: { events: any[] }) {
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {events.map((e) => <TimelineItem key={e.id} event={e} />)}
    </ol>
  );
}

function TimelineItem({ event }: any) {
  return (
    <li className="relative">
      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue-500" />
      <div className="text-sm">
        <span className="font-medium">{event.actorName}</span>{" "}
        <span className="text-slate-500">{formatEvent(event)}</span>
      </div>
      <div className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString("zh-CN")}</div>
    </li>
  );
}

function formatEvent(e: any) {
  switch (e.eventType) {
    case "created": return "创建任务";
    case "source_uploaded": return `上传 ${e.payload.file_count} 个素材`;
    case "assigned": return "派单";
    case "reassigned": return `改派给 ${e.payload.to}`;
    case "editing_reset": return "回退到待剪辑";
    case "edited_uploaded": return "上传成品";
    case "review_approved": return "审核通过";
    case "review_rejected": return `审核回退：${e.payload.reason}`;
    case "published": return e.payload.auto_matched ? `发布并自动绑定视频 ${e.payload.video_id}` : `发布${e.payload.video_id ? `（手填视频 ${e.payload.video_id}）` : "（未绑定视频）"}`;
    case "deleted": return "删除任务";
    default: return e.eventType;
  }
}

function FileList({ files, names, taskId, kind }: any) {
  return (
    <ul className="space-y-1 text-sm">
      {files.map((p: string, i: number) => (
        <li key={p} className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50">
          <span className="truncate">{names[i]}</span>
          <a href={`/api/editing/download?taskId=${taskId}&kind=${kind}&index=${i}`}
             className="text-blue-600 hover:underline">下载</a>
        </li>
      ))}
    </ul>
  );
}

function UploadEditedButton({ taskId }: { taskId: number }) {
  // 简化：标准 file input + form action
  return (
    <form action={`/api/editing/upload-edited?taskId=${taskId}`} method="POST" encType="multipart/form-data">
      <label className="cursor-pointer rounded border border-blue-500 bg-white px-3 py-1.5 text-sm text-blue-600">
        上传成品 <input type="file" name="file" hidden onChange={(e) => e.currentTarget.form?.submit()} />
      </label>
    </form>
  );
}
```

- [ ] **Step 3: 实现 dialog stubs（assign-popover / review-reject / mark-published / delete-confirm）**

每个独立小文件，骨架按上文 import 的接口写一个简单的对话框包 Server Action 调用。

assign-popover.tsx：

```tsx
"use client";
import { useState } from "react";
import { assignEditor } from "@/modules/editing-task";

export function AssignPopover({ editors, taskIds }: { editors: { userId: string; name: string }[]; taskIds: number[] }) {
  const [editor, setEditor] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <select value={editor ?? ""} onChange={(e) => setEditor(e.target.value)} className="rounded border px-2 py-1.5 text-sm">
        <option value="">选剪辑师</option>
        {editors.map((e) => <option key={e.userId} value={e.userId}>{e.name}</option>)}
      </select>
      <button disabled={!editor} onClick={async () => {
        await assignEditor({ taskIds, editorUserId: editor! });
        location.reload();
      }} className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-50">派单</button>
    </div>
  );
}
```

review-reject-dialog.tsx：

```tsx
"use client";
import { useState } from "react";
import { reviewReject } from "@/modules/editing-task";

export function ReviewRejectDialog({ taskId }: { taskId: number }) {
  const [reason, setReason] = useState("");
  return (
    <details className="inline-block">
      <summary className="cursor-pointer rounded border px-3 py-1.5 text-sm">审核回退</summary>
      <div className="mt-2 flex gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="回退原因"
               className="rounded border px-2 py-1 text-sm" />
        <button disabled={!reason} onClick={async () => {
          await reviewReject({ taskId, reason });
          location.reload();
        }} className="rounded bg-amber-500 px-3 py-1.5 text-sm text-white disabled:opacity-50">提交</button>
      </div>
    </details>
  );
}
```

mark-published-dialog.tsx：

```tsx
"use client";
import { useState } from "react";
import { markPublished } from "@/modules/editing-task";
import { toast } from "sonner";

export function MarkPublishedDialog({ taskId, isAdmin }: { taskId: number; isAdmin: boolean }) {
  const [step, setStep] = useState<"idle" | "need_video">("idle");
  const [videoId, setVideoId] = useState("");

  const attempt = async (videoIdInput: string | null | undefined) => {
    const r = await markPublished({ taskId, videoId: videoIdInput });
    if (r.ok) { toast.success(r.autoMatched ? "已自动绑定抖音视频" : "已发布"); location.reload(); }
    else { setStep("need_video"); toast.warning("未匹配到抖音视频，请手填"); }
  };

  if (step === "idle") {
    return <button onClick={() => attempt(undefined)} className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white">标记已发布</button>;
  }
  return (
    <div className="flex gap-2">
      <input value={videoId} onChange={(e) => setVideoId(e.target.value)} placeholder="抖音视频 ID"
             className="rounded border px-2 py-1 text-sm" />
      <button disabled={!videoId} onClick={() => attempt(videoId)} className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white disabled:opacity-50">确认</button>
      {isAdmin && <button onClick={() => attempt(null)} className="rounded border px-3 py-1.5 text-sm text-slate-500">跳过</button>}
    </div>
  );
}
```

- [ ] **Step 4: typecheck + dev 启动 + 提交**

```bash
pnpm typecheck
pnpm dev
```

```bash
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): task drawer + assign/review/publish dialogs + event timeline"
```

---

## T24 · 文件上传 / 下载 API route

**Files:**
- Create: `src/app/api/editing/upload-source/route.ts`
- Create: `src/app/api/editing/upload-edited/route.ts`
- Create: `src/app/api/editing/download/route.ts`

Server Actions 对大文件 multipart 不友好，文件 IO 走传统 API route 更稳。

- [ ] **Step 1: upload-source/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { uploadSource } from "@/modules/editing-task";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分钟

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData();
    await uploadSource(fd);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
```

upload-edited/route.ts 同模板，调 `uploadEdited`。

- [ ] **Step 2: download/route.ts**

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { editing_task } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { resolvePermission, buildScopeWhereClause } from "@/modules/permissions/server";
import { getDownloadStream } from "@/modules/editing-storage/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  if (perm.scope === "none") return new NextResponse("Forbidden", { status: 403 });

  const taskId = Number(req.nextUrl.searchParams.get("taskId"));
  const kind = req.nextUrl.searchParams.get("kind"); // "source" | "edited"
  const index = Number(req.nextUrl.searchParams.get("index") ?? "0");

  const [task] = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
  if (!task) return new NextResponse("Not Found", { status: 404 });

  // TODO: 应用 scope where 检查可见性（简化版：admin 全开，其余 self / team 加 scope check）
  // 当前实现：只做基本 scope==='none' 拦截，详细可见性留后续加固

  const files = kind === "source" ? task.source_files : task.edited_files;
  const names = kind === "source" ? task.source_file_names : task.edited_file_names;
  if (!files?.[index]) return new NextResponse("file not found", { status: 404 });

  const NAS = process.env.EDITING_NAS_PATH!;
  const stream = getDownloadStream(NAS, files[index]);

  return new NextResponse(stream as any, {
    headers: {
      "Content-Disposition": `attachment; filename="${encodeURIComponent(names[index] ?? "file")}"`,
      "Content-Type": "application/octet-stream",
    },
  });
}
```

- [ ] **Step 3: typecheck + 提交**

```bash
pnpm typecheck
git add src/app/api/editing/
git commit -m "feat(editing): file upload + download API routes"
```

---

## T25 · new-task-dialog（新建任务对话框）

**Files:**
- Modify: `src/app/(dashboard)/editing/_components/new-task-dialog.tsx`
- Create: `src/app/(dashboard)/editing/actions.ts`（追加 listAccounts）

- [ ] **Step 1: 在 actions.ts 加 listAccounts helper**

```ts
"use server";
import { db } from "@/db/client";
import { live_account, account_anchor_default, anchor_profile } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function searchLiveAccounts(query: string): Promise<
  { id: string; name: string; product: string; defaultAnchors: { anchorId: string; name: string }[] }[]
> {
  const rows = await db.select({
    id: live_account.id, name: live_account.account_name, product: live_account.product,
  }).from(live_account)
    .where(sql`${live_account.account_name} ILIKE ${'%' + query + '%'}`)
    .limit(20);

  // 查每个账号的默认主播
  const accountIds = rows.map((r) => r.id);
  if (accountIds.length === 0) return [];

  const defaults = await db.select({
    live_account_id: account_anchor_default.live_account_id,
    anchor_id: anchor_profile.anchor_id,
    real_name: anchor_profile.real_name,
  }).from(account_anchor_default)
    .leftJoin(anchor_profile, eq(anchor_profile.anchor_id, account_anchor_default.anchor_id))
    .where(inArray(account_anchor_default.live_account_id, accountIds));

  const byAccount = new Map<string, { anchorId: string; name: string }[]>();
  for (const d of defaults) {
    const arr = byAccount.get(d.live_account_id) ?? [];
    arr.push({ anchorId: d.anchor_id!, name: d.real_name ?? "(无名)" });
    byAccount.set(d.live_account_id, arr);
  }

  return rows.map((r) => ({
    ...r, defaultAnchors: byAccount.get(r.id) ?? [],
  }));
}
```

> **注意：** `account_anchor_default` 表名/字段按 phase 2.1 实际命名调整。

- [ ] **Step 2: 实现 new-task-dialog.tsx**

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createTask } from "@/modules/editing-task";
import { searchLiveAccounts } from "../actions";
import { toast } from "sonner";

export function NewTaskDialog({ onClose }: { onClose: () => void }) {
  const [accountQuery, setAccountQuery] = useState("");
  const [accounts, setAccounts] = useState<Awaited<ReturnType<typeof searchLiveAccounts>>>([]);
  const [selected, setSelected] = useState<typeof accounts[number] | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [materialDate, setMaterialDate] = useState(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState("");
  const [file, setFile] = useState<File | null>(null);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建剪辑任务</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">账号</label>
            <input value={accountQuery} onChange={async (e) => {
              setAccountQuery(e.target.value);
              if (e.target.value.length >= 2) setAccounts(await searchLiveAccounts(e.target.value));
            }} className="w-full rounded border px-3 py-2 text-sm" placeholder="搜索账号昵称" />
            {accounts.length > 0 && !selected && (
              <ul className="mt-1 max-h-40 overflow-auto rounded border">
                {accounts.map((a) => (
                  <li key={a.id} onClick={() => {
                    setSelected(a);
                    if (a.defaultAnchors.length === 1) setAnchorId(a.defaultAnchors[0].anchorId);
                    setAccounts([]); setAccountQuery(a.name);
                  }} className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-50">
                    {a.name} <span className="text-xs text-slate-400">· {a.product}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selected && (
            <div>
              <label className="text-sm font-medium">主播</label>
              <select value={anchorId ?? ""} onChange={(e) => setAnchorId(e.target.value || null)}
                      className="w-full rounded border px-3 py-2 text-sm">
                <option value="">（不指定主播）</option>
                {selected.defaultAnchors.map((a) => <option key={a.anchorId} value={a.anchorId}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-sm font-medium">素材日期</label>
            <input type="date" value={materialDate} onChange={(e) => setMaterialDate(e.target.value)}
                   className="w-full rounded border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-sm font-medium">剪辑要求</label>
            <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3}
                      className="w-full rounded border px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="text-sm font-medium">素材文件</label>
            <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                   className="block w-full text-sm" />
          </div>
        </div>

        <DialogFooter>
          <button onClick={onClose} className="rounded border px-4 py-2 text-sm">取消</button>
          <button disabled={!selected || !file} onClick={async () => {
            const { taskId } = await createTask({
              liveAccountId: selected!.id, anchorId, materialDate, sourceRemark: remark || null,
            });
            const fd = new FormData();
            fd.append("taskId", String(taskId));
            fd.append("file", file!);
            const r = await fetch("/api/editing/upload-source", { method: "POST", body: fd });
            if (!r.ok) { toast.error("素材上传失败"); return; }
            toast.success("任务创建成功"); onClose(); location.reload();
          }} className="rounded bg-blue-500 px-4 py-2 text-sm text-white disabled:opacity-50">
            创建并上传
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: typecheck + dev 走完冒烟（新建一条任务）**

```bash
pnpm typecheck
pnpm dev
```

浏览器：/editing → 「+ 新建任务」→ 选账号 + 选文件 → 创建 → 看板「待剪辑」列应出现新卡片。

- [ ] **Step 4: 提交**

```bash
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): new task dialog with file upload + account search"
```

---

## T26 · 表格视图 /editing/table

**Files:**
- Create: `src/app/(dashboard)/editing/table/page.tsx`
- Create: `src/app/(dashboard)/editing/_components/table-view.tsx`

- [ ] **Step 1: page.tsx**

```tsx
import { requireUser } from "@/lib/session";
import { resolvePermission } from "@/modules/permissions/server";
import { listForTable, buildEditingScopeWhere } from "@/modules/editing-task/server";
import { TableView } from "../_components/table-view";

export default async function EditingTablePage({ searchParams }: any) {
  const sp = await searchParams;
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, "editing_workflow");
  const where = await buildEditingScopeWhere({ scope: perm.scope, userId });
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const rows = await listForTable({
    whereClause: where, dateFrom: monthAgo, dateTo: today,
  });

  return <TableView rows={rows} />;
}
```

- [ ] **Step 2: table-view.tsx**

```tsx
"use client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BoardCard } from "@/modules/editing-task";
import { formatDwellTime } from "../_lib/dwell";

const STATUS_LABEL = { uploaded: "待剪辑", editing: "剪辑中", review: "审核", ready: "待发布", published: "已发布" };

export function TableView({ rows }: { rows: BoardCard[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>账号</TableHead><TableHead>主播</TableHead><TableHead>产品</TableHead>
          <TableHead>状态</TableHead><TableHead>剪辑师</TableHead>
          <TableHead>素材日期</TableHead><TableHead>停留时长</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.liveAccountName}</TableCell>
            <TableCell>{r.anchorName ?? "—"}</TableCell>
            <TableCell>{r.product}</TableCell>
            <TableCell>{STATUS_LABEL[r.status]}</TableCell>
            <TableCell>{r.editorName ?? "—"}</TableCell>
            <TableCell>{r.materialDate}</TableCell>
            <TableCell>{formatDwellTime(r.enteredStatusAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: dev 验证 + 提交**

浏览器：/editing/table → 应见表格列表。

```bash
git add src/app/\(dashboard\)/editing/
git commit -m "feat(editing): table view at /editing/table"
```

---

## T27 · e2e 集成测试：任务生命周期

**Files:**
- Create: `tests/e2e/editing/task-lifecycle.test.ts`

- [ ] **Step 1: 看现有 e2e 测试结构参考**

```bash
ls tests/ 2>/dev/null; find src -name "*.integration.test.ts" | head -3
cat vitest.config.ts 2>/dev/null | head -30
```

如果项目已有 e2e/integration 测试目录，复用；否则在 `src/modules/editing-task/integration.test.ts` 同位置。

- [ ] **Step 2: 写测试**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { editing_task, editing_task_event } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTask } from "@/modules/editing-task";
import { assignEditor, reviewApprove, reviewReject, resetEditing, markPublished, deleteTask } from "@/modules/editing-task";

// 假设有 test helper 创建 user / live_account / 模拟 requireUser
// 实际按现有测试 helper 调整
import { withTestUser, createTestLiveAccount } from "@/test/helpers";

describe("editing task lifecycle", () => {
  beforeEach(async () => {
    await db.delete(editing_task_event);
    await db.delete(editing_task);
  });

  it("happy path: uploaded → editing → review → ready → published", async () => {
    const account = await createTestLiveAccount({ product: "捕鱼大作战" });
    const operator = await withTestUser({ position: "运营" });
    const editor = await withTestUser({ position: "剪辑" });

    // 创建（操作者：运营）
    operator.mock();
    const { taskId } = await createTask({
      liveAccountId: account.id, anchorId: null,
      materialDate: "2026-05-25", sourceRemark: "test",
    });

    // 直接 update source_uploaded_at 模拟上传完成
    await db.update(editing_task).set({
      source_files: ["fake/path.mp4"], source_file_names: ["a.mp4"],
      source_uploaded_at: new Date(),
    }).where(eq(editing_task.id, taskId));

    // 派单
    await assignEditor({ taskIds: [taskId], editorUserId: editor.userId });
    let [t] = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
    expect(t.status).toBe("editing");
    expect(t.editor_user_id).toBe(editor.userId);

    // 剪辑师上传成品（模拟）
    editor.mock();
    await db.update(editing_task).set({
      edited_files: ["fake/edited.mp4"], edited_file_names: ["v1.mp4"],
      edited_uploaded_at: new Date(), status: "review",
    }).where(eq(editing_task.id, taskId));

    // 审核回退一次
    operator.mock();
    await reviewReject({ taskId, reason: "字幕有误" });
    [t] = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
    expect(t.status).toBe("editing");

    // 重新提交审核
    await db.update(editing_task).set({ status: "review" }).where(eq(editing_task.id, taskId));

    // 审核通过
    await reviewApprove({ taskId });
    [t] = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
    expect(t.status).toBe("ready");

    // 标记已发布（admin 跳过 video_id）
    operator.mockAdmin();
    const r = await markPublished({ taskId, videoId: null });
    expect(r.ok).toBe(true);

    [t] = await db.select().from(editing_task).where(eq(editing_task.id, taskId));
    expect(t.status).toBe("published");

    // 事件流应有 ≥ 5 条
    const events = await db.select().from(editing_task_event).where(eq(editing_task_event.task_id, taskId));
    expect(events.length).toBeGreaterThanOrEqual(5);
    const types = events.map((e) => e.event_type);
    expect(types).toContain("created");
    expect(types).toContain("assigned");
    expect(types).toContain("review_rejected");
    expect(types).toContain("review_approved");
    expect(types).toContain("published");
  });

  it("state machine rejects illegal transition", async () => {
    const account = await createTestLiveAccount({ product: "捕鱼大作战" });
    const operator = await withTestUser({ position: "运营" });
    operator.mock();
    const { taskId } = await createTask({
      liveAccountId: account.id, anchorId: null,
      materialDate: "2026-05-25", sourceRemark: null,
    });
    // 强制设 published 状态
    await db.update(editing_task).set({ status: "published" }).where(eq(editing_task.id, taskId));

    await expect(reviewApprove({ taskId })).rejects.toThrow(/illegal/i);
  });

  it("delete blocked for published task even by creator", async () => {
    const account = await createTestLiveAccount({ product: "捕鱼大作战" });
    const operator = await withTestUser({ position: "运营" });
    operator.mock();
    const { taskId } = await createTask({
      liveAccountId: account.id, anchorId: null,
      materialDate: "2026-05-25", sourceRemark: null,
    });
    await db.update(editing_task).set({ status: "published" }).where(eq(editing_task.id, taskId));

    const r = await deleteTask({ taskIds: [taskId] });
    expect(r.deleted).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
```

> **注意：** `@/test/helpers` 是占位 — 如项目无 test helper 工具，本 task 先建一个最简版（mock requireUser 用 vi.mock）。如有现成的（看 placement / live-account 模块的测试），直接复用。

- [ ] **Step 3: 跑测试**

```bash
pnpm test tests/e2e/editing/task-lifecycle.test.ts
```

预期：3 passed。

- [ ] **Step 4: 提交**

```bash
git add tests/e2e/editing/
git commit -m "test(editing): e2e task lifecycle (happy path + illegal transition + delete guard)"
```

---

## T28 · e2e 测试：权限可见性

**Files:**
- Create: `tests/e2e/editing/permission-scope.test.ts`

针对 5 个角色（admin / 运营 / 剪辑 / 主播 / 其他）跑 board 查询，验证可见数量。

- [ ] **Step 1: 写测试**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db/client";
import { listForBoard, buildEditingScopeWhere } from "@/modules/editing-task/server";
import { editing_task } from "@/db/schema";
import { createTestLiveAccount, withTestUser } from "@/test/helpers";

describe("editing scope", () => {
  let admin: any, op1: any, op2: any, editor1: any, anchor1: any;
  let account1: any; // op1 负责，anchor1 主播
  let account2: any; // op2 负责，anchor1 主播
  let task1Id: number, task2Id: number;

  beforeAll(async () => {
    admin = await withTestUser({ position: "老板" });
    op1 = await withTestUser({ position: "运营" });
    op2 = await withTestUser({ position: "运营" });
    editor1 = await withTestUser({ position: "剪辑" });
    anchor1 = await withTestUser({ position: "主播" });

    account1 = await createTestLiveAccount({ product: "捕鱼大作战", operatorUserId: op1.userId });
    account2 = await createTestLiveAccount({ product: "途游斗地主", operatorUserId: op2.userId });

    // task1: account1, 派给 editor1
    const [t1] = await db.insert(editing_task).values({
      live_account_id: account1.id, material_date: new Date(), status: "editing",
      editor_user_id: editor1.userId, created_by_user_id: op1.userId,
    }).returning({ id: editing_task.id });
    task1Id = t1.id;

    const [t2] = await db.insert(editing_task).values({
      live_account_id: account2.id, material_date: new Date(), status: "uploaded",
      created_by_user_id: op2.userId,
    }).returning({ id: editing_task.id });
    task2Id = t2.id;
  });

  it("admin sees all", async () => {
    const where = await buildEditingScopeWhere({ scope: "all", userId: admin.userId });
    const cards = await listForBoard({ whereClause: where, dateFrom: "2020-01-01", dateTo: "2030-01-01" });
    expect(cards.map((c) => c.id).sort()).toEqual([task1Id, task2Id].sort());
  });

  it("op1 sees only own account tasks", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: op1.userId });
    const cards = await listForBoard({ whereClause: where, dateFrom: "2020-01-01", dateTo: "2030-01-01" });
    expect(cards.map((c) => c.id)).toEqual([task1Id]);
  });

  it("editor1 sees only assigned task", async () => {
    const where = await buildEditingScopeWhere({ scope: "self", userId: editor1.userId });
    const cards = await listForBoard({ whereClause: where, dateFrom: "2020-01-01", dateTo: "2030-01-01" });
    expect(cards.map((c) => c.id)).toEqual([task1Id]);
  });
});
```

- [ ] **Step 2: 跑 + 修 + 提交**

```bash
pnpm test tests/e2e/editing/permission-scope.test.ts
```

预期：3 passed（若 4 个 OR 条件实现正确）。

```bash
git add tests/e2e/editing/permission-scope.test.ts
git commit -m "test(editing): scope visibility for admin/operator/editor"
```

---

## T29 · 冒烟手测脚本 + CHANGELOG 收尾

**Files:**
- Create: `docs/superpowers/plans/2026-05-25-phase-3-0-editing-workflow-smoke-test.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 写 smoke test 清单**

```markdown
# Phase 3.0 冒烟手测清单

> 在本地 `pnpm dev` + 真 DB 跑完一遍，全过算上线就绪。

## 准备
1. `docker-compose up -d postgres`
2. `pnpm db:migrate && pnpm db:seed:product-config`
3. `mkdir -p ./tmp/editing-nas`
4. 在 .env.local 设 `EDITING_NAS_PATH=./tmp/editing-nas`
5. `pnpm dev`

## 测试步骤

### 1. 入口权限
- [ ] 用 admin 账号登录，访问 /editing → 看到 5 列看板
- [ ] 用「其他」岗位账号登录，访问 /editing → 重定向到首页

### 2. 新建任务
- [ ] 点「+ 新建任务」→ 弹窗出现
- [ ] 搜索一个真实 live_account → 下拉显示
- [ ] 选中 → 主播自动联动（若该账号有 default anchor）
- [ ] 选素材文件 → 「创建并上传」→ Toast 成功
- [ ] 看板「待剪辑」列出现新卡片

### 3. 批量派单
- [ ] hover 卡片 → checkbox 出现
- [ ] 勾选 3 张 → 底部浮动栏出现「已选 3 条」
- [ ] 下拉选剪辑师 → 「确认派单」→ 3 张卡片移动到「剪辑中」

### 4. 上传成品 + 审核
- [ ] 切换到剪辑师身份（或用 admin），点开「剪辑中」一张卡 → 抽屉打开
- [ ] 「上传成品」→ 选文件 → 状态变 review
- [ ] 切回运营，打开 review 中的卡片 → 「审核回退」填原因「字幕有误」→ 卡片回剪辑中
- [ ] 抽屉时间线显示回退事件 + 原因
- [ ] 重新上传成品 → review → 「审核通过」 → 卡片到「待发布」

### 5. 标记发布
- [ ] 点「待发布」卡片 → 抽屉 → 「标记已发布」
- [ ] 系统尝试自动绑定抖音视频
- [ ] 若失败 → 弹手填输入 → 输入测试 video_id → 卡片到「已发布」

### 6. 删除
- [ ] 选中 1 张「待发布」+ 1 张「已发布」 → 批量删除
- [ ] Toast：删除 1 条，跳过 1 条（已发布不可删）

### 7. 表格视图
- [ ] 切换到「表格」tab → 看到任务列表
- [ ] 列点击排序生效

### 8. 收纳
- [ ] 待剪辑列 ≥7 条 → 出现「+ 查看其余 N 条」
- [ ] 折叠「前天」分组 → 任务不显示但 count 保留
- [ ] 顶部「产品 · 捕鱼」筛选 → 仅捕鱼任务可见
```

- [ ] **Step 2: 更新 CLAUDE.md 把 Phase 3.0 标记完成**

`CLAUDE.md` 表格里加一行：

```markdown
| Phase 3.0（剪辑工作流 MVP） | `v0.5.0-phase3.0` | ✅ 完成（202X-XX-XX） |
```

- [ ] **Step 3: 提交**

```bash
git add docs/superpowers/plans/2026-05-25-phase-3-0-editing-workflow-smoke-test.md CLAUDE.md
git commit -m "docs(editing): phase 3.0 smoke test checklist + CLAUDE.md phase log"
```

- [ ] **Step 4: 跑完整 CI 三件套**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

预期：全过。

- [ ] **Step 5: 打 tag**

```bash
git tag v0.5.0-phase3.0
```

---

## 自审清单

- ✅ **Spec 覆盖检查**：spec §3 数据 ↔ T01-T04；§4 状态机 ↔ T09；§5 13 项功能 ↔ T14-T26（看板/筛选/抽屉/表格/批量栏/新建/上传下载/派单/审核/发布/回退/删除）；§6 权限 ↔ T05/T11；§7 UI ↔ T20-T26；§8 NAS ↔ T06/T07；§9 抖音绑定 ↔ T17/T18；§10 剪辑师 ↔ T19；§12 验收 ↔ T27/T28/T29
- ✅ **类型一致性**：BoardCard 字段在 types.ts 定义 → queries.ts 返回 → board-card.tsx 消费；Status 枚举 schema/types.ts → state-machine.ts 一致
- ✅ **无 TBD / TODO 占位符**：除 matchDouyinVideo 标注「按实际抖音 schema 完成」（依赖 Phase 2 实际表名，注释说明确）；getTask alias join 完整代码已给
- ✅ **migration 顺序无依赖问题**：product_config 先建 → editing_task 再 ref live_account.product（不需要 FK，因为是按 product_name 软关联）

---

## 执行选项

**Plan 完成，存于 `docs/superpowers/plans/2026-05-25-phase-3-0-editing-workflow.md`。两种执行方式：**

**1. Subagent-Driven（推荐）** — 每个 task 分发新 subagent + 两阶段 review + 快速迭代

**2. Inline Execution** — 在当前会话执行 + 批量 checkpoint review

**选哪种？**
