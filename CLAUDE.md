# QJHY-Pro 项目说明（Claude Code 自动加载）

> 在此项目目录启动新对话时，Claude 必读本文件。

## 项目身份

**QJHY-Pro** = 替代 miracle-pro3（屎山）的新中台。当前进度：

| Phase | Tag | 状态 |
|---|---|---|
| Phase 0（基础设施）| `v0.1.0-phase0` | ✅ 完成 |
| Phase 1（钉钉同步 + 三层权限）| `v0.2.0-phase1` | ✅ 完成 |
| Phase 2（主播 + 抖音/快手爬虫 + 直播数据看板）| - | 📋 待 brainstorm |

## 必读文档（按顺序）

1. **设计 Spec**：`docs/superpowers/specs/2026-04-30-qjhy-pro-design.md` — 整体架构、三层权限模型、字段原始性原则
2. **Phase 0 plan**：`docs/superpowers/plans/2026-04-30-phase-0-foundation.md` — 已完成
3. **Phase 1 plan**：`docs/superpowers/plans/2026-04-30-phase-1-org-permissions.md` — 已完成
4. **Design tokens**：`docs/design/tokens.md` — 字节蓝主色、涨红跌绿、PingFang SC
5. **CONTRIBUTING.md** — 项目宪法（命名规范 / 模块边界 / Zod 强制 / Git 规则）

## 技术栈

Next.js 16.2.4 + TypeScript strict + PostgreSQL 16 + Drizzle ORM + better-auth 1.6.9 + Tailwind v4 + shadcn/ui (base-nova) + Vitest + Docker Compose（postgres + web + worker）

## 关键架构经验（Phase 1 末发现，必须遵守）

**模块 index.ts vs server.ts 双入口**：
- `src/modules/[feature]/index.ts` 只导 client-safe（types / Zod schemas / Server Actions）
- `src/modules/[feature]/server.ts` 导 server-only（含 DB 客户端等 Node.js 模块），加 `import "server-only"` tripwire
- ESLint zone 同时允许这两个 entry 作为合法外部 import 入口
- 否则 Turbopack 会把整个 barrel 打进 client chunk，触发 `Can't resolve 'fs'` 错误
- 详见 `src/modules/permissions/` 实例

## 钉钉应用（与 PRO3 共用）

- AppKey: `dingo1r3hn448vbtevj0`（在 `.env.local`，不进 git）
- CorpID: `dingfe99581e9ca94e8da1320dcb25e91351`
- **OAuth 用旧版 sns 协议**（`snsapi_login` + `oapi.dingtalk.com/sns/getuserinfo_bycode` + HMAC-SHA256），不是新版 `Contact.User.Read`（实测拿不到 token）
- 代价：**没有"自动识别本机钉钉账号"功能**，必须扫码
- 钉钉机器人 webhook 关键词："报错"

## 数据库当前状态（11 张表）

```
dingtalk_dept (28) / dingtalk_user (146)        ← Phase 1 同步
role_default_permission (8)                      ← 8 岗位
dept_leader / auth_permission_override / audit_log
auth_user (2: emergency + 张锦)
auth_session / auth_account / auth_verification (better-auth)
_meta
```

## 启动开发

```bash
docker-compose up -d postgres        # 起 DB
pnpm dev                             # Next.js (3000)
pnpm worker                          # 另开终端，钉钉同步等定时任务
```

应急后门密码在 `.env.local` 的 `EMERGENCY_LOGIN_PASSWORD`。
当前 admin 用户：张锦（钉钉登录）、emergency-admin（应急后门）。

## 已知小尾巴（Phase 2 时一起修）

- **sync job unionid 兜底**：`/topapi/user/listsimple` 不返回 unionid，sync job 用 userid 兜底，导致钉钉 OAuth 拿到的 user.id ≠ dingtalk_user.unionid。需改用 `/v2/user/get` 接口拉真实 unionid。
- **张锦 admin override 是手动 SQL 加的**，每天 02:00 sync 会被覆盖（unionid 变回 userid 后查不到）。临时方案：每次同步后重新 seed；根因解决在上一条。

## Phase 2 范围（待 brainstorm）

- 主播实体（`anchor_profile`） + 主播 ↔ 运营关联（`anchor_operator`）
- **抖音/快手爬虫**（PRO3 没有现成可复用！PRO3 是 Excel 导入不是 API 爬虫）
- 单场粒度直播数据（`douyin_session` / `kuaishou_session`，每平台一张表，原始字段直存 `raw: jsonb`）
- 直播数据看板（按权限过滤）
- field_alias 配置（中文显示名）

## 开始工作前的快速检查

```bash
git log -1 --oneline                 # 看最后一个 commit
git tag --list                       # 看到 v0.1.0-phase0 v0.2.0-phase1
pnpm typecheck && pnpm lint && pnpm test  # 应全过（18/18）
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM dingtalk_user;"  # 应 146
```

## 开发流程

新功能用 superpowers 流程：
1. `superpowers:brainstorming` → 写 spec 到 `docs/superpowers/specs/`
2. `superpowers:writing-plans` → 写 plan 到 `docs/superpowers/plans/`
3. `superpowers:subagent-driven-development` → 按 plan dispatch subagent 实施
4. 每个 task 走 spec compliance review + code quality review
