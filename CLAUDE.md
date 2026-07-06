# QJHY-Pro 项目说明（Claude Code 自动加载）

> 在此项目目录启动新对话时，Claude 必读本文件。

## 项目身份

**QJHY-Pro** = 替代 miracle-pro3（屎山）的新中台。当前进度：

| Phase | Tag | 状态 |
|---|---|---|
| Phase 0（基础设施）| `v0.1.0-phase0` | ✅ 完成 |
| Phase 1（钉钉同步 + 三层权限）| `v0.2.0-phase1` | ✅ 完成 |
| Phase 2（主播 + 抖音爬虫 + dashboard 看板）| `v0.3.0-phase2` | ✅ 完成 |
| Phase 2.1（跨平台直播账号 + 主播档案 + 默认排班）| `v0.3.0-phase2.1` | ✅ 完成（2026-05-06）|
| Phase 2.2（投放迁移 + 排班 override + 投放看板）| `v0.4.0-phase2.2` | ✅ 完成（2026-05-06）— PRO3 历史数据迁移已取消（2026-06-10 决定，不再迁移，新数据全走 Excel 上传）|
| Phase 3.0（剪辑工作流 MVP）| `v0.5.0-phase3.0` | ✅ 完成（2026-05-26）— editing_task + 5 状态机 / 看板 + 表格 / NAS / 抖音自动绑定；后续迭代持续进行（覆盖度看板 / 流式上传 / 打卡归因）|
| Phase 2.3（快手 API 爬虫 + 直播数据 + 主播综合效能）| - | 📋 远期 |

## 必读文档（按顺序）

1. **设计 Spec**：`docs/superpowers/specs/2026-04-30-qjhy-pro-design.md` — 整体架构、三层权限模型、字段原始性原则
2. **Design tokens**：`docs/design/tokens.md` — 字节蓝主色、涨红跌绿、PingFang SC
3. **CONTRIBUTING.md** — 项目宪法（命名规范 / 模块边界 / Zod 强制 / Git 规则）

> 各 Phase 的 spec/plan 过程文档已于 2026-06-10 清理（任务全部完成）；历史版本在 git 里可查。

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
- OAuth 用钉钉统一授权入口（`login.dingtalk.com/oauth2/auth` + `openid`），支持桌面钉钉已登录时一键确认。
- token/userinfo 用自定义交换逻辑：`userAccessToken` 走 JSON body，`contact/users/me` 走 `x-acs-dingtalk-access-token`。
- 钉钉机器人 webhook 关键词："报错"

## 数据库当前状态（45 张 public 表）

```
Phase 1 钉钉/权限：
  dingtalk_dept / dingtalk_user / role_default_permission / dept_leader
  auth_permission_override / audit_log / auth_user / auth_session
  auth_account / auth_verification / auth_invite_code / auth_invite_code_use / _meta

Phase 2 主播/爬虫：
  anchor_profile / kuaishou_member / kuaishou_live_session / kuaishou_live_trend
  broker / broker_user_mapping / douyin_video_snapshot
  crawler_cookie_session / fetch_job_* / video_*

Phase 2.1 直播账号：
  live_account / live_anchor / live_anchor_account / live_room
  account_anchor_default / daily_schedule_day / daily_schedule_segment

Phase 2.2 投放归因：
  placement_dataset / placement_row / placement_cumulative_raw
  schedule_override / placement_attribution_dirty

Phase 2.4 配置 / 别名：
  product_config / field_alias / user_column_preset / aliases

Phase 3.0 剪辑工作流（剪辑师 + 任务 + 事件）：
  editing_task / editing_task_event

打卡 / 直播日志：
  live_session_log
```

> 具体字段以 `src/db/schema/*.ts` 为准；表名仅供导航。

## 启动开发

```bash
docker-compose up -d postgres        # 起 DB
pnpm dev                             # Next.js (3000)
pnpm worker                          # 另开终端，钉钉同步等定时任务
```

应急后门密码在 `.env.local` 的 `EMERGENCY_LOGIN_PASSWORD`。
当前 admin 用户：张锦（钉钉登录）、emergency-admin（应急后门）。

## NAS 连接 / 部署（线上跑在绿联 NAS）

线上 = 公司内网绿联 NAS，所有容器（qjhy-web/worker/postgres、miracle-pro-cs、录制器等）都在上面。

- **IP**：`172.16.39.61`（公司内网，外网不可达）
- **SSH 用户**：`15679982012`（NAS 账号是手机号）
- **SSH key**：`~/.ssh/id_rsa_nas`（本机已配免密）
- **工作目录**：`/volume1/docker/qjhy/`（compose 用 `image: qjhy-{web,worker}:latest`，非 build）
- **连一条**：`ssh -i ~/.ssh/id_rsa_nas 15679982012@172.16.39.61`
- **连生产库**：`ssh ... 'docker exec -i qjhy-postgres psql -U qjhy -d qjhy'`（库内端口 5432 不对外，只能从 NAS 内 `docker exec` 进）
- **老中台 PRO3**：容器 `miracle-pro-cs`，目录 `/volume1/docker/miracle-pro-cs/`，SQLite 在 `server/database.sqlite`

> 完整部署一条龙（build amd64 → save → scp -O → load → recreate）、8 个踩坑、反向 dump：见 memory `qjhy-pro-nas-deployment.md`。Mac(ARM64)→NAS(amd64) build **必须** `--platform linux/amd64`。

## 已知小尾巴（Phase 2 时一起修）

- **sync job unionid 兜底**：`/topapi/user/listsimple` 不返回 unionid，sync job 用 userid 兜底，导致钉钉 OAuth 拿到的 user.id ≠ dingtalk_user.unionid。需改用 `/v2/user/get` 接口拉真实 unionid。
- **张锦 admin override 是手动 SQL 加的**，每天 02:00 sync 会被覆盖（unionid 变回 userid 后查不到）。临时方案：每次同步后重新 seed；根因解决在上一条。

## 板块级文档（子目录 CLAUDE.md，读该目录文件时自动加载）

改某板块前先读它的 CLAUDE.md——里面是**代码看不出来的口径和坑**：

| 板块 | 文档 | 核心内容 |
|---|---|---|
| 爬虫 | `src/modules/crawler/CLAUDE.md` | job 架构 / cookie 续期 / 补数入口 / barrel 陷阱 |
| 剪辑工作流 | `src/modules/editing-task/CLAUDE.md` | 状态机 / **anchor_id 存钉钉ID 的坑** / 交片口径 / 命名规则 / 流式上传 |
| 开播打卡 | `src/modules/checkin/CLAUDE.md` | **礼物列算法**(trend MAX-MIN) / 投放分摊 / admin 操作 |
| 业务看板 | `src/modules/dashboard/CLAUDE.md` | **线上/线下分组链**(broker→部门别名) / 各指标 SQL 口径 |
| 主播明细 | `src/modules/anchors/CLAUDE.md` | 双平台配置化表格 / 经纪人筛选 / id 空间的坑 |
| 投放 | `src/modules/placement/CLAUDE.md` | **ingestRows 必须配归因** / placement_label 绑定 |

> 新板块做完（或踩了新坑）就补/更新对应 CLAUDE.md，别让知识只留在会话里。

## 模块清单（19 个 module / `src/modules/*`）

```
基础 / 权限：permissions / brokers / aliases / column-presets / invite-codes
看板 / 数据：dashboard / anchors / placement / placement-attribution
账号 / 排班 / 打卡：live-account / live-anchor / live-room / schedule-override / checkin
爬虫：crawler
配置：product-config
剪辑工作流：editing-task / editing-editor / editing-storage
```

每个 module 必须双入口（`index.ts` 客户端可用 / `server.ts` server-only）。eslint zone 同步注册。

## 开始工作前的快速检查

```bash
git log -1 --oneline                          # 看最后一个 commit
git tag --list                                 # 看到 phase tags
pnpm typecheck && pnpm lint && pnpm test       # 应全过
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "SELECT COUNT(*) FROM dingtalk_user;"  # 应 146+
```

## Git 工作方式（2026-06-10 定）

**直接在 main 上开发，不开分支、不开 worktree。** 单人项目 + NAS 直部署，分支只会制造「忘合并」事故（2026-06-09 曾因 worktree 分支未合并导致 main 落后线上 18 个 commit）。即使 skill/默认流程建议用 worktree，也跳过。

## 开发流程

新功能用 superpowers 流程：
1. `superpowers:brainstorming` → 写 spec 到 `docs/superpowers/specs/`
2. `superpowers:writing-plans` → 写 plan 到 `docs/superpowers/plans/`
3. `superpowers:subagent-driven-development` → 按 plan dispatch subagent 实施
4. 每个 task 走 spec compliance review + code quality review
