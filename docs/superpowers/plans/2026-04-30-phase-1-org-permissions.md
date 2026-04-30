# Phase 1: 组织架构 + 权限基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 QJHY-Pro 系统"知道谁是谁、谁能看什么"——通过钉钉同步建立组织架构数据底座，并实现三层叠加（岗位默认 + 部门负责人加成 + 个体覆盖）的权限模型，配合统一的管理员页面。Phase 1 完成后，系统具备完整的身份和权限管理能力，但还没有业务数据。

**Architecture:** 沿用 Phase 0 的 feature-first + 薄共享层。钉钉作为组织/人员的权威源，每天 02:00 同步到本地表（保留原始 raw JSON）。权限计算独立成 `modules/permissions` 模块，通过 `applyScopeFilter` helper 强制所有数据查询通过权限过滤。管理员页面用单页 + 三 Tab 设计避免老中台"切来切去"的痛。

**Tech Stack:** Next.js 16 + TypeScript strict + Drizzle ORM + PostgreSQL 16 + better-auth（钉钉 OAuth 完整接入）+ Zod + Vitest（Phase 1 引入用于权限单元测试）+ shadcn/ui + Tailwind v4。

**Reference:**
- Spec: `/Users/zhangjin/qjhy-pro/docs/superpowers/specs/2026-04-30-qjhy-pro-design.md`（重点看第 4-5 节）
- PRO3 钉钉同步参考：`/Users/zhangjin/miracle-pro3/`（业务逻辑参考，不复用 schema）
- Phase 0 完成 tag: `v0.1.0-phase0`
- 设计 token: `/Users/zhangjin/qjhy-pro/docs/design/tokens.md`

---

## File Structure (created/modified by Phase 1)

### 新增文件

```
src/
├── lib/
│   ├── dingtalk/                     ← 钉钉 API client（共享）
│   │   ├── client.ts                 ← access_token 缓存 + HTTP 调用
│   │   ├── types.ts                  ← Zod schema for 钉钉 API 响应
│   │   └── index.ts
│   └── audit/                        ← 审计日志（共享）
│       ├── log.ts                    ← writeAuditLog 通用函数
│       └── index.ts
├── modules/
│   └── permissions/                  ← 权限业务模块（feature-first 第一个业务模块）
│       ├── schema.ts                 ← Zod 输入校验
│       ├── types.ts                  ← Permission/Scope 类型定义
│       ├── role-defaults.ts          ← role_default_permission 默认 seed
│       ├── resolve.ts                ← 三层叠加权限计算
│       ├── scope.ts                  ← applyScopeFilter helper
│       ├── actions.ts                ← Server Actions（管理员页用）
│       ├── README.md                 ← 模块说明
│       └── index.ts
├── db/
│   └── schema/
│       ├── dingtalk.ts               ← dingtalk_dept / dingtalk_user
│       ├── permissions.ts            ← dept_leader / role_default_permission / auth_permission_override
│       └── audit.ts                  ← audit_log
├── worker/
│   └── jobs/
│       └── sync-dingtalk.ts          ← 钉钉同步 job
└── app/
    ├── (dashboard)/
    │   ├── admin/
    │   │   └── permissions/
    │   │       ├── page.tsx          ← 三 Tab 容器
    │   │       └── _components/
    │   │           ├── tabs.tsx
    │   │           ├── users-tab.tsx
    │   │           ├── role-defaults-tab.tsx
    │   │           └── audit-log-tab.tsx
    │   └── profile/
    │       └── page.tsx              ← 用户看自己权限来源
    └── api/
        └── (better-auth 内部 handle 钉钉 callback，不需要新文件)

vitest.config.ts                      ← Vitest 配置
tests/
├── modules/permissions/
│   ├── resolve.test.ts
│   └── scope.test.ts
└── setup.ts                          ← 测试环境
```

### 修改文件

```
src/lib/auth/config.ts                ← 钉钉 OAuth 完整接入（替换 Phase 0 占位）
src/lib/auth/dingtalk-provider.ts     ← 实现 OAuth flow
src/db/schema/index.ts                ← export 新 schema
src/worker/index.ts                   ← register sync-dingtalk job
src/app/(dashboard)/layout.tsx        ← 加 admin/profile 入口
src/app/(dashboard)/dashboard/page.tsx ← 显示用户权限摘要
src/app/(auth)/login/page.tsx         ← 钉钉登录按钮接入真实 OAuth
package.json                          ← 加 vitest scripts + 钉钉 SDK
.env.example                          ← 更新钉钉字段说明
CONTRIBUTING.md                       ← 第 8 节注册 permissions 模块
```

---

## 关键设计决策

### 决策 1: 钉钉 API 接入方式
- 用钉钉**服务端 API**（v1.0/v2.0 OpenAPI），不用前端 JSAPI
- 鉴权用 `corpid + appkey + appsecret` 拿 `access_token`，缓存 7100 秒（实际 7200 秒过期，留 100 秒余量）
- 同步策略：**全量 upsert**，不做增量（增量太复杂、对 1000 人以下规模没必要）

### 决策 2: 三层权限叠加
```
最终权限 = MAX(
  岗位默认 (role_default_permission),
  是否 dept_leader (是→TEAM, 否→NONE),
  override (auth_permission_override)
)
```
NONE < SELF < TEAM < ALL

### 决策 3: SELF scope 的双重含义
- 用户是主播：看 `anchor_profile.user_id = 当前用户`
- 用户是运营：看 `anchor_operator.operator_user_id = 当前用户` 关联的主播
- 系统自动 union（不让用户选）
- **Phase 1 暂没有 anchor 数据**，SELF scope 计算逻辑写好但实际查询会返回空（这是预期）

### 决策 4: 同步频率
- 钉钉同步：每天 02:00（cron）
- 不做增量，每次全量 upsert
- 同步失败 → 钉钉机器人通知（含"报错"关键词）

### 决策 5: 单元测试范围
- **权限计算 (`resolve.ts`) 必须单测**——逻辑复杂、错了影响大
- **applyScopeFilter (`scope.ts`) 必须单测**——SQL WHERE 注入正确性
- 钉钉同步 job 不做单测（用真实 API 集成测）
- UI 组件不做单测（成本高收益低）

---

## Task 1: 用户配合 — 申请钉钉应用 + 提供 credentials

**Files:** Modify `.env.local`

**前提**：你（用户）需要在钉钉开发者后台 https://open-dev.dingtalk.com/ 创建一个**企业内部 H5 微应用**或**小程序**，拿到三个值：
- `corpid` (企业 ID)
- `appkey` (应用 AppKey)
- `appsecret` (应用 AppSecret)

并配置：
- 回调域名：`http://localhost:3000`（dev）+ 未来生产域名
- 权限点：`通讯录读权限`（必须）+ `身份验证扫码登录`

- [ ] **Step 1: 在钉钉开发者后台创建应用，获取 credentials**

由你（用户）操作：
1. 打开 https://open-dev.dingtalk.com/，用钉钉扫码登录企业管理员账号
2. 应用管理 → 创建应用 → "企业内部应用" → 选 "H5 微应用"
3. 应用名称：`QJHY-Pro 中台`
4. 描述：`奇迹互娱直播部内部管理中台`
5. 创建后进入应用详情，记下：
   - `appkey`
   - `appsecret`（点"重置"获取，注意只显示一次）
   - `corpid`（企业信息页面）
6. 权限管理 → 申请：
   - `通讯录部门信息读权限`
   - `通讯录部门成员信息读权限`
   - `成员手机号信息`（可选，用于关联）
   - `企业员工信息读权限`
   - `身份验证 - 扫码登录`
7. 安全设置：
   - 服务器出口 IP：留空（开发期）
   - 接口调用回调域名：`localhost:3000`（dev）

- [ ] **Step 2: 把 credentials 填入 `.env.local`**

```bash
# 编辑 /Users/zhangjin/qjhy-pro/.env.local
# 找到这三行（已有，但是空的）：
DINGTALK_APP_KEY=填入appkey
DINGTALK_APP_SECRET=填入appsecret
DINGTALK_CORP_ID=填入corpid
```

- [ ] **Step 3: 验证 env 加载**

```bash
cd /Users/zhangjin/qjhy-pro
pnpm exec tsx --env-file=.env.local -e \
  "import('./src/lib/env').then(({ env }) => console.log({ key: !!env.DINGTALK_APP_KEY, secret: !!env.DINGTALK_APP_SECRET, corpid: !!env.DINGTALK_CORP_ID }))"
```

预期：`{ key: true, secret: true, corpid: true }`

- [ ] **Step 4: 不要 commit（.env.local 已 ignore）**

```bash
git status   # .env.local 不应出现
```

> ⚠️ **此 Task 没有 git commit**——只是配置环境。后续所有 task 都依赖这个配置。

---

## Task 2: 钉钉 API client 封装

**Files:**
- Create: `src/lib/dingtalk/types.ts`, `src/lib/dingtalk/client.ts`, `src/lib/dingtalk/index.ts`

#### Step 1: 创建 `src/lib/dingtalk/types.ts`（钉钉 API 响应 Zod schema）

```typescript
import { z } from "zod";

// 钉钉 access_token 响应
export const DingtalkAccessTokenResponse = z.object({
  accessToken: z.string(),
  expireIn: z.number(),
});
export type DingtalkAccessTokenResponse = z.infer<typeof DingtalkAccessTokenResponse>;

// 钉钉部门
export const DingtalkDept = z.object({
  dept_id: z.number(),
  name: z.string(),
  parent_id: z.number(),
  source_identifier: z.string().optional(),
  create_dept_group: z.boolean().optional(),
  auto_add_user: z.boolean().optional(),
});
export type DingtalkDept = z.infer<typeof DingtalkDept>;

// 钉钉人员
export const DingtalkUser = z.object({
  userid: z.string(),
  unionid: z.string(),
  name: z.string(),
  mobile: z.string().optional(),
  job_number: z.string().optional(),
  title: z.string().optional(), // 钉钉里的"岗位/职位"
  dept_id_list: z.array(z.number()),
  dept_order_list: z.array(z.object({ dept_id: z.number(), order: z.number() })).optional(),
  active: z.boolean(),
  avatar: z.string().optional(),
  email: z.string().optional(),
  hired_date: z.number().optional(),
});
export type DingtalkUser = z.infer<typeof DingtalkUser>;
```

#### Step 2: 创建 `src/lib/dingtalk/client.ts`

```typescript
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { DingtalkAccessTokenResponse, DingtalkDept, DingtalkUser } from "./types";

const API_BASE = "https://api.dingtalk.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (!env.DINGTALK_APP_KEY || !env.DINGTALK_APP_SECRET) {
    throw new AppError(
      "DINGTALK_NOT_CONFIGURED",
      "钉钉 APP_KEY 或 APP_SECRET 未配置",
      500,
    );
  }
  const res = await fetch(`${API_BASE}/v1.0/oauth2/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: env.DINGTALK_APP_KEY,
      appSecret: env.DINGTALK_APP_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_TOKEN_FAILED",
      `获取 access_token 失败: ${res.status} ${body}`,
      500,
    );
  }
  const data = DingtalkAccessTokenResponse.parse(await res.json());
  cachedToken = {
    token: data.accessToken,
    // 钉钉返回 expireIn 是秒，留 100 秒余量
    expiresAt: Date.now() + (data.expireIn - 100) * 1000,
  };
  return cachedToken.token;
}

async function callDingtalkApi<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      "x-acs-dingtalk-access-token": token,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_API_FAILED",
      `钉钉 API 调用失败 ${path}: ${res.status} ${body}`,
      500,
      { path, status: res.status },
    );
  }
  return (await res.json()) as T;
}

/** 拉取所有部门（递归） */
export async function fetchAllDepartments(): Promise<DingtalkDept[]> {
  // 钉钉 API: /topapi/v2/department/listsub  (旧接口)
  // 推荐新接口: /v1.0/contact/departments
  const result = await callDingtalkApi<{ result: unknown[] }>(
    "/v1.0/contact/departments",
  );
  return result.result.map((r) => DingtalkDept.parse(r));
}

/** 拉取部门下所有用户 */
export async function fetchUsersInDepartment(
  deptId: number,
): Promise<DingtalkUser[]> {
  const result = await callDingtalkApi<{ result: { list: unknown[] } }>(
    `/v1.0/contact/departments/${deptId}/users`,
  );
  return result.result.list.map((u) => DingtalkUser.parse(u));
}
```

> ⚠️ **API 路径以钉钉官方文档为准**。钉钉 v1.0/v2.0 接口命名经常变化，实施时用 context7 MCP 查 `dingtalk` 最新接口文档（特别是 `/contact/departments` 和 `/contact/users` 接口的具体路径）。如果接口找不到，BLOCKED 报告。

#### Step 3: 创建 `src/lib/dingtalk/index.ts`

```typescript
export {
  fetchAllDepartments,
  fetchUsersInDepartment,
} from "./client";
export type {
  DingtalkDept,
  DingtalkUser,
} from "./types";
```

#### Step 4: 验证 client 工作（真实调用钉钉 API）

```bash
cd /Users/zhangjin/qjhy-pro

cat > /tmp/_verify_dingtalk.ts <<'EOF'
import { fetchAllDepartments } from "/Users/zhangjin/qjhy-pro/src/lib/dingtalk";

async function main() {
  const depts = await fetchAllDepartments();
  console.log(`✅ 拉到 ${depts.length} 个部门:`);
  console.log(depts.slice(0, 3).map((d) => ({ id: d.dept_id, name: d.name })));
}
main().catch(console.error);
EOF

pnpm exec tsx --env-file=.env.local /tmp/_verify_dingtalk.ts
rm /tmp/_verify_dingtalk.ts
```

预期：输出 `✅ 拉到 N 个部门` + 部门名称（应包含"长沙奇迹互娱"或类似）。

#### Step 5: typecheck + lint

```bash
pnpm typecheck && pnpm lint
```

#### Step 6: Commit

```bash
git add src/lib/dingtalk
git commit -m "feat(lib): add DingTalk API client with token caching"
```

---

## Task 3: 钉钉 OAuth 完整接入 better-auth

**Files:**
- Modify: `src/lib/auth/dingtalk-provider.ts`, `src/lib/auth/config.ts`

#### Step 1: 用 context7 查 better-auth 最新文档

```
# 用 context7 MCP 查
# resolve-library-id "better-auth"
# query-docs "generic OAuth provider, custom social provider"
```

确认 better-auth 当前版本（1.6.x）的 generic OAuth 接入方式。如果 better-auth 提供了 `genericOAuth` 插件，用它；如果只能用 `socialProviders.<custom>`，按文档写。

#### Step 2: 完善 `src/lib/auth/dingtalk-provider.ts`

```typescript
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export interface DingtalkProfile {
  unionid: string;
  openid: string;
  nick: string;
  avatarUrl: string;
  mobile?: string;
}

const DINGTALK_AUTH_URL = "https://login.dingtalk.com/oauth2/auth";
const DINGTALK_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USERINFO_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

export function buildDingtalkAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(DINGTALK_AUTH_URL);
  url.searchParams.set("client_id", env.DINGTALK_APP_KEY);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid corpid");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; refreshToken: string; expireIn: number }> {
  const res = await fetch(DINGTALK_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env.DINGTALK_APP_KEY,
      clientSecret: env.DINGTALK_APP_SECRET,
      code,
      grantType: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new AppError(
      "DINGTALK_OAUTH_TOKEN_FAILED",
      `钉钉 OAuth 换 token 失败: ${res.status} ${await res.text()}`,
      500,
    );
  }
  return await res.json();
}

export async function fetchDingtalkProfile(accessToken: string): Promise<DingtalkProfile> {
  const res = await fetch(DINGTALK_USERINFO_URL, {
    headers: { "x-acs-dingtalk-access-token": accessToken },
  });
  if (!res.ok) {
    throw new AppError(
      "DINGTALK_OAUTH_PROFILE_FAILED",
      `钉钉获取用户信息失败: ${res.status} ${await res.text()}`,
      500,
    );
  }
  return await res.json();
}

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}

export function mapDingtalkProfileToUser(profile: DingtalkProfile) {
  return {
    id: profile.unionid,
    email: `${profile.unionid}@dingtalk.local`,
    name: profile.nick,
    image: profile.avatarUrl,
    emailVerified: true,
  };
}
```

#### Step 3: 修改 `src/lib/auth/config.ts` 接入钉钉 generic OAuth

实施时根据 better-auth 文档调整。基本结构：

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins"; // 如果有
import { db } from "@/db/client";
import {
  auth_user,
  auth_session,
  auth_account,
  auth_verification,
} from "@/db/schema";
import { env } from "@/lib/env";
import { isDingtalkProviderConfigured } from "./dingtalk-provider";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: auth_user,
      session: auth_session,
      account: auth_account,
      verification: auth_verification,
    },
  }),
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: isDingtalkProviderConfigured()
    ? [
        genericOAuth({
          config: [
            {
              providerId: "dingtalk",
              clientId: env.DINGTALK_APP_KEY,
              clientSecret: env.DINGTALK_APP_SECRET,
              authorizationUrl: "https://login.dingtalk.com/oauth2/auth",
              tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
              userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
              scopes: ["openid", "corpid"],
              mapProfileToUser: (profile: unknown) => {
                const p = profile as {
                  unionid: string;
                  nick: string;
                  avatarUrl: string;
                };
                return {
                  id: p.unionid,
                  email: `${p.unionid}@dingtalk.local`,
                  name: p.nick,
                  image: p.avatarUrl,
                  emailVerified: true,
                };
              },
            },
          ],
        }),
      ]
    : [],
});

export type Auth = typeof auth;
```

> ⚠️ **better-auth API 实际语法以最新文档为准**。如果 `genericOAuth` 插件不存在或语法不同，实施时调整为正确写法。**核心目标**：让 `/api/auth/sign-in/social/dingtalk` 接口工作。

#### Step 4: 修改登录页 `src/app/(auth)/login/page.tsx` 接入钉钉登录

替换 `handleDingtalkLogin` 函数：

```typescript
function handleDingtalkLogin() {
  // 跳转到 better-auth 的 social sign-in 路由
  window.location.href = "/api/auth/sign-in/social?provider=dingtalk&callbackURL=/dashboard";
}
```

(具体 URL 形式以 better-auth 当前文档为准)

#### Step 5: 端到端验证（真实钉钉扫码登录）

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
```

手动操作：
1. 浏览器开 http://localhost:3000/login
2. 点 "钉钉扫码登录" 按钮
3. 应跳转到 `https://login.dingtalk.com/oauth2/auth?...`
4. 用钉钉 App 扫码确认
5. 应回跳到 `http://localhost:3000/dashboard`，看到自己的钉钉昵称

如果出错，查 `tail /tmp/dev.log` 看具体错误。

```bash
kill %1 2>/dev/null
```

#### Step 6: typecheck + lint + Commit

```bash
pnpm typecheck && pnpm lint

git add src/lib/auth src/app/\(auth\)/login
git commit -m "feat(auth): integrate DingTalk OAuth via better-auth genericOAuth"
```

---

## Task 4: 钉钉 schema (`dingtalk_dept` + `dingtalk_user`) + migration

**Files:**
- Create: `src/db/schema/dingtalk.ts`
- Modify: `src/db/schema/index.ts`

#### Step 1: 创建 `src/db/schema/dingtalk.ts`

```typescript
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** 钉钉部门（权威源，定时同步，本地只读） */
export const dingtalk_dept = pgTable(
  "dingtalk_dept",
  {
    dept_id: text("dept_id").primaryKey(), // 钉钉的 dept_id（数字转 text 存）
    name: text("name").notNull(),
    parent_id: text("parent_id"), // 顶级部门为 null
    raw: jsonb("raw").notNull(), // 钉钉返回的完整 JSON
    synced_at: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_parent: index("idx_dingtalk_dept_parent").on(t.parent_id),
  }),
);

/** 钉钉人员（权威源，定时同步，本地只读） */
export const dingtalk_user = pgTable(
  "dingtalk_user",
  {
    user_id: text("user_id").primaryKey(), // 钉钉 userid
    unionid: text("unionid").notNull().unique(), // 用于 OAuth 关联
    name: text("name").notNull(),
    mobile: text("mobile"),
    title: text("title"), // 钉钉里的"岗位/职位"，对应 spec 里的 position
    dept_ids: jsonb("dept_ids").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_unionid: index("idx_dingtalk_user_unionid").on(t.unionid),
    idx_active: index("idx_dingtalk_user_active").on(t.active),
  }),
);
```

> 注意：spec 里写的字段叫 `position`，这里用 `title`（钉钉 API 实际字段名）。这是符合"以平台原始字段为准"原则。展示层翻译用 field_alias。

#### Step 2: 在 `src/db/schema/index.ts` 加 export

```typescript
export * from "./_meta";
export * from "./auth";
export * from "./dingtalk";
```

#### Step 3: 生成 migration

```bash
pnpm db:generate
```

预期：生成 `src/db/migrations/0002_xxx.sql` 含两张表。

#### Step 4: 跑 migration

```bash
pnpm db:migrate
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt"
```

应看到 `dingtalk_dept` + `dingtalk_user` 出现。

#### Step 5: typecheck + Commit

```bash
pnpm typecheck

git add src/db/schema src/db/migrations
git commit -m "feat(db): add dingtalk_dept and dingtalk_user schema"
```

---

## Task 5: 钉钉同步 worker job

**Files:**
- Create: `src/worker/jobs/sync-dingtalk.ts`
- Modify: `src/worker/index.ts`

#### Step 1: 创建 `src/worker/jobs/sync-dingtalk.ts`

```typescript
import { db } from "@/db/client";
import { dingtalk_dept, dingtalk_user } from "@/db/schema";
import {
  fetchAllDepartments,
  fetchUsersInDepartment,
  type DingtalkDept,
  type DingtalkUser,
} from "@/lib/dingtalk";
import { writeAuditLog } from "@/lib/audit";
import { notifyError } from "@/lib/notify";
import { sql } from "drizzle-orm";

export async function syncDingtalk(): Promise<void> {
  const startTime = Date.now();
  let deptCount = 0;
  let userCount = 0;

  try {
    // 1. 同步部门
    const depts = await fetchAllDepartments();
    for (const dept of depts) {
      await upsertDept(dept);
      deptCount++;
    }
    console.log(`[sync-dingtalk] synced ${deptCount} depts`);

    // 2. 同步人员（遍历所有部门拉用户）
    const seenUserIds = new Set<string>();
    for (const dept of depts) {
      const users = await fetchUsersInDepartment(dept.dept_id);
      for (const user of users) {
        if (!seenUserIds.has(user.userid)) {
          await upsertUser(user);
          seenUserIds.add(user.userid);
          userCount++;
        }
      }
    }

    // 3. 标记不在最新列表的 user 为 inactive（不删除）
    if (seenUserIds.size > 0) {
      const ids = Array.from(seenUserIds);
      await db.execute(
        sql`UPDATE dingtalk_user SET active = false, synced_at = NOW() WHERE user_id NOT IN (${sql.join(
          ids.map((i) => sql`${i}`),
          sql`, `,
        )})`,
      );
    }

    // 4. 写审计日志
    await writeAuditLog({
      user_id: null,
      action: "DINGTALK_SYNC_SUCCESS",
      target_type: "system",
      target_id: null,
      after: { deptCount, userCount, durationMs: Date.now() - startTime },
    });

    console.log(
      `[sync-dingtalk] ✓ done: ${deptCount} depts, ${userCount} users in ${Date.now() - startTime}ms`,
    );
  } catch (err) {
    console.error("[sync-dingtalk] ✗ failed:", err);
    await notifyError(err, { context: "sync-dingtalk job", deptCount, userCount });
    await writeAuditLog({
      user_id: null,
      action: "DINGTALK_SYNC_FAILED",
      target_type: "system",
      target_id: null,
      after: { deptCount, userCount, error: String(err) },
    });
    throw err;
  }
}

async function upsertDept(dept: DingtalkDept): Promise<void> {
  await db
    .insert(dingtalk_dept)
    .values({
      dept_id: String(dept.dept_id),
      name: dept.name,
      parent_id: dept.parent_id ? String(dept.parent_id) : null,
      raw: dept,
    })
    .onConflictDoUpdate({
      target: dingtalk_dept.dept_id,
      set: {
        name: dept.name,
        parent_id: dept.parent_id ? String(dept.parent_id) : null,
        raw: dept,
        synced_at: new Date(),
      },
    });
}

async function upsertUser(user: DingtalkUser): Promise<void> {
  await db
    .insert(dingtalk_user)
    .values({
      user_id: user.userid,
      unionid: user.unionid,
      name: user.name,
      mobile: user.mobile ?? null,
      title: user.title ?? null,
      dept_ids: user.dept_id_list.map(String),
      active: user.active,
      raw: user,
    })
    .onConflictDoUpdate({
      target: dingtalk_user.user_id,
      set: {
        unionid: user.unionid,
        name: user.name,
        mobile: user.mobile ?? null,
        title: user.title ?? null,
        dept_ids: user.dept_id_list.map(String),
        active: user.active,
        raw: user,
        synced_at: new Date(),
      },
    });
}
```

> 注：上面引用了 `writeAuditLog`，下面 Task 9 会创建。在跑 Task 5 之前，要先确保 Task 9 完成 OR 暂时注释 audit log 调用。**调整执行顺序：先做 Task 9（audit log）再做 Task 5（sync）**。

#### Step 2: 修改 `src/worker/index.ts` 注册 sync job

替换 heartbeat 占位为真实 sync：

```typescript
import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";

registerJob({
  name: "sync-dingtalk",
  schedule: "0 2 * * *", // 每天 02:00
  task: syncDingtalk,
});

// 保留 heartbeat 用于"worker 还活着"的健康检查（每小时一次）
registerJob({
  name: "heartbeat",
  schedule: "0 * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

console.log("[worker] qjhy-pro worker starting");
startScheduler();

process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received, shutting down");
  process.exit(0);
});
```

#### Step 3: 手动触发一次 sync 验证

```bash
cat > /tmp/_run_sync.ts <<'EOF'
import { syncDingtalk } from "/Users/zhangjin/qjhy-pro/src/worker/jobs/sync-dingtalk";
syncDingtalk().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF

pnpm exec tsx --env-file=.env.local /tmp/_run_sync.ts
rm /tmp/_run_sync.ts
```

预期：输出 `[sync-dingtalk] ✓ done: N depts, M users in Xms`。

```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM dingtalk_dept;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT user_id, name, title FROM dingtalk_user LIMIT 5;"
```

应看到部门数 ≥ 1，用户列表里有真实人员。

#### Step 4: typecheck + Commit

```bash
pnpm typecheck && pnpm lint

git add src/worker
git commit -m "feat(worker): add daily DingTalk sync job"
```

---

## Task 6: 权限相关 schema (`dept_leader` + `role_default_permission` + `auth_permission_override`)

**Files:**
- Create: `src/db/schema/permissions.ts`
- Modify: `src/db/schema/index.ts`

#### Step 1: 创建 `src/db/schema/permissions.ts`

```typescript
import {
  boolean,
  index,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { dingtalk_dept, dingtalk_user } from "./dingtalk";

/** 部门负责人（新中台自管，钉钉里没有此概念） */
export const dept_leader = pgTable(
  "dept_leader",
  {
    id: serial("id").primaryKey(),
    dept_id: text("dept_id")
      .notNull()
      .references(() => dingtalk_dept.dept_id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    unique_dept_user: unique("uq_dept_leader_dept_user").on(t.dept_id, t.user_id),
    idx_user: index("idx_dept_leader_user").on(t.user_id),
  }),
);

/** 岗位默认权限（可在 UI 修改） */
export const role_default_permission = pgTable("role_default_permission", {
  position: text("position").primaryKey(), // 钉钉岗位字符串
  scope: text("scope", { enum: ["none", "self", "team", "all"] }).notNull(),
  can_edit: boolean("can_edit").notNull().default(false),
  can_export: boolean("can_export").notNull().default(false),
  can_admin: boolean("can_admin").notNull().default(false),
  description: text("description"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

/** 个体权限覆盖（最高优先级，需理由） */
export const auth_permission_override = pgTable("auth_permission_override", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => dingtalk_user.user_id, { onDelete: "cascade" }),
  scope: text("scope", { enum: ["none", "self", "team", "all"] }), // null = 不覆盖
  can_edit: boolean("can_edit"),
  can_export: boolean("can_export"),
  can_admin: boolean("can_admin"),
  reason: text("reason").notNull(), // 必填理由
  expires_at: timestamp("expires_at"),
  created_by: text("created_by"), // 操作人 user_id
  created_at: timestamp("created_at").notNull().defaultNow(),
});
```

#### Step 2: 在 `src/db/schema/index.ts` 加 export

```typescript
export * from "./_meta";
export * from "./auth";
export * from "./dingtalk";
export * from "./permissions";
```

#### Step 3: 生成 + 跑 migration

```bash
pnpm db:generate
pnpm db:migrate
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt"
```

#### Step 4: typecheck + Commit

```bash
pnpm typecheck

git add src/db/schema src/db/migrations
git commit -m "feat(db): add dept_leader / role_default_permission / auth_permission_override"
```

---

## Task 7: `audit_log` schema + `writeAuditLog` 函数

**Files:**
- Create: `src/db/schema/audit.ts`, `src/lib/audit/log.ts`, `src/lib/audit/index.ts`
- Modify: `src/db/schema/index.ts`

#### Step 1: 创建 `src/db/schema/audit.ts`

```typescript
import {
  index,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const audit_log = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    user_id: text("user_id"), // 操作人，系统操作为 null
    action: text("action").notNull(), // 'PERMISSION_CHANGE' / 'EMERGENCY_LOGIN' / 'DINGTALK_SYNC_*' / ...
    target_type: text("target_type"), // 'user' / 'dept' / 'role' / 'system'
    target_id: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    user_agent: text("user_agent"),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_user_time: index("idx_audit_user_time").on(t.user_id, t.created_at),
    idx_action_time: index("idx_audit_action_time").on(t.action, t.created_at),
  }),
);
```

#### Step 2: 在 `src/db/schema/index.ts` 加 export

```typescript
export * from "./audit";
```

#### Step 3: 创建 `src/lib/audit/log.ts`

```typescript
import { db } from "@/db/client";
import { audit_log } from "@/db/schema";

export type AuditLogInput = {
  user_id: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  user_agent?: string | null;
};

/**
 * 写审计日志。失败不抛异常（避免审计写失败破坏主业务）。
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await db.insert(audit_log).values({
      user_id: input.user_id,
      action: input.action,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
    });
  } catch (err) {
    console.error("[audit] writeAuditLog failed:", err);
    // 不抛异常，让主业务继续
  }
}
```

#### Step 4: 创建 `src/lib/audit/index.ts`

```typescript
export { writeAuditLog, type AuditLogInput } from "./log";
```

#### Step 5: 跑 migration + typecheck + Commit

```bash
pnpm db:generate
pnpm db:migrate
pnpm typecheck

git add src/db/schema src/db/migrations src/lib/audit
git commit -m "feat: add audit_log schema and writeAuditLog helper"
```

---

## Task 8: 配置 Vitest（Phase 1 引入）

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`
- Modify: `package.json`

#### Step 1: 安装 Vitest

```bash
pnpm add -D vitest @vitest/ui happy-dom
```

#### Step 2: 创建 `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

#### Step 3: 创建 `tests/setup.ts`

```typescript
// Vitest 全局测试 setup
// 现在为空，未来加 mock 或测试 DB 初始化
```

#### Step 4: 在 `package.json` 加 scripts

```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

#### Step 5: 写一个 smoke 测试

创建 `tests/smoke.test.ts`：

```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

```bash
pnpm test
```

预期：1 passed。

#### Step 6: 删除 smoke 测试

```bash
rm tests/smoke.test.ts
```

#### Step 7: Commit

```bash
git add vitest.config.ts tests package.json pnpm-lock.yaml
git commit -m "chore: add Vitest for unit testing"
```

---

## Task 9: 权限模块 — 类型 + Zod schema + role_defaults seed

**Files:**
- Create: `src/modules/permissions/types.ts`, `src/modules/permissions/schema.ts`, `src/modules/permissions/role-defaults.ts`, `src/modules/permissions/index.ts`, `src/modules/permissions/README.md`

#### Step 1: 创建 `src/modules/permissions/types.ts`

```typescript
export type Scope = "none" | "self" | "team" | "all";

export type Permission = {
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
};

export type PermissionSource =
  | { kind: "default"; position: string }
  | { kind: "dept_leader"; deptIds: string[] }
  | { kind: "override"; reason: string; expires_at: Date | null };

export type ResolvedPermission = Permission & {
  sources: PermissionSource[];
};
```

#### Step 2: 创建 `src/modules/permissions/schema.ts`

```typescript
import { z } from "zod";

export const ScopeSchema = z.enum(["none", "self", "team", "all"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const PermissionSchema = z.object({
  scope: ScopeSchema,
  can_edit: z.boolean(),
  can_export: z.boolean(),
  can_admin: z.boolean(),
});
export type Permission = z.infer<typeof PermissionSchema>;

export const SetDeptLeaderInput = z.object({
  dept_id: z.string().min(1),
  user_id: z.string().min(1),
});
export type SetDeptLeaderInput = z.infer<typeof SetDeptLeaderInput>;

export const RemoveDeptLeaderInput = z.object({
  dept_id: z.string().min(1),
  user_id: z.string().min(1),
});

export const UpsertOverrideInput = z.object({
  user_id: z.string().min(1),
  scope: ScopeSchema.optional(),
  can_edit: z.boolean().optional(),
  can_export: z.boolean().optional(),
  can_admin: z.boolean().optional(),
  reason: z.string().min(1, "必须填变更理由"),
  expires_at: z.string().datetime().optional(),
});
export type UpsertOverrideInput = z.infer<typeof UpsertOverrideInput>;

export const UpsertRoleDefaultInput = z.object({
  position: z.string().min(1),
  scope: ScopeSchema,
  can_edit: z.boolean(),
  can_export: z.boolean(),
  can_admin: z.boolean(),
  description: z.string().optional(),
});
export type UpsertRoleDefaultInput = z.infer<typeof UpsertRoleDefaultInput>;
```

#### Step 3: 创建 `src/modules/permissions/role-defaults.ts`（默认数据 seed）

```typescript
import type { Permission } from "./types";

/**
 * 岗位默认权限初始 seed。
 * Phase 1 实施时一次性插入到 role_default_permission 表，之后管理员可在 UI 修改。
 */
export const ROLE_DEFAULTS_SEED: Array<Permission & { position: string; description: string }> = [
  { position: "总监", scope: "all", can_edit: true, can_export: true, can_admin: true, description: "看所有数据，可管理" },
  { position: "老板", scope: "all", can_edit: true, can_export: true, can_admin: true, description: "看所有数据，可管理" },
  { position: "运营", scope: "self", can_edit: true, can_export: false, can_admin: false, description: "看自己负责主播" },
  { position: "主播", scope: "self", can_edit: false, can_export: false, can_admin: false, description: "看自己作为主播的数据" },
  { position: "剪辑", scope: "self", can_edit: false, can_export: false, can_admin: false, description: "看自己负责主播" },
  { position: "行政", scope: "none", can_edit: false, can_export: false, can_admin: false, description: "默认无权限" },
  { position: "财务", scope: "none", can_edit: false, can_export: true, can_admin: false, description: "默认无权限，按需开导出" },
  { position: "其他", scope: "none", can_edit: false, can_export: false, can_admin: false, description: "兜底" },
];
```

#### Step 4: 创建 `src/modules/permissions/README.md`

```markdown
# permissions 模块

## 职责

实现 QJHY-Pro 的三层叠加权限模型，参考 spec 第 5 节。

## 公开 API

通过 `index.ts` 导出：

- `resolvePermission(userId)` — 计算用户最终权限（三层叠加）
- `applyScopeFilter(query, user, permission)` — 自动注入 SQL WHERE 条件
- Server Actions: `setDeptLeader`, `removeDeptLeader`, `upsertOverride`, `upsertRoleDefault`
- Schemas: `SetDeptLeaderInput`, `UpsertOverrideInput`, `UpsertRoleDefaultInput`
- Types: `Scope`, `Permission`, `ResolvedPermission`, `PermissionSource`

## 三层叠加

```
最终权限 = MAX(
  岗位默认 (role_default_permission),
  是否 dept_leader (是→TEAM, 否→NONE),
  override (auth_permission_override)
)
```

`MAX` 在 scope 序上：`NONE < SELF < TEAM < ALL`。

## 必读

- 任何业务模块查询数据，**必须**经过 `applyScopeFilter`，不允许裸查询。
- 权限改动**必须**写 `audit_log`（reason 字段非空）。
```

#### Step 5: 创建 `src/modules/permissions/index.ts`（暂时只 export types/schema）

```typescript
export type {
  Scope,
  Permission,
  PermissionSource,
  ResolvedPermission,
} from "./types";

export {
  ScopeSchema,
  PermissionSchema,
  SetDeptLeaderInput,
  RemoveDeptLeaderInput,
  UpsertOverrideInput,
  UpsertRoleDefaultInput,
} from "./schema";

export { ROLE_DEFAULTS_SEED } from "./role-defaults";
```

#### Step 6: 跑一遍 role_defaults seed（写入数据库）

创建临时脚本 `/tmp/_seed_roles.ts`：

```typescript
import { db } from "@/db/client";
import { role_default_permission } from "@/db/schema";
import { ROLE_DEFAULTS_SEED } from "@/modules/permissions";

async function main() {
  for (const role of ROLE_DEFAULTS_SEED) {
    await db
      .insert(role_default_permission)
      .values({
        position: role.position,
        scope: role.scope,
        can_edit: role.can_edit,
        can_export: role.can_export,
        can_admin: role.can_admin,
        description: role.description,
      })
      .onConflictDoNothing();
  }
  console.log(`✅ Seeded ${ROLE_DEFAULTS_SEED.length} role defaults`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

```bash
pnpm exec tsx --env-file=.env.local /tmp/_seed_roles.ts
rm /tmp/_seed_roles.ts

docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT position, scope FROM role_default_permission ORDER BY position;"
```

应看到 8 条记录。

#### Step 7: typecheck + Commit

```bash
pnpm typecheck && pnpm lint

git add src/modules/permissions
git commit -m "feat(permissions): add types, Zod schemas, and role defaults seed"
```

---

## Task 10: 权限计算核心 (`resolve.ts`) + 单元测试

**Files:**
- Create: `src/modules/permissions/resolve.ts`, `tests/modules/permissions/resolve.test.ts`
- Modify: `src/modules/permissions/index.ts`

#### Step 1: 写失败的测试 `tests/modules/permissions/resolve.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { mergePermissions, scopeAtLeast, MAX_SCOPE } from "@/modules/permissions/resolve";
import type { Permission, Scope } from "@/modules/permissions";

describe("scopeAtLeast", () => {
  it("none < self < team < all", () => {
    expect(scopeAtLeast("self", "none")).toBe(true);
    expect(scopeAtLeast("none", "self")).toBe(false);
    expect(scopeAtLeast("all", "team")).toBe(true);
    expect(scopeAtLeast("team", "all")).toBe(false);
    expect(scopeAtLeast("self", "self")).toBe(true);
  });
});

describe("MAX_SCOPE", () => {
  it("returns the strongest scope", () => {
    expect(MAX_SCOPE("none", "self")).toBe("self");
    expect(MAX_SCOPE("self", "team")).toBe("team");
    expect(MAX_SCOPE("team", "all")).toBe("all");
    expect(MAX_SCOPE("self", "self")).toBe("self");
    expect(MAX_SCOPE("none", "none")).toBe("none");
  });
});

describe("mergePermissions (三层叠加)", () => {
  const NULL: Permission = { scope: "none", can_edit: false, can_export: false, can_admin: false };

  it("only role default", () => {
    const role: Permission = { scope: "self", can_edit: true, can_export: false, can_admin: false };
    const result = mergePermissions(role, false, null);
    expect(result.scope).toBe("self");
    expect(result.can_edit).toBe(true);
  });

  it("dept leader upgrades scope to team", () => {
    const role: Permission = { scope: "self", can_edit: false, can_export: false, can_admin: false };
    const result = mergePermissions(role, true, null);
    expect(result.scope).toBe("team");
  });

  it("override beats role + dept_leader", () => {
    const role: Permission = { scope: "self", can_edit: false, can_export: false, can_admin: false };
    const override: Partial<Permission> = { scope: "all", can_export: true };
    const result = mergePermissions(role, true, override);
    expect(result.scope).toBe("all");
    expect(result.can_export).toBe(true);
    // can_edit 没在 override 里 — 应该回退到 role 的 false
    expect(result.can_edit).toBe(false);
  });

  it("partial override only overrides specified fields", () => {
    const role: Permission = { scope: "self", can_edit: true, can_export: false, can_admin: false };
    const override: Partial<Permission> = { can_export: true }; // 只 override can_export
    const result = mergePermissions(role, false, override);
    expect(result.scope).toBe("self");      // 来自 role
    expect(result.can_edit).toBe(true);     // 来自 role
    expect(result.can_export).toBe(true);   // 来自 override
  });

  it("override with smaller scope still applies (override wins absolutely on scope if set)", () => {
    const role: Permission = { scope: "all", can_edit: true, can_export: true, can_admin: true };
    const override: Partial<Permission> = { scope: "none" };
    const result = mergePermissions(role, true, override);
    // override 显式设了 scope=none → 取 max(role.all, dept_leader→team, override.none) = all
    // 因为 mergePermissions 是 MAX，override scope 显式设为更低没效果
    // 这是设计决策：override 可以加权限，不能降权限。如果要降权限，删 dept_leader 或改 role default。
    expect(result.scope).toBe("all");
  });

  it("dept_leader=false has no effect on scope", () => {
    const role: Permission = { scope: "self", can_edit: false, can_export: false, can_admin: false };
    const result = mergePermissions(role, false, null);
    expect(result.scope).toBe("self");
  });

  it("null role + null override + dept_leader=false → none", () => {
    const result = mergePermissions(NULL, false, null);
    expect(result).toEqual(NULL);
  });
});
```

#### Step 2: 跑测试确认失败

```bash
pnpm test tests/modules/permissions/resolve.test.ts
```

预期：FAIL with "module not found"。

#### Step 3: 实现 `src/modules/permissions/resolve.ts`

```typescript
import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  dingtalk_user,
  role_default_permission,
} from "@/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Permission, ResolvedPermission, Scope, PermissionSource } from "./types";

const SCOPE_RANK: Record<Scope, number> = { none: 0, self: 1, team: 2, all: 3 };

export function scopeAtLeast(a: Scope, b: Scope): boolean {
  return SCOPE_RANK[a] >= SCOPE_RANK[b];
}

export function MAX_SCOPE(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

const NULL_PERMISSION: Permission = {
  scope: "none",
  can_edit: false,
  can_export: false,
  can_admin: false,
};

/**
 * 三层叠加合并：role default + dept_leader + override = final
 *
 * 规则：
 * - scope: MAX(role, dept_leader ? team : none, override.scope ?? none)
 * - can_*: override 显式设了用 override，否则用 role
 * - 注意：override 不能"降低"scope（防止误删 dept_leader 也降权限）
 */
export function mergePermissions(
  roleDefault: Permission,
  isDeptLeader: boolean,
  override: Partial<Permission> | null,
): Permission {
  const deptLeaderScope: Scope = isDeptLeader ? "team" : "none";
  const overrideScope: Scope = override?.scope ?? "none";

  let scope = MAX_SCOPE(MAX_SCOPE(roleDefault.scope, deptLeaderScope), overrideScope);

  return {
    scope,
    can_edit: override?.can_edit ?? roleDefault.can_edit,
    can_export: override?.can_export ?? roleDefault.can_export,
    can_admin: override?.can_admin ?? roleDefault.can_admin,
  };
}

/**
 * 查询给定用户的最终权限（含来源说明）。
 */
export async function resolvePermission(userId: string): Promise<ResolvedPermission> {
  const [user] = await db.select().from(dingtalk_user).where(eq(dingtalk_user.user_id, userId));
  if (!user) {
    return { ...NULL_PERMISSION, sources: [] };
  }

  // 1. 岗位默认
  const position = user.title ?? "其他";
  const [roleRow] = await db
    .select()
    .from(role_default_permission)
    .where(eq(role_default_permission.position, position));
  const fallback = await db
    .select()
    .from(role_default_permission)
    .where(eq(role_default_permission.position, "其他"));
  const role: Permission = roleRow
    ? {
        scope: roleRow.scope,
        can_edit: roleRow.can_edit,
        can_export: roleRow.can_export,
        can_admin: roleRow.can_admin,
      }
    : fallback[0]
      ? {
          scope: fallback[0].scope,
          can_edit: fallback[0].can_edit,
          can_export: fallback[0].can_export,
          can_admin: fallback[0].can_admin,
        }
      : NULL_PERMISSION;

  // 2. 是否 dept_leader
  const leaderRows = await db
    .select()
    .from(dept_leader)
    .where(eq(dept_leader.user_id, userId));
  const isDeptLeader = leaderRows.length > 0;

  // 3. override（且未过期）
  const [overrideRow] = await db
    .select()
    .from(auth_permission_override)
    .where(
      and(
        eq(auth_permission_override.user_id, userId),
        or(
          isNull(auth_permission_override.expires_at),
          gt(auth_permission_override.expires_at, new Date()),
        ),
      ),
    );

  const override: Partial<Permission> | null = overrideRow
    ? {
        ...(overrideRow.scope !== null ? { scope: overrideRow.scope } : {}),
        ...(overrideRow.can_edit !== null ? { can_edit: overrideRow.can_edit } : {}),
        ...(overrideRow.can_export !== null ? { can_export: overrideRow.can_export } : {}),
        ...(overrideRow.can_admin !== null ? { can_admin: overrideRow.can_admin } : {}),
      }
    : null;

  const merged = mergePermissions(role, isDeptLeader, override);

  const sources: PermissionSource[] = [{ kind: "default", position }];
  if (isDeptLeader) {
    sources.push({ kind: "dept_leader", deptIds: leaderRows.map((r) => r.dept_id) });
  }
  if (overrideRow) {
    sources.push({
      kind: "override",
      reason: overrideRow.reason,
      expires_at: overrideRow.expires_at,
    });
  }

  return { ...merged, sources };
}
```

#### Step 4: 在 `src/modules/permissions/index.ts` 加 export

```typescript
export {
  resolvePermission,
  mergePermissions,
  scopeAtLeast,
  MAX_SCOPE,
} from "./resolve";
```

#### Step 5: 跑测试确认通过

```bash
pnpm test tests/modules/permissions/resolve.test.ts
```

预期：所有测试 pass。

#### Step 6: typecheck + Commit

```bash
pnpm typecheck && pnpm lint

git add src/modules/permissions tests/modules/permissions
git commit -m "feat(permissions): implement three-tier scope merge with unit tests"
```

---

## Task 11: `applyScopeFilter` helper + 单元测试

**Files:**
- Create: `src/modules/permissions/scope.ts`, `tests/modules/permissions/scope.test.ts`
- Modify: `src/modules/permissions/index.ts`

#### Step 1: 写失败的测试 `tests/modules/permissions/scope.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { buildScopeWhereClause } from "@/modules/permissions/scope";
import type { Scope } from "@/modules/permissions";

describe("buildScopeWhereClause", () => {
  it("scope=all → no filter", () => {
    const result = buildScopeWhereClause("all", "user-1", []);
    expect(result.kind).toBe("none");
  });

  it("scope=none → reject all (1=0)", () => {
    const result = buildScopeWhereClause("none", "user-1", []);
    expect(result.kind).toBe("reject");
  });

  it("scope=self → filter by user_id or operator relation", () => {
    const result = buildScopeWhereClause("self", "user-1", []);
    expect(result.kind).toBe("self");
    expect(result.userId).toBe("user-1");
  });

  it("scope=team → filter by managed dept_ids", () => {
    const result = buildScopeWhereClause("team", "user-1", ["dept-A", "dept-B"]);
    expect(result.kind).toBe("team");
    expect(result.deptIds).toEqual(["dept-A", "dept-B"]);
  });

  it("scope=team with no managed depts → reject (defensive)", () => {
    const result = buildScopeWhereClause("team", "user-1", []);
    expect(result.kind).toBe("reject");
  });
});
```

#### Step 2: 实现 `src/modules/permissions/scope.ts`

```typescript
import type { Scope } from "./types";

export type ScopeWhereClause =
  | { kind: "none" } // no filter
  | { kind: "reject" } // 1=0
  | { kind: "self"; userId: string }
  | { kind: "team"; deptIds: string[] };

/**
 * 根据 scope 计算应用到查询的 WHERE 子句逻辑。
 *
 * 调用方需要根据 kind 转换为具体表的 SQL（不同业务表 join 方式不同）。
 */
export function buildScopeWhereClause(
  scope: Scope,
  userId: string,
  managedDeptIds: string[],
): ScopeWhereClause {
  if (scope === "all") return { kind: "none" };
  if (scope === "none") return { kind: "reject" };
  if (scope === "self") return { kind: "self", userId };
  if (scope === "team") {
    if (managedDeptIds.length === 0) return { kind: "reject" }; // 防御
    return { kind: "team", deptIds: managedDeptIds };
  }
  // 兜底（理论上不到）
  return { kind: "reject" };
}

/**
 * 查询给定用户作为 dept_leader 管理的所有部门 ID（含子部门递归）。
 *
 * 注：此函数依赖 dingtalk_dept 的 parent_id 关系做递归 CTE。
 * 在 Phase 1 实施时如果 Postgres 版本不支持 RECURSIVE CTE，会有问题——但 PG 16 支持。
 */
export async function getManagedDeptIds(_userId: string): Promise<string[]> {
  // 实施提示：用 recursive CTE 查 dept_leader → dingtalk_dept → 子部门
  // 这里简化为单层（直接从 dept_leader 查）。Phase 2 真用 TEAM scope 时再加递归。
  // 详细 SQL 见模块 README。
  // Phase 1 先返回直接管理的部门：
  const { db } = await import("@/db/client");
  const { dept_leader } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db
    .select({ dept_id: dept_leader.dept_id })
    .from(dept_leader)
    .where(eq(dept_leader.user_id, _userId));
  return rows.map((r) => r.dept_id);
}
```

> 注：完整的"managed dept ids 含子部门递归"在 Phase 2 真正用 TEAM 查数据时才必要。Phase 1 先做直接管理的部门，单元测试覆盖逻辑分支。

#### Step 3: 在 `src/modules/permissions/index.ts` 加 export

```typescript
export {
  buildScopeWhereClause,
  getManagedDeptIds,
  type ScopeWhereClause,
} from "./scope";
```

#### Step 4: 跑测试确认通过

```bash
pnpm test tests/modules/permissions/scope.test.ts
```

预期：所有测试 pass。

#### Step 5: typecheck + Commit

```bash
pnpm typecheck && pnpm lint

git add src/modules/permissions tests/modules/permissions
git commit -m "feat(permissions): add applyScopeFilter helper with unit tests"
```

---

## Task 12: 权限模块的 Server Actions

**Files:**
- Create: `src/modules/permissions/actions.ts`
- Modify: `src/modules/permissions/index.ts`

#### Step 1: 创建 `src/modules/permissions/actions.ts`

```typescript
"use server";

import { db } from "@/db/client";
import {
  auth_permission_override,
  dept_leader,
  role_default_permission,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { headers } from "next/headers";
import { eq, and } from "drizzle-orm";
import {
  RemoveDeptLeaderInput,
  SetDeptLeaderInput,
  UpsertOverrideInput,
  UpsertRoleDefaultInput,
} from "./schema";
import { resolvePermission } from "./resolve";

async function requireAdmin(): Promise<{ userId: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AppError("AUTH_NOT_LOGGED_IN", "未登录", 401);
  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) {
    throw new AppError("AUTH_FORBIDDEN", "需要管理员权限", 403);
  }
  return { userId: session.user.id };
}

export async function setDeptLeader(input: unknown): Promise<{ ok: true }> {
  const { dept_id, user_id } = SetDeptLeaderInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  await db
    .insert(dept_leader)
    .values({ dept_id, user_id })
    .onConflictDoNothing();

  await writeAuditLog({
    user_id: opUser,
    action: "DEPT_LEADER_ADDED",
    target_type: "user",
    target_id: user_id,
    after: { dept_id, user_id },
  });
  return { ok: true };
}

export async function removeDeptLeader(input: unknown): Promise<{ ok: true }> {
  const { dept_id, user_id } = RemoveDeptLeaderInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  await db
    .delete(dept_leader)
    .where(and(eq(dept_leader.dept_id, dept_id), eq(dept_leader.user_id, user_id)));

  await writeAuditLog({
    user_id: opUser,
    action: "DEPT_LEADER_REMOVED",
    target_type: "user",
    target_id: user_id,
    after: { dept_id, user_id },
  });
  return { ok: true };
}

export async function upsertOverride(input: unknown): Promise<{ ok: true }> {
  const data = UpsertOverrideInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  const [before] = await db
    .select()
    .from(auth_permission_override)
    .where(eq(auth_permission_override.user_id, data.user_id));

  await db
    .insert(auth_permission_override)
    .values({
      user_id: data.user_id,
      scope: data.scope ?? null,
      can_edit: data.can_edit ?? null,
      can_export: data.can_export ?? null,
      can_admin: data.can_admin ?? null,
      reason: data.reason,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
      created_by: opUser,
    })
    .onConflictDoUpdate({
      target: auth_permission_override.user_id,
      set: {
        scope: data.scope ?? null,
        can_edit: data.can_edit ?? null,
        can_export: data.can_export ?? null,
        can_admin: data.can_admin ?? null,
        reason: data.reason,
        expires_at: data.expires_at ? new Date(data.expires_at) : null,
        created_by: opUser,
      },
    });

  await writeAuditLog({
    user_id: opUser,
    action: "PERMISSION_OVERRIDE_UPSERT",
    target_type: "user",
    target_id: data.user_id,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

export async function upsertRoleDefault(input: unknown): Promise<{ ok: true }> {
  const data = UpsertRoleDefaultInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  const [before] = await db
    .select()
    .from(role_default_permission)
    .where(eq(role_default_permission.position, data.position));

  await db
    .insert(role_default_permission)
    .values({
      position: data.position,
      scope: data.scope,
      can_edit: data.can_edit,
      can_export: data.can_export,
      can_admin: data.can_admin,
      description: data.description ?? null,
    })
    .onConflictDoUpdate({
      target: role_default_permission.position,
      set: {
        scope: data.scope,
        can_edit: data.can_edit,
        can_export: data.can_export,
        can_admin: data.can_admin,
        description: data.description ?? null,
        updated_at: new Date(),
      },
    });

  await writeAuditLog({
    user_id: opUser,
    action: "ROLE_DEFAULT_UPSERT",
    target_type: "role",
    target_id: data.position,
    before: before ? (before as unknown as Record<string, unknown>) : null,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
```

#### Step 2: 在 `src/modules/permissions/index.ts` 加 export

```typescript
export {
  setDeptLeader,
  removeDeptLeader,
  upsertOverride,
  upsertRoleDefault,
} from "./actions";
```

#### Step 3: 在 CONTRIBUTING.md 第 8 节注册模块

```markdown
| permissions | `src/modules/permissions/` | 三层叠加权限计算 + Server Actions + ScopeFilter | Phase 1 (2026-04-30) |
```

#### Step 4: typecheck + lint + Commit

```bash
pnpm typecheck && pnpm lint

git add src/modules/permissions CONTRIBUTING.md
git commit -m "feat(permissions): add Server Actions for dept_leader/override/role-default"
```

---

## Task 13: 统一管理员页面 — `/admin/permissions` 骨架 + Tab 路由

**Files:**
- Create: `src/app/(dashboard)/admin/permissions/page.tsx`, `_components/tabs.tsx`

#### Step 1: 装 shadcn Tabs 组件

```bash
pnpm dlx shadcn@latest add tabs select dialog table textarea
```

#### Step 2: 创建 `src/app/(dashboard)/admin/permissions/_components/tabs.tsx`

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsersTab } from "./users-tab";
import { RoleDefaultsTab } from "./role-defaults-tab";
import { AuditLogTab } from "./audit-log-tab";

export function PermissionsTabs() {
  const [tab, setTab] = useState<"users" | "roles" | "audit">("users");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <TabsList>
        <TabsTrigger value="users">按用户管理</TabsTrigger>
        <TabsTrigger value="roles">岗位默认权限</TabsTrigger>
        <TabsTrigger value="audit">审计日志</TabsTrigger>
      </TabsList>
      <TabsContent value="users">
        <UsersTab />
      </TabsContent>
      <TabsContent value="roles">
        <RoleDefaultsTab />
      </TabsContent>
      <TabsContent value="audit">
        <AuditLogTab />
      </TabsContent>
    </Tabs>
  );
}
```

#### Step 3: 创建占位 Tab 文件（具体实现下面 Task 14-16 完成）

`src/app/(dashboard)/admin/permissions/_components/users-tab.tsx`:
```tsx
export function UsersTab() {
  return <div className="p-4 text-muted-foreground">按用户管理（Task 14 实现）</div>;
}
```

`src/app/(dashboard)/admin/permissions/_components/role-defaults-tab.tsx`:
```tsx
export function RoleDefaultsTab() {
  return <div className="p-4 text-muted-foreground">岗位默认权限（Task 15 实现）</div>;
}
```

`src/app/(dashboard)/admin/permissions/_components/audit-log-tab.tsx`:
```tsx
export function AuditLogTab() {
  return <div className="p-4 text-muted-foreground">审计日志（Task 16 实现）</div>;
}
```

#### Step 4: 创建 `src/app/(dashboard)/admin/permissions/page.tsx`

```tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePermission } from "@/modules/permissions";
import { PermissionsTabs } from "./_components/tabs";

export default async function PermissionsAdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) {
    return (
      <div className="p-8">
        <h2 className="text-xl font-semibold">权限不足</h2>
        <p className="text-muted-foreground">
          需要管理员权限。当前权限来源：
          {perm.sources.map((s) => s.kind).join(", ")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">权限管理</h2>
      <p className="text-sm text-muted-foreground">
        统一管理用户权限、岗位默认权限和审计日志。
      </p>
      <PermissionsTabs />
    </div>
  );
}
```

#### Step 5: dashboard layout 加入口链接

修改 `src/app/(dashboard)/layout.tsx`，在 header 里加 nav：

```tsx
// 在 header div 里 user info 之前加：
<nav className="flex gap-4 text-sm">
  <a href="/dashboard" className="text-muted-foreground hover:text-primary">仪表盘</a>
  <a href="/admin/permissions" className="text-muted-foreground hover:text-primary">权限管理</a>
  <a href="/profile" className="text-muted-foreground hover:text-primary">我的权限</a>
</nav>
```

#### Step 6: typecheck + 视觉验证

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
curl -i http://localhost:3000/admin/permissions
kill %1 2>/dev/null
```

至少返回 307→/login（未登录跳转）。手动登录后访问应看到三个 Tab。

#### Step 7: Commit

```bash
pnpm typecheck && pnpm lint

git add src/app src/components/ui
git commit -m "feat(admin): add /admin/permissions page with three-tab skeleton"
```

---

## Task 14: 按用户管理 Tab 实现

**Files:**
- Modify: `src/app/(dashboard)/admin/permissions/_components/users-tab.tsx`
- Create: `src/app/(dashboard)/admin/permissions/_components/user-detail.tsx`

#### Step 1: 实现 `users-tab.tsx`（用户列表 + 详情面板）

```tsx
"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { UserDetailPanel } from "./user-detail";
import type { Scope } from "@/modules/permissions";

type UserRow = {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  scope: Scope;
};

export function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((data: { users: UserRow[] }) => {
        setUsers(data.users);
        if (data.users.length > 0 && !selected && data.users[0]) {
          setSelected(data.users[0].user_id);
        }
      });
  }, []);

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(filter.toLowerCase()) ||
      (u.title?.toLowerCase().includes(filter.toLowerCase()) ?? false),
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-2">
        <Input
          placeholder="搜索姓名/岗位..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="border rounded-lg divide-y max-h-[600px] overflow-auto">
          {filtered.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onClick={() => setSelected(u.user_id)}
              className={`w-full text-left p-3 hover:bg-muted/50 ${
                selected === u.user_id ? "bg-accent" : ""
              }`}
            >
              <div className="font-medium">{u.name}</div>
              <div className="text-xs text-muted-foreground">
                {u.title ?? "未填岗位"} · scope={u.scope}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="border rounded-lg p-4">
        {selected ? (
          <UserDetailPanel userId={selected} />
        ) : (
          <p className="text-muted-foreground">选择左侧用户查看详情</p>
        )}
      </div>
    </div>
  );
}
```

#### Step 2: 创建 API Route `/api/admin/users` 用于获取用户列表

`src/app/api/admin/users/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user, dept_leader } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });
  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });

  const users = await db
    .select({
      user_id: dingtalk_user.user_id,
      name: dingtalk_user.name,
      title: dingtalk_user.title,
      dept_ids: dingtalk_user.dept_ids,
    })
    .from(dingtalk_user)
    .where(eq(dingtalk_user.active, true))
    .limit(500);

  // 计算每个用户的最终 scope（批量调用 resolvePermission）
  const enriched = await Promise.all(
    users.map(async (u) => {
      const p = await resolvePermission(u.user_id);
      return { ...u, scope: p.scope };
    }),
  );

  return NextResponse.json({ users: enriched });
}
```

#### Step 3: 实现 `user-detail.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  setDeptLeader,
  removeDeptLeader,
  upsertOverride,
  type Scope,
} from "@/modules/permissions";

type UserDetail = {
  user_id: string;
  name: string;
  title: string | null;
  dept_ids: string[];
  permission: {
    scope: Scope;
    can_edit: boolean;
    can_export: boolean;
    can_admin: boolean;
    sources: Array<{ kind: string; [k: string]: unknown }>;
  };
  managedDepts: { dept_id: string; name: string }[];
};

export function UserDetailPanel({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<Scope | "">("");
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const [canExport, setCanExport] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setDetail);
  }, [userId]);

  if (!detail) return <p className="text-muted-foreground">加载中...</p>;

  async function handleAddDeptLeader(deptId: string) {
    await setDeptLeader({ dept_id: deptId, user_id: userId });
    location.reload();
  }
  async function handleRemoveDeptLeader(deptId: string) {
    await removeDeptLeader({ dept_id: deptId, user_id: userId });
    location.reload();
  }

  async function handleSubmitOverride() {
    if (!reason.trim()) {
      alert("必须填变更理由");
      return;
    }
    await upsertOverride({
      user_id: userId,
      scope: scope || undefined,
      can_edit: canEdit ?? undefined,
      can_export: canExport ?? undefined,
      reason,
    });
    setOverrideOpen(false);
    location.reload();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{detail.name}</CardTitle>
          <div className="text-xs text-muted-foreground">
            {detail.title ?? "未填岗位"} · 来自钉钉同步（不可改）
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            最终生效权限：scope=<strong>{detail.permission.scope}</strong>，
            can_edit={String(detail.permission.can_edit)}，
            can_export={String(detail.permission.can_export)}，
            can_admin={String(detail.permission.can_admin)}
          </div>
          <div>
            来源：
            {detail.permission.sources
              .map((s) => s.kind)
              .join(" + ") || "无"}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">团队负责人设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {detail.managedDepts.length === 0 ? (
            <p className="text-sm text-muted-foreground">未管理任何部门</p>
          ) : (
            <ul className="space-y-1">
              {detail.managedDepts.map((d) => (
                <li key={d.dept_id} className="flex items-center justify-between text-sm">
                  <span>{d.name}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveDeptLeader(d.dept_id)}
                  >
                    移除
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">添加管理部门</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>添加部门</DialogTitle>
              </DialogHeader>
              <p className="text-sm">
                在用户的所属部门里选一个让他作为负责人。MVP 简化：手动输入 dept_id。
              </p>
              <Input
                placeholder="dept_id"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAddDeptLeader((e.target as HTMLInputElement).value);
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">个体权限覆盖</CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">编辑覆盖</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>编辑权限覆盖</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Scope（可选，留空则不覆盖）</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
                    <SelectTrigger><SelectValue placeholder="不覆盖" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="self">self</SelectItem>
                      <SelectItem value="team">team</SelectItem>
                      <SelectItem value="all">all</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>变更理由（必填）</Label>
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="例：临时给该运营开 TEAM 范围用于 X 项目"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSubmitOverride}>保存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Step 4: 创建 `/api/admin/users/[userId]` 路由

`src/app/api/admin/users/[userId]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_dept, dingtalk_user, dept_leader } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });
  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });

  const { userId } = await params;

  const [user] = await db
    .select()
    .from(dingtalk_user)
    .where(eq(dingtalk_user.user_id, userId));
  if (!user) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const targetPerm = await resolvePermission(userId);

  const leaderDepts = await db
    .select({
      dept_id: dept_leader.dept_id,
      name: dingtalk_dept.name,
    })
    .from(dept_leader)
    .innerJoin(dingtalk_dept, eq(dept_leader.dept_id, dingtalk_dept.dept_id))
    .where(eq(dept_leader.user_id, userId));

  return NextResponse.json({
    user_id: user.user_id,
    name: user.name,
    title: user.title,
    dept_ids: user.dept_ids,
    permission: targetPerm,
    managedDepts: leaderDepts,
  });
}
```

#### Step 5: typecheck + 端到端

```bash
pnpm typecheck && pnpm lint

# 启动 dev 手动测试
pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
# 浏览器测：登录 → /admin/permissions → 按用户管理 Tab → 看到用户列表
kill %1 2>/dev/null
```

#### Step 6: Commit

```bash
git add src/app
git commit -m "feat(admin): implement Users tab with detail panel and override dialog"
```

---

## Task 15: 岗位默认权限 Tab 实现

**Files:**
- Modify: `src/app/(dashboard)/admin/permissions/_components/role-defaults-tab.tsx`
- Create: `src/app/api/admin/roles/route.ts`

#### Step 1: 创建 `/api/admin/roles` API

`src/app/api/admin/roles/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { role_default_permission } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });
  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });

  const roles = await db.select().from(role_default_permission);
  return NextResponse.json({ roles });
}
```

#### Step 2: 实现 `role-defaults-tab.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { upsertRoleDefault, type Scope } from "@/modules/permissions";

type Role = {
  position: string;
  scope: Scope;
  can_edit: boolean;
  can_export: boolean;
  can_admin: boolean;
  description: string | null;
};

export function RoleDefaultsTab() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/admin/roles")
      .then((r) => r.json())
      .then((data: { roles: Role[] }) => setRoles(data.roles));
  }, []);

  function startEdit(role: Role | null) {
    setEditing(
      role ?? {
        position: "",
        scope: "none",
        can_edit: false,
        can_export: false,
        can_admin: false,
        description: null,
      },
    );
    setOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    if (!editing.position.trim()) {
      alert("岗位名称必填");
      return;
    }
    await upsertRoleDefault({
      position: editing.position,
      scope: editing.scope,
      can_edit: editing.can_edit,
      can_export: editing.can_export,
      can_admin: editing.can_admin,
      description: editing.description ?? undefined,
    });
    setOpen(false);
    location.reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          编辑岗位默认权限。新岗位可直接添加，无需修改代码。
        </p>
        <Button onClick={() => startEdit(null)}>添加新岗位</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>岗位</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>可编辑</TableHead>
            <TableHead>可导出</TableHead>
            <TableHead>可管理</TableHead>
            <TableHead>说明</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((r) => (
            <TableRow key={r.position}>
              <TableCell className="font-medium">{r.position}</TableCell>
              <TableCell>{r.scope}</TableCell>
              <TableCell>{r.can_edit ? "✓" : ""}</TableCell>
              <TableCell>{r.can_export ? "✓" : ""}</TableCell>
              <TableCell>{r.can_admin ? "✓" : ""}</TableCell>
              <TableCell className="text-muted-foreground">{r.description}</TableCell>
              <TableCell>
                <Button size="sm" variant="ghost" onClick={() => startEdit(r)}>编辑</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.position ? `编辑：${editing.position}` : "添加新岗位"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>岗位名称</Label>
                <Input
                  value={editing.position}
                  onChange={(e) => setEditing({ ...editing, position: e.target.value })}
                  disabled={!!editing.position && roles.some((r) => r.position === editing.position)}
                />
              </div>
              <div>
                <Label>Scope</Label>
                <Select
                  value={editing.scope}
                  onValueChange={(v) => setEditing({ ...editing, scope: v as Scope })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="self">self</SelectItem>
                    <SelectItem value="team">team</SelectItem>
                    <SelectItem value="all">all</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.can_edit}
                    onChange={(e) => setEditing({ ...editing, can_edit: e.target.checked })}
                  />
                  can_edit
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.can_export}
                    onChange={(e) => setEditing({ ...editing, can_export: e.target.checked })}
                  />
                  can_export
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.can_admin}
                    onChange={(e) => setEditing({ ...editing, can_admin: e.target.checked })}
                  />
                  can_admin
                </label>
              </div>
              <div>
                <Label>说明</Label>
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

#### Step 3: 端到端测试

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
# 浏览器：/admin/permissions → 切到"岗位默认权限"Tab → 看到 8 个岗位 → 点编辑改一个 → 保存 → 列表更新
kill %1 2>/dev/null
```

#### Step 4: Commit

```bash
pnpm typecheck && pnpm lint

git add src/app
git commit -m "feat(admin): implement role defaults editor tab"
```

---

## Task 16: 审计日志 Tab 实现

**Files:**
- Modify: `src/app/(dashboard)/admin/permissions/_components/audit-log-tab.tsx`
- Create: `src/app/api/admin/audit/route.ts`

#### Step 1: 创建 `/api/admin/audit` API

`src/app/api/admin/audit/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { audit_log } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "AUTH_NOT_LOGGED_IN" }, { status: 401 });
  const perm = await resolvePermission(session.user.id);
  if (!perm.can_admin) return NextResponse.json({ error: "AUTH_FORBIDDEN" }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const logs = await db
    .select()
    .from(audit_log)
    .orderBy(desc(audit_log.created_at))
    .limit(limit);

  return NextResponse.json({ logs });
}
```

#### Step 2: 实现 `audit-log-tab.tsx`

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LogRow = {
  id: number;
  user_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  before: unknown;
  after: unknown;
  created_at: string;
};

const HIGHLIGHT_ACTIONS = new Set(["EMERGENCY_LOGIN", "DINGTALK_SYNC_FAILED"]);

export function AuditLogTab() {
  const [logs, setLogs] = useState<LogRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/audit?limit=200")
      .then((r) => r.json())
      .then((data: { logs: LogRow[] }) => setLogs(data.logs));
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">最近 200 条操作记录</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>动作</TableHead>
            <TableHead>对象</TableHead>
            <TableHead>变更内容</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((l) => (
            <TableRow
              key={l.id}
              className={HIGHLIGHT_ACTIONS.has(l.action) ? "bg-warning-bg" : ""}
            >
              <TableCell className="text-xs">
                {new Date(l.created_at).toLocaleString("zh-CN")}
              </TableCell>
              <TableCell>{l.user_id ?? "system"}</TableCell>
              <TableCell className="font-mono text-xs">{l.action}</TableCell>
              <TableCell>
                {l.target_type ? `${l.target_type}:${l.target_id}` : "-"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                {l.after ? JSON.stringify(l.after) : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

#### Step 3: 端到端 + Commit

```bash
pnpm dev > /tmp/dev.log 2>&1 &
sleep 8
# 浏览器：/admin/permissions → 切到"审计日志"Tab → 看到所有日志（DINGTALK_SYNC_SUCCESS、PERMISSION_OVERRIDE_UPSERT 等）
kill %1 2>/dev/null

pnpm typecheck && pnpm lint

git add src/app
git commit -m "feat(admin): implement audit log tab with action highlighting"
```

---

## Task 17: `/profile` 页面 — 用户看自己权限

**Files:**
- Create: `src/app/(dashboard)/profile/page.tsx`

#### Step 1: 创建 profile 页

```tsx
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { dingtalk_user } from "@/db/schema";
import { resolvePermission } from "@/modules/permissions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  // 通过 better-auth user.id（钉钉 unionid）找 dingtalk_user
  const [dingUser] = await db
    .select()
    .from(dingtalk_user)
    .where(eq(dingtalk_user.unionid, session.user.id));

  const perm = dingUser
    ? await resolvePermission(dingUser.user_id)
    : { scope: "none" as const, can_edit: false, can_export: false, can_admin: false, sources: [] };

  return (
    <div className="space-y-4 max-w-2xl">
      <h2 className="text-2xl font-bold">我的权限</h2>

      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>姓名：{dingUser?.name ?? session.user.name}</div>
          <div>钉钉岗位：{dingUser?.title ?? "未同步或未填岗位"}</div>
          <div>所属部门：{dingUser?.dept_ids.join(", ") ?? "-"}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>当前权限</CardTitle>
          <CardDescription>三层叠加计算结果</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            数据范围：<strong className="text-primary">{perm.scope}</strong>
          </div>
          <div>可编辑：{perm.can_edit ? "✓" : "✗"}</div>
          <div>可导出：{perm.can_export ? "✓" : "✗"}</div>
          <div>可管理：{perm.can_admin ? "✓" : "✗"}</div>
          <div className="pt-2 text-muted-foreground">
            权限来源：
            <ul className="list-disc pl-5">
              {perm.sources.map((s, i) => (
                <li key={i}>
                  {s.kind === "default" && `岗位默认（${s.position}）`}
                  {s.kind === "dept_leader" &&
                    `部门负责人（管理 ${(s as { deptIds: string[] }).deptIds.length} 个部门）`}
                  {s.kind === "override" && `个体覆盖（理由：${(s as { reason: string }).reason}）`}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Step 2: typecheck + Commit

```bash
pnpm typecheck && pnpm lint

git add src/app/\(dashboard\)/profile
git commit -m "feat: add /profile page showing user's resolved permission"
```

---

## Task 18: Phase 1 端到端验收 + tag

**Files:** None.

#### Step 1: 完整端到端验收

```bash
cd /Users/zhangjin/qjhy-pro

# 1. 启动全栈
docker-compose --env-file=.env.local up -d
sleep 30

# 2. 跑钉钉同步（在容器内或本地）
pnpm exec tsx --env-file=.env.local -e \
  "import('./src/worker/jobs/sync-dingtalk').then(m => m.syncDingtalk())"

# 3. 验证数据
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM dingtalk_dept;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM dingtalk_user;"
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM role_default_permission;"

# 4. 给自己加个 admin override（用 SQL 直接，因为还没办法走 UI 给自己开权限）
docker exec qjhy-postgres psql -U qjhy -d qjhy -c \
  "INSERT INTO auth_permission_override(user_id, scope, can_admin, reason, created_by) \
   VALUES('<你的 dingtalk userid>', 'all', true, '初始 admin', 'system') \
   ON CONFLICT (user_id) DO UPDATE SET scope='all', can_admin=true;"

# 5. 浏览器测试
# - 钉钉扫码登录
# - 访问 /admin/permissions
#   - 按用户管理 Tab：搜索、选用户、看详情
#   - 岗位默认权限 Tab：编辑某个岗位
#   - 审计日志 Tab：看到刚才的编辑记录
# - 访问 /profile：看到自己 scope=all、can_admin=true、来源含 override

# 6. 验证测试 + lint + typecheck
pnpm test
pnpm typecheck
pnpm lint
pnpm format

# 7. 关闭
docker-compose down
```

#### Step 2: 打 Phase 1 tag

```bash
git tag -a v0.2.0-phase1 -m "$(cat <<'EOF'
Phase 1 organization + permissions complete

- DingTalk API client with token caching
- DingTalk OAuth via better-auth genericOAuth
- DingTalk daily sync (depts + users)
- Three-tier permission model (role default + dept_leader + override)
- applyScopeFilter helper for query filtering
- Unit tests for resolve.ts and scope.ts (vitest)
- Unified /admin/permissions page with three tabs:
  - Users: list + detail panel + override editor
  - Role defaults: CRUD with new role addition
  - Audit log: chronological view with highlighting
- /profile page showing user's resolved permission with source breakdown
EOF
)"
```

#### Step 3: 更新 README.md Phase 1 验收清单

修改 `README.md`，把 "Phase 0 验收清单" 改为同时包含 Phase 1：

```markdown
## Phase 1 验收清单

- [x] 钉钉 API client（access_token 缓存）
- [x] 钉钉 OAuth 集成（扫码登录 → 关联 unionid）
- [x] 钉钉每日同步 job（部门 + 人员，全量 upsert）
- [x] 权限三层叠加（role default + dept_leader + override）
- [x] applyScopeFilter helper（防止裸查询）
- [x] 权限单元测试（vitest）
- [x] /admin/permissions 单页三 Tab UX
- [x] /profile 用户权限来源说明
- [x] audit_log 全链路记录
```

#### Step 4: Commit + push tag

```bash
git add README.md
git commit -m "docs: update README with Phase 1 acceptance checklist"
git log --oneline | head -30
git tag --list
```

Phase 1 完成。

---

## Self-Review

**1. Spec 覆盖：**

| Spec 要求 | Plan Task |
|---|---|
| 钉钉同步组织架构（部门 + 人员）| Task 4-5 |
| 钉钉 OAuth 登录 | Task 1, 3 |
| 主播实体扩展 | （延后到 Phase 2）|
| 权限三层叠加 | Task 9-12 |
| dept_leader 中台自管 | Task 6 |
| role_default_permission 可配置 | Task 6, 9, 15 |
| auth_permission_override（必填理由）| Task 6, 12 |
| audit_log | Task 7 |
| /admin/permissions 单页三 Tab | Task 13-16 |
| /profile | Task 17 |
| applyScopeFilter | Task 11 |
| 权限单元测试 | Task 8, 10, 11 |

**2. 占位符扫描：**
- "TBD" / "TODO" / "Add appropriate" — 无
- 一处 "Phase 2 真用 TEAM scope 时再加递归" 是已知简化，不是占位

**3. 类型一致性：**
- `Scope` 在 types.ts 定义、schema.ts、resolve.ts、scope.ts、actions.ts 一致使用 ✓
- `Permission` / `ResolvedPermission` 一致 ✓
- `ROLE_DEFAULTS_SEED` 在 role-defaults.ts 定义、Task 9 引用 ✓

**4. 范围检查：**
- 不含主播业务（Phase 2 才做）✓
- 不含直播数据（Phase 2 才做）✓
- 焦点在"组织 + 权限"地基 ✓

**5. 已发现的依赖问题（已在 plan 中标注）：**
- Task 5 sync-dingtalk 引用 `writeAuditLog`，应先做 Task 7（audit）。**实施顺序：1 → 2 → 3 → 4 → 7 → 5 → 6 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18**
