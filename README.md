# QJHY-Pro

> 新中台 · 替代 miracle-pro3 作为数据底座

## 项目目标

替代老中台（miracle-pro3）做"数据底座"，解决以下问题：

- 数据接口规范乱、加新功能要重新引导
- 爬虫数据被"翻译"后丢失原始字段含义
- SQLite 性能瓶颈（pro3 数据库已 600+MB）

详见 [设计文档](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)。

## 技术栈

- Next.js 16 (App Router + RSC + Server Actions)
- TypeScript strict + Zod
- PostgreSQL 16 + Drizzle ORM
- Tailwind v4 + shadcn/ui（[design tokens](./docs/design/tokens.md)：字节蓝 + Semi Design 风格）
- better-auth（钉钉 OAuth + 应急后门）
- Docker Compose（web + worker + postgres）
- ESLint + Prettier + Husky + commitlint

## 快速开始

### 前置

- Node.js 20+（参考 `.nvmrc`）
- pnpm 9+（`corepack enable`）
- Docker Desktop / OrbStack

### 安装

```bash
git clone <repo>
cd qjhy-pro
pnpm install
cp .env.example .env.local
# 编辑 .env.local 填入实际值（见下）
```

### `.env.local` 必填项

- `AUTH_SECRET`：≥16 字符随机字符串（`openssl rand -base64 32`）
- `EMERGENCY_LOGIN_PASSWORD`：≥16 字符随机字符串（应急登录用）
- `DATABASE_URL`：默认本地 docker 即可
- `DINGTALK_BOT_WEBHOOK`：报错通知（可选，留空则不通知）

### 启动开发环境（本机）

```bash
docker-compose up -d postgres   # 起 Postgres
pnpm db:migrate                 # 跑 migration
pnpm db:seed:emergency          # 创建应急用户（首次）
pnpm dev                        # 起 Next.js（3000）

# 另一个 terminal：
pnpm worker                     # 起 Worker
```

访问 http://localhost:3000，应跳到 `/login`。用 `EMERGENCY_LOGIN_PASSWORD` 登录。

### 全栈 Docker 启动

```bash
docker-compose --env-file=.env.local up -d
```

## 开发规范

⚠ **必读：[`CONTRIBUTING.md`](./CONTRIBUTING.md)**

简言之：

- 加新功能 = 加 `src/modules/[feature]/` 文件夹
- 模块之间只能 import `index.ts`（ESLint 强制）
- 所有 Server Action 入参 `Schema.parse()`
- 错误用 `AppError`，不用 `new Error`
- 落库不翻译字段，存原始 JSON

## Phase 0 验收清单

- [x] 项目骨架就绪（Next.js 16 + TS strict + Tailwind + shadcn/ui）
- [x] Design tokens 应用（字节蓝 + 涨红跌绿 + KPI typography）
- [x] ESLint 跨模块限制工作
- [x] Pre-commit hook（typecheck + lint + format）+ commitlint
- [x] Docker Compose 三容器（postgres + web + worker）启动成功
- [x] Drizzle 迁移工作（`pnpm db:migrate`）
- [x] env 通过 Zod 校验加载
- [x] AppError 统一错误类型可用
- [x] 钉钉机器人通知封装可用
- [x] better-auth 集成 + 应急后门登录工作
- [x] 钉钉 OAuth provider 占位（Phase 1 完整接入）
- [x] 登录/Dashboard 闭环可走通
- [x] Worker 进程 + cron 调度器可启动
- [x] CONTRIBUTING.md 写完
- [x] 平台数据样本（抖音/快手）已收集

## Phase 1 验收清单

- [x] 钉钉 API client（token 缓存 + 并发锁 + 递归保护 + 分页 cursor 检查）
- [x] 钉钉旧版 sns OAuth 集成（snsapi_login + HMAC-SHA256 签名，浏览器扫码登录闭环）
- [x] 钉钉每日同步 job（28 部门 + 146 用户，全量 upsert）
- [x] 权限三层叠加（role default + dept_leader + override）
- [x] applyScopeFilter helper（防止裸查询）
- [x] 权限单元测试（vitest，18/18 通过）
- [x] /admin/permissions 单页三 Tab UX
- [x] /profile 用户权限来源说明
- [x] audit_log 全链路记录
- [x] 架构经验：模块 index.ts 拆分 client-safe/server-only 入口

## 下一步

进入 Phase 2（业务模块开发）。

## 项目结构

```
qjhy-pro/
├── src/
│   ├── app/          # Next.js 路由（页面/api）
│   ├── modules/      # 业务模块（feature-first，目前空）
│   ├── components/   # UI 组件（shadcn）
│   ├── db/           # Drizzle schema + migration
│   ├── lib/          # 共享工具（auth/env/errors/notify）
│   └── worker/       # Worker 进程
├── docs/
│   ├── superpowers/  # spec / plan
│   ├── design/       # design tokens
│   └── raw-samples/  # 平台原始数据样本
└── docker-compose.yml
```

## 相关文档

- [设计文档](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)
- [Phase 0 实施计划](./docs/superpowers/plans/2026-04-30-phase-0-foundation.md)
- [Design Tokens](./docs/design/tokens.md)
- [开发规范](./CONTRIBUTING.md)
