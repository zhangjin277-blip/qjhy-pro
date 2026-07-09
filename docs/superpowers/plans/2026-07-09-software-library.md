# 软件库板块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「软件库」板块——全员可下载工作软件、管理员可上传，扁平自定义分类，软件名称/版本/说明可自定义。

**Architecture:** 独立模块 `src/modules/software-library/`（标准双入口），复用 `editing-storage` 的流式上传/下载/NAS 原语；2 张新表（software_category / software_item）；新权限 module key `software_library`（全员 scope=all 可下载，总监/老板 can_edit 可上传）；顶层导航 `/software`。

**Tech Stack:** Next.js 16 App Router + Drizzle ORM + PostgreSQL + Zod + shadcn/ui + Vitest

**Spec:** `docs/superpowers/specs/2026-07-09-software-library-design.md`

**约定（全程遵守）：**
- 直接在 main 上开发（项目 Git 规则，不开分支/worktree）
- 每个 Task 结束跑 `pnpm typecheck`，Task 4/7 跑全量 `pnpm lint && pnpm test`
- 测试需要 dev 库：`docker-compose up -d postgres`；NAS 根用 `EDITING_NAS_PATH`（.env.local 已有）

---

### Task 1: DB schema + migration + 权限种子

**Files:**
- Create: `src/db/schema/software.ts`
- Modify: `src/db/schema/index.ts`（加一行 export）
- Generate: `src/db/migrations/0054_software_library.sql`（drizzle 生成）
- Generate+手写: `src/db/migrations/0055_software_library_permission_seed.sql`

- [ ] **Step 1: 写 schema 文件**

创建 `src/db/schema/software.ts`：

```ts
import {
  bigint,
  bigserial,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { dingtalk_user } from "./dingtalk";

/**
 * 软件库（Software Library）。
 *
 * 全员可下载的工作软件仓库（直播工具/办公软件/剪辑软件/驱动等安装包），
 * 扁平自定义分类，软件名称/版本/说明可自定义。上传走 editing-storage 流式落盘，
 * 物理路径 软件库/{yyyymm}/{md5前12}-{文件名}，与逻辑分类解耦（改分类只改 DB）。
 * MD5 去重：同 hash 未删条目直接复用。
 */

export const software_category = pgTable("software_category", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(), // 分类名，业务唯一（action 层校验）
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const software_item = pgTable(
  "software_item",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    category_id: bigint("category_id", { mode: "number" }).references(
      () => software_category.id,
    ), // NULL = 未分类
    name: text("name").notNull(), // 自定义软件名，默认取文件名，可改
    version: text("version"), // 版本号，选填
    note: text("note"), // 一句话说明，选填
    nas_path: text("nas_path").notNull(), // NAS 相对路径（物理位置）
    file_name: text("file_name").notNull(), // 原始文件名
    file_hash: text("file_hash").notNull(), // MD5，去重用
    file_size: bigint("file_size", { mode: "number" }).notNull(), // 字节
    download_count: integer("download_count").notNull().default(0),
    uploaded_by_user_id: text("uploaded_by_user_id").references(() => dingtalk_user.user_id),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deleted_at: timestamp("deleted_at", { withTimezone: true }), // 软删
  },
  (t) => ({
    idx_category: index("idx_software_item_category").on(t.category_id),
    idx_hash: index("idx_software_item_hash").on(t.file_hash),
  }),
);
```

- [ ] **Step 2: schema index 注册**

修改 `src/db/schema/index.ts`，在 `export * from "./schedule-override";` 之后加：

```ts
export * from "./software";
```

- [ ] **Step 3: 生成 DDL migration**

```bash
docker-compose up -d postgres
pnpm db:generate --name=software_library
```

Expected: 生成 `src/db/migrations/0054_software_library.sql`，内容为两张表的 CREATE TABLE + 索引 + 外键。检查确认没有误伤其他表的 diff。

- [ ] **Step 4: 生成权限种子 custom migration**

```bash
pnpm db:generate --custom --name=software_library_permission_seed
```

生成的空文件 `src/db/migrations/0055_software_library_permission_seed.sql` 里写入：

```sql
-- 软件库权限种子：全员 scope=all（可见可下载），仅总监/老板可上传/管理。
-- 岗位清单从现有 role_default_permission 行派生，新岗位以后走 UI 配置。
INSERT INTO "role_default_permission"
  (position, module, scope, can_edit, can_export, can_admin, description, updated_at)
SELECT p.position,
       'software_library',
       'all',
       p.position IN ('总监', '老板'),
       false,
       p.position IN ('总监', '老板'),
       '软件库：全员可下载，管理员可上传',
       now()
  FROM (SELECT DISTINCT position FROM "role_default_permission") p
    ON CONFLICT (position, module) DO NOTHING;
```

- [ ] **Step 5: 应用 migration 并验证**

```bash
pnpm db:migrate
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\d software_item" | head -20
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT position, scope, can_edit FROM role_default_permission WHERE module='software_library' ORDER BY position;"
```

Expected: software_item 表存在；权限行 ≥ 8 条，全部 scope=all，总监/老板 can_edit=t 其余 f。

- [ ] **Step 6: Commit**

```bash
git add src/db/schema/software.ts src/db/schema/index.ts src/db/migrations/
git commit -m "feat(software-library): software_category/software_item 表 + 权限种子 migration"
```

---

### Task 2: 权限模块注册 software_library

**Files:**
- Modify: `src/modules/permissions/modules.ts`
- Modify: `src/modules/permissions/role-defaults.ts`
- Test: `tests/modules/permissions/role-defaults.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

创建 `tests/modules/permissions/role-defaults.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions";

describe("ROLE_DEFAULTS_SEED software_library 特例", () => {
  const rows = ROLE_DEFAULTS_SEED.filter((r) => r.module === "software_library");

  it("每个岗位都有 software_library 行", () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
  });

  it("全员 scope=all（全员可见可下载）", () => {
    expect(rows.every((r) => r.scope === "all")).toBe(true);
  });

  it("仅总监/老板默认 can_edit", () => {
    const editors = rows.filter((r) => r.can_edit).map((r) => r.position);
    expect(editors.sort()).toEqual(["总监", "老板"].sort());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/modules/permissions/role-defaults.test.ts`
Expected: FAIL（`software_library` 不在 MODULE_KEYS，rows 为空 / 类型报错）

- [ ] **Step 3: 注册 module key**

修改 `src/modules/permissions/modules.ts`：

MODULE_KEYS 数组末尾加：

```ts
  "software_library",
```

MODULE_LABEL 加：

```ts
  software_library: "软件库",
```

MODULE_DESC 加：

```ts
  software_library: "工作软件上传下载 / 分类管理",
```

- [ ] **Step 4: role-defaults 特例**

修改 `src/modules/permissions/role-defaults.ts` 的 `ROLE_DEFAULTS_SEED`：

```ts
export const ROLE_DEFAULTS_SEED: (Permission & {
  position: string;
  module: ModuleKey;
  description: string;
})[] = POSITION_BASE.flatMap((row) =>
  MODULE_KEYS.map((module) => ({
    ...row,
    module,
    // 软件库：全员可见可下载（scope=all），can_edit/can_admin 沿用岗位 base（仅总监/老板 true）
    ...(module === "software_library" ? { scope: "all" as const } : {}),
  })),
);
```

- [ ] **Step 5: 跑测试确认通过 + 全量回归**

Run: `pnpm test tests/modules/permissions/ && pnpm typecheck`
Expected: PASS（含既有 resolve/scope 测试不回归）

- [ ] **Step 6: Commit**

```bash
git add src/modules/permissions/modules.ts src/modules/permissions/role-defaults.ts tests/modules/permissions/role-defaults.test.ts
git commit -m "feat(permissions): 注册 software_library 板块（全员可见，总监/老板可编辑）"
```

---

### Task 3: software-library 模块核心（types/schema/authz/storage）

**Files:**
- Create: `src/modules/software-library/types.ts`
- Create: `src/modules/software-library/schema.ts`
- Create: `src/modules/software-library/authz.ts`
- Create: `src/modules/software-library/storage.ts`
- Create: `src/modules/software-library/server.ts`（本 task 先导 storage/authz）
- Create: `src/modules/software-library/index.ts`（本 task 先导 types/schema）
- Test: `tests/modules/software-library/storage.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `tests/modules/software-library/storage.test.ts`：

```ts
import { describe, it, expect, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { dingtalk_user } from "@/db/schema/dingtalk";
import { buildSoftwarePath, ingestSoftware, listItems } from "@/modules/software-library/server";
import { removeFile } from "@/modules/editing-storage/server";

const NAS = process.env.EDITING_NAS_PATH ?? "./tmp/editing-nas";
const createdIds: number[] = [];
const createdPaths: string[] = [];

afterEach(async () => {
  for (const id of createdIds) {
    await db
      .delete(software_item)
      .where(eq(software_item.id, id))
      .catch(() => undefined);
  }
  for (const p of createdPaths) {
    await removeFile(NAS, p).catch(() => undefined);
  }
  createdIds.length = 0;
  createdPaths.length = 0;
});

async function realUserId(): Promise<string | null> {
  const [u] = await db.select({ id: dingtalk_user.user_id }).from(dingtalk_user).limit(1);
  return u?.id ?? null;
}

async function makeTempFile(): Promise<{ md5: string; tmpRel: string; bytes: number }> {
  const content = Buffer.from(`TEST-SOFTWARE-${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  const md5 = createHash("md5").update(content).digest("hex");
  const tmpRel = join(".tmp", `vitest-sw-${md5.slice(0, 10)}`);
  await mkdir(join(NAS, ".tmp"), { recursive: true });
  await writeFile(join(NAS, tmpRel), content);
  return { md5, tmpRel, bytes: content.length };
}

describe("buildSoftwarePath 纯函数", () => {
  const now = new Date(2026, 6, 9); // 2026-07

  it("路径 = 软件库/yyyymm/md5前12-文件名", () => {
    const p = buildSoftwarePath("abcdef0123456789", "OBS-Studio-30.exe", now);
    expect(p).toBe("软件库/202607/abcdef012345-OBS-Studio-30.exe");
  });

  it("剥掉路径与前导点，防目录穿越", () => {
    const p = buildSoftwarePath("abcdef0123456789", "../../.hidden.dmg", now);
    expect(p).toBe("软件库/202607/abcdef012345-hidden.dmg");
  });

  it("空文件名兜底 unnamed", () => {
    const p = buildSoftwarePath("abcdef0123456789", "...", now);
    expect(p).toBe("软件库/202607/abcdef012345-unnamed");
  });
});

describe("ingestSoftware 入库/去重/软删", () => {
  it("ingest：落 NAS + 入库 + 可查", async () => {
    const userId = await realUserId();
    if (!userId) return; // 无用户数据时跳过
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r = await ingestSoftware(NAS, {
      fileName: "向日葵远程.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: "向日葵",
      version: "v15.2",
      note: "远程协助",
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);

    expect(r.ok).toBe(true);
    expect(r.deduped).toBe(false);

    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.name).toBe("向日葵");
    expect(row.version).toBe("v15.2");
    expect(row.nas_path).toContain("软件库/");

    const st = await stat(join(NAS, row.nas_path));
    expect(st.size).toBe(bytes);

    const list = await listItems({ page: 1, pageSize: 100 });
    expect(list.items.some((i) => i.id === r.itemId)).toBe(true);
  });

  it("自定义名为空时回退文件名", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();
    const r = await ingestSoftware(NAS, {
      fileName: "setup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: "  ",
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);
    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);
    expect(row.name).toBe("setup.exe");
  });

  it("MD5 去重：同内容再传命中已有条目", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();

    const r1 = await ingestSoftware(NAS, {
      fileName: "dup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r1.itemId);
    const [row1] = await db.select().from(software_item).where(eq(software_item.id, r1.itemId));
    if (!row1) throw new Error("DB 行未创建");
    createdPaths.push(row1.nas_path);

    await writeFile(join(NAS, tmpRel), Buffer.from("X")); // 重造临时文件，md5 由参数决定
    const r2 = await ingestSoftware(NAS, {
      fileName: "dup.exe",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });

    expect(r2.deduped).toBe(true);
    expect(r2.itemId).toBe(r1.itemId);
  });

  it("软删后 listItems 不再返回", async () => {
    const userId = await realUserId();
    if (!userId) return;
    const { md5, tmpRel, bytes } = await makeTempFile();
    const r = await ingestSoftware(NAS, {
      fileName: "del.dmg",
      md5,
      bytes,
      tmpRelPath: tmpRel,
      categoryId: null,
      name: null,
      version: null,
      note: null,
      uploadedByUserId: userId,
    });
    createdIds.push(r.itemId);
    const [row] = await db.select().from(software_item).where(eq(software_item.id, r.itemId));
    if (!row) throw new Error("DB 行未创建");
    createdPaths.push(row.nas_path);

    await db
      .update(software_item)
      .set({ deleted_at: sql`now()` })
      .where(eq(software_item.id, r.itemId));

    const list = await listItems({ page: 1, pageSize: 100 });
    expect(list.items.some((i) => i.id === r.itemId)).toBe(false);
  });
});
```

> 注意：本测试引用了 Task 4 的 `listItems`。Task 3 实施时先把 `listItems` 相关断言注释掉（3 处），Task 4 完成 queries 后恢复。或者 Task 3/4 一起做完再跑全绿——两个 task 由同一人连续执行时推荐后者。

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test tests/modules/software-library/storage.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: types.ts**

创建 `src/modules/software-library/types.ts`：

```ts
export interface SoftwareCategoryItem {
  id: number;
  name: string;
  sortOrder: number;
  itemCount: number; // 分类下未删软件数
}

export interface SoftwareListItem {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  version: string | null;
  note: string | null;
  fileName: string;
  fileSize: number;
  downloadCount: number;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  uploadedAt: string; // ISO
}

export interface SoftwareListResult {
  items: SoftwareListItem[];
  total: number;
}
```

- [ ] **Step 4: schema.ts（Zod）**

创建 `src/modules/software-library/schema.ts`：

```ts
import { z } from "zod";

export const CreateCategoryInput = z.object({
  name: z.string().trim().min(1, "分类名不能为空").max(30),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const RenameCategoryInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(30),
});

export const DeleteCategoryInput = z.object({
  id: z.number().int().positive(),
});

export const UpdateItemInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120).optional(),
  version: z.string().trim().max(60).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

export const DeleteItemInput = z.object({
  id: z.number().int().positive(),
});

export const ListItemsInput = z.object({
  // undefined = 全部；"none" = 未分类；数字 = 指定分类
  category: z.union([z.number().int().positive(), z.literal("none")]).optional(),
  keyword: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
});
export type ListItemsInput = z.infer<typeof ListItemsInput>;
```

- [ ] **Step 5: authz.ts**

创建 `src/modules/software-library/authz.ts`：

```ts
import "server-only";
import { requireUser } from "@/lib/auth/page-auth";
import { resolvePermission } from "@/modules/permissions/server";
import type { ResolvedPermission } from "@/modules/permissions";

/**
 * 软件库鉴权。
 *  - 浏览/下载：scope !== "none"（默认全员）
 *  - 上传/编辑/删除/分类管理：can_edit（默认总监/老板，可在权限页单独授权）
 */
const MODULE = "software_library" as const;

export async function requireSoftwareViewer(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (perm.scope === "none") throw new Error("无软件库访问权限");
  return { userId, perm };
}

export async function requireSoftwareWriter(): Promise<{
  userId: string;
  perm: ResolvedPermission;
}> {
  const { userId } = await requireUser();
  const perm = await resolvePermission(userId, MODULE);
  if (!perm.can_edit) throw new Error("无软件库上传/管理权限");
  return { userId, perm };
}
```

- [ ] **Step 6: storage.ts**

创建 `src/modules/software-library/storage.ts`：

```ts
import "server-only";
import { basename, join } from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { moveTemp, removeTemp } from "@/modules/editing-storage/server";

const SOFTWARE_ROOT = "软件库";

function safeFilename(name: string): string {
  return basename(name).replace(/^\.+/, "") || "unnamed";
}

/**
 * 物理路径与逻辑分类解耦：软件库/{yyyymm}/{md5前12}-{安全文件名}。
 * 改分类/改名只改 DB，不动 NAS 文件。
 */
export function buildSoftwarePath(md5: string, originalName: string, now: Date): string {
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return join(SOFTWARE_ROOT, yyyymm, `${md5.slice(0, 12)}-${safeFilename(originalName)}`);
}

export interface IngestSoftwareInput {
  fileName: string;
  md5: string;
  bytes: number;
  tmpRelPath: string;
  categoryId: number | null;
  name: string | null; // 自定义名，空则用文件名
  version: string | null;
  note: string | null;
  uploadedByUserId: string;
}

export interface IngestSoftwareResult {
  ok: true;
  itemId: number;
  deduped: boolean;
}

/**
 * 把已落临时盘的上传文件入库。
 *  - MD5 去重：库里已有同 hash 且未删 → 删临时文件，返回已有条目（deduped=true）。
 *  - 未命中 → moveTemp 到正式路径 → insert software_item。
 */
export async function ingestSoftware(
  nasRoot: string,
  input: IngestSoftwareInput,
): Promise<IngestSoftwareResult> {
  const [existing] = await db
    .select({ id: software_item.id })
    .from(software_item)
    .where(and(eq(software_item.file_hash, input.md5), isNull(software_item.deleted_at)));
  if (existing) {
    await removeTemp(nasRoot, input.tmpRelPath).catch(() => undefined);
    return { ok: true, itemId: existing.id, deduped: true };
  }

  const relPath = buildSoftwarePath(input.md5, input.fileName, new Date());
  await moveTemp(nasRoot, input.tmpRelPath, relPath);

  try {
    const [row] = await db
      .insert(software_item)
      .values({
        category_id: input.categoryId,
        name: (input.name && input.name.trim()) || input.fileName,
        version: input.version?.trim() || null,
        note: input.note?.trim() || null,
        nas_path: relPath,
        file_name: input.fileName,
        file_hash: input.md5,
        file_size: input.bytes,
        uploaded_by_user_id: input.uploadedByUserId,
      })
      .returning({ id: software_item.id });
    if (!row) throw new Error("软件入库失败");
    return { ok: true, itemId: row.id, deduped: false };
  } catch (err) {
    // DB 写失败补偿：删掉刚落盘的正式文件，避免 NAS 孤儿
    const { removeFile } = await import("@/modules/editing-storage/server");
    await removeFile(nasRoot, relPath).catch(() => undefined);
    throw err;
  }
}
```

- [ ] **Step 7: 双入口占位**

创建 `src/modules/software-library/server.ts`（Task 4 会补 queries 导出）：

```ts
import "server-only";
export {
  ingestSoftware,
  buildSoftwarePath,
  type IngestSoftwareInput,
  type IngestSoftwareResult,
} from "./storage";
export { requireSoftwareViewer, requireSoftwareWriter } from "./authz";
```

创建 `src/modules/software-library/index.ts`（Task 4 会补 actions 导出）：

```ts
export type {
  SoftwareCategoryItem,
  SoftwareListItem,
  SoftwareListResult,
} from "./types";

export {
  CreateCategoryInput,
  RenameCategoryInput,
  DeleteCategoryInput,
  UpdateItemInput,
  DeleteItemInput,
  ListItemsInput,
} from "./schema";
```

- [ ] **Step 8: 跑测试（纯函数部分通过）**

Run: `pnpm test tests/modules/software-library/storage.test.ts`
Expected: `buildSoftwarePath` 3 条 PASS；ingest 4 条若 `listItems` 未注释会因 queries 缺失编译失败——按 Step 1 注意事项处理（与 Task 4 连做则此步可延后到 Task 4 Step 6 一起验证）。

- [ ] **Step 9: Commit**

```bash
git add src/modules/software-library/ tests/modules/software-library/
git commit -m "feat(software-library): 模块核心（authz/storage/types/zod schema）"
```

---

### Task 4: queries + actions + 双入口收口 + ESLint zone

**Files:**
- Create: `src/modules/software-library/queries.ts`
- Create: `src/modules/software-library/actions/create-category.ts`
- Create: `src/modules/software-library/actions/rename-category.ts`
- Create: `src/modules/software-library/actions/delete-category.ts`
- Create: `src/modules/software-library/actions/update-item.ts`
- Create: `src/modules/software-library/actions/delete-item.ts`
- Create: `src/modules/software-library/actions/list-items.ts`
- Modify: `src/modules/software-library/index.ts` / `server.ts`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: queries.ts**

创建 `src/modules/software-library/queries.ts`：

```ts
import "server-only";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import { dingtalk_user } from "@/db/schema/dingtalk";
import type { ListItemsInput } from "./schema";
import type { SoftwareCategoryItem, SoftwareListItem, SoftwareListResult } from "./types";

/** 全部分类 + 每分类未删软件数。 */
export async function listCategories(): Promise<SoftwareCategoryItem[]> {
  const rows = await db
    .select({
      id: software_category.id,
      name: software_category.name,
      sortOrder: software_category.sort_order,
      itemCount: sql<number>`count(${software_item.id})::int`,
    })
    .from(software_category)
    .leftJoin(
      software_item,
      and(
        eq(software_item.category_id, software_category.id),
        isNull(software_item.deleted_at),
      ),
    )
    .groupBy(software_category.id)
    .orderBy(software_category.sort_order, software_category.id);
  return rows;
}

export async function listItems(input: ListItemsInput): Promise<SoftwareListResult> {
  const conds = [isNull(software_item.deleted_at)];
  if (input.category === "none") conds.push(isNull(software_item.category_id));
  else if (typeof input.category === "number")
    conds.push(eq(software_item.category_id, input.category));
  if (input.keyword) {
    const kw = `%${input.keyword}%`;
    const kwCond = or(ilike(software_item.name, kw), ilike(software_item.file_name, kw));
    if (kwCond) conds.push(kwCond);
  }
  const where = and(...conds);

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(software_item)
    .where(where);
  const total = countRows[0]?.total ?? 0;

  const rows = await db
    .select({
      id: software_item.id,
      name: software_item.name,
      categoryId: software_item.category_id,
      categoryName: software_category.name,
      version: software_item.version,
      note: software_item.note,
      fileName: software_item.file_name,
      fileSize: software_item.file_size,
      downloadCount: software_item.download_count,
      uploadedByUserId: software_item.uploaded_by_user_id,
      uploadedByName: dingtalk_user.name,
      createdAt: software_item.created_at,
    })
    .from(software_item)
    .leftJoin(software_category, eq(software_category.id, software_item.category_id))
    .leftJoin(dingtalk_user, eq(dingtalk_user.user_id, software_item.uploaded_by_user_id))
    .where(where)
    .orderBy(desc(software_item.created_at))
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize);

  return {
    total,
    items: rows.map(
      (r): SoftwareListItem => ({
        id: r.id,
        name: r.name,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        version: r.version,
        note: r.note,
        fileName: r.fileName,
        fileSize: r.fileSize,
        downloadCount: r.downloadCount,
        uploadedByUserId: r.uploadedByUserId,
        uploadedByName: r.uploadedByName,
        uploadedAt: r.createdAt.toISOString(),
      }),
    ),
  };
}

/** 下载路由用：取未删条目的物理路径与原始文件名。 */
export async function getItemFile(
  id: number,
): Promise<{ nasPath: string; fileName: string } | null> {
  const [r] = await db
    .select({ nasPath: software_item.nas_path, fileName: software_item.file_name })
    .from(software_item)
    .where(and(eq(software_item.id, id), isNull(software_item.deleted_at)));
  return r ?? null;
}

/** 分类名是否已被占用（excludeId 用于重命名时排除自身）。 */
export async function categoryNameTaken(name: string, excludeId?: number): Promise<boolean> {
  const conds = [eq(software_category.name, name)];
  if (excludeId != null) conds.push(ne(software_category.id, excludeId));
  const [row] = await db
    .select({ id: software_category.id })
    .from(software_category)
    .where(and(...conds))
    .limit(1);
  return row != null;
}

/** 分类下是否还有未删软件（删除保护）。 */
export async function categoryHasActiveItems(id: number): Promise<boolean> {
  const [row] = await db
    .select({ id: software_item.id })
    .from(software_item)
    .where(and(eq(software_item.category_id, id), isNull(software_item.deleted_at)))
    .limit(1);
  return row != null;
}
```

> 注意：文件顶部 drizzle-orm 导入需含 `ne`：`import { and, desc, eq, ilike, isNull, ne, or, sql } from "drizzle-orm";`

- [ ] **Step 2: actions（6 个文件）**

创建 `src/modules/software-library/actions/create-category.ts`：

```ts
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { categoryNameTaken } from "../queries";
import { CreateCategoryInput } from "../schema";

export async function createCategory(input: unknown): Promise<{ ok: true; id: number }> {
  const data = CreateCategoryInput.parse(input);
  await requireSoftwareWriter();
  if (await categoryNameTaken(data.name)) throw new Error("同名分类已存在");
  const [row] = await db
    .insert(software_category)
    .values({ name: data.name })
    .returning({ id: software_category.id });
  if (!row) throw new Error("创建分类失败");
  revalidatePath("/software");
  return { ok: true, id: row.id };
}
```

创建 `src/modules/software-library/actions/rename-category.ts`：

```ts
"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { categoryNameTaken } from "../queries";
import { RenameCategoryInput } from "../schema";

export async function renameCategory(input: unknown): Promise<{ ok: true }> {
  const data = RenameCategoryInput.parse(input);
  await requireSoftwareWriter();
  if (await categoryNameTaken(data.name, data.id)) throw new Error("同名分类已存在");
  const res = await db
    .update(software_category)
    .set({ name: data.name, updated_at: new Date() })
    .where(eq(software_category.id, data.id))
    .returning({ id: software_category.id });
  if (!res.length) throw new Error("分类不存在");
  revalidatePath("/software");
  return { ok: true };
}
```

创建 `src/modules/software-library/actions/delete-category.ts`：

```ts
"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { categoryHasActiveItems } from "../queries";
import { DeleteCategoryInput } from "../schema";

/** 删除分类：分类下还有未删软件则拒绝，避免悬空引用。 */
export async function deleteCategory(input: unknown): Promise<{ ok: true }> {
  const data = DeleteCategoryInput.parse(input);
  await requireSoftwareWriter();

  if (await categoryHasActiveItems(data.id)) throw new Error("该分类下还有软件，请先移走或删除");

  const res = await db
    .delete(software_category)
    .where(eq(software_category.id, data.id))
    .returning({ id: software_category.id });
  if (!res.length) throw new Error("分类不存在");

  revalidatePath("/software");
  return { ok: true };
}
```

创建 `src/modules/software-library/actions/update-item.ts`：

```ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { UpdateItemInput } from "../schema";

export async function updateItem(input: unknown): Promise<{ ok: true }> {
  const data = UpdateItemInput.parse(input);
  await requireSoftwareWriter();

  if (typeof data.categoryId === "number") {
    const [cat] = await db
      .select({ id: software_category.id })
      .from(software_category)
      .where(eq(software_category.id, data.categoryId))
      .limit(1);
    if (!cat) throw new Error("目标分类不存在");
  }

  const patch: Partial<typeof software_item.$inferInsert> = { updated_at: new Date() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.version !== undefined) patch.version = data.version?.trim() || null;
  if (data.note !== undefined) patch.note = data.note?.trim() || null;
  if (data.categoryId !== undefined) patch.category_id = data.categoryId;

  const res = await db
    .update(software_item)
    .set(patch)
    .where(and(eq(software_item.id, data.id), isNull(software_item.deleted_at)))
    .returning({ id: software_item.id });
  if (!res.length) throw new Error("软件不存在或已删除");

  revalidatePath("/software");
  return { ok: true };
}
```

创建 `src/modules/software-library/actions/delete-item.ts`：

```ts
"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { requireSoftwareWriter } from "../authz";
import { DeleteItemInput } from "../schema";

/** 软删（NAS 文件保留，需要时可人工恢复）。 */
export async function deleteItem(input: unknown): Promise<{ ok: true }> {
  const data = DeleteItemInput.parse(input);
  await requireSoftwareWriter();
  const res = await db
    .update(software_item)
    .set({ deleted_at: new Date() })
    .where(and(eq(software_item.id, data.id), isNull(software_item.deleted_at)))
    .returning({ id: software_item.id });
  if (!res.length) throw new Error("软件不存在或已删除");
  revalidatePath("/software");
  return { ok: true };
}
```

创建 `src/modules/software-library/actions/list-items.ts`：

```ts
"use server";
import { requireSoftwareViewer } from "../authz";
import { listItems } from "../queries";
import { ListItemsInput } from "../schema";
import type { SoftwareListResult } from "../types";

/** 客户端分类切换/搜索用的列表拉取。 */
export async function fetchItems(input: unknown): Promise<SoftwareListResult> {
  const data = ListItemsInput.parse(input);
  await requireSoftwareViewer();
  return listItems(data);
}
```

- [ ] **Step 3: 双入口收口**

`src/modules/software-library/index.ts` 追加（文件末尾）：

```ts
export { createCategory } from "./actions/create-category";
export { renameCategory } from "./actions/rename-category";
export { deleteCategory } from "./actions/delete-category";
export { updateItem } from "./actions/update-item";
export { deleteItem } from "./actions/delete-item";
export { fetchItems } from "./actions/list-items";
```

`src/modules/software-library/server.ts` 追加：

```ts
export {
  listCategories,
  listItems,
  getItemFile,
  categoryNameTaken,
  categoryHasActiveItems,
} from "./queries";
```

- [ ] **Step 4: ESLint zone 注册**

修改 `eslint.config.mjs`：仿照 material-library 的 zone 块（约 45-55 行），在其后插入同构块：

```js
            {
              target: [
                "./src/app/**",
                "./src/components/**",
                "./src/lib/**",
                "./src/modules/!(software-library)/**",
              ],
              from: "./src/modules/software-library/!(index|server).ts",
              message: "software-library 模块只能从 index.ts / server.ts 入口 import",
            },
```

> 实施时以文件里 material-library 块的实际字段/格式为准（target 数组内容一致，只换模块名），保持逐字段对齐。

- [ ] **Step 5: 分类校验测试**

创建 `tests/modules/software-library/categories.test.ts`：

```ts
import { describe, it, expect, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { software_category, software_item } from "@/db/schema/software";
import { categoryHasActiveItems, categoryNameTaken } from "@/modules/software-library/server";

const createdCatIds: number[] = [];
const createdItemIds: number[] = [];

afterEach(async () => {
  for (const id of createdItemIds) {
    await db
      .delete(software_item)
      .where(eq(software_item.id, id))
      .catch(() => undefined);
  }
  for (const id of createdCatIds) {
    await db
      .delete(software_category)
      .where(eq(software_category.id, id))
      .catch(() => undefined);
  }
  createdItemIds.length = 0;
  createdCatIds.length = 0;
});

async function makeCategory(name: string): Promise<number> {
  const [row] = await db
    .insert(software_category)
    .values({ name })
    .returning({ id: software_category.id });
  if (!row) throw new Error("插入分类失败");
  createdCatIds.push(row.id);
  return row.id;
}

describe("分类重名校验 categoryNameTaken", () => {
  it("同名已存在返回 true；excludeId 排除自身", async () => {
    const name = `vitest-分类-${Date.now()}`;
    const id = await makeCategory(name);
    expect(await categoryNameTaken(name)).toBe(true);
    expect(await categoryNameTaken(name, id)).toBe(false);
    expect(await categoryNameTaken(`${name}-不存在`)).toBe(false);
  });
});

describe("分类删除保护 categoryHasActiveItems", () => {
  it("有未删软件 true；软删后 false", async () => {
    const id = await makeCategory(`vitest-删保-${Date.now()}`);
    const [item] = await db
      .insert(software_item)
      .values({
        category_id: id,
        name: "t",
        nas_path: `软件库/test/vitest-${Date.now()}`,
        file_name: "t.exe",
        file_hash: `vitest-${Date.now()}`,
        file_size: 1,
      })
      .returning({ id: software_item.id });
    if (!item) throw new Error("插入软件失败");
    createdItemIds.push(item.id);

    expect(await categoryHasActiveItems(id)).toBe(true);

    await db
      .update(software_item)
      .set({ deleted_at: new Date() })
      .where(eq(software_item.id, item.id));
    expect(await categoryHasActiveItems(id)).toBe(false);
  });
});
```

- [ ] **Step 6: Zod schema 边界测试**

创建 `tests/modules/software-library/schema.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { CreateCategoryInput, ListItemsInput, UpdateItemInput } from "@/modules/software-library";

describe("软件库 Zod schema 边界", () => {
  it("分类名 trim 后不能为空", () => {
    expect(() => CreateCategoryInput.parse({ name: "  " })).toThrow();
    expect(CreateCategoryInput.parse({ name: " 直播工具 " }).name).toBe("直播工具");
  });

  it("ListItemsInput category 联合类型：数字/none/缺省", () => {
    expect(ListItemsInput.parse({}).category).toBeUndefined();
    expect(ListItemsInput.parse({ category: "none" }).category).toBe("none");
    expect(ListItemsInput.parse({ category: 3 }).category).toBe(3);
    expect(() => ListItemsInput.parse({ category: "abc" })).toThrow();
  });

  it("UpdateItemInput version/note 可置空", () => {
    const r = UpdateItemInput.parse({ id: 1, version: null, note: null });
    expect(r.version).toBeNull();
    expect(r.note).toBeNull();
  });
});
```

- [ ] **Step 7: 恢复 storage.test.ts 中 listItems 断言（若 Task 3 注释过）**

- [ ] **Step 8: 全量验证**

Run: `pnpm typecheck && pnpm lint && pnpm test tests/modules/software-library/`
Expected: 全部 PASS（ingest/分类测试在有 dingtalk_user 数据的 dev 库上执行）

- [ ] **Step 9: Commit**

```bash
git add src/modules/software-library/ eslint.config.mjs tests/modules/software-library/
git commit -m "feat(software-library): queries + 分类/条目 actions + 双入口 + eslint zone"
```

---

### Task 5: API routes（上传/下载）

**Files:**
- Create: `src/app/api/software/upload/route.ts`
- Create: `src/app/api/software/download/route.ts`

- [ ] **Step 1: 上传 route**

创建 `src/app/api/software/upload/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { parseUploadToTemp, removeTemp } from "@/modules/editing-storage/server";
import { ingestSoftware, requireSoftwareWriter } from "@/modules/software-library/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) {
    return NextResponse.json({ ok: false, error: "EDITING_NAS_PATH 未配置" }, { status: 500 });
  }

  // 先鉴权再落盘：未授权请求不允许往 NAS 写临时文件
  let userId: string;
  try {
    ({ userId } = await requireSoftwareWriter());
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }

  // 流式落盘到临时文件（峰值 ~64KB，大安装包不会 OOM）
  let parsed;
  try {
    parsed = await parseUploadToTemp(req, NAS);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `上传失败：${msg}` }, { status: 400 });
  }

  try {
    const catRaw = parsed.fields.categoryId;
    const categoryId = catRaw && catRaw !== "" ? Number(catRaw) : null;
    const result = await ingestSoftware(NAS, {
      fileName: parsed.fileName,
      md5: parsed.md5,
      bytes: parsed.bytes,
      tmpRelPath: parsed.tmpRelPath,
      categoryId: categoryId && Number.isFinite(categoryId) ? categoryId : null,
      name: parsed.fields.name ?? null,
      version: parsed.fields.version ?? null,
      note: parsed.fields.note ?? null,
      uploadedByUserId: userId,
    });
    return NextResponse.json(result);
  } catch (e) {
    // ingest 内部已对自身失败做补偿删除；这里兜底删临时文件（幂等）
    await removeTemp(NAS, parsed.tmpRelPath).catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
```

- [ ] **Step 2: 下载 route**

创建 `src/app/api/software/download/route.ts`：

```ts
import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { software_item } from "@/db/schema/software";
import { getDownloadStream, statFile } from "@/modules/editing-storage/server";
import { getItemFile, requireSoftwareViewer } from "@/modules/software-library/server";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSoftwareViewer();
  } catch (e) {
    const status = isAppError(e) ? e.httpStatus : 403;
    return new NextResponse(e instanceof Error ? e.message : "Forbidden", { status });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id || !Number.isFinite(id)) return new NextResponse("Bad Request", { status: 400 });

  const item = await getItemFile(id);
  if (!item) return new NextResponse("Not Found", { status: 404 });

  const NAS = process.env.EDITING_NAS_PATH;
  if (!NAS) return new NextResponse("NAS 未配置", { status: 500 });

  let size: number;
  try {
    ({ size } = await statFile(NAS, item.nasPath));
  } catch {
    return new NextResponse("文件不存在", { status: 404 });
  }

  const disposition = `attachment; filename="${encodeURIComponent(item.fileName)}"`;

  // Range 请求（浏览器断点续传）不重复计数
  const rangeHeader = req.headers.get("range");
  if (!rangeHeader) {
    await db
      .update(software_item)
      .set({ download_count: sql`${software_item.download_count} + 1` })
      .where(eq(software_item.id, id))
      .catch(() => undefined);
  }

  const rangeMatch = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;
  if (rangeMatch) {
    const hasStart = rangeMatch[1] !== "";
    const hasEnd = rangeMatch[2] !== "";
    let start: number;
    let end: number;
    if (!hasStart && !hasEnd) {
      start = NaN;
      end = NaN;
    } else if (!hasStart) {
      start = size - Number(rangeMatch[2]);
      end = size - 1;
    } else {
      start = Number(rangeMatch[1]);
      end = hasEnd ? Number(rangeMatch[2]) : size - 1;
    }
    start = Math.max(0, start);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      return new NextResponse("Range Not Satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${size}` },
      });
    }
    end = Math.min(end, size - 1);
    const webStream = nodeStreamToWeb(getDownloadStream(NAS, item.nasPath, { start, end }));
    return new NextResponse(webStream, {
      status: 206,
      headers: {
        "Content-Disposition": disposition,
        "Content-Type": "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  const webStream = nodeStreamToWeb(getDownloadStream(NAS, item.nasPath));
  return new NextResponse(webStream, {
    headers: {
      "Content-Disposition": disposition,
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Length": String(size),
    },
  });
}

/**
 * Node fs 流 → Web ReadableStream 健壮桥接（与 materials/download 同款）：
 * cancel 时销毁底层流、enqueue 包 try/catch 兜底竞态、背压避免大文件全进内存。
 */
function nodeStreamToWeb(node: NodeJS.ReadableStream): ReadableStream<Uint8Array> {
  const nodeReadable = node as Readable;
  let canceled = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeReadable.on("data", (chunk: Buffer) => {
        if (canceled) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          canceled = true;
          nodeReadable.destroy();
          return;
        }
        if ((controller.desiredSize ?? 1) <= 0) nodeReadable.pause();
      });
      nodeReadable.on("end", () => {
        if (canceled) return;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      nodeReadable.on("error", (err) => {
        if (canceled) return;
        try {
          controller.error(err);
        } catch {
          /* already errored */
        }
      });
    },
    pull() {
      nodeReadable.resume();
    },
    cancel() {
      canceled = true;
      nodeReadable.destroy();
    },
  });
}
```

- [ ] **Step 3: 验证 + Commit**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS

```bash
git add src/app/api/software/
git commit -m "feat(software-library): 上传/下载 API（流式 + MD5 去重 + Range 断点续传）"
```

---

### Task 6: 导航 + 页面 + 客户端 UI

**Files:**
- Modify: `src/lib/nav.ts`
- Create: `src/app/(dashboard)/software/page.tsx`
- Create: `src/app/(dashboard)/software/_components/software-library.tsx`

- [ ] **Step 1: 导航注册**

修改 `src/lib/nav.ts`：

lucide 导入行加 `HardDriveDownload`（保持字母序）：

```ts
import {
  BarChart3,
  HardDriveDownload,
  Home,
  MonitorPlay,
  Scissors,
  Settings2,
  Shield,
  UserCircle2,
  Users,
  type LucideIcon,
} from "lucide-react";
```

在 `NAV` 数组中「短视频」（key: "editing"）section 之后、「运营管理」（key: "ops"）之前插入：

```ts
  {
    key: "software",
    label: "软件库",
    icon: HardDriveDownload,
    single: true,
    href: "/software",
    module: "software_library",
  },
```

- [ ] **Step 2: 页面 server component**

创建 `src/app/(dashboard)/software/page.tsx`：

```tsx
import { redirect } from "next/navigation";
import {
  listCategories,
  listItems,
  requireSoftwareViewer,
} from "@/modules/software-library/server";
import { SoftwareLibrary } from "./_components/software-library";

export const dynamic = "force-dynamic";

export default async function SoftwarePage() {
  let canEdit = false;
  try {
    const { perm } = await requireSoftwareViewer();
    canEdit = perm.can_edit;
  } catch {
    redirect("/dashboard");
  }

  const [categories, list] = await Promise.all([
    listCategories(),
    listItems({ page: 1, pageSize: 100 }),
  ]);

  return (
    <SoftwareLibrary
      initialCategories={categories}
      initialItems={list.items}
      initialTotal={list.total}
      canEdit={canEdit}
    />
  );
}
```

- [ ] **Step 3: 客户端组件**

创建 `src/app/(dashboard)/software/_components/software-library.tsx`：

```tsx
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  FolderPlus,
  HardDriveDownload,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PromptDialog } from "@/components/ui/prompt-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createCategory,
  deleteCategory,
  deleteItem,
  fetchItems,
  renameCategory,
  updateItem,
  type SoftwareCategoryItem,
  type SoftwareListItem,
} from "@/modules/software-library";

type CategoryFilter = "all" | "none" | number;

interface Props {
  initialCategories: SoftwareCategoryItem[];
  initialItems: SoftwareListItem[];
  initialTotal: number;
  canEdit: boolean;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function SoftwareLibrary({
  initialCategories,
  initialItems,
  initialTotal,
  canEdit,
}: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [activeCat, setActiveCat] = useState<CategoryFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [isPending, startTransition] = useTransition();

  // server component 重新渲染（revalidatePath 后）同步 props
  useEffect(() => setCategories(initialCategories), [initialCategories]);
  useEffect(() => {
    setItems(initialItems);
    setTotal(initialTotal);
  }, [initialItems, initialTotal]);

  const reload = useCallback(
    (cat: CategoryFilter, kw: string) => {
      startTransition(async () => {
        try {
          const r = await fetchItems({
            category: cat === "all" ? undefined : cat,
            keyword: kw.trim() || undefined,
            page: 1,
            pageSize: 100,
          });
          setItems(r.items);
          setTotal(r.total);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "加载失败");
        }
      });
    },
    [startTransition],
  );

  // 搜索防抖
  const kwTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onKeywordChange(v: string) {
    setKeyword(v);
    if (kwTimer.current) clearTimeout(kwTimer.current);
    kwTimer.current = setTimeout(() => reload(activeCat, v), 300);
  }

  function switchCategory(cat: CategoryFilter) {
    setActiveCat(cat);
    reload(cat, keyword);
  }

  // ---- 分类管理 ----
  const [createCatOpen, setCreateCatOpen] = useState(false);
  const [renameCat, setRenameCat] = useState<SoftwareCategoryItem | null>(null);
  const [deleteCat, setDeleteCat] = useState<SoftwareCategoryItem | null>(null);

  async function handleCreateCategory(name: string) {
    try {
      await createCategory({ name });
      toast.success("分类已创建");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建分类失败");
    }
  }

  async function handleRenameCategory(name: string) {
    if (!renameCat) return;
    try {
      await renameCategory({ id: renameCat.id, name });
      toast.success("分类已重命名");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重命名失败");
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCat) return;
    try {
      await deleteCategory({ id: deleteCat.id });
      toast.success("分类已删除");
      if (activeCat === deleteCat.id) setActiveCat("all");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  // ---- 上传 / 编辑 / 删除条目 ----
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editItem, setEditItem] = useState<SoftwareListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SoftwareListItem | null>(null);

  async function handleDeleteItem() {
    if (!deleteTarget) return;
    try {
      await deleteItem({ id: deleteTarget.id });
      toast.success("已删除");
      reload(activeCat, keyword);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  return (
    <div className="flex gap-4 p-4">
      {/* 左侧分类栏 */}
      <aside className="w-[180px] shrink-0">
        <div className="bg-card rounded-xl border p-2">
          <CategoryRow
            label="全部"
            active={activeCat === "all"}
            onClick={() => switchCategory("all")}
          />
          <CategoryRow
            label="未分类"
            active={activeCat === "none"}
            onClick={() => switchCategory("none")}
          />
          <div className="my-1.5 border-t" />
          {categories.map((c) => (
            <CategoryRow
              key={c.id}
              label={c.name}
              count={c.itemCount}
              active={activeCat === c.id}
              onClick={() => switchCategory(c.id)}
              onRename={canEdit ? () => setRenameCat(c) : undefined}
              onDelete={canEdit ? () => setDeleteCat(c) : undefined}
            />
          ))}
          {canEdit && (
            <button
              type="button"
              onClick={() => setCreateCatOpen(true)}
              className="text-muted-foreground hover:text-primary mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[12px]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              新建分类
            </button>
          )}
        </div>
      </aside>

      {/* 右侧列表 */}
      <main className="min-w-0 flex-1">
        <div className="bg-card rounded-xl border">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <HardDriveDownload className="text-primary h-4.5 w-4.5" />
            <h1 className="text-[15px] font-semibold">软件库</h1>
            <span className="text-muted-foreground text-xs">{total} 个软件</span>
            <div className="relative ml-auto w-56">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                value={keyword}
                onChange={(e) => onKeywordChange(e.target.value)}
                placeholder="搜索软件名/文件名"
                className="h-8 pl-8 text-[13px]"
              />
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setUploadOpen(true)}>
                <Upload className="mr-1 h-3.5 w-3.5" />
                上传软件
              </Button>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>版本</TableHead>
                <TableHead>说明</TableHead>
                <TableHead>大小</TableHead>
                <TableHead>上传人</TableHead>
                <TableHead>上传时间</TableHead>
                <TableHead className="text-right">下载次数</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-32 text-center">
                    {isPending ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    ) : (
                      "暂无软件"
                    )}
                  </TableCell>
                </TableRow>
              )}
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="max-w-[220px]">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-muted-foreground truncate text-[11px]">
                      {it.fileName}
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px]">{it.categoryName ?? "未分类"}</TableCell>
                  <TableCell className="text-[12px]">{it.version ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate text-[12px]">
                    {it.note ?? "-"}
                  </TableCell>
                  <TableCell className="text-[12px] tabular-nums">
                    {formatSize(it.fileSize)}
                  </TableCell>
                  <TableCell className="text-[12px]">{it.uploadedByName ?? "-"}</TableCell>
                  <TableCell className="text-[12px] tabular-nums">
                    {formatDate(it.uploadedAt)}
                  </TableCell>
                  <TableCell className="text-right text-[12px] tabular-nums">
                    {it.downloadCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={`/api/software/download?id=${it.id}`} download>
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setEditItem(it)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive h-7 px-2"
                            onClick={() => setDeleteTarget(it)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* 弹窗集合 */}
      <PromptDialog
        open={createCatOpen}
        title="新建分类"
        placeholder="如：直播工具 / 办公软件"
        maxLength={30}
        onOpenChange={setCreateCatOpen}
        onConfirm={handleCreateCategory}
      />
      <PromptDialog
        open={renameCat != null}
        title="重命名分类"
        defaultValue={renameCat?.name ?? ""}
        maxLength={30}
        onOpenChange={(o) => !o && setRenameCat(null)}
        onConfirm={handleRenameCategory}
      />
      <ConfirmDialog
        open={deleteCat != null}
        title={`删除分类「${deleteCat?.name ?? ""}」？`}
        description="分类下还有软件时无法删除。"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteCat(null)}
        onConfirm={handleDeleteCategory}
      />
      <ConfirmDialog
        open={deleteTarget != null}
        title={`删除「${deleteTarget?.name ?? ""}」？`}
        description="删除后列表不再展示（NAS 文件保留，可联系管理员恢复）。"
        variant="danger"
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={handleDeleteItem}
      />
      {uploadOpen && (
        <UploadDialog
          categories={categories}
          defaultCategoryId={typeof activeCat === "number" ? activeCat : null}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => {
            setUploadOpen(false);
            reload(activeCat, keyword);
            router.refresh();
          }}
        />
      )}
      {editItem && (
        <EditDialog
          item={editItem}
          categories={categories}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null);
            reload(activeCat, keyword);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CategoryRow({
  label,
  count,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div ref={ref} className="group relative">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors",
          active
            ? "bg-primary/10 text-primary font-medium"
            : "text-foreground/80 hover:bg-[var(--hover-bg)]",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count != null && <span className="text-muted-foreground text-[11px]">{count}</span>}
        {(onRename || onDelete) && (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="hover:bg-muted hidden rounded p-0.5 group-hover:block"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
      {menuOpen && (
        <div className="border-border absolute top-full right-0 z-20 mt-0.5 w-[100px] rounded-lg border bg-white p-1 shadow-lg">
          {onRename && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onRename();
              }}
              className="hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px]"
            >
              <Pencil className="h-3 w-3" /> 重命名
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="text-destructive hover:bg-muted flex w-full items-center gap-1.5 rounded px-2 py-1 text-[12px]"
            >
              <Trash2 className="h-3 w-3" /> 删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UploadDialog({
  categories,
  defaultCategoryId,
  onClose,
  onUploaded,
}: {
  categories: SoftwareCategoryItem[];
  defaultCategoryId: number | null;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>(
    defaultCategoryId != null ? String(defaultCategoryId) : "none",
  );
  const [version, setVersion] = useState("");
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !name.trim()) setName(f.name.replace(/\.[^.]+$/, ""));
  }

  function submit() {
    if (!file) {
      toast.error("请先选择文件");
      return;
    }
    const fd = new FormData();
    fd.append("name", name.trim());
    fd.append("categoryId", categoryId === "none" ? "" : categoryId);
    fd.append("version", version.trim());
    fd.append("note", note.trim());
    fd.append("file", file); // file 放最后：busboy 之前的 fields 才能在文件流前解析到

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("POST", "/api/software/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      try {
        const res = JSON.parse(xhr.responseText) as {
          ok?: boolean;
          deduped?: boolean;
          error?: string;
        };
        if (xhr.status === 200 && res.ok) {
          toast.success(res.deduped ? "该文件已存在，直接复用" : "上传成功");
          onUploaded();
        } else {
          toast.error(res.error ?? `上传失败（${xhr.status}）`);
        }
      } catch {
        toast.error(`上传失败（${xhr.status}）`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      toast.error("网络错误，上传失败");
    };
    setProgress(0);
    xhr.send(fd);
  }

  function cancel() {
    xhrRef.current?.abort();
    onClose();
  }

  const uploading = progress != null;

  return (
    <Dialog open onOpenChange={(o) => !o && !uploading && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>上传软件</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">安装包文件</Label>
            <Input
              type="file"
              disabled={uploading}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
            {file && (
              <p className="text-muted-foreground mt-1 text-[11px]">
                {file.name}（{formatSize(file.size)}）
              </p>
            )}
          </div>
          <div>
            <Label className="text-xs">软件名称</Label>
            <Input
              value={name}
              disabled={uploading}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：OBS 直播推流"
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">分类</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={uploading}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">版本号（选填）</Label>
              <Input
                value={version}
                disabled={uploading}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="如：v30.2"
                maxLength={60}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">说明备注（选填）</Label>
            <Textarea
              value={note}
              disabled={uploading}
              onChange={(e) => setNote(e.target.value)}
              placeholder="一句话说明用途，如：直播伴侣，装播必备"
              maxLength={300}
              rows={2}
              className="mt-1"
            />
          </div>
          {uploading && (
            <div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-muted-foreground mt-1 text-center text-[11px]">
                {progress}%（大文件请勿关闭页面）
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={cancel}>
            取消
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || uploading}>
            {uploading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            {uploading ? "上传中…" : "开始上传"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: SoftwareListItem;
  categories: SoftwareCategoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState<string>(
    item.categoryId != null ? String(item.categoryId) : "none",
  );
  const [version, setVersion] = useState(item.version ?? "");
  const [note, setNote] = useState(item.note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await updateItem({
        id: item.id,
        name: name.trim(),
        categoryId: categoryId === "none" ? null : Number(categoryId),
        version: version.trim() || null,
        note: note.trim() || null,
      });
      toast.success("已保存");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑软件信息</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">软件名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">分类</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分类</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">版本号</Label>
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                maxLength={60}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">说明备注</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              className="mt-1"
            />
          </div>
          <p className="text-muted-foreground text-[11px]">
            原始文件：{item.fileName}（{formatSize(item.fileSize)}）— 文件本体不可改，需要换包请删除后重传
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: 手工冒烟（dev）**

```bash
pnpm dev
```

管理员（张锦钉钉登录 or emergency-admin）访问 `http://localhost:3000/software`：
1. 侧边栏出现「软件库」入口（顶层，短视频之下）
2. 新建分类「直播工具」→ 出现在左栏
3. 上传一个小文件（如 10MB 的 zip），填名称/版本/说明 → 进度条走完 → 列表出现
4. 点下载 → 浏览器下载成功、文件名正确、下载次数 +1（刷新可见）
5. 编辑改分类 → 分类列表计数变化
6. 再传同一个文件 → 提示「该文件已存在，直接复用」
7. 删除条目 → 列表消失
8. 用无 can_edit 的账号（或权限页把自己某测试号设为 scope=all/can_edit=false）确认：能看能下载，无上传/编辑/删除按钮

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts "src/app/(dashboard)/software/"
git commit -m "feat(software-library): /software 页面 + 顶层导航（分类栏/表格/XHR 进度上传）"
```

---

### Task 7: 全量验证 + 文档更新

**Files:**
- Modify: `CLAUDE.md`（表清单 + 模块清单）

- [ ] **Step 1: 全量验证**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 全部 PASS。

- [ ] **Step 2: 更新根 CLAUDE.md**

数据库表清单（45 → 47 张）追加一段：

```
软件库：
  software_category / software_item
```

并把「数据库当前状态（45 张 public 表）」标题数字改为 47。

模块清单（19 → 20 个）：

```
剪辑工作流：editing-task / editing-editor / editing-storage
软件库：software-library
```

并把「模块清单（19 个 module …）」数字改成 20。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): 软件库板块入册（software_category/software_item + software-library 模块）"
```

---

## 部署提醒（不在本 plan 内自动执行）

NAS 部署时无需新增配置：`EDITING_NAS_PATH=/mnt/qjhy-edit` 已挂载，migration 随 `pnpm db:migrate` 一起跑。走 memory `qjhy-pro-nas-deployment.md` 的 build → save → scp → load → recreate 流程即可。
