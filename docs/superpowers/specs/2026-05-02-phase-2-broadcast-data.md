# Phase 2 Spec：主播数据中台（抖音）

> 起草日期：2026-05-02
> 上一阶段：Phase 1 完成（v0.2.0-phase1，钉钉同步 + 三层权限）
> 范围参考：`2026-04-30-qjhy-pro-design.md` 第 9.3 节
> brainstorming 全过程：`.tmp-design-preview/phase-2-brainstorming-state.md`

---

## 1. 目标与范围

### 1.1 业务目标

替代 PRO3 中"主播 + 直播数据 + 数据看板"模块，建立中台抖音数据底座，支撑：

- **运营经纪人**：每天看自己负责主播的音浪 / 时长 / 小游戏流水 / 健康分等指标
- **运营 leader**：看团队聚合数据，识别异常主播（健康分掉、违规增、流水降）
- **公会管理者**：跨经纪人维度的全公会概览

### 1.2 业务覆盖

仅 **本基地** 的两条产品线，其他基地后续再说：

| 产品线 | 主播识别 | 数据来源 API |
|---|---|---|
| 三国冰河时代 | `recruit_broker_name = "三国项目"` | 数据中心-基础 + 业务合作-小游戏合作 + 主播详情-小游戏 |
| 途游斗地主 | 其他主播（兜底） | 数据中心-基础 + 数据中心-其他业务-抖音游戏 |

### 1.3 不在 Phase 2 范围

- 主播档案的 CRUD 编辑（档案完全由抖音平台同步，不做编辑）
- 主播 ↔ 运营 user 的 1:1 绑定（等"主播花名册"业务流程到位后做）
- 快手平台
- 跨基地数据合并（cs / nc1 / nc2 三账号）
- 财务结算 API（用户后续补探查）
- 历史数据回填（仅每日拉昨日，不补 PRO3 历史）
- 单场详情的"非激活人数字段"（仅采小游戏激活漏斗）
- 实时数据（游戏直播不需要）
- 自定义仪表板拖拽（Phase 3+ 再考虑）

---

## 2. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│  Web (Next.js)                                          │
│   /dashboard           总览页（卡片 + 趋势）            │
│   /anchors             主播明细页（按 anchor 表格）     │
│   /brokers             经纪人聚合页                     │
│   /admin/crawler       采集监控 / Cookie 管理           │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL                                             │
│   anchor_profile / anchor_daily                         │
│   anchor_game_promo_daily / anchor_minigame_daily       │
│   anchor_portrait_daily / session_minigame_convert      │
│   broker_user_mapping / field_alias                     │
│   crawler_job (pg-boss) / crawler_cookie_session        │
└───────────────▲─────────────────────────────────────────┘
                │
                │ writes
                │
┌─────────────────────────────────────────────────────────┐
│  Worker（pg-boss + Puppeteer）                          │
│   每日 10:00 cron → enqueue 全套 jobs                   │
│   data_ready_check → fetch_profile + fetch_daily        │
│      → fetch_game / fetch_minigame / fetch_portrait     │
│      → fetch_session_minigame                           │
│   失败 → 指数退避 → 钉钉报错                            │
└─────────────────────────────────────────────────────────┘
```

**部署形态**（不变 Phase 0/1 既有架构）：

```
docker-compose:
  postgres   PG 16
  web        Next.js (3000)
  worker     pg-boss + Puppeteer + cron
```

---

## 3. 数据模型

完整字段清单见 `.tmp-design-preview/anchor-tables-fields-final.md`，本节给出表结构概述与表间关系。

### 3.1 核心表

#### `anchor_profile`（主播档案 · 维度表）

```
PK: anchor_id (text)
来源: 抖音 API uanchor/anchor_list/list（117 字段）
入库: 解构 6 个嵌套对象后约 48 个扁平字段 + raw jsonb 兜底
更新: 每日 10:00 全量同步覆盖（不存历史快照）
```

字段分组：身份 10 / 状态标签 7 / 签约相关 13 / 经纪人 4 / 分成比 2（含 percent_map jsonb） / 业务标识 12 / 时长汇总 4。

详细字段映射见 final.md 第一节。

#### `anchor_daily`（主播按日数据 · 事实表）

```
PK: (anchor_id, date)
FK: anchor_id → anchor_profile.anchor_id
来源: 抖音 API data_center/anchor_list（91 字段，fields 显式声明全集）
入库: 34 个标准化字段 + raw jsonb 兜底
更新: 每日仅拉昨日数据（date = yesterday）
```

字段分组：身份冗余 3 / 音浪收益 10 / 时长天数 4 / 看播人气 2 / 粉丝转化 2 / 视频统计 3 / 分成比 4 / 状态档案 4 / 其他 4。

#### `anchor_game_promo_daily`（推广游戏数据 · 斗地主主播）

```
PK: (anchor_id, date, promote_scene, biz_mode, game_name)
FK: anchor_id → anchor_profile
来源: faction/game/game_anchor_detail_list × 3 bizMode (cps_all / cpc / poi)
覆盖: live + video 两种 promote_scene
仅采集: recruit_broker_name != "三国项目" 的开播主播
```

字段：基础（acu/pcu/duration/cnt）+ 看播 + 互动 + 转化漏斗 + 付费 + 分账（含主播分账后 `promoteAnchorIncome1d`）。

#### `anchor_minigame_daily`（小游戏数据 · 三国主播）

```
PK: (anchor_id, date, scene)  -- scene = 'live' | 'video'
FK: anchor_id → anchor_profile
来源:
  scene=live  → faction/micro_game/live_anchor_list
  scene=video → micro_game/video/creator_list
仅采集: recruit_broker_name = "三国项目" 的开播主播
```

字段：开播场次/时长 + 看播互动 + `gmClickUcnt/gmActiveUcnt/gmPayUcnt` + 分账（`afterDividedAuthorIncome` 主播分账后）+ `cpsBindUv`。

#### `anchor_portrait_daily`（主播详情·直播数据 · 曝光人数）

```
PK: (anchor_id, date)
FK: anchor_id → anchor_profile
来源: portrait/core_day_stats（仅取曝光人数 showUv 一个核心指标 + 几个附属漏斗字段）
仅采集: 所有开播主播
```

精简字段（仅 5 个）：

```
showUv          曝光人数（核心，业务方唯一关心字段）
enterUv         进入人数
enterRatio      进入率
payUcnt         付费人数
payRatio        付费率
```

> 不全采 portrait——其他指标（漏斗、看播分析）平台已有图表能看，中台仅做"曝光人数"这一不可替代字段，附带几个相邻漏斗字段方便看转化。

#### `session_minigame_convert`（单场小游戏激活漏斗）

```
PK: room_id (text)
FK: anchor_id → anchor_profile
来源:
  ├─ tinker_proxy/lego/native/webcast_api/room/replay/overview_v3   (取 acu / show_uv 等)
  └─ tinker_proxy/lego/native/webcast_api/room/minigame/audience_convert
仅采集: 三国主播的开播场次（每日新增 ~50-100 场）
```

字段：notOpenGameUV / openGameUV / 各转化率 / 各 Medium 中位数。

### 3.2 辅助表

#### `broker_user_mapping`（经纪人 ↔ 钉钉 user 映射）

```
broker_id          抖音 broker_id (text)
broker_name        抖音 broker 名 (text)
dingtalk_user_id   钉钉 user_id（可空，未匹配状态）
match_source       enum('auto' | 'manual')
matched_at         timestamptz
```

每天 sync 后 fuzzy match `broker_name` ↔ `dingtalk_user.name`。admin 页可手动改。

#### `field_alias`（字段中文显示名 + 单位）

```
PK: (table_name, field_name)
chinese_name       中文显示名
unit               单位（小时/分/%/元/...）
hidden             是否隐藏（看板默认不展示）
sort_order         默认排序权重
```

> 仅做"展示层"配置，不影响存储/采集。新字段先 hardcode 入库，再 admin 页配中文名。

#### `crawler_job`（pg-boss 自带表）

pg-boss 内部表（`pgboss.job` 等），不自己造。

#### `crawler_cookie_session`（Cookie 储存）

```
basecamp        enum('cs' | 'nc1' | 'nc2')  -- Phase 2 仅 cs
cookies         jsonb  -- {sid_guard, sessionid, msToken, ttwid, passport_csrf_token, ...}
captured_at     timestamptz
expires_at      timestamptz  -- 失效时间（定时检测推算）
status          enum('active' | 'expired')
```

Phase 2 只一个 base，单行记录。失效时 admin 扫码登录抓 Cookie 写入。

### 3.3 表关系图

```
dingtalk_user ─┐
               │
broker_user_mapping  ──┐
                       │
anchor_profile ←───────┘ broker_id 字符串关联
   ↑   ↑   ↑   ↑   ↑
   │   │   │   │   │  FK on anchor_id
   │   │   │   │   │
anchor_daily / anchor_game_promo_daily / anchor_minigame_daily
            / anchor_portrait_daily / session_minigame_convert
```

---

## 4. 数据采集

### 4.1 鉴权与 HTTP 模式

抖音公会平台所有 API 均需：

```
Cookie: sid_guard / sessionid / passport_csrf_token / msToken / ttwid
URL 签名: msToken + X-Bogus + _signature ← 平台前端 SDK 在浏览器 context 生成
Headers: X-Appid: 3000, X-Secsdk-Csrf-Token
```

**爬虫模式**：Puppeteer 启动 browser，通过 `page.evaluate()` 发起 fetch，让平台前端 SDK 自动加签。**不做纯 axios + 自实现签名**（签名 SDK 复现成本高）。

参考 `~/bytedance_export` 项目的实现，**不复用代码**（TS 重写），但复用模式：

- 启动 headless Chrome
- 访问 `https://union.bytedance.com/portal/...` 等待登录态
- 在浏览器 context 内调 `fetch()` 发请求
- 解析返回（含 `data.data_string` 双层 JSON 解析）

### 4.2 队列设计（pg-boss）

```
依赖 pg-boss
PG 复用 phase 0 数据库（schema = pgboss）
worker 进程通过 docker-compose 起独立容器
```

**job 类型**：

```
job:check_data_ready   守护 job，10:00 起每 30 min 跑一次直至成功
job:fetch_profile      全量主播档案（一次性）
job:fetch_daily        全量主播按日数据（一次性）
job:fetch_game         per anchor，斗地主主播开播
job:fetch_minigame     per anchor，三国主播开播
job:fetch_portrait     per anchor，所有开播主播
job:fetch_session_mg   per room_id，三国开播场次的小游戏漏斗
```

**依赖关系**：

```
check_data_ready (成功) 
   ↓ enqueue
fetch_profile (singleton) + fetch_daily (singleton)
   ↓ both done, enqueue
fetch_game (N个) | fetch_minigame (M个) | fetch_portrait (K个)
   ↓ minigame 完成后, enqueue
fetch_session_mg (per room_id)
```

**并发控制**：

```
worker 默认 concurrency = 1（先单线程，避险控）
job 间隔 200-500ms（job retry interval）
失败重试: 3 次指数退避（1s / 5s / 30s）
仍失败 → 标记 dead → 钉钉告警
```

### 4.3 数据就绪检测

抖音上午 10 点前后陆续刷新数据，存在延迟。`check_data_ready` 流程：

```
1. 试拉 data_center/anchor_list date=yesterday，前 50 条
2. 检测 totalFanTicket：
     >70% 主播 = 0  →  视为"未就绪"
     否则           →  "已就绪"
3. 未就绪 → 30 min 后重试，最多 8 次（10:00 → 14:00）
4. 仍未就绪 → 钉钉告警 "Phase2 数据未刷新"，停止当日采集
5. 已就绪 → 持久化判定结果，触发后续 jobs
```

### 4.4 项目归属判定

```typescript
function isThreekingdoms(profile: AnchorProfile): boolean {
  return profile.recruit_broker_name === "三国项目";
}
```

判定时机：`fetch_profile` 完成后写入 `anchor_profile` 时打标。下游 jobs 入队时按此标分流：

- 三国 → `fetch_minigame` + `fetch_portrait` + `fetch_session_mg`
- 斗地主 → `fetch_game` + `fetch_portrait`

### 4.5 字段值预处理

数据 API 大量字段是格式化字符串，入库前必须解析：

| 输入 | 解析后 |
|---|---|
| `"6小时6分钟38秒"` | `6.11`（小时，numeric(6,2)） |
| `"17小时前"` | unix 时间戳（基于采集时间反推） |
| `"3.8万"` | `38000`（整数） |
| `"0%"` | `0.0`（百分比小数） |

实现：`src/modules/crawler/parsers.ts` 一组纯函数，配 vitest 单测。

### 4.6 Cookie 失效处理

```
任一 job 返回 401 / 重定向到登录页 → 标记 cookie status='expired'
→ pause 整个队列（pg-boss API: schedule paused state）
→ 钉钉告警 "Cookie 失效，扫码续期"
→ admin 在 /admin/crawler 页面扫码登录
   → puppeteer 浏览器自动捕获新 Cookie 写入 crawler_cookie_session
→ 队列恢复 active，未完成 job 自动续跑
```

### 4.7 触发与回填

```
触发:
  cron: 每天 10:00 自动 enqueue check_data_ready
  手动: admin 页"立即重跑昨日"

回填: 不在 Phase 2 范围（仅拉昨日；测试稳定后再加）
```

### 4.8 钉钉告警

复用 PRO3 的"报错"机器人（webhook 关键词："报错"），凭证从 `.env.local` 读：

```
DINGTALK_WEBHOOK_ERROR_URL=...
DINGTALK_WEBHOOK_ERROR_KEYWORD=报错
```

告警场景：
- 数据就绪检测 8 次后仍未就绪
- Cookie 失效
- 任意 job 重试 3 次仍失败
- 队列在 PostgreSQL 不可达

---

## 5. 字段标准化层

### 5.1 三层架构

```
Adapter 层（hardcode）
  per endpoint: src/modules/crawler/adapters/{endpoint}.ts
  导出 fetch() + parse() 两函数
  parse() 把 raw response → 标准化 row（中台字段命名）

field_alias 表（DB 配置）
  仅控制"展示层"：中文名、单位、是否默认隐藏、排序权重
  admin 页可改
  新字段先 hardcode 入库 → 再配 field_alias

raw jsonb 兜底
  每张表都有 raw 列存完整原始返回
  以后想用新字段不需改爬虫，写 SQL backfill 即可
```

### 5.2 命名规范

中台所有字段统一规范：

```
风格: snake_case
时间维度后缀: _1d / _30d / _all_time
单位约定:
  时长       numeric(6,2) 单位小时（_duration）
  金额       bigint        单位分    （_income / _amount）
  人数       integer       原值      （_uv / _ucnt / _cnt）
  比率       numeric(5,4)  0-1 小数  （_ratio / _rate）
  时间戳     timestamptz   或 bigint unix（_time / _at）
```

### 5.3 Adapter 接口

```typescript
interface CrawlerAdapter<TRow> {
  endpoint: string;
  fetch(ctx: CrawlerContext, params: object): Promise<RawResponse>;
  parse(raw: RawResponse): TRow[];   // 标准化 row
  table: string;                       // 落表名
}
```

每个端点一个 adapter 文件，目录：

```
src/modules/crawler/adapters/
  anchor-list.ts          → anchor_profile
  anchor-daily.ts         → anchor_daily
  game-promo-anchor.ts    → anchor_game_promo_daily
  minigame-live.ts        → anchor_minigame_daily (scene=live)
  minigame-video.ts       → anchor_minigame_daily (scene=video)
  portrait-core.ts        → anchor_portrait_daily
  session-minigame.ts     → session_minigame_convert
```

### 5.4 raw jsonb 用法

每张事实表都加 `raw jsonb`，存采集到的完整 API response 节选（不存 meta，仅 series 当行）。

用途：
1. 调试（数据异常时回查原值）
2. 字段扩展（要新字段时 SQL backfill：`UPDATE ... SET new_field = raw->>'someKey'`）
3. 审计（业务核账）

---

## 6. 数据看板

### 6.1 三页结构

#### 6.1.1 总览页（`/dashboard`）

固定卡片 + 趋势图：

```
顶部三筛: 时间范围 / 项目（斗地主/三国/全部）/ 经纪人（多选）

卡片（6 个）:
  今日总音浪          来自 anchor_daily.total_fan_ticket SUM
  今日开播主播数      anchor_daily.live_duration_1d > 0 COUNT
  小游戏总流水（三国）anchor_minigame_daily.beforeDividedIncome SUM
  推广游戏总流水（斗地主）anchor_game_promo_daily.promoteAnchorIncome1d SUM
  健康分异常主播数    anchor_profile.anchor_health_score < 60 COUNT
  违规主播数          anchor_profile.anchor_violation_30d > 0 COUNT

趋势图（折线，2 条）:
  总音浪 7 天趋势 / 总开播时长 7 天趋势
```

#### 6.1.2 主播明细页（`/anchors`）

```
表格（默认列 8 个，列选择器可加 30+ 字段）:
  昵称 | 项目 | 经纪人 | 健康分 | 当日音浪 | 当日时长 | 当日小游戏流水 | 操作

行点击 → drawer 展示主播档案完整字段 + 7/30 天趋势图

筛: 同总览三筛 + 健康分阈值 + 签约状态
导出 CSV: 当前筛选结果
```

#### 6.1.3 经纪人聚合页（`/brokers`）

```
表格按经纪人 group by:
  经纪人名 | 钉钉 user（如 mapped）| 主播数 | 总音浪 | 总时长 | 总小游戏流水 | 健康分均值

点击 → 该经纪人下所有主播明细（跳 /anchors?broker_id=xxx）
```

### 6.2 权限过滤

复用 Phase 1 三层权限模型。看板查询前先 resolve 当前用户 scope：

```
scope=all   → 全部数据（admin / 公会管理者）
scope=team  → 当前用户管理的部门下所有运营经纪人的主播
              （broker_user_mapping.dingtalk_user_id 在该部门内）
scope=self  → 仅当前用户对应 broker 名下的主播
              （broker_user_mapping.dingtalk_user_id = self）
scope=none  → 无数据
```

实现：所有看板查询都用 `applyAnchorPermission(query, userId, scope)` 包一层（统一过滤函数，写在 `src/modules/dashboard/queries.ts`）。

### 6.3 admin 监控页（`/admin/crawler`）

```
- 队列状态（pg-boss 内置 dashboard 二次封装即可）
- 当日采集进度（jobs 完成数 / 失败数 / 重试中）
- Cookie 状态（active / expired，过期时间）
- 手动操作:
    立即重跑昨日 → 强制 enqueue 全套
    扫码续期 Cookie → 启动 puppeteer 引导扫码
    查看失败 job 详情 → 重试单个 job
- field_alias 编辑（中文名/单位/隐藏）
```

仅 `can_admin = true` 用户可见。

---

## 7. Phase 2 模块边界

按 CONTRIBUTING.md 的 feature-first 模块划分：

```
src/modules/
  anchors/              主播档案 CRUD（仅查 + admin 编辑别名）
    index.ts            client-safe（types/zod schemas/server actions）
    server.ts           server-only（DB 客户端）
    queries.ts          按权限过滤的查询函数
  
  crawler/              采集模块
    index.ts            client-safe（admin 操作 server actions：扫码续期、重跑、暂停）
    server.ts           server-only
    adapters/           各端点 adapter 集合
    queue.ts            pg-boss 启动与 job handler 绑定
    parsers.ts          字段值解析（小时/百分比/相对时间）
    cookie.ts           Cookie 持久化与刷新
    notify.ts           钉钉告警
  
  dashboard/            看板查询
    index.ts            client-safe
    queries.ts          按 scope 过滤的聚合查询
  
  brokers/              经纪人 ↔ 钉钉 user 映射
    index.ts            client-safe
    server.ts           server-only
    matcher.ts          fuzzy match 算法

src/db/schema/
  anchors.ts            anchor_profile / anchor_daily / anchor_game_promo_daily / ...
  brokers.ts            broker_user_mapping
  crawler.ts            crawler_cookie_session / field_alias

src/worker/
  index.ts              worker 入口（pg-boss 启动 + cron）
  jobs/                 各 job handler
```

ESLint zone 同 phase 1 模式，每模块两个合法 import 入口（`index.ts` / `server.ts`），其他文件不可被外部 import。

---

## 8. 安全与运维

### 8.1 Cookie 安全

```
crawler_cookie_session.cookies (jsonb) 含敏感凭证
表级权限: 仅 worker DB user 可读，web DB user 不可读
admin UI 不展示原始 Cookie 值，仅展示 status / expires_at
扫码登录通过 puppeteer 完成，新 Cookie 由 worker 直接写库（web 进程不接触）
```

### 8.2 限流防风控

```
worker concurrency = 1（保守起步）
job 间隔 200-500ms（每 fetch 后随机 sleep）
单日单端点最大 fetch 次数 hard limit（避免 bug 时疯狂调用）
失败 3 次后 dead，不再重试
```

### 8.3 钉钉告警内容

```
[Phase2 错误] 类型: <data_not_ready|cookie_expired|job_failed|db_unreachable>
时间: 2026-05-02 14:00
详情: <具体描述>
影响: <当日 X 个主播数据未采集 / Cookie 失效，队列暂停>
处理: <扫码续期 / 重跑 / 联系开发>
```

### 8.4 监控指标

写入 audit_log（Phase 1 已有）：
- 采集每日完成时间
- 失败率
- Cookie 续期次数
- admin 手动操作

---

## 9. 实施分块（writing-plans 阶段拆细）

预计 4-5 个 plan tasks：

```
Task 1: 数据模型 + Drizzle schema 落地
  - 6 张事实表 + broker_user_mapping + field_alias + crawler_cookie_session
  - 迁移 + 单测

Task 2: Puppeteer + Cookie 基础设施
  - 启动浏览器 → 登录态保持 → 提供 fetch API
  - parsers.ts（时长/百分比/相对时间解析）+ 单测

Task 3: 队列 + 采集 jobs
  - pg-boss 集成
  - 7 个 adapter 实现 + 入库
  - check_data_ready 守护 job
  - 钉钉告警接入
  - cron 触发

Task 4: 经纪人映射 + admin 页
  - broker_user_mapping 表 + fuzzy matcher
  - /admin/crawler 监控页
  - /admin/brokers 映射管理页
  - 扫码续期 Cookie 流程

Task 5: 看板（3 页）
  - /dashboard 总览
  - /anchors 明细
  - /brokers 聚合
  - 权限过滤函数 + 单测
  - 列选择器 + CSV 导出
```

每个 Task 走 spec compliance review + code quality review（按 superpowers 流程）。

---

## 10. 已知风险与遗留

1. **抖音 API 字段变化**：平台改字段名时 adapter 会挂——`raw jsonb` 兜底 + 入库前 schema 校验（zod parse 失败钉钉告警）
2. **签名 SDK 升级**：抖音前端可能换签名机制，需重新调试 Puppeteer 注入逻辑
3. **数据回填能力**：Phase 2 不做，但 schema 已支持任意 date 主键，将来 1-2 天工作量可加
4. **跨基地账号**：当前 cs 一个基地够用；nc1/nc2 接入时只需扩 `crawler_cookie_session.basecamp` 多行 + worker 切换 Cookie 上下文
5. **主播 ↔ 运营 1:1 绑定**：当前仅经纪人级，运营无法看自己个人 KPI 中的具体主播明细（仅能看团队聚合）。等业务花名册到位后补
6. **Phase 1 unionid 兜底**：sync job 用 userid 兜底导致钉钉登录用户 id 与 dingtalk_user.unionid 不一致 → Phase 2 启动前需先用 `/v2/user/get` 修复（避免影响 broker 映射）

---

## 11. 验收标准

Phase 2 完成 = 以下全部通过：

- [ ] 6 张事实表迁移完成，schema 单测全过
- [ ] cron 10:00 自动跑，14:00 前完成全套采集（健康主播数 ~1591）
- [ ] check_data_ready 在数据未刷新时正确等待，刷新后正确触发下游
- [ ] Cookie 失效场景：钉钉收到告警，admin 扫码后队列恢复
- [ ] 三页看板可访问，scope=team / scope=self 权限过滤正确
- [ ] 主播明细 CSV 导出对得上抖音平台导出（字段值差距 <1%）
- [ ] 经纪人映射 admin 页可手动修正
- [ ] 钉钉告警在指定场景触发，不误报
- [ ] typecheck / lint / test 全过
- [ ] field_alias 至少配齐看板默认展示的 30 字段中文名

---

## 附录 A：参考文件

- `.tmp-design-preview/anchor-tables-fields-final.md` - 字段最终清单
- `.tmp-design-preview/endpoints-discovered.md` - 23 端点完整笔记
- `.tmp-design-preview/anchor-list-response.network-response` - 主播列表 API 真实样本
- `.tmp-design-preview/anchor-data-list-response.network-response` - 主播按日 API 真实样本
- `~/bytedance_export/` - 老爬虫项目（不复用代码，复用模式）
- Phase 0 design: `2026-04-30-qjhy-pro-design.md`
- Phase 0 plan: `2026-04-30-phase-0-foundation.md`
- Phase 1 plan: `2026-04-30-phase-1-org-permissions.md`
