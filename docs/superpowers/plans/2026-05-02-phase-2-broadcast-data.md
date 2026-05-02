# Phase 2: 主播数据中台（抖音）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 QJHY-Pro 具备从抖音公会平台自动采集主播档案、按日数据、推广游戏数据、小游戏数据、portrait 曝光、单场激活漏斗的能力，按运营经纪人/项目/时间维度做数据看板，权限按 Phase 1 的 scope 模型过滤。

**Architecture:** 沿用 feature-first + 双入口（index.ts client-safe / server.ts server-only）模块结构。爬虫用 Puppeteer 在浏览器 context 内调 `fetch()`，让平台前端 SDK 自动加签名。任务调度用 pg-boss（PG 内置队列，不引入 Redis）。10:00 cron 触发"数据就绪检测"守护 job，确认昨日数据已刷新后才链式 enqueue 下游 fetch jobs。所有事实表强制 `raw jsonb` 兜底。看板查询全部经过 `applyScopeFilter`。

**Tech Stack:** Next.js 16 + TypeScript strict + Drizzle ORM + PostgreSQL 16 + pg-boss 10 + puppeteer 24 (with stealth) + Zod + Vitest + better-auth (Phase 1 已接入) + shadcn/ui + Tailwind v4。

**Reference:**
- Spec: `docs/superpowers/specs/2026-05-02-phase-2-broadcast-data.md`
- 字段最终清单：`.tmp-design-preview/anchor-tables-fields-final.md`
- 端点笔记：`.tmp-design-preview/endpoints-discovered.md`
- 真实 API 样本：`.tmp-design-preview/anchor-list-response.network-response`、`anchor-data-list-response.network-response`
- 老爬虫模式参考（不复用代码）：`~/bytedance_export/`
- Phase 0 完成 tag: `v0.1.0-phase0` / Phase 1 完成 tag: `v0.2.0-phase1`
- CONTRIBUTING.md（项目宪法）

---

## File Structure

### 新增文件

```
src/
├── lib/
│   └── puppeteer/                    Phase 2 新（共享基础设施）
│       ├── browser.ts                启停浏览器单例 + 注入 Cookie
│       ├── page-fetch.ts             page.evaluate 包装的 fetch helper
│       └── index.ts
│
├── modules/
│   ├── anchors/                      Phase 2 新（主播档案 + 查询）
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   └── queries.ts                按权限过滤的 query 函数
│   │
│   ├── crawler/                      Phase 2 新（采集核心）
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── types.ts
│   │   ├── schema.ts
│   │   ├── parsers.ts                "6小时6分钟" → 6.11 小时 解析
│   │   ├── parsers.test.ts
│   │   ├── adapters/
│   │   │   ├── anchor-list.ts        档案 adapter
│   │   │   ├── anchor-daily.ts       按日 adapter
│   │   │   ├── game-promo.ts         斗地主推广游戏 adapter
│   │   │   ├── minigame-live.ts      三国小游戏直播 adapter
│   │   │   ├── minigame-video.ts     三国小游戏短视频 adapter
│   │   │   ├── portrait-core.ts      portrait 曝光 adapter
│   │   │   └── session-minigame.ts   单场小游戏激活漏斗 adapter
│   │   ├── cookie.ts                 Cookie 持久化 + 失效检测
│   │   ├── queue.ts                  pg-boss 包装（job 类型枚举 + enqueue helpers）
│   │   ├── readiness.ts              totalFanTicket 全 0 检测
│   │   ├── notify.ts                 钉钉告警包装
│   │   └── actions.ts                admin Server Actions
│   │
│   ├── dashboard/                    Phase 2 新（看板查询）
│   │   ├── index.ts
│   │   ├── server.ts
│   │   ├── types.ts
│   │   └── queries.ts                聚合查询（卡片/趋势/明细）
│   │
│   └── brokers/                      Phase 2 新（经纪人映射）
│       ├── index.ts
│       ├── server.ts
│       ├── types.ts
│       ├── schema.ts
│       ├── matcher.ts                fuzzy match 算法
│       ├── matcher.test.ts
│       └── actions.ts
│
├── db/
│   └── schema/
│       ├── anchors.ts                anchor_profile / anchor_daily / 4 张游戏数据表
│       ├── brokers.ts                broker_user_mapping
│       └── crawler.ts                crawler_cookie_session / field_alias
│
├── worker/
│   └── jobs/
│       ├── crawl-orchestrator.ts     cron 入口（10:00 起跑）
│       ├── handlers/
│       │   ├── check-data-ready.ts
│       │   ├── fetch-profile.ts
│       │   ├── fetch-daily.ts
│       │   ├── fetch-game.ts
│       │   ├── fetch-minigame.ts
│       │   ├── fetch-portrait.ts
│       │   └── fetch-session-mg.ts
│       └── register.ts               把 handlers 注册到 pg-boss
│
└── app/
    ├── (dashboard)/
    │   ├── dashboard/
    │   │   └── page.tsx              改：加 6 张卡片
    │   ├── anchors/                  Phase 2 新：主播明细
    │   │   ├── page.tsx
    │   │   └── _components/
    │   │       ├── anchor-table.tsx
    │   │       ├── filters.tsx
    │   │       └── csv-export.tsx
    │   ├── brokers/                  Phase 2 新：经纪人聚合
    │   │   └── page.tsx
    │   └── admin/
    │       ├── crawler/              Phase 2 新：采集监控
    │       │   ├── page.tsx
    │       │   └── _components/
    │       │       ├── queue-status.tsx
    │       │       ├── cookie-panel.tsx
    │       │       ├── field-alias-tab.tsx
    │       │       └── manual-rerun.tsx
    │       └── brokers/              Phase 2 新：经纪人映射管理
    │           ├── page.tsx
    │           └── _components/
    │               └── broker-table.tsx
    └── api/
        └── admin/
            ├── crawler/
            │   ├── status/route.ts   pg-boss 查询 GET
            │   └── cookie/route.ts   Cookie 状态 GET
            └── brokers/route.ts      经纪人列表 GET

tests/
├── modules/
│   ├── crawler/
│   │   ├── parsers.test.ts
│   │   ├── readiness.test.ts
│   │   └── adapters/
│   │       └── anchor-list.test.ts   adapter parse() 单测
│   ├── brokers/
│   │   └── matcher.test.ts
│   └── dashboard/
│       └── queries.test.ts           scope 过滤测试
└── fixtures/
    ├── anchor-list-response.json     从 .tmp-design-preview 拷贝过来
    └── anchor-daily-response.json
```

### 修改文件

```
src/db/schema/index.ts                re-export 3 个新 schema 文件
src/worker/index.ts                   注册 crawl-orchestrator cron
src/lib/nav.ts                        启用 Phase 2 nav items（disabled: true → false）
src/app/(dashboard)/dashboard/page.tsx 加 6 张卡片 + 趋势图
eslint.config.mjs                     加 4 个新模块的 zones
CONTRIBUTING.md                       第 8 节注册 4 个新模块
package.json                          加 puppeteer / puppeteer-extra-plugin-stealth / pg-boss / @types/pg-boss
.env.example                          加 PUPPETEER_HEADLESS / DOUYIN_COOKIE_BASECAMP
docker-compose.yml                    worker 容器加 puppeteer 依赖（chromium）
```

---

## 关键设计决策（从 spec 第 2-6 节提炼）

1. **三层数据存储**：标准化字段 hardcode + raw jsonb 兜底 + field_alias 配置中文名
2. **采集流程**：10:00 cron → check-data-ready → profile + daily → 下游 jobs（按项目分流）
3. **项目归属**：`anchor_profile.recruit_broker_name === "三国项目"` → 三国 → 拉小游戏；其他 → 斗地主 → 拉推广游戏
4. **失败策略**：3 次指数退避；Cookie 失效暂停整队列 + 钉钉告警 + admin 扫码续期
5. **就绪检测**：取前 50 条按日数据，若 `totalFanTicket > 0` 占比 < 30% → 视未就绪 → 30min 后重试，最多 8 次
6. **范围限制**：仅 cs 基地，仅本基地账号能看到的主播；不回填历史；单场详情仅采小游戏激活漏斗

---

## Tasks 概览

| # | Task | 产出 | 预计工时 |
|---|---|---|---|
| 1 | Schemas + migrations | 9 张新表全部建好 | 1.5h |
| 2 | parsers.ts | 字段值解析 + 单测 | 1h |
| 3 | Puppeteer + Cookie infra | 浏览器单例 + Cookie 持久化 | 2h |
| 4 | pg-boss queue + 守护 job 框架 | queue.ts + 注册机制 | 1.5h |
| 5 | anchor-list adapter + fetch-profile | profile job 跑通 | 2h |
| 6 | anchor-daily adapter + fetch-daily + readiness | daily job 跑通含就绪检测 | 2h |
| 7 | game-promo adapter + fetch-game | 斗地主数据采集 | 1.5h |
| 8 | minigame adapters + fetch-minigame | 三国数据采集 | 2h |
| 9 | portrait + session-mg adapters + jobs | 剩余 2 个采集 | 1.5h |
| 10 | orchestrator + cron + 钉钉告警 | 全链路自动跑 | 1.5h |
| 11 | broker matcher + module + admin 映射页 | 经纪人映射 | 2h |
| 12 | anchors module + /anchors 明细页 | 主播明细页 | 2h |
| 13 | dashboard queries + /dashboard 改造 | 总览页卡片 | 1.5h |
| 14 | /brokers 聚合页 | 经纪人聚合页 | 1h |
| 15 | /admin/crawler 监控页 + field_alias | 采集监控 + 字段配置 | 2h |
| 16 | nav 启用 + 集成测试 + 验收 | Phase 2 收口 | 1h |
|   | **合计** | | **~25h** |

---

## Task 1: Schemas + Migrations

**Files:**
- Create: `src/db/schema/anchors.ts`
- Create: `src/db/schema/brokers.ts`
- Create: `src/db/schema/crawler.ts`
- Modify: `src/db/schema/index.ts`
- Generate: `src/db/migrations/0006_*.sql`

- [ ] **Step 1.1: 创建 anchors schema 文件**

`src/db/schema/anchors.ts`:

```typescript
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * 主播档案（维度表）。
 * 来源：抖音 uanchor/anchor_list/list（117 字段，解构 6 个嵌套对象后落 48 个扁平字段）
 * 更新：每日 10:00 全量同步覆盖（不存历史快照）
 * 详细字段映射见 .tmp-design-preview/anchor-tables-fields-final.md
 */
export const anchor_profile = pgTable(
  "anchor_profile",
  {
    anchor_id: text("anchor_id").primaryKey(),

    // 身份/基础（10）
    nick_name: text("nick_name").notNull(),
    avatar: text("avatar"),
    gender: integer("gender"), // 0/1/2
    aweme_display_id: text("aweme_display_id"),
    aweme_short_id: text("aweme_short_id"),
    hotsoon_display_id: text("hotsoon_display_id"),
    hotsoon_short_id: text("hotsoon_short_id"),
    xigua_display_id: text("xigua_display_id"),
    real_name: text("real_name"),

    // 状态/标签（7）
    last_live_time: bigint("last_live_time", { mode: "number" }), // unix
    live_status: integer("live_status"),
    anchor_health_score: integer("anchor_health_score"),
    anchor_health_score_level: integer("anchor_health_score_level"),
    anchor_ban_30d: integer("anchor_ban_30d"),
    anchor_violation_30d: integer("anchor_violation_30d"),
    notes: text("notes"),

    // 签约/经纪人（13）
    anchor_sign_type: integer("anchor_sign_type"),
    anchor_sign_out: integer("anchor_sign_out"),
    signing_time: bigint("signing_time", { mode: "number" }),
    sign_start_time: bigint("sign_start_time", { mode: "number" }),
    sign_end_time: bigint("sign_end_time", { mode: "number" }),
    union_member_end_date: bigint("union_member_end_date", { mode: "number" }),
    auto_renewal: boolean("auto_renewal"),
    join_time: bigint("join_time", { mode: "number" }),
    first_live_time_in_faction: bigint("first_live_time_in_faction", { mode: "number" }),
    leave_time: bigint("leave_time", { mode: "number" }),
    wait_for_leave: boolean("wait_for_leave"),
    have_operate_relation: boolean("have_operate_relation"),
    have_recruit_relation: boolean("have_recruit_relation"),

    // 经纪人关系（4）
    broker_id: text("broker_id"),
    broker_name: text("broker_name"),
    recruit_broker_id: text("recruit_broker_id"),
    recruit_broker_name: text("recruit_broker_name"),

    // 分成比（2）
    income_percent: numeric("income_percent", { precision: 5, scale: 4 }),
    percent_map: jsonb("percent_map"),

    // 业务标识 + 时长汇总（16，统一拍 jsonb 不一一建列，避免列爆炸）
    misc: jsonb("misc"), // 存其他 12+4 字段

    // 项目归属（采集后 derived）
    is_threekingdoms: boolean("is_threekingdoms").notNull().default(false),

    // 系统
    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_broker: index("idx_anchor_profile_broker").on(t.broker_id),
    idx_recruit_broker: index("idx_anchor_profile_recruit_broker").on(t.recruit_broker_id),
    idx_is_three: index("idx_anchor_profile_is_three").on(t.is_threekingdoms),
    idx_health: index("idx_anchor_profile_health").on(t.anchor_health_score),
  }),
);

/**
 * 主播按日数据（事实表）。
 * 来源：data_center/anchor_list（91 字段，fields 显式声明全集）
 * 主键：(anchor_id, date)
 */
export const anchor_daily = pgTable(
  "anchor_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD

    // 身份冗余（3，当日快照）
    nickname_snapshot: text("nickname_snapshot"),

    // 音浪/收益（10，单位：分）
    total_fan_ticket: bigint("total_fan_ticket", { mode: "number" }),
    live_fan_ticket_no_guest: bigint("live_fan_ticket_no_guest", { mode: "number" }),
    property_fan_ticket_no_guest: bigint("property_fan_ticket_no_guest", { mode: "number" }),
    guest_fan_ticket: bigint("guest_fan_ticket", { mode: "number" }),
    activity_fan_ticket_no_guest: bigint("activity_fan_ticket_no_guest", { mode: "number" }),
    special_fan_ticket: bigint("special_fan_ticket", { mode: "number" }),
    subscribe_fan_ticket: bigint("subscribe_fan_ticket", { mode: "number" }),
    pk_fan_ticket: bigint("pk_fan_ticket", { mode: "number" }),
    link_screen_fan_ticket: bigint("link_screen_fan_ticket", { mode: "number" }),
    link_screen_room_fan_ticket: bigint("link_screen_room_fan_ticket", { mode: "number" }),

    // 时长（4，单位：小时 numeric 6,2）
    live_duration_1d: numeric("live_duration_1d", { precision: 6, scale: 2 }),
    valid_live_duration_1d: numeric("valid_live_duration_1d", { precision: 6, scale: 2 }),
    is_solo_valid_day: integer("is_solo_valid_day"),
    feed_watch_duration_1d: numeric("feed_watch_duration_1d", { precision: 6, scale: 2 }),

    // 看播/人气（2）
    feed_acu: integer("feed_acu"),
    peak_per_minute_ucnt: integer("peak_per_minute_ucnt"),

    // 粉丝/转化（2）
    total_fans: integer("total_fans"),
    new_follow_fans_1d: integer("new_follow_fans_1d"),

    // 视频统计（3）
    video_view_count: integer("video_view_count"),
    video_like_count: integer("video_like_count"),
    video_comment_count: integer("video_comment_count"),

    // 分成比（4，0-1 小数）
    current_percent: numeric("current_percent", { precision: 5, scale: 4 }),
    game_share_percent: numeric("game_share_percent", { precision: 5, scale: 4 }),
    pay_money_connect_share_percent: numeric("pay_money_connect_share_percent", {
      precision: 5,
      scale: 4,
    }),
    profit_share_ratio: numeric("profit_share_ratio", { precision: 5, scale: 4 }),

    // 状态/档案（4，当日快照）
    broker_snapshot: text("broker_snapshot"),
    signing_type_snapshot: text("signing_type_snapshot"),
    last_live_time_snapshot: text("last_live_time_snapshot"), // 字符串快照如 "17小时前"
    is_new: integer("is_new"),

    // 其他（4）
    anchor_info: text("anchor_info"),
    star_guard_earn_score: bigint("star_guard_earn_score", { mode: "number" }),
    total_ticket_outside_link: bigint("total_ticket_outside_link", { mode: "number" }),
    stat_guard_enter_account_earn_score: bigint("stat_guard_enter_account_earn_score", {
      mode: "number",
    }),

    // 系统
    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date] }),
    idx_date: index("idx_anchor_daily_date").on(t.date),
    idx_anchor: index("idx_anchor_daily_anchor").on(t.anchor_id),
  }),
);

/**
 * 推广游戏数据（斗地主主播）。
 * 来源：faction/game/game_anchor_detail_list × 3 bizMode (cps_all / cpc / poi) × 2 promote_scene
 */
export const anchor_game_promo_daily = pgTable(
  "anchor_game_promo_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),
    promote_scene: text("promote_scene", { enum: ["live", "video"] }).notNull(),
    biz_mode: text("biz_mode", { enum: ["cps_all", "cpc", "poi"] }).notNull(),
    game_name: text("game_name").notNull(),

    // 基础
    promote_live_cnt_1d: integer("promote_live_cnt_1d"),
    promote_live_duration_1d: numeric("promote_live_duration_1d", { precision: 6, scale: 2 }),
    acu: integer("acu"),
    pcu: integer("pcu"),

    // 看播 / 互动 / 转化漏斗 / 付费 / 分账 — 全部拍进 raw, 仅核心字段 indexed
    promote_anchor_income_1d: bigint("promote_anchor_income_1d", { mode: "number" }), // 主播分账后
    promote_faction_income_1d: bigint("promote_faction_income_1d", { mode: "number" }),
    promote_pay_amount_1d: bigint("promote_pay_amount_1d", { mode: "number" }),
    promote_pay_ucnt_1d: integer("promote_pay_ucnt_1d"),

    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.anchor_id, t.date, t.promote_scene, t.biz_mode, t.game_name],
    }),
    idx_date: index("idx_game_promo_date").on(t.date),
    idx_anchor: index("idx_game_promo_anchor").on(t.anchor_id),
  }),
);

/**
 * 小游戏数据（三国主播）。
 * 来源：
 *   scene=live  → faction/micro_game/live_anchor_list
 *   scene=video → micro_game/video/creator_list
 */
export const anchor_minigame_daily = pgTable(
  "anchor_minigame_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),
    scene: text("scene", { enum: ["live", "video"] }).notNull(),

    // 共性（命名风格用 live 那套，video 字段在 adapter 里映射进来）
    live_room_cnt: integer("live_room_cnt"),
    live_duration: numeric("live_duration", { precision: 6, scale: 2 }),
    watch_ucnt: integer("watch_ucnt"),
    gm_click_ucnt: integer("gm_click_ucnt"),
    gm_active_ucnt: integer("gm_active_ucnt"),
    gm_pay_ucnt: integer("gm_pay_ucnt"),

    // 分账（核心）
    before_divided_income: bigint("before_divided_income", { mode: "number" }),
    after_divided_author_income: bigint("after_divided_author_income", { mode: "number" }), // 主播分账后
    after_divided_trade_union_income: bigint("after_divided_trade_union_income", { mode: "number" }),
    cps_bind_uv: integer("cps_bind_uv"),

    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date, t.scene] }),
    idx_date: index("idx_minigame_date").on(t.date),
    idx_anchor: index("idx_minigame_anchor").on(t.anchor_id),
  }),
);

/**
 * 主播 portrait 直播数据（仅曝光人数 + 几个邻接漏斗字段）。
 * 来源：portrait/core_day_stats/{cid}
 */
export const anchor_portrait_daily = pgTable(
  "anchor_portrait_daily",
  {
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(),

    show_uv: integer("show_uv"),
    enter_uv: integer("enter_uv"),
    enter_ratio: numeric("enter_ratio", { precision: 5, scale: 4 }),
    pay_ucnt: integer("pay_ucnt"),
    pay_ratio: numeric("pay_ratio", { precision: 5, scale: 4 }),

    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.anchor_id, t.date] }),
    idx_date: index("idx_portrait_date").on(t.date),
  }),
);

/**
 * 单场小游戏激活漏斗。
 * 来源：tinker_proxy/lego/native/webcast_api/room/minigame/audience_convert
 *      + room/replay/overview_v3 (取 acu / show_uv 等)
 */
export const session_minigame_convert = pgTable(
  "session_minigame_convert",
  {
    room_id: text("room_id").primaryKey(),
    anchor_id: text("anchor_id").notNull(),
    date: text("date").notNull(), // 场次开始日

    // overview_v3 摘要
    acu: integer("acu"),
    show_uv: integer("show_uv"),

    // 激活漏斗
    not_open_game_uv: integer("not_open_game_uv"),
    not_open_game_show_uv: integer("not_open_game_show_uv"),
    not_open_game_click_uv: integer("not_open_game_click_uv"),
    not_open_game_pay_uv: integer("not_open_game_pay_uv"),
    not_open_show_per: numeric("not_open_show_per", { precision: 5, scale: 4 }),
    not_open_click_per: numeric("not_open_click_per", { precision: 5, scale: 4 }),
    not_open_pay_per: numeric("not_open_pay_per", { precision: 5, scale: 4 }),
    open_game_uv: integer("open_game_uv"),
    open_game_click_uv: integer("open_game_click_uv"),
    open_game_pay_uv: integer("open_game_pay_uv"),
    open_game_click_per: numeric("open_game_click_per", { precision: 5, scale: 4 }),
    open_game_pay_per: numeric("open_game_pay_per", { precision: 5, scale: 4 }),

    raw: jsonb("raw").notNull(),
    synced_at: timestamp("synced_at").notNull().defaultNow(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_anchor_date: index("idx_session_mg_anchor_date").on(t.anchor_id, t.date),
    idx_date: index("idx_session_mg_date").on(t.date),
  }),
);
```

- [ ] **Step 1.2: 创建 brokers schema**

`src/db/schema/brokers.ts`:

```typescript
import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

/**
 * 经纪人 ↔ 钉钉 user 映射。
 * 每天 sync 后 fuzzy match anchor_profile.broker_name ↔ dingtalk_user.name 自动填。
 * admin 页可手动改（match_source='manual' 优先于 'auto'）。
 */
export const broker_user_mapping = pgTable(
  "broker_user_mapping",
  {
    broker_id: text("broker_id").primaryKey(),
    broker_name: text("broker_name").notNull(),
    dingtalk_user_id: text("dingtalk_user_id"),
    match_source: text("match_source", { enum: ["auto", "manual", "pending"] })
      .notNull()
      .default("pending"),
    matched_at: timestamp("matched_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    idx_user: index("idx_broker_mapping_user").on(t.dingtalk_user_id),
    uniq_user: unique("uq_broker_mapping_user").on(t.dingtalk_user_id), // 一个钉钉 user 只能对应一个 broker
  }),
);
```

- [ ] **Step 1.3: 创建 crawler schema**

`src/db/schema/crawler.ts`:

```typescript
import { index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 爬虫 Cookie 储存。
 * Phase 2 仅 cs 一个 basecamp，单行；后续扩 nc1/nc2 时多行即可。
 * Cookie 失效 status='expired' → 队列暂停 → 钉钉告警 → admin 扫码续期重置 active。
 */
export const crawler_cookie_session = pgTable("crawler_cookie_session", {
  basecamp: text("basecamp", { enum: ["cs", "nc1", "nc2"] }).primaryKey(),
  cookies: jsonb("cookies").notNull(), // {sid_guard, sessionid, msToken, ttwid, passport_csrf_token, ...}
  captured_at: timestamp("captured_at").notNull().defaultNow(),
  expires_at: timestamp("expires_at"),
  status: text("status", { enum: ["active", "expired"] })
    .notNull()
    .default("active"),
  last_check_at: timestamp("last_check_at"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * 字段中文显示名 + 单位 + 显示控制。
 * 仅"展示层"配置——不影响存储/采集。
 * 主键 (table_name, field_name) 全局唯一。
 */
export const field_alias = pgTable(
  "field_alias",
  {
    table_name: text("table_name").notNull(),
    field_name: text("field_name").notNull(),
    chinese_name: text("chinese_name").notNull(),
    unit: text("unit"), // 小时 / 分 / 元 / % / null
    hidden: text("hidden", { enum: ["true", "false"] })
      .notNull()
      .default("false"),
    sort_order: text("sort_order").notNull().default("0"),
    description: text("description"),
    updated_by: text("updated_by"),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.table_name, t.field_name] }),
    idx_table: index("idx_field_alias_table").on(t.table_name),
  }),
);
```

- [ ] **Step 1.4: 在 schema/index.ts 添加 re-export**

修改 `src/db/schema/index.ts`，在末尾追加：

```typescript
export * from "./anchors";
export * from "./brokers";
export * from "./crawler";
```

- [ ] **Step 1.5: 生成 migration**

Run: `pnpm db:generate`
Expected output: `src/db/migrations/0006_*.sql` 文件出现，含 9 张表的 CREATE TABLE 语句。

- [ ] **Step 1.6: 应用 migration**

Run: `docker-compose up -d postgres && pnpm db:migrate`
Expected: 无报错。

验证：
```bash
docker exec qjhy-postgres psql -U qjhy -d qjhy -c "\dt"
```
Expected: 看到 9 张新表（anchor_profile / anchor_daily / anchor_game_promo_daily / anchor_minigame_daily / anchor_portrait_daily / session_minigame_convert / broker_user_mapping / crawler_cookie_session / field_alias）。

- [ ] **Step 1.7: TypeScript 编译验证**

Run: `pnpm typecheck`
Expected: 无错误。

- [ ] **Step 1.8: Commit**

```bash
git add src/db/schema/ src/db/migrations/
git commit -m "feat(phase-2): add 9 tables for anchor data + crawler infrastructure

- anchor_profile / anchor_daily (维度+按日事实)
- anchor_game_promo_daily (斗地主推广) / anchor_minigame_daily (三国小游戏)
- anchor_portrait_daily (曝光) / session_minigame_convert (单场激活)
- broker_user_mapping (经纪人映射) / crawler_cookie_session / field_alias

Refs: docs/superpowers/specs/2026-05-02-phase-2-broadcast-data.md §3"
```

---

## Task 2: parsers.ts (字段值解析 + 单测)

**Files:**
- Create: `src/modules/crawler/parsers.ts`
- Create: `src/modules/crawler/parsers.test.ts`
- Create: `src/modules/crawler/index.ts` (临时占位)
- Create: `src/modules/crawler/server.ts` (临时占位)

抖音返回字段大量是格式化字符串，必须反向解析。

- [ ] **Step 2.1: 创建模块占位 + index/server**

`src/modules/crawler/index.ts`:
```typescript
export { parseDuration, parseRelativeTime, parsePercent, parseChineseNumber } from "./parsers";
```

`src/modules/crawler/server.ts`:
```typescript
import "server-only";
// 后续 task 在此 export server-only API
```

- [ ] **Step 2.2: 写 parsers.test.ts（先写失败测试）**

`src/modules/crawler/parsers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  parseDuration,
  parseRelativeTime,
  parsePercent,
  parseChineseNumber,
} from "./parsers";

describe("parseDuration", () => {
  it("parses '6小时6分钟38秒' to 6.11 hours", () => {
    expect(parseDuration("6小时6分钟38秒")).toBeCloseTo(6.11, 2);
  });
  it("parses '0小时0分钟0秒' to 0", () => {
    expect(parseDuration("0小时0分钟0秒")).toBe(0);
  });
  it("parses '30分钟' to 0.5 hours", () => {
    expect(parseDuration("30分钟")).toBeCloseTo(0.5, 2);
  });
  it("parses '1小时' to 1", () => {
    expect(parseDuration("1小时")).toBe(1);
  });
  it("parses empty/null to null", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
  it("parses non-string fallback to null", () => {
    expect(parseDuration("乱码")).toBeNull();
  });
});

describe("parseRelativeTime", () => {
  it("parses '17小时前' relative to now", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("17小时前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 17 * 3600);
  });
  it("parses '3天前'", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("3天前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 3 * 86400);
  });
  it("parses '5分钟前'", () => {
    const now = new Date("2026-05-02T12:00:00Z");
    const result = parseRelativeTime("5分钟前", now);
    expect(result).toBe(Math.floor(now.getTime() / 1000) - 5 * 60);
  });
  it("returns null on unparseable", () => {
    expect(parseRelativeTime("一会儿前")).toBeNull();
  });
});

describe("parsePercent", () => {
  it("parses '50%' to 0.5", () => {
    expect(parsePercent("50%")).toBe(0.5);
  });
  it("parses '0%' to 0", () => {
    expect(parsePercent("0%")).toBe(0);
  });
  it("parses '100%' to 1", () => {
    expect(parsePercent("100%")).toBe(1);
  });
  it("parses '12.5%' to 0.125", () => {
    expect(parsePercent("12.5%")).toBeCloseTo(0.125, 4);
  });
  it("returns null on bad input", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc%")).toBeNull();
  });
});

describe("parseChineseNumber", () => {
  it("parses '3.8万' to 38000", () => {
    expect(parseChineseNumber("3.8万")).toBe(38000);
  });
  it("parses '1万' to 10000", () => {
    expect(parseChineseNumber("1万")).toBe(10000);
  });
  it("parses '1.2亿' to 120000000", () => {
    expect(parseChineseNumber("1.2亿")).toBe(120000000);
  });
  it("parses plain '1234' to 1234", () => {
    expect(parseChineseNumber("1234")).toBe(1234);
  });
  it("parses numeric value as-is", () => {
    expect(parseChineseNumber(1234)).toBe(1234);
  });
  it("returns null on bad input", () => {
    expect(parseChineseNumber("")).toBeNull();
    expect(parseChineseNumber("abc")).toBeNull();
  });
});
```

- [ ] **Step 2.3: 跑测试确认失败**

Run: `pnpm test -- parsers`
Expected: 测试全失败（"function not defined" 或 module 找不到）。

- [ ] **Step 2.4: 实现 parsers.ts**

`src/modules/crawler/parsers.ts`:

```typescript
/**
 * 抖音公会平台返回的字段值预处理。
 * 平台大量字段是格式化字符串（"6小时6分钟38秒" / "17小时前" / "3.8万" / "0%"），
 * 入库前必须反向解析为数值/时间戳。
 */

/**
 * 把"X小时Y分钟Z秒"解析为小时（小数）。
 * "" / null / 无法解析 → null
 */
export function parseDuration(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const re =
    /^(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分钟)?\s*(?:(\d+)\s*秒)?$/;
  const m = input.trim().match(re);
  if (!m) return null;
  const [, h, mm, s] = m;
  if (!h && !mm && !s) return null;
  const hours = parseInt(h ?? "0", 10);
  const mins = parseInt(mm ?? "0", 10);
  const secs = parseInt(s ?? "0", 10);
  return Math.round(((hours * 3600 + mins * 60 + secs) / 3600) * 100) / 100;
}

/**
 * 把"17小时前"/"3天前"/"5分钟前"解析为 unix 时间戳（秒）。
 * 基于 now 反推。
 */
export function parseRelativeTime(
  input: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!input || typeof input !== "string") return null;
  const m = input.trim().match(/^(\d+)\s*(秒|分钟|小时|天)前$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const seconds =
    unit === "秒" ? n : unit === "分钟" ? n * 60 : unit === "小时" ? n * 3600 : n * 86400;
  return Math.floor(now.getTime() / 1000) - seconds;
}

/**
 * 把"50%"解析为 0.5（0-1 小数）。
 */
export function parsePercent(input: string | null | undefined): number | null {
  if (!input || typeof input !== "string") return null;
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  if (!m) return null;
  return parseFloat(m[1]) / 100;
}

/**
 * 把"3.8万"解析为 38000，"1.2亿"解析为 120000000，纯数字字符串原样转 Number。
 */
export function parseChineseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") return input;
  const s = input.toString().trim();
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(万|亿)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  if (m[2] === "万") return Math.round(n * 10000);
  if (m[2] === "亿") return Math.round(n * 100000000);
  return n;
}
```

- [ ] **Step 2.5: 跑测试确认通过**

Run: `pnpm test -- parsers`
Expected: 全部 18+ 个 test PASS。

- [ ] **Step 2.6: ESLint zone 添加 crawler 模块**

修改 `eslint.config.mjs`，在 `zones` 数组里追加：

```javascript
{
  target: [
    "./src/app/**",
    "./src/components/**",
    "./src/lib/**",
    "./src/worker/**",
    "./src/modules/!(crawler)/**",
  ],
  from: "./src/modules/crawler/!(index|server).ts",
  message: "跨模块只允许 import 对方的 index.ts。详见 CONTRIBUTING.md 第 10.2 节。",
},
```

注意：`adapters/` 子目录的限制由 `!(index|server).ts` 隐含覆盖（任何非 index.ts/server.ts 都禁止外部 import）。

Run: `pnpm lint`
Expected: 无错误。

- [ ] **Step 2.7: Commit**

```bash
git add src/modules/crawler/ eslint.config.mjs
git commit -m "feat(crawler): parsers for 抖音 formatted strings (duration/relative-time/percent/chinese-number)"
```

---

## Task 3: Puppeteer + Cookie 基础设施

**Files:**
- Create: `src/lib/puppeteer/browser.ts`
- Create: `src/lib/puppeteer/page-fetch.ts`
- Create: `src/lib/puppeteer/index.ts`
- Create: `src/modules/crawler/cookie.ts`
- Modify: `package.json` (add puppeteer)
- Modify: `.env.example`

- [ ] **Step 3.1: 装依赖**

Run:
```bash
pnpm add puppeteer-core@24 puppeteer-extra puppeteer-extra-plugin-stealth
pnpm add -D @types/puppeteer-core
```

(用 puppeteer-core 不带 chromium，docker 镜像里另装)

- [ ] **Step 3.2: 创建浏览器单例**

`src/lib/puppeteer/browser.ts`:

```typescript
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer-core";

puppeteer.use(StealthPlugin());

let _browser: Browser | null = null;

/**
 * 启动 / 复用 headless Chrome。
 * worker 进程生命周期内只起一个 Browser 实例，省启动开销。
 */
export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  _browser = (await puppeteer.launch({
    headless: process.env.PUPPETEER_HEADLESS !== "false",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // docker 里指 chromium
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  })) as unknown as Browser;
  return _browser;
}

/** 关闭 Browser（仅 worker shutdown 调用） */
export async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

/**
 * 打开抖音公会平台 page，注入 Cookie。
 * 调用方负责关闭 page。
 */
export async function openDouyinPage(cookies: Record<string, string>): Promise<Page> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  );
  // 先访问主域名才能 setCookie
  await page.goto("https://union.bytedance.com/", { waitUntil: "domcontentloaded" });
  const cookieEntries = Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: ".bytedance.com",
    path: "/",
  }));
  await page.setCookie(...cookieEntries);
  return page;
}
```

- [ ] **Step 3.3: page-fetch helper**

`src/lib/puppeteer/page-fetch.ts`:

```typescript
import type { Page } from "puppeteer-core";

/**
 * 在浏览器 context 内调 fetch，让平台前端 SDK 自动加 X-Bogus / _signature 等签名。
 * url 必须含完整 query string；headers 由调用方传（X-Appid: 3000 等）。
 */
export async function pageFetch<T = unknown>(
  page: Page,
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string },
): Promise<T> {
  const result = await page.evaluate(
    async (u, i) => {
      const res = await fetch(u, {
        method: i?.method ?? "GET",
        headers: i?.headers ?? {},
        body: i?.body,
        credentials: "include",
      });
      const text = await res.text();
      return { status: res.status, text };
    },
    url,
    init,
  );

  if (result.status === 401 || result.status === 403) {
    throw new CookieExpiredError(`Auth failed (${result.status}) on ${url}`);
  }
  if (!result.text.startsWith("{")) {
    // 重定向到登录页
    throw new CookieExpiredError(`Non-JSON response on ${url} (likely redirected to login)`);
  }
  return JSON.parse(result.text) as T;
}

export class CookieExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookieExpiredError";
  }
}
```

- [ ] **Step 3.4: 创建 lib/puppeteer/index.ts**

```typescript
export { getBrowser, closeBrowser, openDouyinPage } from "./browser";
export { pageFetch, CookieExpiredError } from "./page-fetch";
```

- [ ] **Step 3.5: cookie.ts 持久化**

`src/modules/crawler/cookie.ts`:

```typescript
import "server-only";
import { db } from "@/db/client";
import { crawler_cookie_session } from "@/db/schema";
import { eq } from "drizzle-orm";

export type Basecamp = "cs" | "nc1" | "nc2";

export interface CookieRecord {
  basecamp: Basecamp;
  cookies: Record<string, string>;
  status: "active" | "expired";
  captured_at: Date;
}

/** 取当前 base 的 active cookies；无则抛错 */
export async function getActiveCookies(basecamp: Basecamp): Promise<Record<string, string>> {
  const [row] = await db
    .select()
    .from(crawler_cookie_session)
    .where(eq(crawler_cookie_session.basecamp, basecamp));
  if (!row || row.status !== "active") {
    throw new Error(`No active cookie for basecamp=${basecamp}`);
  }
  return row.cookies as Record<string, string>;
}

/** 标记 Cookie 失效（page-fetch 抛 CookieExpiredError 时调） */
export async function markCookieExpired(basecamp: Basecamp): Promise<void> {
  await db
    .update(crawler_cookie_session)
    .set({ status: "expired", last_check_at: new Date(), updated_at: new Date() })
    .where(eq(crawler_cookie_session.basecamp, basecamp));
}

/** admin 扫码续期后写入新 Cookie */
export async function saveCookies(
  basecamp: Basecamp,
  cookies: Record<string, string>,
): Promise<void> {
  await db
    .insert(crawler_cookie_session)
    .values({
      basecamp,
      cookies,
      status: "active",
      captured_at: new Date(),
      last_check_at: new Date(),
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: crawler_cookie_session.basecamp,
      set: {
        cookies,
        status: "active",
        captured_at: new Date(),
        last_check_at: new Date(),
        updated_at: new Date(),
      },
    });
}
```

- [ ] **Step 3.6: 更新 .env.example**

追加:
```
# Puppeteer (Phase 2)
PUPPETEER_HEADLESS=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 默认基地（Phase 2 仅支持 cs）
DOUYIN_DEFAULT_BASECAMP=cs
```

- [ ] **Step 3.7: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/lib/puppeteer/ src/modules/crawler/cookie.ts package.json pnpm-lock.yaml .env.example
git commit -m "feat(phase-2): puppeteer browser + cookie persistence infra"
```

---

## Task 4: pg-boss queue + 守护 job 框架

**Files:**
- Create: `src/modules/crawler/queue.ts`
- Create: `src/modules/crawler/types.ts`
- Create: `src/modules/crawler/notify.ts`
- Modify: `package.json` (add pg-boss)

- [ ] **Step 4.1: 装依赖**

```bash
pnpm add pg-boss@10
pnpm add -D @types/pg-boss
```

- [ ] **Step 4.2: 定义 job 类型**

`src/modules/crawler/types.ts`:

```typescript
export const JOB_NAMES = {
  CHECK_DATA_READY: "crawler:check_data_ready",
  FETCH_PROFILE: "crawler:fetch_profile",
  FETCH_DAILY: "crawler:fetch_daily",
  FETCH_GAME: "crawler:fetch_game", // per anchor
  FETCH_MINIGAME: "crawler:fetch_minigame", // per anchor
  FETCH_PORTRAIT: "crawler:fetch_portrait", // per anchor
  FETCH_SESSION_MG: "crawler:fetch_session_mg", // per room_id
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface FetchPerAnchorPayload {
  anchor_id: string;
  date: string; // YYYY-MM-DD
  basecamp: "cs" | "nc1" | "nc2";
}

export interface FetchSessionMgPayload {
  room_id: string;
  anchor_id: string;
  basecamp: "cs" | "nc1" | "nc2";
}

export interface FetchSimplePayload {
  date: string;
  basecamp: "cs" | "nc1" | "nc2";
}

export interface CheckDataReadyPayload {
  date: string;
  basecamp: "cs" | "nc1" | "nc2";
  attempt: number; // 1..8
}
```

- [ ] **Step 4.3: queue.ts**

`src/modules/crawler/queue.ts`:

```typescript
import "server-only";
import PgBoss from "pg-boss";
import { JOB_NAMES, type JobName } from "./types";

let _boss: PgBoss | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL not set");
  _boss = new PgBoss({
    connectionString: databaseUrl,
    schema: "pgboss",
    retryLimit: 3,
    retryBackoff: true, // 指数退避: 1s / 5s / 30s
    expireInHours: 6, // 单 job 超 6 小时未完成 → 失败
  });
  _boss.on("error", (err) => console.error("[pg-boss] error", err));
  await _boss.start();
  return _boss;
}

export async function stopBoss(): Promise<void> {
  if (_boss) {
    await _boss.stop({ graceful: true, close: true });
    _boss = null;
  }
}

/** Enqueue helper：所有 enqueue 走这个，统一日志 */
export async function enqueue<T extends object>(
  jobName: JobName,
  payload: T,
  opts?: { startAfter?: Date | string | number; singletonKey?: string },
): Promise<string | null> {
  const boss = await getBoss();
  const id = await boss.send(jobName, payload, {
    retryLimit: 3,
    retryBackoff: true,
    expireInHours: 2,
    startAfter: opts?.startAfter,
    singletonKey: opts?.singletonKey,
  });
  console.log(`[queue] enqueued ${jobName}`, { id, payload });
  return id;
}

export { JOB_NAMES };
export type { JobName };
```

- [ ] **Step 4.4: notify.ts（钉钉告警包装）**

`src/modules/crawler/notify.ts`:

```typescript
import "server-only";
import { notifyError } from "@/lib/notify"; // Phase 1 已有

export async function notifyCrawlerError(opts: {
  type: "data_not_ready" | "cookie_expired" | "job_failed" | "db_unreachable";
  detail: string;
  impact?: string;
  action?: string;
}): Promise<void> {
  const lines = [
    `[Phase2 报错] ${opts.type}`,
    `时间: ${new Date().toISOString()}`,
    `详情: ${opts.detail}`,
  ];
  if (opts.impact) lines.push(`影响: ${opts.impact}`);
  if (opts.action) lines.push(`处理: ${opts.action}`);
  await notifyError(lines.join("\n"));
}
```

注意：Phase 1 的 `src/lib/notify` 必须含"报错"关键词，已实现。

- [ ] **Step 4.5: 暴露 server.ts 导出**

修改 `src/modules/crawler/server.ts`:

```typescript
import "server-only";

export { getBoss, stopBoss, enqueue, JOB_NAMES } from "./queue";
export type { JobName } from "./types";
export {
  getActiveCookies,
  markCookieExpired,
  saveCookies,
  type Basecamp,
  type CookieRecord,
} from "./cookie";
export { notifyCrawlerError } from "./notify";
```

更新 `src/modules/crawler/index.ts`:

```typescript
export { parseDuration, parseRelativeTime, parsePercent, parseChineseNumber } from "./parsers";
export { JOB_NAMES, type JobName } from "./types";
export type { Basecamp } from "./cookie";
```

- [ ] **Step 4.6: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/crawler/ package.json pnpm-lock.yaml
git commit -m "feat(crawler): pg-boss queue scaffolding + 钉钉 alerts"
```

---

## Task 5: anchor-list adapter + fetch-profile job

**Files:**
- Create: `src/modules/crawler/adapters/anchor-list.ts`
- Create: `src/worker/jobs/handlers/fetch-profile.ts`
- Create: `tests/fixtures/anchor-list-response.json` (拷贝自 .tmp-design-preview)
- Create: `src/modules/crawler/adapters/anchor-list.test.ts`

- [ ] **Step 5.1: 拷贝真实样本到 fixtures**

```bash
mkdir -p tests/fixtures
cp .tmp-design-preview/anchor-list-response.network-response tests/fixtures/anchor-list-response.json
```

- [ ] **Step 5.2: 写 adapter parse() 单测**

`src/modules/crawler/adapters/anchor-list.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseAnchorListResponse } from "./anchor-list";

const RAW = JSON.parse(
  readFileSync(join(__dirname, "../../../../tests/fixtures/anchor-list-response.json"), "utf-8"),
);

describe("parseAnchorListResponse", () => {
  it("returns array of profile rows", () => {
    const rows = parseAnchorListResponse(RAW);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("first row has all key fields populated from base_info / faction_info / signing_info", () => {
    const [row] = parseAnchorListResponse(RAW);
    expect(row.anchor_id).toBeTruthy();
    expect(row.nick_name).toBeTruthy();
    expect(row.broker_id).toBeTruthy();
    expect(row.recruit_broker_name).toBeTruthy();
    expect(row.join_time).toBeGreaterThan(0);
    expect(row.first_live_time_in_faction).toBeGreaterThan(0);
  });

  it("flags is_threekingdoms when recruit_broker_name === 三国项目", () => {
    const [row] = parseAnchorListResponse(RAW);
    if (row.recruit_broker_name === "三国项目") {
      expect(row.is_threekingdoms).toBe(true);
    } else {
      expect(row.is_threekingdoms).toBe(false);
    }
  });

  it("includes raw payload", () => {
    const [row] = parseAnchorListResponse(RAW);
    expect(row.raw).toBeTruthy();
    expect(typeof row.raw).toBe("object");
  });
});
```

- [ ] **Step 5.3: 跑测试确认失败**

Run: `pnpm test -- anchor-list`
Expected: FAIL（adapter 还没建）。

- [ ] **Step 5.4: 实现 adapter**

`src/modules/crawler/adapters/anchor-list.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT = "https://union.bytedance.com/ark/api/uanchor/anchor_list/list";

export interface AnchorProfileRow {
  anchor_id: string;
  nick_name: string;
  avatar: string | null;
  gender: number | null;
  aweme_display_id: string | null;
  aweme_short_id: string | null;
  hotsoon_display_id: string | null;
  hotsoon_short_id: string | null;
  xigua_display_id: string | null;
  real_name: string | null;
  last_live_time: number | null;
  live_status: number | null;
  anchor_health_score: number | null;
  anchor_health_score_level: number | null;
  anchor_ban_30d: number | null;
  anchor_violation_30d: number | null;
  notes: string | null;
  anchor_sign_type: number | null;
  anchor_sign_out: number | null;
  signing_time: number | null;
  sign_start_time: number | null;
  sign_end_time: number | null;
  union_member_end_date: number | null;
  auto_renewal: boolean | null;
  join_time: number | null;
  first_live_time_in_faction: number | null;
  leave_time: number | null;
  wait_for_leave: boolean | null;
  have_operate_relation: boolean | null;
  have_recruit_relation: boolean | null;
  broker_id: string | null;
  broker_name: string | null;
  recruit_broker_id: string | null;
  recruit_broker_name: string | null;
  income_percent: number | null;
  percent_map: Record<string, string> | null;
  misc: Record<string, unknown>;
  is_threekingdoms: boolean;
  raw: Record<string, unknown>;
}

interface RawListResponse {
  status_code: number;
  data: { list: Record<string, unknown>[]; total_amount: number };
}

/**
 * 从平台 API 抓取分页主播列表，自动翻页直到拉完。
 */
export async function fetchAnchorList(page: Page): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let pageNum = 1;
  const size = 50;
  while (true) {
    const url = `${ENDPOINT}?vertical_type=0&sort_tag=5&is_increasing=false&page=${pageNum}&size=${size}`;
    const res = await pageFetch<RawListResponse>(page, url, {
      headers: { "X-Appid": "3000" },
    });
    if (res.status_code !== 0) {
      throw new Error(`anchor_list/list failed: code=${res.status_code}`);
    }
    all.push(...res.data.list);
    if (all.length >= res.data.total_amount) break;
    pageNum++;
    if (pageNum > 100) break; // safety
    await new Promise((r) => setTimeout(r, 300));
  }
  return all;
}

/**
 * 把平台返回的单条 record（嵌套对象 + 平铺字段）解构为 anchor_profile 表行。
 */
export function parseAnchorListResponse(raw: RawListResponse): AnchorProfileRow[] {
  return raw.data.list.map((r) => mapOne(r));
}

function mapOne(r: Record<string, unknown>): AnchorProfileRow {
  const baseInfo = (r.anchor_base_info ?? {}) as Record<string, unknown>;
  const factionInfo = (r.anchor_faction_info ?? {}) as Record<string, unknown>;
  const card = (r.anchor_card ?? {}) as Record<string, unknown>;
  const signing = (r.signing_info ?? {}) as Record<string, unknown>;

  const recruit_broker_name = (factionInfo.recruit_broker_name as string) ?? null;

  return {
    anchor_id: String(baseInfo.anchor_id ?? r.anchor_id ?? ""),
    nick_name: String(baseInfo.nick_name ?? ""),
    avatar: (baseInfo.avatar as string) ?? null,
    gender: numOrNull(baseInfo.gender),
    aweme_display_id: strOrNull(baseInfo.aweme_display_id),
    aweme_short_id: strOrNull(baseInfo.aweme_short_id),
    hotsoon_display_id: strOrNull(baseInfo.hotsoon_display_id),
    hotsoon_short_id: strOrNull(baseInfo.hotsoon_short_id),
    xigua_display_id: strOrNull(baseInfo.xigua_display_id),
    real_name: strOrNull(baseInfo.real_name),

    last_live_time: numOrNull(r.last_live_time),
    live_status: numOrNull(card.live_status),
    anchor_health_score: numOrNull(baseInfo.anchor_health_score),
    anchor_health_score_level: numOrNull(baseInfo.anchor_health_score_level),
    anchor_ban_30d: numOrNull(card.anchor_ban_30d),
    anchor_violation_30d: numOrNull(card.anchor_violation_30d),
    notes: strOrNull(baseInfo.notes),

    anchor_sign_type: numOrNull(r.anchor_sign_type),
    anchor_sign_out: numOrNull(r.anchor_sign_out),
    signing_time: numOrNull(signing.signing_time),
    sign_start_time: numOrNull(factionInfo.sign_start_time),
    sign_end_time: numOrNull(factionInfo.sign_end_time),
    union_member_end_date: numOrNull(baseInfo.union_member_end_date),
    auto_renewal: boolOrNull(factionInfo.auto_renewal),
    join_time: numOrNull(factionInfo.join_time),
    first_live_time_in_faction: numOrNull(factionInfo.first_live_time_in_faction),
    leave_time: numOrNull(factionInfo.leave_time),
    wait_for_leave: boolOrNull(factionInfo.wait_for_leave),
    have_operate_relation: boolOrNull(r.have_operate_relation),
    have_recruit_relation: boolOrNull(r.have_recruit_relation),

    broker_id: strOrNull(factionInfo.broker_id),
    broker_name: strOrNull(factionInfo.broker_name),
    recruit_broker_id: strOrNull(factionInfo.recruit_broker_id),
    recruit_broker_name,

    income_percent: pctOrNull(signing.income_percent),
    percent_map: (signing.percent_map as Record<string, string>) ?? null,

    misc: {
      anchor_identity_type: r.anchor_identity_type,
      anchor_type: r.anchor_type,
      content_type: r.content_type,
      current_live_style: r.current_live_style,
      current_live_style_sub_type: r.current_live_style_sub_type,
      introduce_level: r.introduce_level,
      introduce_type: r.introduce_type,
      is_batch_live: r.is_batch_live,
      is_faction_pid_bound: r.is_faction_pid_bound,
      is_broker_follow: r.is_broker_follow,
      share_percent_modify: r.share_percent_modify,
      union_anchor_mark_type_list: r.union_anchor_mark_type_list,
      broker_rights: r.broker_rights,
      tz_link_cnt: r.tz_link_cnt,
      tz_link_recharge_consume_diamond: r.tz_link_recharge_consume_diamond,
      personal_live_income: r.personal_live_income,
      personal_live_interrupt_day: r.personal_live_interrupt_day,
      personal_live_valid_day: r.personal_live_valid_day,
      personal_live_valid_duration: r.personal_live_valid_duration,
    },

    is_threekingdoms: recruit_broker_name === "三国项目",
    raw: r,
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function pctOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // 平台返回 0-100 还是 0-1 不一定，看实际样本——income_percent 是整数百分比
  return n > 1 ? n / 100 : n;
}
```

- [ ] **Step 5.5: 跑测试确认通过**

Run: `pnpm test -- anchor-list`
Expected: 全部 4 test PASS。

- [ ] **Step 5.6: 写 fetch-profile job handler**

`src/worker/jobs/handlers/fetch-profile.ts`:

```typescript
import { db } from "@/db/client";
import { anchor_profile } from "@/db/schema";
import { sql } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";
import { fetchAnchorList, parseAnchorListResponse } from "@/modules/crawler/adapters/anchor-list";
import type { FetchSimplePayload } from "@/modules/crawler/server";

export async function fetchProfileHandler(payload: FetchSimplePayload): Promise<void> {
  const { basecamp } = payload;
  let cookies: Record<string, string>;
  try {
    cookies = await getActiveCookies(basecamp);
  } catch (e) {
    await notifyCrawlerError({
      type: "cookie_expired",
      detail: `No active cookie for ${basecamp}: ${(e as Error).message}`,
      action: "Admin 扫码续期",
    });
    throw e;
  }

  const page = await openDouyinPage(cookies);
  try {
    const list = await fetchAnchorList(page);
    const fakeRaw = { status_code: 0, data: { list, total_amount: list.length } };
    const rows = parseAnchorListResponse(fakeRaw);

    // 全量 upsert
    for (const row of rows) {
      await db
        .insert(anchor_profile)
        .values({
          ...row,
          synced_at: new Date(),
          updated_at: new Date(),
        })
        .onConflictDoUpdate({
          target: anchor_profile.anchor_id,
          set: {
            ...row,
            synced_at: new Date(),
            updated_at: new Date(),
          },
        });
    }
    console.log(`[fetch-profile] synced ${rows.length} anchors for ${basecamp}`);
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: e.message,
        action: "Admin 扫码续期",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-profile failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 5.7: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/modules/crawler/adapters/anchor-list.ts \
        src/modules/crawler/adapters/anchor-list.test.ts \
        src/worker/jobs/handlers/fetch-profile.ts \
        tests/fixtures/
git commit -m "feat(crawler): anchor-list adapter + fetch-profile job"
```

---

## Task 6: anchor-daily adapter + fetch-daily + readiness check

**Files:**
- Create: `src/modules/crawler/adapters/anchor-daily.ts`
- Create: `src/modules/crawler/adapters/anchor-daily.test.ts`
- Create: `src/modules/crawler/readiness.ts`
- Create: `src/modules/crawler/readiness.test.ts`
- Create: `tests/fixtures/anchor-daily-response.json`
- Create: `src/worker/jobs/handlers/fetch-daily.ts`
- Create: `src/worker/jobs/handlers/check-data-ready.ts`

- [ ] **Step 6.1: 拷贝 daily 样本**

```bash
cp .tmp-design-preview/anchor-data-list-response.network-response \
   tests/fixtures/anchor-daily-response.json
```

- [ ] **Step 6.2: anchor-daily adapter（先写测试）**

`src/modules/crawler/adapters/anchor-daily.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { parseAnchorDailyResponse, ANCHOR_DAILY_FIELDS } from "./anchor-daily";

const RAW = JSON.parse(
  readFileSync(join(__dirname, "../../../../tests/fixtures/anchor-daily-response.json"), "utf-8"),
);

describe("parseAnchorDailyResponse", () => {
  it("returns array of daily rows", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("parses formatted strings: live_duration to hours", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    const r = rows[0];
    expect(typeof r.live_duration_1d).toBe("number"); // not the "6小时6分钟38秒" string
    if (r.live_duration_1d !== null) expect(r.live_duration_1d).toBeGreaterThanOrEqual(0);
  });

  it("includes anchor_id and date as primary key fields", () => {
    const rows = parseAnchorDailyResponse(RAW, "2026-05-01");
    const r = rows[0];
    expect(r.anchor_id).toBeTruthy();
    expect(r.date).toBe("2026-05-01");
  });

  it("ANCHOR_DAILY_FIELDS lists all 91 fields for fields= request param", () => {
    expect(ANCHOR_DAILY_FIELDS.length).toBeGreaterThanOrEqual(80); // 至少 80 个
  });
});
```

- [ ] **Step 6.3: 跑确认失败**

Run: `pnpm test -- anchor-daily`
Expected: FAIL（adapter not exists）。

- [ ] **Step 6.4: 实现 adapter**

`src/modules/crawler/adapters/anchor-daily.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";
import { parseDuration, parsePercent, parseChineseNumber } from "../parsers";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/union/data_center/anchor_list";

/**
 * 91 字段全集（meta.field 里 91 项的 key）。
 * fields= 参数显式声明全集，避免平台默认只返 39 字段。
 */
export const ANCHOR_DAILY_FIELDS = [
  "anchorID", "nicknameRaw", "coverUrlRaw", "awemeIDRaw", "awemeShortIDRaw",
  "hotsoonIDRaw", "hotsoonShortIDRaw", "xiguaDisplayIdRaw", "totalFansRaw",
  "lastLiveTimeRaw", "signingTypeRaw", "brokerRaw", "anchorTagType", "isNew",
  "anchorInfo",
  "totalFanTicket", "liveFanTicketWithoutGuest", "propertyFanTicketWithoutGuest",
  "guestFanTicket", "activityFanTicketWithoutGuest", "specialFanTicket",
  "subscribeFanTicket", "pkFanTicket", "linkScreenFanTicket", "linkScreenRoomFanTicket",
  "squareWandererFanTicket", "squareNowandererFanTicket", "squareNoguestFanTicket",
  "voiceWandererFanTicket", "voiceNoguestFanTicket", "voiceNowandererFanTicket",
  "voiceChatNoguestFanTicket", "voiceChatNowandererFanTicket", "voiceChatWandererFanTicket",
  "radioLinkFanTicket", "radioLinkFanWithoutGuestTicket",
  "totalTicketOutsideLink", "voiceTotalTicketOutsideLink", "voiceChatTotalTicketOutsideLink",
  "radioTotalTicketOutsideLink", "videoTotalTicketOutsideLink",
  "groupNoMemberFanTicket", "groupMemberFanTicket",
  "luckyNumBoxTicket", "starGuardEarnScore", "starGuardUcnt",
  "statGuardEnterAccountEarnScore",
  "aiCloneFanTicket", "aiCloneConsumeUcnt",
  "virtualIncome", "virtualPremiumIdentityIncome",
  "liveDuration1d", "single25minValidLiveDuration1d", "isSingleThan1hLiveValidDay",
  "feedWatchDuration1d", "voiceLiveDurationWithoutPause", "single25minVoiceLiveDuration",
  "voiceChatLiveDuration1d", "voiceChatLinkDuration1d",
  "single25minVoiceChatLiveDuration1d", "voiceChatLiveVaildDay", "voiceChatLinkVaildDay",
  "squareLiveDurationWithoutPauseVoiceRaw",
  "squareSingle25minValidLiveDurationFromStWithoutPauseVoiceRaw",
  "squareSingle60minValidLiveDayFromStWithoutPauseVoiceRaw",
  "squareLinkDuration1d", "squareLiveSingle60minValidLiveDayFromStWithoutPauseVoiceRaw",
  "single60minVoiceLiveCntFromStWithoutPause",
  "validRadioLiveDuration", "validRadioLiveDay", "radioLiveDuration",
  "virtualLiveDuration", "virtualLiveVaildDuration", "virtualLiveVaildDay",
  "voiceChatroomConnectNum", "voiceGuestConnectNum", "voiceGuestConnectValidTimeDuration",
  "voiceGuestConnectIncomeSingleHour",
  "feedAcuRaw", "perMinuteUcnt1d", "newFollowFansUcnt1d",
  "VideoCountRaw", "LikeCountRaw", "CommentCountRaw", "ViewCountRaw",
  "CurrentPercentRaw", "GameSharePercentRaw", "PayMoneyConnectSharePercentRaw",
  "profitShareRatio",
  "QrcodeRaw",
  "pkCnt", "pkWinCnt", "pkScores", "pkFinishCnt", "pkFanTicketPercent",
] as const;

export interface AnchorDailyRow {
  anchor_id: string;
  date: string;
  nickname_snapshot: string | null;

  total_fan_ticket: number | null;
  live_fan_ticket_no_guest: number | null;
  property_fan_ticket_no_guest: number | null;
  guest_fan_ticket: number | null;
  activity_fan_ticket_no_guest: number | null;
  special_fan_ticket: number | null;
  subscribe_fan_ticket: number | null;
  pk_fan_ticket: number | null;
  link_screen_fan_ticket: number | null;
  link_screen_room_fan_ticket: number | null;

  live_duration_1d: number | null;
  valid_live_duration_1d: number | null;
  is_solo_valid_day: number | null;
  feed_watch_duration_1d: number | null;

  feed_acu: number | null;
  peak_per_minute_ucnt: number | null;

  total_fans: number | null;
  new_follow_fans_1d: number | null;

  video_view_count: number | null;
  video_like_count: number | null;
  video_comment_count: number | null;

  current_percent: number | null;
  game_share_percent: number | null;
  pay_money_connect_share_percent: number | null;
  profit_share_ratio: number | null;

  broker_snapshot: string | null;
  signing_type_snapshot: string | null;
  last_live_time_snapshot: string | null;
  is_new: number | null;

  anchor_info: string | null;
  star_guard_earn_score: number | null;
  total_ticket_outside_link: number | null;
  stat_guard_enter_account_earn_score: number | null;

  raw: Record<string, unknown>;
}

interface RawDailyResponse {
  data: { data_string: string };
}

interface ParsedDailyInner {
  data: { series: Record<string, unknown>[] };
  meta: string;
}

export async function fetchAnchorDaily(
  page: Page,
  date: string,
  pageNum = 1,
  size = 100,
): Promise<{ list: Record<string, unknown>[]; total: number }> {
  const fields = ANCHOR_DAILY_FIELDS.join(",");
  const url =
    `${ENDPOINT}?beginDate=${date}&endDate=${date}&page=${pageNum}&size=${size}` +
    `&orderField=totalFanTicket&sortType=desc&fields=${fields}`;
  const res = await pageFetch<RawDailyResponse>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedDailyInner;
  return { list: inner.data.series, total: inner.data.series.length };
}

export function parseAnchorDailyResponse(
  inner: ParsedDailyInner,
  date: string,
): AnchorDailyRow[] {
  return inner.data.series.map((r) => mapOne(r, date));
}

function mapOne(r: Record<string, unknown>, date: string): AnchorDailyRow {
  return {
    anchor_id: String(r.anchorID ?? ""),
    date,
    nickname_snapshot: strOrNull(r.nicknameRaw),

    total_fan_ticket: parseChineseNumber(r.totalFanTicket as string | number),
    live_fan_ticket_no_guest: parseChineseNumber(r.liveFanTicketWithoutGuest as string | number),
    property_fan_ticket_no_guest: parseChineseNumber(
      r.propertyFanTicketWithoutGuest as string | number,
    ),
    guest_fan_ticket: parseChineseNumber(r.guestFanTicket as string | number),
    activity_fan_ticket_no_guest: parseChineseNumber(
      r.activityFanTicketWithoutGuest as string | number,
    ),
    special_fan_ticket: parseChineseNumber(r.specialFanTicket as string | number),
    subscribe_fan_ticket: parseChineseNumber(r.subscribeFanTicket as string | number),
    pk_fan_ticket: parseChineseNumber(r.pkFanTicket as string | number),
    link_screen_fan_ticket: parseChineseNumber(r.linkScreenFanTicket as string | number),
    link_screen_room_fan_ticket: parseChineseNumber(r.linkScreenRoomFanTicket as string | number),

    live_duration_1d: parseDuration(r.liveDuration1d as string),
    valid_live_duration_1d: parseDuration(r.single25minValidLiveDuration1d as string),
    is_solo_valid_day: numOrNull(r.isSingleThan1hLiveValidDay),
    feed_watch_duration_1d: parseDuration(r.feedWatchDuration1d as string),

    feed_acu: numOrNull(r.feedAcuRaw),
    peak_per_minute_ucnt: numOrNull(r.perMinuteUcnt1d),

    total_fans: parseChineseNumber(r.totalFansRaw as string | number),
    new_follow_fans_1d: numOrNull(r.newFollowFansUcnt1d),

    video_view_count: parseChineseNumber(r.ViewCountRaw as string | number),
    video_like_count: parseChineseNumber(r.LikeCountRaw as string | number),
    video_comment_count: parseChineseNumber(r.CommentCountRaw as string | number),

    current_percent: parsePercentOrNum(r.CurrentPercentRaw),
    game_share_percent: parsePercentOrNum(r.GameSharePercentRaw),
    pay_money_connect_share_percent: parsePercentOrNum(r.PayMoneyConnectSharePercentRaw),
    profit_share_ratio: parsePercent(r.profitShareRatio as string),

    broker_snapshot: strOrNull(r.brokerRaw),
    signing_type_snapshot: strOrNull(r.signingTypeRaw),
    last_live_time_snapshot: strOrNull(r.lastLiveTimeRaw),
    is_new: numOrNull(r.isNew),

    anchor_info: strOrNull(r.anchorInfo),
    star_guard_earn_score: parseChineseNumber(r.starGuardEarnScore as string | number),
    total_ticket_outside_link: parseChineseNumber(r.totalTicketOutsideLink as string | number),
    stat_guard_enter_account_earn_score: parseChineseNumber(
      r.statGuardEnterAccountEarnScore as string | number,
    ),

    raw: r,
  };
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function parsePercentOrNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    if (v.endsWith("%")) return parsePercent(v);
    const n = Number(v);
    return Number.isFinite(n) ? (n > 1 ? n / 100 : n) : null;
  }
  if (typeof v === "number") return v > 1 ? v / 100 : v;
  return null;
}
```

- [ ] **Step 6.5: 跑测试通过**

Run: `pnpm test -- anchor-daily`
Expected: 4 PASS。

- [ ] **Step 6.6: readiness 检测（先写测试）**

`src/modules/crawler/readiness.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isDailyReady } from "./readiness";

describe("isDailyReady", () => {
  it("returns false when >70% rows have totalFanTicket=0", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      totalFanTicket: i < 40 ? 0 : 100,
    }));
    expect(isDailyReady(rows)).toBe(false);
  });

  it("returns true when >30% rows have totalFanTicket>0", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      totalFanTicket: i < 20 ? 0 : 100,
    }));
    expect(isDailyReady(rows)).toBe(true);
  });

  it("returns false on empty input", () => {
    expect(isDailyReady([])).toBe(false);
  });

  it("handles string totalFanTicket", () => {
    const rows = [
      { totalFanTicket: "100" },
      { totalFanTicket: "0" },
      { totalFanTicket: "50" },
    ];
    expect(isDailyReady(rows)).toBe(true);
  });
});
```

- [ ] **Step 6.7: 实现 readiness.ts**

`src/modules/crawler/readiness.ts`:

```typescript
/**
 * 数据就绪检测：取前 N 条按日数据，
 * 若 totalFanTicket > 0 占比 < 30%（即 >70% 是 0）→ 视为未就绪。
 */
export function isDailyReady(rows: { totalFanTicket?: unknown }[]): boolean {
  if (rows.length === 0) return false;
  const sample = rows.slice(0, 50);
  const positive = sample.filter((r) => {
    const v = r.totalFanTicket;
    if (v === null || v === undefined || v === "") return false;
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }).length;
  return positive / sample.length >= 0.3;
}

export const READINESS_THRESHOLD = 0.3;
export const MAX_READINESS_ATTEMPTS = 8;
export const READINESS_RETRY_INTERVAL_MS = 30 * 60 * 1000; // 30 min
```

- [ ] **Step 6.8: 跑 readiness 测试**

Run: `pnpm test -- readiness`
Expected: 4 PASS。

- [ ] **Step 6.9: 写 check-data-ready handler**

`src/worker/jobs/handlers/check-data-ready.ts`:

```typescript
import { openDouyinPage } from "@/lib/puppeteer";
import {
  getActiveCookies,
  enqueue,
  notifyCrawlerError,
  JOB_NAMES,
} from "@/modules/crawler/server";
import { fetchAnchorDaily } from "@/modules/crawler/adapters/anchor-daily";
import {
  isDailyReady,
  MAX_READINESS_ATTEMPTS,
  READINESS_RETRY_INTERVAL_MS,
} from "@/modules/crawler/readiness";
import type { CheckDataReadyPayload } from "@/modules/crawler/types";

export async function checkDataReadyHandler(payload: CheckDataReadyPayload): Promise<void> {
  const { date, basecamp, attempt } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const { list } = await fetchAnchorDaily(page, date, 1, 50);
    if (isDailyReady(list)) {
      console.log(`[check-data-ready] ✓ data ready for ${date} (attempt=${attempt})`);
      // 触发下游
      await enqueue(JOB_NAMES.FETCH_PROFILE, { date, basecamp });
      await enqueue(JOB_NAMES.FETCH_DAILY, { date, basecamp });
      return;
    }
    if (attempt >= MAX_READINESS_ATTEMPTS) {
      await notifyCrawlerError({
        type: "data_not_ready",
        detail: `数据就绪检测 ${attempt} 次后仍未刷新，停止当日采集`,
        impact: `${date} 数据未采集`,
        action: "等待平台刷新或联系开发",
      });
      return;
    }
    // 重试
    await enqueue<CheckDataReadyPayload>(
      JOB_NAMES.CHECK_DATA_READY,
      { date, basecamp, attempt: attempt + 1 },
      { startAfter: new Date(Date.now() + READINESS_RETRY_INTERVAL_MS) },
    );
    console.log(
      `[check-data-ready] not ready (attempt=${attempt}), retry in 30 min`,
    );
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 6.10: fetch-daily handler**

`src/worker/jobs/handlers/fetch-daily.ts`:

```typescript
import { db } from "@/db/client";
import { anchor_daily } from "@/db/schema";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
  enqueue,
  JOB_NAMES,
} from "@/modules/crawler/server";
import {
  fetchAnchorDaily,
  parseAnchorDailyResponse,
} from "@/modules/crawler/adapters/anchor-daily";
import { db as dbClient } from "@/db/client";
import { anchor_profile } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { FetchSimplePayload } from "@/modules/crawler/types";

export async function fetchDailyHandler(payload: FetchSimplePayload): Promise<void> {
  const { date, basecamp } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    let pageNum = 1;
    let totalFetched = 0;
    while (true) {
      const { list } = await fetchAnchorDaily(page, date, pageNum, 100);
      if (list.length === 0) break;
      const fakeInner = { data: { series: list }, meta: "" };
      const rows = parseAnchorDailyResponse(fakeInner, date);
      for (const row of rows) {
        await db
          .insert(anchor_daily)
          .values(row)
          .onConflictDoUpdate({
            target: [anchor_daily.anchor_id, anchor_daily.date],
            set: { ...row, synced_at: new Date() },
          });
      }
      totalFetched += rows.length;
      if (list.length < 100) break;
      pageNum++;
      await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`[fetch-daily] synced ${totalFetched} rows for ${date}`);

    // 触发下游 per-anchor jobs
    await enqueueDownstream(date, basecamp);
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({
        type: "cookie_expired",
        detail: e.message,
        action: "Admin 扫码续期",
      });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-daily failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}

async function enqueueDownstream(date: string, basecamp: "cs" | "nc1" | "nc2"): Promise<void> {
  // 取昨日开播主播
  const liveAnchors = await dbClient
    .select({
      anchor_id: anchor_profile.anchor_id,
      is_three: anchor_profile.is_threekingdoms,
    })
    .from(anchor_profile);
  // 简化：只看 anchor_daily.live_duration_1d > 0 的
  // 实际查询应该 join，这里为清晰先全列再筛
  // ...
  for (const a of liveAnchors) {
    if (a.is_three) {
      await enqueue(JOB_NAMES.FETCH_MINIGAME, { anchor_id: a.anchor_id, date, basecamp });
    } else {
      await enqueue(JOB_NAMES.FETCH_GAME, { anchor_id: a.anchor_id, date, basecamp });
    }
    await enqueue(JOB_NAMES.FETCH_PORTRAIT, { anchor_id: a.anchor_id, date, basecamp });
  }
}
```

注意：`enqueueDownstream` 当前是简化版——遍历所有主播都进队列。优化：用 SQL JOIN 筛 `live_duration_1d > 0`。后续 Task 7-9 实现 handler 时可以加 filter。

- [ ] **Step 6.11: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/modules/crawler/ src/worker/jobs/handlers/ tests/fixtures/
git commit -m "feat(crawler): anchor-daily adapter + readiness check + fetch-daily/check-data-ready jobs"
```

---

## Task 7: game-promo adapter + fetch-game

**Files:**
- Create: `src/modules/crawler/adapters/game-promo.ts`
- Create: `src/worker/jobs/handlers/fetch-game.ts`

只采斗地主主播（`is_threekingdoms = false`），只在该主播昨日有开播时拉。

- [ ] **Step 7.1: game-promo adapter**

`src/modules/crawler/adapters/game-promo.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/v2/faction/game";

export type BizMode = "cps_all" | "cpc" | "poi";
export type PromoteScene = "live" | "video";

export interface GamePromoRow {
  anchor_id: string;
  date: string;
  promote_scene: PromoteScene;
  biz_mode: BizMode;
  game_name: string;
  promote_live_cnt_1d: number | null;
  promote_live_duration_1d: number | null;
  acu: number | null;
  pcu: number | null;
  promote_anchor_income_1d: number | null;
  promote_faction_income_1d: number | null;
  promote_pay_amount_1d: number | null;
  promote_pay_ucnt_1d: number | null;
  raw: Record<string, unknown>;
}

interface RawGameResponse {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchGamePromoForAnchor(
  page: Page,
  anchorId: string,
  date: string,
  scene: PromoteScene,
  bizMode: BizMode,
): Promise<Record<string, unknown>[]> {
  const fields = [
    "anchorName", "gameName",
    "promoteLiveCnt1d", "promoteLiveDuration1d", "acu", "pcu",
    "promoteAnchorIncome1d", "promoteFactionIncome1d",
    "promotePayAmount1d", "promotePayUcnt1d",
    "promoteDownloadPayUcnt1d", "promoteDownloadPayAmount1d",
    "promoteFactionDownloadPayAmount1d", "promoteAnchorDownloadPayAmount1d",
    "promoteActivePayUcnt1d",
    "promoteFactionActivePayAmount1d", "promoteAnchorActivePayAmount1d",
  ].join(",");
  const url =
    `${ENDPOINT_BASE}/game_anchor_detail_list?anchorID=${anchorId}` +
    `&beginDate=${date}&endDate=${date}` +
    `&promoteScene=${scene}&bizMode=${bizMode}&os=all&trafficType=all` +
    `&page=1&size=100&fields=${fields}`;
  const res = await pageFetch<RawGameResponse>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseGamePromoResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
  scene: PromoteScene,
  bizMode: BizMode,
): GamePromoRow[] {
  return series.map((r) => ({
    anchor_id: anchorId,
    date,
    promote_scene: scene,
    biz_mode: bizMode,
    game_name: String(r.gameName ?? ""),
    promote_live_cnt_1d: numOrNull(r.promoteLiveCnt1d),
    promote_live_duration_1d: numOrNull(r.promoteLiveDuration1d),
    acu: numOrNull(r.acu),
    pcu: numOrNull(r.pcu),
    promote_anchor_income_1d: numOrNull(r.promoteAnchorIncome1d),
    promote_faction_income_1d: numOrNull(r.promoteFactionIncome1d),
    promote_pay_amount_1d: numOrNull(r.promotePayAmount1d),
    promote_pay_ucnt_1d: numOrNull(r.promotePayUcnt1d),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 7.2: fetch-game handler**

`src/worker/jobs/handlers/fetch-game.ts`:

```typescript
import { db } from "@/db/client";
import { anchor_game_promo_daily, anchor_daily, anchor_profile } from "@/db/schema";
import { and, eq, gt, sql } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";
import {
  fetchGamePromoForAnchor,
  parseGamePromoResponse,
  type BizMode,
  type PromoteScene,
} from "@/modules/crawler/adapters/game-promo";
import type { FetchPerAnchorPayload } from "@/modules/crawler/types";

const SCENES: PromoteScene[] = ["live", "video"];
const BIZ_MODES: BizMode[] = ["cps_all", "cpc", "poi"];

export async function fetchGameHandler(payload: FetchPerAnchorPayload): Promise<void> {
  const { anchor_id, date, basecamp } = payload;

  // skip 如果不是斗地主或昨日未开播
  const [check] = await db
    .select({
      is_three: anchor_profile.is_threekingdoms,
      live: anchor_daily.live_duration_1d,
    })
    .from(anchor_profile)
    .leftJoin(
      anchor_daily,
      and(
        eq(anchor_profile.anchor_id, anchor_daily.anchor_id),
        eq(anchor_daily.date, date),
      ),
    )
    .where(eq(anchor_profile.anchor_id, anchor_id));
  if (!check || check.is_three) return;
  if (!check.live || Number(check.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    for (const scene of SCENES) {
      for (const bizMode of BIZ_MODES) {
        const series = await fetchGamePromoForAnchor(page, anchor_id, date, scene, bizMode);
        const rows = parseGamePromoResponse(series, anchor_id, date, scene, bizMode);
        for (const row of rows) {
          await db
            .insert(anchor_game_promo_daily)
            .values(row)
            .onConflictDoUpdate({
              target: [
                anchor_game_promo_daily.anchor_id,
                anchor_game_promo_daily.date,
                anchor_game_promo_daily.promote_scene,
                anchor_game_promo_daily.biz_mode,
                anchor_game_promo_daily.game_name,
              ],
              set: { ...row, synced_at: new Date() },
            });
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    }
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-game(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 7.3: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/crawler/adapters/game-promo.ts src/worker/jobs/handlers/fetch-game.ts
git commit -m "feat(crawler): game-promo adapter + fetch-game (斗地主主播)"
```

---

## Task 8: minigame adapters + fetch-minigame (三国主播)

**Files:**
- Create: `src/modules/crawler/adapters/minigame-live.ts`
- Create: `src/modules/crawler/adapters/minigame-video.ts`
- Create: `src/worker/jobs/handlers/fetch-minigame.ts`

- [ ] **Step 8.1: minigame-live adapter**

`src/modules/crawler/adapters/minigame-live.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/simple/faction/micro_game/live_anchor_list";

export interface MinigameRow {
  anchor_id: string;
  date: string;
  scene: "live" | "video";
  live_room_cnt: number | null;
  live_duration: number | null;
  watch_ucnt: number | null;
  gm_click_ucnt: number | null;
  gm_active_ucnt: number | null;
  gm_pay_ucnt: number | null;
  before_divided_income: number | null;
  after_divided_author_income: number | null;
  after_divided_trade_union_income: number | null;
  cps_bind_uv: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchMinigameLiveForAnchor(
  page: Page,
  anchorId: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const fields = [
    "liveRoomCnt", "liveDuration", "watchUcnt",
    "likeUcnt", "followUcnt", "commentUcnt",
    "gmClickUcnt", "gmActiveUcnt", "gmPayUcnt",
    "beforeDividedIncome",
    "afterDividedAuthorIncome", "afterDividedTradeUnionIncome",
    "cpsBindUv",
  ].join(",");
  const url =
    `${ENDPOINT}?anchorID=${anchorId}&begin_date=${date}&end_date=${date}` +
    `&os=all&flow_type=all&page=1&size=100&fields=${fields}`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseMinigameLiveResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
): MinigameRow[] {
  // 同一主播同一天 live scene 应该只一行
  return series.slice(0, 1).map((r) => ({
    anchor_id: anchorId,
    date,
    scene: "live" as const,
    live_room_cnt: numOrNull(r.liveRoomCnt),
    live_duration: parseDurationSec(r.liveDuration),
    watch_ucnt: numOrNull(r.watchUcnt),
    gm_click_ucnt: numOrNull(r.gmClickUcnt),
    gm_active_ucnt: numOrNull(r.gmActiveUcnt),
    gm_pay_ucnt: numOrNull(r.gmPayUcnt),
    before_divided_income: numOrNull(r.beforeDividedIncome),
    after_divided_author_income: numOrNull(r.afterDividedAuthorIncome),
    after_divided_trade_union_income: numOrNull(r.afterDividedTradeUnionIncome),
    cps_bind_uv: numOrNull(r.cpsBindUv),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDurationSec(v: unknown): number | null {
  // 小游戏 API 返回时长单位是秒（数字），转小时
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 3600) * 100) / 100;
}
```

- [ ] **Step 8.2: minigame-video adapter**

`src/modules/crawler/adapters/minigame-video.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";
import type { MinigameRow } from "./minigame-live";

const ENDPOINT =
  "https://union.bytedance.com/ark/api/data/pugna_component/data/simple/micro_game/video/creator_list";

interface RawResp {
  data: { data_string: string };
}

interface ParsedInner {
  data: { series: Record<string, unknown>[] };
}

export async function fetchMinigameVideoForAnchor(
  page: Page,
  anchorId: string,
  date: string,
): Promise<Record<string, unknown>[]> {
  const url =
    `${ENDPOINT}?anchorID=${anchorId}&begin_date=${date}&end_date=${date}` +
    `&os=all&flow_type=all&page=1&size=100`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  const inner = JSON.parse(res.data.data_string) as ParsedInner;
  return inner.data.series;
}

export function parseMinigameVideoResponse(
  series: Record<string, unknown>[],
  anchorId: string,
  date: string,
): MinigameRow[] {
  return series.slice(0, 1).map((r) => ({
    anchor_id: anchorId,
    date,
    scene: "video" as const,
    live_room_cnt: numOrNull(r.publish_item_cnt), // video: 投稿数
    live_duration: null, // video 无时长
    watch_ucnt: numOrNull(r.play_uv),
    gm_click_ucnt: numOrNull(r.mg_click_uv),
    gm_active_ucnt: numOrNull(r.mg_active_uv),
    gm_pay_ucnt: numOrNull(r.mg_pay_uv),
    before_divided_income: numOrNull(r.mg_income_before),
    after_divided_author_income: numOrNull(r.anchor_income_after),
    after_divided_trade_union_income: numOrNull(r.faction_income_after),
    cps_bind_uv: numOrNull(r.cps_bind_uv),
    raw: r,
  }));
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 8.3: fetch-minigame handler**

`src/worker/jobs/handlers/fetch-minigame.ts`:

```typescript
import { db } from "@/db/client";
import { anchor_minigame_daily, anchor_profile, anchor_daily } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";
import {
  fetchMinigameLiveForAnchor,
  parseMinigameLiveResponse,
} from "@/modules/crawler/adapters/minigame-live";
import {
  fetchMinigameVideoForAnchor,
  parseMinigameVideoResponse,
} from "@/modules/crawler/adapters/minigame-video";
import type { FetchPerAnchorPayload } from "@/modules/crawler/types";

export async function fetchMinigameHandler(payload: FetchPerAnchorPayload): Promise<void> {
  const { anchor_id, date, basecamp } = payload;

  const [check] = await db
    .select({
      is_three: anchor_profile.is_threekingdoms,
      live: anchor_daily.live_duration_1d,
    })
    .from(anchor_profile)
    .leftJoin(
      anchor_daily,
      and(eq(anchor_profile.anchor_id, anchor_daily.anchor_id), eq(anchor_daily.date, date)),
    )
    .where(eq(anchor_profile.anchor_id, anchor_id));
  if (!check || !check.is_three) return;
  if (!check.live || Number(check.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    // live
    const liveSeries = await fetchMinigameLiveForAnchor(page, anchor_id, date);
    for (const row of parseMinigameLiveResponse(liveSeries, anchor_id, date)) {
      await db
        .insert(anchor_minigame_daily)
        .values(row)
        .onConflictDoUpdate({
          target: [
            anchor_minigame_daily.anchor_id,
            anchor_minigame_daily.date,
            anchor_minigame_daily.scene,
          ],
          set: { ...row, synced_at: new Date() },
        });
    }
    await new Promise((r) => setTimeout(r, 300));
    // video
    const videoSeries = await fetchMinigameVideoForAnchor(page, anchor_id, date);
    for (const row of parseMinigameVideoResponse(videoSeries, anchor_id, date)) {
      await db
        .insert(anchor_minigame_daily)
        .values(row)
        .onConflictDoUpdate({
          target: [
            anchor_minigame_daily.anchor_id,
            anchor_minigame_daily.date,
            anchor_minigame_daily.scene,
          ],
          set: { ...row, synced_at: new Date() },
        });
    }
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-minigame(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 8.4: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/crawler/adapters/minigame-{live,video}.ts \
        src/worker/jobs/handlers/fetch-minigame.ts
git commit -m "feat(crawler): minigame live+video adapters + fetch-minigame (三国主播)"
```

---

## Task 9: portrait + session-mg adapters + jobs

**Files:**
- Create: `src/modules/crawler/adapters/portrait-core.ts`
- Create: `src/modules/crawler/adapters/session-minigame.ts`
- Create: `src/worker/jobs/handlers/fetch-portrait.ts`
- Create: `src/worker/jobs/handlers/fetch-session-mg.ts`

- [ ] **Step 9.1: portrait-core adapter**

`src/modules/crawler/adapters/portrait-core.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const ENDPOINT_BASE =
  "https://union.bytedance.com/ark/api/uanchor/pugna_component/data/anchor/portrait/core_day_stats";

export interface PortraitRow {
  anchor_id: string;
  date: string;
  show_uv: number | null;
  enter_uv: number | null;
  enter_ratio: number | null;
  pay_ucnt: number | null;
  pay_ratio: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: Record<string, unknown>;
}

export async function fetchPortraitCoreForAnchor(
  page: Page,
  anchorId: string,
  date: string,
  cid: string,
): Promise<Record<string, unknown>> {
  const url = `${ENDPOINT_BASE}/${cid}?anchorID=${anchorId}&beginDate=${date}&endDate=${date}`;
  const res = await pageFetch<RawResp>(page, url, {
    headers: { "X-Appid": "3000" },
  });
  return res.data;
}

export function parsePortraitCoreResponse(
  data: Record<string, unknown>,
  anchorId: string,
  date: string,
): PortraitRow {
  // core_day_stats 返回结构平台具体形式以实际抓为准——这里假设 series[0] 含字段
  // 真实接入时根据 Chrome DevTools 抓的 sample 修
  const series = (data.series ?? data.list ?? []) as Record<string, unknown>[];
  const r = series[0] ?? {};
  return {
    anchor_id: anchorId,
    date,
    show_uv: numOrNull(r.showUv),
    enter_uv: numOrNull(r.enterUv),
    enter_ratio: pctOrNull(r.enterRatio),
    pay_ucnt: numOrNull(r.payUcnt),
    pay_ratio: pctOrNull(r.payRatio),
    raw: r,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pctOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}
```

> ⚠️ **实施注意**：`PORTRAIT_CORE_CID` 的具体值（如 `cnollfrc77u17eplost0`）需要实施时在 Chrome DevTools 抓真实请求，hardcode 在 handler 里。.tmp-design-preview/endpoints-discovered.md 给出参考但平台可能改 cid。

- [ ] **Step 9.2: session-minigame adapter**

`src/modules/crawler/adapters/session-minigame.ts`:

```typescript
import "server-only";
import type { Page } from "puppeteer-core";
import { pageFetch } from "@/lib/puppeteer";

const OVERVIEW =
  "https://union.bytedance.com/ark_api_tinker_proxy/lego/native/webcast_api/room/replay/overview_v3";
const AUDIENCE_CONVERT =
  "https://union.bytedance.com/ark_api_tinker_proxy/lego/native/webcast_api/room/minigame/audience_convert";

export interface SessionMgRow {
  room_id: string;
  anchor_id: string;
  date: string;
  acu: number | null;
  show_uv: number | null;
  not_open_game_uv: number | null;
  not_open_game_show_uv: number | null;
  not_open_game_click_uv: number | null;
  not_open_game_pay_uv: number | null;
  not_open_show_per: number | null;
  not_open_click_per: number | null;
  not_open_pay_per: number | null;
  open_game_uv: number | null;
  open_game_click_uv: number | null;
  open_game_pay_uv: number | null;
  open_game_click_per: number | null;
  open_game_pay_per: number | null;
  raw: Record<string, unknown>;
}

interface RawResp {
  data: Record<string, unknown>;
}

export async function fetchSessionMinigame(
  page: Page,
  roomId: string,
): Promise<{ overview: Record<string, unknown>; convert: Record<string, unknown> }> {
  const ovRes = await pageFetch<RawResp>(page, `${OVERVIEW}?roomID=${roomId}`, {
    headers: { "X-Appid": "3000" },
  });
  const cvRes = await pageFetch<RawResp>(page, `${AUDIENCE_CONVERT}?roomID=${roomId}`, {
    headers: { "X-Appid": "3000" },
  });
  return { overview: ovRes.data, convert: cvRes.data };
}

export function parseSessionMinigameResponse(
  overview: Record<string, unknown>,
  convert: Record<string, unknown>,
  roomId: string,
  anchorId: string,
  date: string,
): SessionMgRow {
  return {
    room_id: roomId,
    anchor_id: anchorId,
    date,
    acu: numOrNull(overview.acu),
    show_uv: numOrNull(overview.show_uv),
    not_open_game_uv: numOrNull(convert.notOpenGameUV),
    not_open_game_show_uv: numOrNull(convert.notOpenGameShowUV),
    not_open_game_click_uv: numOrNull(convert.notOpenGameClickUV),
    not_open_game_pay_uv: numOrNull(convert.notOpenGamePayUV),
    not_open_show_per: pctOrNull(convert.notOpenShowPer),
    not_open_click_per: pctOrNull(convert.notOpenClickPer),
    not_open_pay_per: pctOrNull(convert.notOpenPayPer),
    open_game_uv: numOrNull(convert.openGameUV),
    open_game_click_uv: numOrNull(convert.openGameClickUV),
    open_game_pay_uv: numOrNull(convert.openGamePayUV),
    open_game_click_per: pctOrNull(convert.openGameClickPer),
    open_game_pay_per: pctOrNull(convert.openGamePayPer),
    raw: { overview, convert },
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pctOrNull(v: unknown): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}
```

- [ ] **Step 9.3: fetch-portrait handler**

`src/worker/jobs/handlers/fetch-portrait.ts`:

```typescript
import { db } from "@/db/client";
import { anchor_portrait_daily, anchor_daily } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";
import {
  fetchPortraitCoreForAnchor,
  parsePortraitCoreResponse,
} from "@/modules/crawler/adapters/portrait-core";
import type { FetchPerAnchorPayload } from "@/modules/crawler/types";

// 实施时换成抓到的真实 cid
const PORTRAIT_CORE_CID = process.env.DOUYIN_PORTRAIT_CORE_CID ?? "";

export async function fetchPortraitHandler(payload: FetchPerAnchorPayload): Promise<void> {
  if (!PORTRAIT_CORE_CID) {
    console.warn("[fetch-portrait] DOUYIN_PORTRAIT_CORE_CID not set, skipping");
    return;
  }
  const { anchor_id, date, basecamp } = payload;

  const [d] = await db
    .select({ live: anchor_daily.live_duration_1d })
    .from(anchor_daily)
    .where(and(eq(anchor_daily.anchor_id, anchor_id), eq(anchor_daily.date, date)));
  if (!d || !d.live || Number(d.live) === 0) return;

  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const data = await fetchPortraitCoreForAnchor(page, anchor_id, date, PORTRAIT_CORE_CID);
    const row = parsePortraitCoreResponse(data, anchor_id, date);
    await db
      .insert(anchor_portrait_daily)
      .values(row)
      .onConflictDoUpdate({
        target: [anchor_portrait_daily.anchor_id, anchor_portrait_daily.date],
        set: { ...row, synced_at: new Date() },
      });
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-portrait(${anchor_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 9.4: fetch-session-mg handler**

`src/worker/jobs/handlers/fetch-session-mg.ts`:

```typescript
import { db } from "@/db/client";
import { session_minigame_convert } from "@/db/schema";
import { openDouyinPage, CookieExpiredError } from "@/lib/puppeteer";
import {
  getActiveCookies,
  markCookieExpired,
  notifyCrawlerError,
} from "@/modules/crawler/server";
import {
  fetchSessionMinigame,
  parseSessionMinigameResponse,
} from "@/modules/crawler/adapters/session-minigame";
import type { FetchSessionMgPayload } from "@/modules/crawler/types";

export async function fetchSessionMgHandler(payload: FetchSessionMgPayload): Promise<void> {
  const { room_id, anchor_id, basecamp } = payload;
  const cookies = await getActiveCookies(basecamp);
  const page = await openDouyinPage(cookies);
  try {
    const { overview, convert } = await fetchSessionMinigame(page, room_id);
    const date = new Date().toISOString().slice(0, 10); // 简化：场次日期取采集当日，实际应从 overview.create_time 反推
    const row = parseSessionMinigameResponse(overview, convert, room_id, anchor_id, date);
    await db
      .insert(session_minigame_convert)
      .values(row)
      .onConflictDoUpdate({
        target: session_minigame_convert.room_id,
        set: { ...row, synced_at: new Date() },
      });
  } catch (e) {
    if (e instanceof CookieExpiredError) {
      await markCookieExpired(basecamp);
      await notifyCrawlerError({ type: "cookie_expired", detail: e.message });
    } else {
      await notifyCrawlerError({
        type: "job_failed",
        detail: `fetch-session-mg(${room_id}) failed: ${(e as Error).message}`,
      });
    }
    throw e;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 9.5: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/crawler/adapters/portrait-core.ts \
        src/modules/crawler/adapters/session-minigame.ts \
        src/worker/jobs/handlers/fetch-portrait.ts \
        src/worker/jobs/handlers/fetch-session-mg.ts
git commit -m "feat(crawler): portrait + session-minigame adapters + handlers"
```

---

## Task 10: Orchestrator + cron + handler 注册

**Files:**
- Create: `src/worker/jobs/handlers/register.ts`
- Create: `src/worker/jobs/crawl-orchestrator.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 10.1: handler 注册**

`src/worker/jobs/handlers/register.ts`:

```typescript
import { getBoss, JOB_NAMES } from "@/modules/crawler/server";
import { checkDataReadyHandler } from "./check-data-ready";
import { fetchProfileHandler } from "./fetch-profile";
import { fetchDailyHandler } from "./fetch-daily";
import { fetchGameHandler } from "./fetch-game";
import { fetchMinigameHandler } from "./fetch-minigame";
import { fetchPortraitHandler } from "./fetch-portrait";
import { fetchSessionMgHandler } from "./fetch-session-mg";

export async function registerCrawlerHandlers(): Promise<void> {
  const boss = await getBoss();
  // concurrency=1 全局：一个 job 跑完才下一个，避免限流/Cookie 竞争
  await boss.work(JOB_NAMES.CHECK_DATA_READY, { teamSize: 1 }, async ([job]) => {
    await checkDataReadyHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_PROFILE, { teamSize: 1 }, async ([job]) => {
    await fetchProfileHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_DAILY, { teamSize: 1 }, async ([job]) => {
    await fetchDailyHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_GAME, { teamSize: 1 }, async ([job]) => {
    await fetchGameHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_MINIGAME, { teamSize: 1 }, async ([job]) => {
    await fetchMinigameHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_PORTRAIT, { teamSize: 1 }, async ([job]) => {
    await fetchPortraitHandler(job.data as never);
  });
  await boss.work(JOB_NAMES.FETCH_SESSION_MG, { teamSize: 1 }, async ([job]) => {
    await fetchSessionMgHandler(job.data as never);
  });
  console.log("[crawler] all 7 handlers registered");
}
```

- [ ] **Step 10.2: orchestrator job**

`src/worker/jobs/crawl-orchestrator.ts`:

```typescript
import { enqueue, JOB_NAMES } from "@/modules/crawler/server";

/**
 * 每天 10:00 入口：仅 enqueue check-data-ready 守护 job。
 * 守护 job 自己负责重试 + 触发下游。
 */
export async function crawlOrchestrator(): Promise<void> {
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const basecamp = (process.env.DOUYIN_DEFAULT_BASECAMP ?? "cs") as "cs" | "nc1" | "nc2";
  await enqueue(JOB_NAMES.CHECK_DATA_READY, { date: yesterday, basecamp, attempt: 1 });
  console.log(`[crawl-orchestrator] enqueued check-data-ready for ${yesterday}`);
}
```

- [ ] **Step 10.3: 修改 worker/index.ts**

修改 `src/worker/index.ts`:

```typescript
import "@/lib/env";

import { registerJob, startScheduler } from "./scheduler";
import { syncDingtalk } from "./jobs/sync-dingtalk";
import { crawlOrchestrator } from "./jobs/crawl-orchestrator";
import { registerCrawlerHandlers } from "./jobs/handlers/register";
import { stopBoss } from "@/modules/crawler/server";
import { closeBrowser } from "@/lib/puppeteer";

// Phase 1: 钉钉同步
registerJob({
  name: "sync-dingtalk",
  schedule: "0 2 * * *",
  task: syncDingtalk,
});

// Phase 2: 抖音爬虫每日 10:00 入口
registerJob({
  name: "crawl-orchestrator",
  schedule: "0 10 * * *",
  task: crawlOrchestrator,
});

registerJob({
  name: "heartbeat",
  schedule: "0 * * * *",
  task: async () => {
    console.log(`[heartbeat] ${new Date().toISOString()}`);
  },
});

(async () => {
  console.log("[worker] qjhy-pro worker starting");
  await registerCrawlerHandlers();
  startScheduler();
})();

const shutdown = async () => {
  console.log("[worker] shutting down");
  await stopBoss();
  await closeBrowser();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

- [ ] **Step 10.4: 跑 worker 烟测**

```bash
docker-compose up -d postgres
pnpm worker  # 另开终端
# 看日志：应该看到 "[crawler] all 7 handlers registered"
# 手动 enqueue 触发：
pnpm tsx -e "import('./src/modules/crawler/server.js').then(m => m.enqueue('crawler:check_data_ready', {date:'2026-05-01',basecamp:'cs',attempt:1}))"
# 但因为没真 Cookie，会失败钉钉报错——观察是否走错误流程即可
```

- [ ] **Step 10.5: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/worker/
git commit -m "feat(crawler): orchestrator + cron 10:00 + register all 7 job handlers"
```

---

## Task 11: broker fuzzy matcher + module + admin 映射页

**Files:**
- Create: `src/modules/brokers/{index,server,types,schema,matcher,actions}.ts`
- Create: `src/modules/brokers/matcher.test.ts`
- Create: `src/app/(dashboard)/admin/brokers/page.tsx`
- Create: `src/app/(dashboard)/admin/brokers/_components/broker-table.tsx`
- Create: `src/app/api/admin/brokers/route.ts`
- Modify: `eslint.config.mjs` (添加 brokers zone)
- Modify: `CONTRIBUTING.md` (注册 brokers 模块)

- [ ] **Step 11.1: matcher.test.ts**

`src/modules/brokers/matcher.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { fuzzyMatchBroker } from "./matcher";

describe("fuzzyMatchBroker", () => {
  const users = [
    { user_id: "u1", name: "陈泰" },
    { user_id: "u2", name: "陈泰(运营)" },
    { user_id: "u3", name: "李雷" },
    { user_id: "u4", name: "李雷·新名字" },
  ];

  it("exact match wins", () => {
    expect(fuzzyMatchBroker("陈泰", users)?.user_id).toBe("u1");
  });

  it("substring match if no exact", () => {
    expect(fuzzyMatchBroker("陈泰运营", users)?.user_id).toBe("u2");
  });

  it("returns null on no match", () => {
    expect(fuzzyMatchBroker("张三", users)).toBeNull();
  });

  it("strips parenthetical suffix when matching", () => {
    expect(fuzzyMatchBroker("陈泰(测试)", users)?.user_id).toBe("u1");
  });
});
```

- [ ] **Step 11.2: matcher.ts**

`src/modules/brokers/matcher.ts`:

```typescript
export interface DingtalkUserCandidate {
  user_id: string;
  name: string;
}

/**
 * 经纪人姓名 ↔ 钉钉 user.name 模糊匹配。
 * 优先级：精确 > 去括号精确 > 子串 > null。
 */
export function fuzzyMatchBroker(
  brokerName: string,
  users: DingtalkUserCandidate[],
): DingtalkUserCandidate | null {
  const normalized = brokerName.replace(/\(.*?\)|（.*?）/g, "").trim();
  if (!normalized) return null;

  // 1. 精确（含括号原值）
  const exact = users.find((u) => u.name === brokerName || u.name === normalized);
  if (exact) return exact;

  // 2. 去括号精确
  const userNoParen = users.find((u) => {
    const un = u.name.replace(/\(.*?\)|（.*?）/g, "").trim();
    return un === normalized;
  });
  if (userNoParen) return userNoParen;

  // 3. 子串（任一方包含另一方）
  const sub = users.find(
    (u) =>
      u.name.includes(normalized) || normalized.includes(u.name.replace(/\(.*?\)|（.*?）/g, "")),
  );
  if (sub) return sub;

  return null;
}
```

- [ ] **Step 11.3: 跑测试**

Run: `pnpm test -- matcher`
Expected: 4 PASS。

- [ ] **Step 11.4: 模块其余文件**

`src/modules/brokers/types.ts`:

```typescript
export interface BrokerMappingRow {
  broker_id: string;
  broker_name: string;
  dingtalk_user_id: string | null;
  match_source: "auto" | "manual" | "pending";
  matched_at: Date | null;
}
```

`src/modules/brokers/schema.ts`:

```typescript
import { z } from "zod";

export const SetBrokerMappingInput = z.object({
  broker_id: z.string().min(1),
  dingtalk_user_id: z.string().min(1),
});
export type SetBrokerMappingInputType = z.infer<typeof SetBrokerMappingInput>;
```

`src/modules/brokers/actions.ts`:

```typescript
"use server";

import { db } from "@/db/client";
import { broker_user_mapping } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { SetBrokerMappingInput } from "./schema";

export async function setBrokerMapping(input: unknown): Promise<{ ok: true }> {
  const data = SetBrokerMappingInput.parse(input);
  const { userId: opUser } = await requireAdmin();

  await db
    .update(broker_user_mapping)
    .set({
      dingtalk_user_id: data.dingtalk_user_id,
      match_source: "manual",
      matched_at: new Date(),
      updated_at: new Date(),
    })
    .where(/* eq inline */ undefined as never); // 此处需 import eq from drizzle
  // 上面写法只是 placeholder，实际：
  // .where(eq(broker_user_mapping.broker_id, data.broker_id))

  await writeAuditLog({
    user_id: opUser,
    action: "BROKER_MAPPING_SET",
    target_type: "broker",
    target_id: data.broker_id,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
```

修一下 actions.ts where 写法（用 eq）:
```typescript
import { eq } from "drizzle-orm";
// ...
.where(eq(broker_user_mapping.broker_id, data.broker_id))
```

`src/modules/brokers/server.ts`:

```typescript
import "server-only";
import { db } from "@/db/client";
import { anchor_profile, broker_user_mapping, dingtalk_user } from "@/db/schema";
import { sql } from "drizzle-orm";
import { fuzzyMatchBroker } from "./matcher";

/**
 * 同步：扫描 anchor_profile 拿到所有 distinct broker_id+broker_name，
 * 跟 dingtalk_user 做 fuzzy match。
 * 已有 manual 映射不动。
 */
export async function syncBrokerMappings(): Promise<{ matched: number; pending: number }> {
  const brokers = await db
    .selectDistinct({
      broker_id: anchor_profile.broker_id,
      broker_name: anchor_profile.broker_name,
    })
    .from(anchor_profile);

  const users = await db
    .select({ user_id: dingtalk_user.user_id, name: dingtalk_user.name })
    .from(dingtalk_user);

  let matched = 0;
  let pending = 0;
  for (const b of brokers) {
    if (!b.broker_id || !b.broker_name) continue;
    const existing = await db
      .select()
      .from(broker_user_mapping)
      .where(sql`${broker_user_mapping.broker_id} = ${b.broker_id}`);
    if (existing[0]?.match_source === "manual") continue; // 已手工映射不覆盖

    const m = fuzzyMatchBroker(b.broker_name, users);
    await db
      .insert(broker_user_mapping)
      .values({
        broker_id: b.broker_id,
        broker_name: b.broker_name,
        dingtalk_user_id: m?.user_id ?? null,
        match_source: m ? "auto" : "pending",
        matched_at: m ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: broker_user_mapping.broker_id,
        set: {
          broker_name: b.broker_name,
          dingtalk_user_id: m?.user_id ?? null,
          match_source: m ? "auto" : "pending",
          matched_at: m ? new Date() : null,
          updated_at: new Date(),
        },
      });
    if (m) matched++;
    else pending++;
  }
  return { matched, pending };
}

export async function listBrokerMappings(): Promise<
  {
    broker_id: string;
    broker_name: string;
    dingtalk_user_id: string | null;
    user_name: string | null;
    match_source: "auto" | "manual" | "pending";
  }[]
> {
  const rows = await db
    .select({
      broker_id: broker_user_mapping.broker_id,
      broker_name: broker_user_mapping.broker_name,
      dingtalk_user_id: broker_user_mapping.dingtalk_user_id,
      match_source: broker_user_mapping.match_source,
      user_name: dingtalk_user.name,
    })
    .from(broker_user_mapping)
    .leftJoin(
      dingtalk_user,
      sql`${broker_user_mapping.dingtalk_user_id} = ${dingtalk_user.user_id}`,
    );
  return rows;
}
```

`src/modules/brokers/index.ts`:

```typescript
export type { BrokerMappingRow } from "./types";
export { SetBrokerMappingInput, type SetBrokerMappingInputType } from "./schema";
export { setBrokerMapping } from "./actions";
```

- [ ] **Step 11.5: 加 ESLint zone**

`eslint.config.mjs` 在 zones 里加：

```javascript
{
  target: [
    "./src/app/**",
    "./src/components/**",
    "./src/lib/**",
    "./src/worker/**",
    "./src/modules/!(brokers)/**",
  ],
  from: "./src/modules/brokers/!(index|server).ts",
  message: "跨模块只允许 import 对方的 index.ts。",
},
```

- [ ] **Step 11.6: API route 列经纪人**

`src/app/api/admin/brokers/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { listBrokerMappings } from "@/modules/brokers/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const rows = await listBrokerMappings();
  return NextResponse.json({ brokers: rows });
}
```

- [ ] **Step 11.7: admin/brokers 页面**

`src/app/(dashboard)/admin/brokers/page.tsx`:

```typescript
import { BrokerTable } from "./_components/broker-table";

export default function BrokersAdminPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">经纪人映射</h1>
      <p className="text-sm text-muted-foreground">
        把抖音平台的运营经纪人和钉钉用户对应起来。每天同步后自动 fuzzy match，可手动改写。
      </p>
      <BrokerTable />
    </div>
  );
}
```

`src/app/(dashboard)/admin/brokers/_components/broker-table.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setBrokerMapping } from "@/modules/brokers";

interface BrokerRow {
  broker_id: string;
  broker_name: string;
  dingtalk_user_id: string | null;
  user_name: string | null;
  match_source: "auto" | "manual" | "pending";
}

const SOURCE_LABEL: Record<string, string> = {
  auto: "自动匹配",
  manual: "手工设置",
  pending: "未匹配",
};

export function BrokerTable(): React.JSX.Element {
  const [rows, setRows] = useState<BrokerRow[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState("");

  useEffect(() => {
    fetch("/api/admin/brokers")
      .then((r) => r.json() as Promise<{ brokers: BrokerRow[] }>)
      .then((d) => setRows(d.brokers));
  }, []);

  async function save(brokerId: string): Promise<void> {
    await setBrokerMapping({ broker_id: brokerId, dingtalk_user_id: editUserId });
    setEditing(null);
    location.reload();
  }

  const q = filter.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      !q ||
      r.broker_name.toLowerCase().includes(q) ||
      (r.user_name?.toLowerCase().includes(q) ?? false),
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="搜索经纪人/钉钉用户..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-xs"
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>经纪人姓名</TableHead>
            <TableHead>钉钉用户</TableHead>
            <TableHead>匹配方式</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.broker_id}>
              <TableCell>{r.broker_name}</TableCell>
              <TableCell>
                {editing === r.broker_id ? (
                  <Input
                    placeholder="user_id"
                    value={editUserId}
                    onChange={(e) => setEditUserId(e.target.value)}
                    className="h-8"
                  />
                ) : (
                  r.user_name ?? <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>{SOURCE_LABEL[r.match_source]}</TableCell>
              <TableCell className="text-right space-x-2">
                {editing === r.broker_id ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      取消
                    </Button>
                    <Button size="sm" onClick={() => save(r.broker_id)}>
                      保存
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r.broker_id);
                      setEditUserId(r.dingtalk_user_id ?? "");
                    }}
                  >
                    编辑
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 11.8: CONTRIBUTING.md 注册模块**

在第 8 节表格末尾加：

```markdown
| brokers | `src/modules/brokers/` | 经纪人 ↔ 钉钉用户映射 + fuzzy matcher | Phase 2 (2026-05-02) |
```

- [ ] **Step 11.9: 把 sync 加到 sync-dingtalk job 末尾**

修改 `src/worker/jobs/sync-dingtalk.ts` 末尾，在 audit log 之前加：

```typescript
import { syncBrokerMappings } from "@/modules/brokers/server";
// ...
const brokerResult = await syncBrokerMappings();
console.log(`[sync-brokers] matched=${brokerResult.matched} pending=${brokerResult.pending}`);
```

> 注意：dingtalk sync 也应在 anchor_profile 同步之后再跑 broker match，但 dingtalk 是 02:00 跑、anchor 是 10:00 之后跑——所以应该把 syncBrokerMappings 放到 fetch-profile 完成 hook 里。临时先放 sync-dingtalk，全跑通后挪。

- [ ] **Step 11.10: typecheck + commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/modules/brokers/ \
        src/app/api/admin/brokers/ \
        src/app/\(dashboard\)/admin/brokers/ \
        src/worker/jobs/sync-dingtalk.ts \
        eslint.config.mjs CONTRIBUTING.md
git commit -m "feat(brokers): fuzzy match broker_name → dingtalk_user + admin mapping page"
```

---

## Task 12: anchors module + /anchors 明细页

**Files:**
- Create: `src/modules/anchors/{index,server,types,schema,queries}.ts`
- Create: `src/app/(dashboard)/anchors/page.tsx`
- Create: `src/app/(dashboard)/anchors/_components/{anchor-table,filters,csv-export}.tsx`
- Create: `src/app/api/anchors/route.ts`
- Modify: `eslint.config.mjs` (添加 anchors zone)

- [ ] **Step 12.1: types + schema**

`src/modules/anchors/types.ts`:

```typescript
export type ProjectFilter = "all" | "ddz" | "three";

export interface AnchorListFilters {
  date: string; // YYYY-MM-DD
  project?: ProjectFilter;
  broker_ids?: string[];
  health_min?: number;
  search?: string;
}

export interface AnchorListRow {
  anchor_id: string;
  nick_name: string;
  is_threekingdoms: boolean;
  broker_name: string | null;
  recruit_broker_name: string | null;
  anchor_health_score: number | null;
  total_fan_ticket: number | null; // 当日
  live_duration_1d: number | null;
  minigame_income: number | null; // after_divided_author_income SUM
  game_income: number | null; // promote_anchor_income_1d SUM
}
```

`src/modules/anchors/schema.ts`:

```typescript
import { z } from "zod";

export const AnchorListFiltersSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  project: z.enum(["all", "ddz", "three"]).optional(),
  broker_ids: z.array(z.string()).optional(),
  health_min: z.number().int().min(0).max(100).optional(),
  search: z.string().optional(),
});
```

- [ ] **Step 12.2: queries.ts（with scope filter）**

`src/modules/anchors/queries.ts`:

```typescript
import "server-only";
import { db } from "@/db/client";
import {
  anchor_profile,
  anchor_daily,
  anchor_minigame_daily,
  anchor_game_promo_daily,
  broker_user_mapping,
} from "@/db/schema";
import { and, eq, sql, inArray, gte, like, or } from "drizzle-orm";
import { resolveUserPermission } from "@/modules/permissions/server";
import type { AnchorListFilters, AnchorListRow } from "./types";

/**
 * 按用户权限过滤的主播明细查询。
 * - scope=all: 全部
 * - scope=team: 当前 user 管理的部门下经纪人映射的主播
 * - scope=self: 当前 user 对应 broker 的主播
 * - scope=none: 空
 */
export async function listAnchors(
  userId: string,
  filters: AnchorListFilters,
): Promise<AnchorListRow[]> {
  const perm = await resolveUserPermission(userId);
  if (perm.scope === "none") return [];

  const where = [];

  // scope 过滤
  if (perm.scope === "self") {
    const myBroker = await db
      .select({ broker_id: broker_user_mapping.broker_id })
      .from(broker_user_mapping)
      .where(eq(broker_user_mapping.dingtalk_user_id, userId));
    if (myBroker.length === 0) return [];
    where.push(inArray(anchor_profile.broker_id, myBroker.map((m) => m.broker_id)));
  } else if (perm.scope === "team") {
    // perm.team_user_ids 由 resolveUserPermission 提供（部门下所有 user）
    const teamUsers = perm.team_user_ids ?? [];
    if (teamUsers.length === 0) return [];
    const teamBrokers = await db
      .select({ broker_id: broker_user_mapping.broker_id })
      .from(broker_user_mapping)
      .where(inArray(broker_user_mapping.dingtalk_user_id, teamUsers));
    if (teamBrokers.length === 0) return [];
    where.push(inArray(anchor_profile.broker_id, teamBrokers.map((m) => m.broker_id)));
  }

  // 业务筛
  if (filters.project === "ddz") {
    where.push(eq(anchor_profile.is_threekingdoms, false));
  } else if (filters.project === "three") {
    where.push(eq(anchor_profile.is_threekingdoms, true));
  }
  if (filters.broker_ids && filters.broker_ids.length > 0) {
    where.push(inArray(anchor_profile.broker_id, filters.broker_ids));
  }
  if (filters.health_min !== undefined) {
    where.push(gte(anchor_profile.anchor_health_score, filters.health_min));
  }
  if (filters.search) {
    where.push(
      or(
        like(anchor_profile.nick_name, `%${filters.search}%`),
        like(anchor_profile.aweme_display_id, `%${filters.search}%`),
      )!,
    );
  }

  const rows = await db
    .select({
      anchor_id: anchor_profile.anchor_id,
      nick_name: anchor_profile.nick_name,
      is_threekingdoms: anchor_profile.is_threekingdoms,
      broker_name: anchor_profile.broker_name,
      recruit_broker_name: anchor_profile.recruit_broker_name,
      anchor_health_score: anchor_profile.anchor_health_score,
      total_fan_ticket: anchor_daily.total_fan_ticket,
      live_duration_1d: anchor_daily.live_duration_1d,
    })
    .from(anchor_profile)
    .leftJoin(
      anchor_daily,
      and(
        eq(anchor_profile.anchor_id, anchor_daily.anchor_id),
        eq(anchor_daily.date, filters.date),
      ),
    )
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(sql`${anchor_daily.total_fan_ticket} DESC NULLS LAST`)
    .limit(500);

  // 补全 minigame / game income (单查询附加)
  const anchorIds = rows.map((r) => r.anchor_id);
  if (anchorIds.length === 0) return [];

  const mgIncomes = await db
    .select({
      anchor_id: anchor_minigame_daily.anchor_id,
      sum_income: sql<number>`SUM(${anchor_minigame_daily.after_divided_author_income})`,
    })
    .from(anchor_minigame_daily)
    .where(
      and(
        inArray(anchor_minigame_daily.anchor_id, anchorIds),
        eq(anchor_minigame_daily.date, filters.date),
      ),
    )
    .groupBy(anchor_minigame_daily.anchor_id);

  const gameIncomes = await db
    .select({
      anchor_id: anchor_game_promo_daily.anchor_id,
      sum_income: sql<number>`SUM(${anchor_game_promo_daily.promote_anchor_income_1d})`,
    })
    .from(anchor_game_promo_daily)
    .where(
      and(
        inArray(anchor_game_promo_daily.anchor_id, anchorIds),
        eq(anchor_game_promo_daily.date, filters.date),
      ),
    )
    .groupBy(anchor_game_promo_daily.anchor_id);

  const mgMap = new Map(mgIncomes.map((r) => [r.anchor_id, Number(r.sum_income)]));
  const gameMap = new Map(gameIncomes.map((r) => [r.anchor_id, Number(r.sum_income)]));

  return rows.map((r) => ({
    ...r,
    minigame_income: mgMap.get(r.anchor_id) ?? null,
    game_income: gameMap.get(r.anchor_id) ?? null,
  }));
}
```

注意：`resolveUserPermission` 需要 Phase 1 的 `team_user_ids` 字段——若 Phase 1 未提供，需在 `src/modules/permissions/server.ts` 中扩 resolveUserPermission 返回值。

- [ ] **Step 12.3: anchors index/server**

`src/modules/anchors/server.ts`:

```typescript
import "server-only";
export { listAnchors } from "./queries";
```

`src/modules/anchors/index.ts`:

```typescript
export type {
  ProjectFilter,
  AnchorListFilters,
  AnchorListRow,
} from "./types";
export { AnchorListFiltersSchema } from "./schema";
```

- [ ] **Step 12.4: ESLint zone**

加 anchors zone 到 `eslint.config.mjs`:

```javascript
{
  target: [
    "./src/app/**",
    "./src/components/**",
    "./src/lib/**",
    "./src/worker/**",
    "./src/modules/!(anchors)/**",
  ],
  from: "./src/modules/anchors/!(index|server).ts",
  message: "跨模块只允许 import 对方的 index.ts。",
},
```

- [ ] **Step 12.5: API route**

`src/app/api/anchors/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listAnchors } from "@/modules/anchors/server";
import { AnchorListFiltersSchema } from "@/modules/anchors";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const filters = AnchorListFiltersSchema.parse({
    date: sp.get("date") ?? new Date(Date.now() - 86400_000).toISOString().slice(0, 10),
    project: sp.get("project") ?? undefined,
    broker_ids: sp.getAll("broker_id"),
    health_min: sp.get("health_min") ? Number(sp.get("health_min")) : undefined,
    search: sp.get("search") ?? undefined,
  });

  const rows = await listAnchors(session.user.id, filters);
  return NextResponse.json({ rows });
}
```

- [ ] **Step 12.6: 主播明细页 components（精简实现）**

`src/app/(dashboard)/anchors/page.tsx`:

```typescript
import { AnchorTable } from "./_components/anchor-table";

export default function AnchorsPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">主播明细</h1>
      <AnchorTable />
    </div>
  );
}
```

`src/app/(dashboard)/anchors/_components/anchor-table.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnchorListRow, AnchorListFilters } from "@/modules/anchors";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export function AnchorTable(): React.JSX.Element {
  const [filters, setFilters] = useState<AnchorListFilters>({ date: yesterday, project: "all" });
  const [rows, setRows] = useState<AnchorListRow[]>([]);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date", filters.date);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    fetch(`/api/anchors?${sp}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => setRows(d.rows));
  }, [filters]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <CsvExportButton rows={rows} />
      </div>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>昵称</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>运营经纪人</TableHead>
              <TableHead>健康分</TableHead>
              <TableHead className="text-right">音浪</TableHead>
              <TableHead className="text-right">时长</TableHead>
              <TableHead className="text-right">小游戏分账</TableHead>
              <TableHead className="text-right">推广游戏分账</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.anchor_id}>
                <TableCell>{r.nick_name}</TableCell>
                <TableCell>{r.is_threekingdoms ? "三国" : "斗地主"}</TableCell>
                <TableCell>{r.broker_name ?? "—"}</TableCell>
                <TableCell>{r.anchor_health_score ?? "—"}</TableCell>
                <TableCell className="text-right">{fmt(r.total_fan_ticket)}</TableCell>
                <TableCell className="text-right">{r.live_duration_1d ?? "—"}h</TableCell>
                <TableCell className="text-right">{fmt(r.minigame_income)}</TableCell>
                <TableCell className="text-right">{fmt(r.game_income)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("zh-CN");
}
```

`src/app/(dashboard)/anchors/_components/filters.tsx`:

```typescript
"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnchorListFilters, ProjectFilter } from "@/modules/anchors";

export function Filters({
  filters,
  onChange,
}: {
  filters: AnchorListFilters;
  onChange: (f: AnchorListFilters) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={filters.date}
        onChange={(e) => onChange({ ...filters, date: e.target.value })}
        className="max-w-[160px]"
      />
      <Select
        value={filters.project ?? "all"}
        onValueChange={(v) => onChange({ ...filters, project: v as ProjectFilter })}
      >
        <SelectTrigger className="max-w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          <SelectItem value="ddz">斗地主</SelectItem>
          <SelectItem value="three">三国</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="搜索昵称/抖音号"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="max-w-[200px]"
      />
    </div>
  );
}
```

`src/app/(dashboard)/anchors/_components/csv-export.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import type { AnchorListRow } from "@/modules/anchors";

export function CsvExportButton({ rows }: { rows: AnchorListRow[] }): React.JSX.Element {
  function download(): void {
    const headers = [
      "昵称",
      "项目",
      "运营经纪人",
      "健康分",
      "音浪",
      "时长(h)",
      "小游戏分账",
      "推广游戏分账",
    ];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.nick_name,
          r.is_threekingdoms ? "三国" : "斗地主",
          r.broker_name ?? "",
          r.anchor_health_score ?? "",
          r.total_fan_ticket ?? "",
          r.live_duration_1d ?? "",
          r.minigame_income ?? "",
          r.game_income ?? "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anchors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button size="sm" variant="outline" onClick={download} disabled={rows.length === 0}>
      导出 CSV
    </Button>
  );
}
```

- [ ] **Step 12.7: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/anchors/ src/app/api/anchors/ \
        src/app/\(dashboard\)/anchors/ eslint.config.mjs
git commit -m "feat(anchors): module + /anchors page with scope filter + csv export"
```

---

## Task 13: dashboard queries + 总览页改造

**Files:**
- Create: `src/modules/dashboard/{index,server,types,queries}.ts`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/app/api/dashboard/cards/route.ts`
- Modify: `eslint.config.mjs`

- [ ] **Step 13.1: dashboard module**

`src/modules/dashboard/types.ts`:

```typescript
export interface DashboardCards {
  total_fan_ticket_today: number;
  active_anchors_today: number;
  minigame_income_today: number;
  game_income_today: number;
  health_warn_count: number;
  violation_count: number;
}

export interface TrendPoint {
  date: string;
  total_fan_ticket: number;
  total_duration: number;
}
```

`src/modules/dashboard/queries.ts`:

```typescript
import "server-only";
import { db } from "@/db/client";
import {
  anchor_daily,
  anchor_profile,
  anchor_minigame_daily,
  anchor_game_promo_daily,
  broker_user_mapping,
} from "@/db/schema";
import { and, eq, sql, inArray, gt } from "drizzle-orm";
import { resolveUserPermission } from "@/modules/permissions/server";
import type { DashboardCards, TrendPoint } from "./types";

async function applyScope(userId: string): Promise<string[] | null> {
  // returns: null = all (no filter), [] = none (empty), [...] = subset of broker_ids
  const perm = await resolveUserPermission(userId);
  if (perm.scope === "all") return null;
  if (perm.scope === "none") return [];
  const userIds =
    perm.scope === "self" ? [userId] : (perm.team_user_ids ?? [userId]);
  const rows = await db
    .select({ broker_id: broker_user_mapping.broker_id })
    .from(broker_user_mapping)
    .where(inArray(broker_user_mapping.dingtalk_user_id, userIds));
  return rows.map((r) => r.broker_id);
}

export async function getDashboardCards(
  userId: string,
  date: string,
): Promise<DashboardCards> {
  const brokerIds = await applyScope(userId);
  const empty: DashboardCards = {
    total_fan_ticket_today: 0,
    active_anchors_today: 0,
    minigame_income_today: 0,
    game_income_today: 0,
    health_warn_count: 0,
    violation_count: 0,
  };
  if (brokerIds && brokerIds.length === 0) return empty;

  const profileFilter =
    brokerIds === null ? undefined : inArray(anchor_profile.broker_id, brokerIds);

  // 1. 总音浪 + 开播主播数
  const dailyAgg = await db
    .select({
      total_ft: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      active: sql<number>`COUNT(*) FILTER (WHERE ${anchor_daily.live_duration_1d} > 0)`,
    })
    .from(anchor_daily)
    .innerJoin(anchor_profile, eq(anchor_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_daily.date, date), profileFilter));

  // 2. minigame income
  const mgAgg = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${anchor_minigame_daily.after_divided_author_income}), 0)`,
    })
    .from(anchor_minigame_daily)
    .innerJoin(anchor_profile, eq(anchor_minigame_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_minigame_daily.date, date), profileFilter));

  // 3. game income
  const gameAgg = await db
    .select({
      sum: sql<number>`COALESCE(SUM(${anchor_game_promo_daily.promote_anchor_income_1d}), 0)`,
    })
    .from(anchor_game_promo_daily)
    .innerJoin(anchor_profile, eq(anchor_game_promo_daily.anchor_id, anchor_profile.anchor_id))
    .where(and(eq(anchor_game_promo_daily.date, date), profileFilter));

  // 4. 健康分 < 60
  const warn = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(anchor_profile)
    .where(
      and(
        sql`${anchor_profile.anchor_health_score} < 60`,
        profileFilter,
      ),
    );

  // 5. 违规
  const violations = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(anchor_profile)
    .where(and(gt(anchor_profile.anchor_violation_30d, 0), profileFilter));

  return {
    total_fan_ticket_today: Number(dailyAgg[0]?.total_ft ?? 0),
    active_anchors_today: Number(dailyAgg[0]?.active ?? 0),
    minigame_income_today: Number(mgAgg[0]?.sum ?? 0),
    game_income_today: Number(gameAgg[0]?.sum ?? 0),
    health_warn_count: Number(warn[0]?.c ?? 0),
    violation_count: Number(violations[0]?.c ?? 0),
  };
}

export async function getTrend(userId: string, days: number): Promise<TrendPoint[]> {
  const brokerIds = await applyScope(userId);
  if (brokerIds && brokerIds.length === 0) return [];
  const profileFilter =
    brokerIds === null ? undefined : inArray(anchor_profile.broker_id, brokerIds);

  const rows = await db
    .select({
      date: anchor_daily.date,
      total_fan_ticket: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      total_duration: sql<number>`COALESCE(SUM(${anchor_daily.live_duration_1d}), 0)`,
    })
    .from(anchor_daily)
    .innerJoin(anchor_profile, eq(anchor_daily.anchor_id, anchor_profile.anchor_id))
    .where(
      and(
        sql`${anchor_daily.date} >= (CURRENT_DATE - ${days}::int)`,
        profileFilter,
      ),
    )
    .groupBy(anchor_daily.date)
    .orderBy(anchor_daily.date);
  return rows.map((r) => ({
    date: r.date,
    total_fan_ticket: Number(r.total_fan_ticket),
    total_duration: Number(r.total_duration),
  }));
}
```

`src/modules/dashboard/server.ts`:

```typescript
import "server-only";
export { getDashboardCards, getTrend } from "./queries";
```

`src/modules/dashboard/index.ts`:

```typescript
export type { DashboardCards, TrendPoint } from "./types";
```

- [ ] **Step 13.2: ESLint zone**

加 dashboard zone（同前模式）。

- [ ] **Step 13.3: API + 页面改造**

`src/app/api/dashboard/cards/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDashboardCards, getTrend } from "@/modules/dashboard/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date =
    req.nextUrl.searchParams.get("date") ??
    new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const cards = await getDashboardCards(session.user.id, date);
  const trend = await getTrend(session.user.id, 7);
  return NextResponse.json({ cards, trend });
}
```

- [ ] **Step 13.4: 改 dashboard/page.tsx**

`src/app/(dashboard)/dashboard/page.tsx` 重写为：

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDashboardCards, getTrend } from "@/modules/dashboard/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const cards = await getDashboardCards(session.user.id, yesterday);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">总览</h1>
      <p className="text-sm text-muted-foreground">数据日期：{yesterday}</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <CardItem title="今日总音浪" value={cards.total_fan_ticket_today.toLocaleString()} />
        <CardItem title="今日开播主播数" value={cards.active_anchors_today.toString()} />
        <CardItem title="小游戏总流水" value={cards.minigame_income_today.toLocaleString()} />
        <CardItem title="推广游戏总流水" value={cards.game_income_today.toLocaleString()} />
        <CardItem title="健康分异常" value={cards.health_warn_count.toString()} hint="< 60 分" />
        <CardItem
          title="近 30 日违规"
          value={cards.violation_count.toString()}
          hint="violation > 0"
        />
      </div>
    </div>
  );
}

function CardItem({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
```

> 趋势图先不做，Phase 2 只要卡片够用，趋势图可放后续。

- [ ] **Step 13.5: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/dashboard/ \
        src/app/api/dashboard/ \
        src/app/\(dashboard\)/dashboard/page.tsx \
        eslint.config.mjs
git commit -m "feat(dashboard): 6 cards on overview page, scope-filtered"
```

---

## Task 14: /brokers 经纪人聚合页

**Files:**
- Create: `src/modules/dashboard/queries.ts` 加 `getBrokerAggregates`
- Create: `src/app/(dashboard)/brokers/page.tsx`
- Create: `src/app/api/brokers-agg/route.ts`

- [ ] **Step 14.1: queries 加聚合**

修改 `src/modules/dashboard/queries.ts`，追加:

```typescript
export interface BrokerAggregate {
  broker_id: string;
  broker_name: string;
  user_name: string | null;
  anchor_count: number;
  total_fan_ticket: number;
  total_duration: number;
  total_minigame_income: number;
  avg_health_score: number | null;
}

export async function getBrokerAggregates(
  userId: string,
  date: string,
): Promise<BrokerAggregate[]> {
  const brokerIds = await applyScope(userId);
  if (brokerIds && brokerIds.length === 0) return [];
  const profileFilter =
    brokerIds === null ? undefined : inArray(anchor_profile.broker_id, brokerIds);

  const rows = await db
    .select({
      broker_id: anchor_profile.broker_id,
      broker_name: anchor_profile.broker_name,
      anchor_count: sql<number>`COUNT(DISTINCT ${anchor_profile.anchor_id})`,
      total_fan_ticket: sql<number>`COALESCE(SUM(${anchor_daily.total_fan_ticket}), 0)`,
      total_duration: sql<number>`COALESCE(SUM(${anchor_daily.live_duration_1d}), 0)`,
      avg_health: sql<number>`AVG(${anchor_profile.anchor_health_score})`,
    })
    .from(anchor_profile)
    .leftJoin(
      anchor_daily,
      and(
        eq(anchor_profile.anchor_id, anchor_daily.anchor_id),
        eq(anchor_daily.date, date),
      ),
    )
    .where(profileFilter)
    .groupBy(anchor_profile.broker_id, anchor_profile.broker_name);

  // join broker_user_mapping → user name
  const mappings = await db
    .select({
      broker_id: broker_user_mapping.broker_id,
      user_id: broker_user_mapping.dingtalk_user_id,
    })
    .from(broker_user_mapping);
  const mapToUser = new Map(mappings.map((m) => [m.broker_id, m.user_id]));

  return rows
    .filter((r) => r.broker_id)
    .map((r) => ({
      broker_id: r.broker_id!,
      broker_name: r.broker_name ?? "—",
      user_name: mapToUser.get(r.broker_id!) ?? null,
      anchor_count: Number(r.anchor_count),
      total_fan_ticket: Number(r.total_fan_ticket),
      total_duration: Number(r.total_duration),
      total_minigame_income: 0, // 简化：本任务不再做 minigame join，留 Phase 3
      avg_health_score: r.avg_health !== null ? Math.round(Number(r.avg_health)) : null,
    }));
}
```

并 export 到 `src/modules/dashboard/server.ts`:

```typescript
export { getDashboardCards, getTrend, getBrokerAggregates } from "./queries";
```

- [ ] **Step 14.2: API**

`src/app/api/brokers-agg/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBrokerAggregates } from "@/modules/dashboard/server";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const date =
    req.nextUrl.searchParams.get("date") ??
    new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  const rows = await getBrokerAggregates(session.user.id, date);
  return NextResponse.json({ rows });
}
```

- [ ] **Step 14.3: /brokers 页面**

`src/app/(dashboard)/brokers/page.tsx`:

```typescript
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getBrokerAggregates } from "@/modules/dashboard/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

export default async function BrokersPage(): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const rows = await getBrokerAggregates(session.user.id, yesterday);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">经纪人聚合</h1>
      <div className="bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>经纪人</TableHead>
              <TableHead>钉钉用户</TableHead>
              <TableHead className="text-right">主播数</TableHead>
              <TableHead className="text-right">总音浪</TableHead>
              <TableHead className="text-right">总时长 (h)</TableHead>
              <TableHead className="text-right">平均健康分</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.broker_id}>
                <TableCell>{r.broker_name}</TableCell>
                <TableCell>{r.user_name ?? "—"}</TableCell>
                <TableCell className="text-right">{r.anchor_count}</TableCell>
                <TableCell className="text-right">{r.total_fan_ticket.toLocaleString()}</TableCell>
                <TableCell className="text-right">{r.total_duration.toFixed(1)}</TableCell>
                <TableCell className="text-right">{r.avg_health_score ?? "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                  无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 14.4: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/dashboard/ \
        src/app/api/brokers-agg/ \
        src/app/\(dashboard\)/brokers/
git commit -m "feat(dashboard): /brokers aggregate page"
```

---

## Task 15: /admin/crawler 监控页 + field_alias

**Files:**
- Create: `src/app/(dashboard)/admin/crawler/page.tsx`
- Create: `src/app/(dashboard)/admin/crawler/_components/{queue-status,cookie-panel,field-alias-tab,manual-rerun}.tsx`
- Create: `src/app/api/admin/crawler/status/route.ts`
- Create: `src/app/api/admin/crawler/cookie/route.ts`
- Create: `src/modules/crawler/actions.ts`

- [ ] **Step 15.1: actions.ts（admin Server Actions）**

`src/modules/crawler/actions.ts`:

```typescript
"use server";

import { db } from "@/db/client";
import { field_alias } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { enqueue, JOB_NAMES, saveCookies, type Basecamp } from "./server";

const RerunInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basecamp: z.enum(["cs", "nc1", "nc2"]),
});
export async function rerunCrawl(input: unknown): Promise<{ ok: true }> {
  const data = RerunInput.parse(input);
  const { userId } = await requireAdmin();
  await enqueue(JOB_NAMES.CHECK_DATA_READY, {
    date: data.date,
    basecamp: data.basecamp,
    attempt: 1,
  });
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_MANUAL_RERUN",
    target_type: "crawler",
    target_id: data.date,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}

const SaveCookieInput = z.object({
  basecamp: z.enum(["cs", "nc1", "nc2"]),
  cookies: z.record(z.string(), z.string()),
});
export async function saveCookieAction(input: unknown): Promise<{ ok: true }> {
  const data = SaveCookieInput.parse(input);
  const { userId } = await requireAdmin();
  await saveCookies(data.basecamp as Basecamp, data.cookies);
  await writeAuditLog({
    user_id: userId,
    action: "CRAWLER_COOKIE_REFRESH",
    target_type: "crawler",
    target_id: data.basecamp,
  });
  return { ok: true };
}

const FieldAliasInput = z.object({
  table_name: z.string().min(1),
  field_name: z.string().min(1),
  chinese_name: z.string().min(1),
  unit: z.string().optional(),
  hidden: z.enum(["true", "false"]).default("false"),
  sort_order: z.string().default("0"),
  description: z.string().optional(),
});
export async function upsertFieldAlias(input: unknown): Promise<{ ok: true }> {
  const data = FieldAliasInput.parse(input);
  const { userId } = await requireAdmin();
  await db
    .insert(field_alias)
    .values({
      ...data,
      updated_by: userId,
      updated_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [field_alias.table_name, field_alias.field_name],
      set: {
        chinese_name: data.chinese_name,
        unit: data.unit ?? null,
        hidden: data.hidden,
        sort_order: data.sort_order,
        description: data.description ?? null,
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  await writeAuditLog({
    user_id: userId,
    action: "FIELD_ALIAS_UPSERT",
    target_type: "field_alias",
    target_id: `${data.table_name}.${data.field_name}`,
    after: data as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
```

更新 `src/modules/crawler/index.ts`:

```typescript
export { parseDuration, parseRelativeTime, parsePercent, parseChineseNumber } from "./parsers";
export { JOB_NAMES, type JobName } from "./types";
export type { Basecamp } from "./cookie";
export { rerunCrawl, saveCookieAction, upsertFieldAlias } from "./actions";
```

- [ ] **Step 15.2: status API（pg-boss 查询）**

`src/app/api/admin/crawler/status/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getBoss, JOB_NAMES } from "@/modules/crawler/server";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const boss = await getBoss();
  const stats: Record<string, { active: number; created: number; failed: number; completed: number }> = {};
  for (const name of Object.values(JOB_NAMES)) {
    const counts = await boss.getQueueSize(name as string);
    stats[name as string] = {
      active: 0,
      created: counts ?? 0,
      failed: 0,
      completed: 0,
    };
    // pg-boss v10 API：用 boss.fetch + state 拿不同状态——简化只看 size
  }
  return NextResponse.json({ stats });
}
```

> pg-boss v10 的具体查询 API 见 https://github.com/timgit/pg-boss/blob/master/docs/readme.md，实施时按文档 fetch 各状态。

- [ ] **Step 15.3: cookie 状态 API**

`src/app/api/admin/crawler/cookie/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { crawler_cookie_session } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-guard";

export async function GET(): Promise<NextResponse> {
  await requireAdmin();
  const rows = await db
    .select({
      basecamp: crawler_cookie_session.basecamp,
      status: crawler_cookie_session.status,
      captured_at: crawler_cookie_session.captured_at,
      expires_at: crawler_cookie_session.expires_at,
      last_check_at: crawler_cookie_session.last_check_at,
    })
    .from(crawler_cookie_session);
  return NextResponse.json({ cookies: rows });
}
```

- [ ] **Step 15.4: /admin/crawler 页面（精简）**

`src/app/(dashboard)/admin/crawler/page.tsx`:

```typescript
import { CookiePanel } from "./_components/cookie-panel";
import { QueueStatus } from "./_components/queue-status";
import { ManualRerun } from "./_components/manual-rerun";

export default function CrawlerAdminPage(): React.JSX.Element {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">采集监控</h1>
      <ManualRerun />
      <QueueStatus />
      <CookiePanel />
    </div>
  );
}
```

`src/app/(dashboard)/admin/crawler/_components/manual-rerun.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rerunCrawl } from "@/modules/crawler";

export function ManualRerun(): React.JSX.Element {
  const [date, setDate] = useState(new Date(Date.now() - 86400_000).toISOString().slice(0, 10));
  return (
    <div className="bg-card rounded-lg border p-4 space-y-2">
      <h3 className="font-semibold">手动重跑</h3>
      <div className="flex items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[160px]" />
        <Button
          onClick={async () => {
            await rerunCrawl({ date, basecamp: "cs" });
            alert("已入队");
          }}
        >
          重跑
        </Button>
      </div>
    </div>
  );
}
```

`src/app/(dashboard)/admin/crawler/_components/queue-status.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";

export function QueueStatus(): React.JSX.Element {
  const [stats, setStats] = useState<Record<string, { created: number }> | null>(null);

  useEffect(() => {
    fetch("/api/admin/crawler/status")
      .then((r) => r.json() as Promise<{ stats: Record<string, { created: number }> }>)
      .then((d) => setStats(d.stats));
  }, []);

  if (!stats) return <div className="text-sm text-muted-foreground">加载中...</div>;

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="font-semibold mb-2">队列状态</h3>
      <ul className="text-sm space-y-1">
        {Object.entries(stats).map(([name, v]) => (
          <li key={name}>
            <code className="text-xs">{name}</code> — 排队 {v.created}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`src/app/(dashboard)/admin/crawler/_components/cookie-panel.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface CookieRow {
  basecamp: string;
  status: string;
  captured_at: string;
  expires_at: string | null;
  last_check_at: string | null;
}

export function CookiePanel(): React.JSX.Element {
  const [rows, setRows] = useState<CookieRow[]>([]);

  useEffect(() => {
    fetch("/api/admin/crawler/cookie")
      .then((r) => r.json() as Promise<{ cookies: CookieRow[] }>)
      .then((d) => setRows(d.cookies));
  }, []);

  return (
    <div className="bg-card rounded-lg border p-4">
      <h3 className="font-semibold mb-2">Cookie 状态</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">尚未配置任何 Cookie</p>
      ) : (
        <ul className="text-sm space-y-2">
          {rows.map((r) => (
            <li key={r.basecamp} className="flex items-center justify-between">
              <span>
                <code>{r.basecamp}</code> — 状态:{" "}
                <span className={r.status === "active" ? "text-green-600" : "text-red-600"}>
                  {r.status}
                </span>
              </span>
              {r.status === "expired" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => alert("扫码续期 UI 后续 Phase 实现，先用 admin SQL 写入新 cookie")}
                >
                  扫码续期
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

> 注意：完整的"扫码续期"流程需要 worker 端启动 puppeteer 引导扫码并 capture 新 cookie——这部分 Phase 2 用人工写入兜底（admin 直接 SQL `UPDATE crawler_cookie_session`），UI 仅展示状态。后续 Phase 完整化。

- [ ] **Step 15.5: typecheck + commit**

```bash
pnpm typecheck && pnpm lint
git add src/modules/crawler/actions.ts \
        src/modules/crawler/index.ts \
        src/app/api/admin/crawler/ \
        src/app/\(dashboard\)/admin/crawler/
git commit -m "feat(admin): /admin/crawler page (queue status + cookie panel + manual rerun)"
```

---

## Task 16: nav 启用 + 集成跑通 + 验收

**Files:**
- Modify: `src/lib/nav.ts`
- Modify: `CONTRIBUTING.md`

- [ ] **Step 16.1: 启用 Phase 2 nav items**

修改 `src/lib/nav.ts`，把 `disabled: true` 的 Phase 2 条目改为 `disabled: false`，并添加（如果还没）:

```
首页 / Dashboard          /dashboard
主播明细                  /anchors
经纪人聚合                /brokers
管理 → 经纪人映射         /admin/brokers
管理 → 采集监控           /admin/crawler
（保留 Phase 1 的 admin/permissions）
```

- [ ] **Step 16.2: CONTRIBUTING.md 注册剩余模块**

第 8 节加：

```markdown
| anchors | `src/modules/anchors/` | 主播档案查询（按权限过滤）| Phase 2 (2026-05-02) |
| crawler | `src/modules/crawler/` | 抖音爬虫 + 队列 + Cookie | Phase 2 (2026-05-02) |
| dashboard | `src/modules/dashboard/` | 看板聚合查询 | Phase 2 (2026-05-02) |
```

- [ ] **Step 16.3: docker-compose 加 chromium**

修改 `docker-compose.yml` worker 服务，加 chromium 包：

```yaml
worker:
  build:
    context: .
    dockerfile: Dockerfile.worker
  environment:
    - PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
    # ...
```

`Dockerfile.worker`（如已存在则 patch）需要 `apk add chromium`（alpine）或 `apt install chromium`。

- [ ] **Step 16.4: 端到端冒烟（手动）**

1. 准备 Cookie：从已登录的 union.bytedance.com 复制 sid_guard / sessionid 等到一个 JSON
2. SQL 写入：
   ```sql
   INSERT INTO crawler_cookie_session (basecamp, cookies, status)
   VALUES ('cs', '{"sid_guard":"...","sessionid":"...","ttwid":"...","msToken":"..."}', 'active');
   ```
3. 起 worker：`pnpm worker`
4. 等到 10:00 cron 自动跑（或手动 enqueue 一次 check-data-ready）
5. 跟进日志 → 看 fetch_profile 完成 → 看 anchor_profile 表行数（应 ~1591）
6. 看 fetch_daily 完成 → anchor_daily 表行数
7. 看少数 anchor 的 game/minigame 数据
8. 浏览 `/dashboard`、`/anchors`、`/brokers` 页面看数据是否合理

- [ ] **Step 16.5: 验收清单（spec §11）逐项检查**

```
[ ] 9 张表迁移完成，schema 单测全过
[ ] cron 10:00 自动跑
[ ] check_data_ready 在数据未刷新时正确等待 → 刷新后正确触发下游
[ ] Cookie 失效场景（手动改 status='expired' 模拟）：钉钉收到告警
[ ] 三页看板可访问，scope=team / scope=self 权限过滤正确
[ ] 主播明细 CSV 导出可用
[ ] 经纪人映射 admin 页可手动修正
[ ] typecheck / lint / test 全过
[ ] field_alias 至少配齐看板默认 30 字段中文名（手动 SQL 写入）
```

- [ ] **Step 16.6: 打 tag + 收尾 commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add CONTRIBUTING.md src/lib/nav.ts docker-compose.yml Dockerfile.worker
git commit -m "feat(phase-2): enable nav + register modules + worker chromium config"
git tag -a v0.3.0-phase2 -m "Phase 2: 抖音主播数据中台（采集 + 看板）"
```

---

## Self-Review

**Spec coverage check：**

| Spec section | Task |
|---|---|
| §3 数据模型（9 张表）| Task 1 |
| §4.1 鉴权 / Puppeteer | Task 3 |
| §4.2 队列设计 | Task 4, 10 |
| §4.3 数据就绪检测 | Task 6 |
| §4.4 项目归属 | Task 5 (in adapter) |
| §4.5 字段值预处理 | Task 2 |
| §4.6 Cookie 失效 | Task 3 (cookie.ts), Task 15 (admin) |
| §4.7 触发与回填 | Task 10 (cron), Task 15 (manual rerun) |
| §4.8 钉钉告警 | Task 4 (notify.ts) |
| §5 字段标准化层 | Task 5-9 (adapters) + Task 15 (field_alias actions) |
| §6.1 总览页 | Task 13 |
| §6.1.2 主播明细 | Task 12 |
| §6.1.3 经纪人聚合 | Task 14 |
| §6.2 权限过滤 | Task 12, 13, 14 (applyScope) |
| §6.3 admin/crawler | Task 15 |
| §7 模块边界 / ESLint zone | Task 4, 11, 12, 13 (ESLint zones added) |
| §11 验收 | Task 16 |

**Placeholder scan：**
- [x] 无 TBD/TODO/FIXME（除 Task 9.1 的 `PORTRAIT_CORE_CID` 注明实施时抓真实 cid——这是必要的，文档有提示）
- [x] Task 11.4 actions.ts 里 `where(/* eq inline */ undefined as never)` 已在 Step 11.4 末尾修正

**类型一致性：**
- `JOB_NAMES` 在 Task 4 定义，Task 6/7/8/9/10 一致使用
- `Basecamp` 类型在 Task 3 定义
- `MinigameRow` 接口在 Task 8.1 定义，Task 8.2 复用 import
- `applyScope` helper 命名在 Task 12 (queries.ts) 与 Task 13 (queries.ts) 重复——应抽到一处共享：

> 修复建议：把 `applyScope` 放 `src/modules/permissions/scope.ts`（Phase 1 已有此文件），让 anchors 和 dashboard 都 import。Task 12.2 和 13.1 实现时合并到 scope.ts。

**已知遗留（非阻塞）：**
1. Task 13 趋势图未做（spec §6.1.1 提到 7 天趋势）—— 留 Phase 3
2. Task 15 扫码续期 UI 未做完整 —— admin SQL 兜底
3. Task 14 `total_minigame_income` 简化为 0 —— 后续补 join

---

## Plan complete and saved to `docs/superpowers/plans/2026-05-02-phase-2-broadcast-data.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - 每个 task dispatch 一个 fresh subagent 实施，task 间做 review，迭代快速

**2. Inline Execution** - 在当前 session 用 executing-plans 批量跑，checkpoint 处人工 review

Which approach?

