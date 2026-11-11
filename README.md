# QJHY-Pro

> 面向直播 MCN 团队的业务中台与数据底座，逐步替代 miracle-pro3。

QJHY-Pro 统一承载账号、主播、直播、爬虫、招聘、考勤、绩效、目标、投放、采购和内容生产等业务数据，并通过权限、审计和后台 Worker 支持日常运营。

## 功能概览

- **运营工作台**：经营总览、趋势指标、项目工作台和可下钻明细。
- **直播业务**：直播账号、主播、排班、直播记录、开播/下播打卡和直播间配置。
- **平台数据**：抖音、快手等平台的直播、作品、趋势和官方视频数据采集与回填。
- **招聘与人员**：主播招聘流程、招聘统计、人员档案、批量导入、试用期评价和绩效评估。
- **目标与绩效**：目标拆分、团队分配、参与团队、历史周期查询和绩效看板。
- **考勤与行政**：考勤日历、审批范围、采购流程及钉钉通知。
- **投放与内容**：投放数据导入、日报/小时数据解析、剪辑任务、素材、课程和发布记录。
- **权限与审计**：角色默认权限、部门负责人权限、个人覆盖权限和审计日志。
- **后台任务**：Worker 负责定时同步、数据回填、通知和异步导入。

## 技术栈

- Next.js 16（App Router、RSC、Server Actions）
- TypeScript strict、Zod、ESLint、Prettier、Vitest
- PostgreSQL 16、Drizzle ORM、SQL migrations
- React 19、Tailwind CSS 4、shadcn/ui、Recharts
- better-auth（钉钉 OAuth 与应急登录）
- Docker Compose（Web、Worker、PostgreSQL）
- Puppeteer、ExcelJS、PapaParse、node-cron、pg-boss

## 快速开始

### 前置条件

- Node.js 20+
- pnpm 9+（推荐先执行 `corepack enable`）
- Docker Desktop 或 OrbStack

### 安装配置

```bash
git clone https://github.com/zhangjin277-blip/qjhy-pro.git
cd qjhy-pro
pnpm install
cp .env.example .env.local
```

编辑 `.env.local`。本地开发至少需要：

- `AUTH_SECRET`：不少于 16 个字符的随机字符串
- `EMERGENCY_LOGIN_PASSWORD`：不少于 16 个字符的应急登录密码
- `DATABASE_URL`：默认使用本地 Docker PostgreSQL
- 钉钉、爬虫和通知功能按需配置对应的 App、Cookie、Webhook 和 CLI profile

不要把 `.env.local`、Cookie、Token、Webhook 或生产数据库凭据提交到 Git。

### 启动开发环境

```bash
docker compose up -d postgres
pnpm db:migrate
pnpm db:seed:emergency
pnpm dev
```

另开终端启动后台任务：

```bash
pnpm worker
```

浏览器访问 <http://localhost:3000>，使用 `.env.local` 中的应急登录密码登录。

### 使用 Docker 启动完整服务

```bash
docker compose --env-file .env.local up -d
```

当前 Compose 文件中的剪辑和课程存储使用 NAS NFS 挂载。部署到其他环境前，请调整 `editing_nas`、`course_nas` 的地址和目录，或改成本地卷。钉钉 DWS 功能还需要独立的 CLI 登录与授权。

历史 migration 涉及从旧系统迁移的表结构；已有数据库升级前应核对实际迁移记录并备份。`drizzle.config.ts` 通过进程环境读取 `DATABASE_URL`，使用自定义数据库时需要显式导出该变量。

## 常用命令

```bash
pnpm dev                 # Web 开发服务器
pnpm worker              # 后台 Worker
pnpm typecheck           # TypeScript 检查
pnpm lint                # ESLint 检查
pnpm test                # Vitest 测试
pnpm format              # Prettier 检查
pnpm build               # 生产构建
pnpm db:generate         # 生成 Drizzle migration
pnpm db:migrate          # 执行数据库 migration
pnpm db:studio           # 打开 Drizzle Studio
```

## 项目结构

```text
qjhy-pro/
├── src/app/             # 页面与 API 路由
├── src/modules/         # 按业务域组织的服务、查询、Schema 和权限逻辑
├── src/components/      # 通用 UI 组件
├── src/db/              # PostgreSQL schema、migration 和 seed
├── src/lib/             # auth、env、错误、通知和共享基础设施
├── src/worker/          # 定时任务、同步和异步处理
├── tests/               # 单元测试和模块测试
├── docs/                # 设计、实施计划和原始资料说明
└── docker-compose.yml   # Web、Worker、PostgreSQL 编排
```

## 开发约定

详细规范见 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。核心约定包括：

- 新业务功能放在 `src/modules/[feature]/`，模块间通过 `index.ts` 暴露公共接口。
- Server Action 和 API 入参先用 Schema 校验。
- 业务错误使用 `AppError`，避免直接抛出未分类的 `Error`。
- 数据库存储保留平台原始字段含义，展示层再做格式化。
- 查询必须经过权限范围过滤；涉及人员、业务数据和通知的操作需要保留审计线索。

## 文档

- [设计文档](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)
- [Phase 0 实施计划](./docs/superpowers/plans/2026-04-30-phase-0-foundation.md)
- [Design Tokens](./docs/design/tokens.md)
- [开发规范](./CONTRIBUTING.md)
- [业务模块说明](./src/modules/)
- [更新记录](./CHANGELOG.md)

## 项目状态

项目正在持续迭代中。生产部署请先在本地完成类型检查、Lint、测试和构建，再按当前环境的 migration 与 Docker 发布流程更新 Web 或 Worker 服务。

## License

当前仓库尚未声明开源许可证。使用与授权事宜请联系仓库所有者。
