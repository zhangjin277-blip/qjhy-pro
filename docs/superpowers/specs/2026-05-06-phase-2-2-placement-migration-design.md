# Phase 2.2 — 投放数据迁移 + 排班 override + 投放主播效能

> **状态**：Spec / 设计 — 2026-05-06
> **范围**：PRO3 捕鱼投放数据迁移 + 排班 override + 投放看板（按账号 / 按主播 / 按时段）
> **前置**：Phase 2.1（live_account / live_anchor / account_anchor_default）已完成

## 1. 背景与目标

### 1.1 业务诉求（用户原话）

> "你认真看下 /Users/zhangjin/miracle-pro3 这个项目下捕鱼投放这个板块，所有功能，设定都自己看一下，我要把这个板块的所有功能都转移过来"

——这是用户 conversation 开头的最早诉求。Phase 2.1 是其前置基础（直播账号 + 主播 + 默认排班），Phase 2.2 才是实质迁移与升级。

### 1.2 目标

1. **完整复刻 PRO3 投放看板能力**（按账号视角的消耗 / 激活 / 单价 / 付费）
2. **新增主播归因能力**（PRO3 没有 — qjhy-pro 借助 Phase 2.1 排班可做真人级归因）
3. **新增排班 override 能力**（PRO3 没有 — 临时调班不污染默认排班）
4. **迁移 8.4 万行 PRO3 历史投放数据**到 qjhy-pro，保持业务连续性

### 1.3 Non-goals

- ❌ 投放数据 API 自动拉（百应/巨量没成熟开放 API，PRO3 也没做）
- ❌ 投放计划 / 创意层面管理（百应后台已有，不重复造）
- ❌ 投放 ROI 优化建议算法（远期 AI 能力，超出本期范围）
- ❌ 把投放合并进 /dashboard 总览（受众不同，独立 /placements 页）

### 1.4 关键决策记录

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据粒度 | 小时级落库 + 看板默认日级（可下钻小时）| PRO3 原生小时级，丢掉可惜 |
| 归因算法实现 | **B 方案：归因快照**（写库时 dirty=true，job 异步算后冷冻在 placement_row）| 看板查询快 / 历史归因可解释 / 可独立测试 |
| 数据来源 | Excel 手工上传（百应/巨量后台导出）| PRO3 同款流程 |
| 切换节奏 | 双写过渡 1 周后 PRO3 投放停用 | 风险可控 |
| override 模型 | 单独 `schedule_override` 表，**不**改 `account_anchor_default` | 历史归因不被翻案 |
| override 主要场景 | A 临时调班 + C 时段微调 | 用户拍板 |
| 产品范围 | PRO3 原生 3 个：buyu / ue4 / urp，架构开放 | 与 PRO3 一致 + 未来扩 |
| 看板权限 | admin + 直播一部主管全可见，主播可见自己 | 按 Phase 1 三层权限实现 |
| 历史 unmatched 处理 | C：仅按账号汇总，**不**模糊归因主播 | 模糊归因风险 > 收益 |

---

## 2. 架构与模块划分

### 2.1 数据流总览

```
                  ┌── Excel 上传 ──┐                         ┌── PRO3 SQLite ─────┐
                  │  (运营手工)    │                         │  business_data      │
                  └────────┬───────┘                         │  type='custom-ds-*' │
                           │                                 └──────────┬──────────┘
                           ▼                                            ▼
              ┌──── xlsxAdapter ───┐                         ┌──── pro3Adapter ────┐
              │  解析列 → rawRows   │                         │  转标准 rawRow      │
              └─────────┬───────────┘                         └─────────┬───────────┘
                        ▼                                               ▼
             ┌────────────── 共享 ingest pipeline ───────────────────────┐
             │  match account by placement_label                          │
             │  → computeIncrements (累计→增量)                           │
             │  → INSERT placement_row (dirty=TRUE)                       │
             │  → trigger attribution job                                 │
             └────────────────────────────────────────────────────────────┘
                                      ▼
                  ┌──── 归因 job (后台 worker) ────┐
                  │  扫 dirty=TRUE                 │
                  │  → 查 schedule_override        │
                  │  → 查 account_anchor_default   │
                  │  → 写回 attributed_user/source │
                  │  → 标 dirty=FALSE              │
                  └─────────┬──────────────────────┘
                            ▼
              ┌──────── /placements 看板 ────────┐
              │  /by-account  /by-anchor         │
              │  /by-hour     /upload  /batches  │
              └──────────────────────────────────┘

           ┌── /live-accounts 抽屉 → 「临时调整」子 tab ──┐
           │  CRUD schedule_override                       │
           │  → 标受影响 placement_row.dirty=TRUE          │
           │  → trigger 归因 job                           │
           └───────────────────────────────────────────────┘
```

### 2.2 模块清单（feature-first）

| 路径 | 职责 | 入口 |
|---|---|---|
| `src/modules/placement/` | placement_row schema、ingest pipeline、查询 | `index.ts` + `server.ts` 双入口 |
| `src/modules/schedule-override/` | override schema、CRUD、effective merge | `index.ts` + `server.ts` |
| `src/modules/placement-attribution/` | 归因 job、单行归因函数、dirty 触发 | `server.ts`（无 client 入口） |
| `src/app/(dashboard)/placements/` | 看板 + 上传 + 批次 UI | route group |
| `src/app/(dashboard)/live-accounts/_components/schedule-override-tab.tsx` | override 编辑 UI | 现有抽屉的新子 tab |
| `src/scripts/migrate-pro3-placements.ts` | 一次性历史迁移 CLI | CLI |
| `src/scripts/verify-placement-migration.ts` | 抽样校验 PRO3 vs qjhy-pro | CLI |

### 2.3 与现有模块的依赖

```
placement
  ├── live-account       (按 placement_label join)
  ├── live-anchor        (归因结果落到 dingtalk_user_id)
  └── (无写入依赖 account_anchor_default / schedule_override，仅读)

placement-attribution
  ├── placement                     (写回 attributed_dingtalk_user_id)
  ├── account_anchor_default        (读 default 排班)
  └── schedule-override             (读 override 排班)

/placements 看板
  ├── placement                     (读 placement_row)
  ├── live-account                  (join 账号信息)
  ├── live-anchor                   (join 主播信息)
  └── permissions                   (resolvePermission scope 过滤)
```

### 2.4 0 改动的现有内容

- ✅ `live_account` / `live_anchor` / `account_anchor_default` 表结构不动
- ✅ `live_account.placement_label` 字段 Phase 2.1 已建好
- ✅ Dashboard / anchors / permissions 模块零侵入
- ✅ better-auth / 钉钉同步 / 爬虫 不受影响

---

## 3. 数据模型

### 3.1 `placement_row` — 核心投放数据 + 归因结果

```sql
CREATE TABLE placement_row (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL,
  hour            INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
  dataset_id      TEXT NOT NULL,                     -- 'product_buyu' / 'product_ue4' / 'product_urp'
  live_account_id UUID NOT NULL REFERENCES live_account(id),

  -- 增量值（已经累计→增量算过）
  cost_yuan       NUMERIC(14,3) NOT NULL DEFAULT 0,  -- 消耗
  activations     INTEGER NOT NULL DEFAULT 0,        -- 激活数
  payment_yuan    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 激活当日付费金额
  start_download  INTEGER NOT NULL DEFAULT 0,
  finish_download INTEGER NOT NULL DEFAULT 0,

  -- 归因快照
  attributed_dingtalk_user_id TEXT REFERENCES dingtalk_user(user_id),
  attribution_dirty           BOOLEAN NOT NULL DEFAULT TRUE,
  attribution_computed_at     TIMESTAMPTZ,
  attribution_source          TEXT,                  -- 'override' / 'default' / 'conflict' / 'unmatched' / NULL

  raw             JSONB NOT NULL,                    -- 原始 PRO3 / Excel 行
  import_batch_id UUID REFERENCES placement_import_batch(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (date, hour, dataset_id, live_account_id)
);

CREATE INDEX placement_row_account_date_idx     ON placement_row (live_account_id, date);
CREATE INDEX placement_row_anchor_date_idx      ON placement_row (attributed_dingtalk_user_id, date);
CREATE INDEX placement_row_dataset_date_idx     ON placement_row (dataset_id, date);
CREATE INDEX placement_row_dirty_partial_idx    ON placement_row (id) WHERE attribution_dirty = TRUE;
```

### 3.2 `schedule_override` — 日级临时排班

```sql
CREATE TABLE schedule_override (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES live_account(id),
  date              DATE NOT NULL,
  dingtalk_user_id  TEXT NOT NULL REFERENCES dingtalk_user(user_id),
  time_slots        JSONB NOT NULL,           -- [["14:00","18:00"], ...]，[] 表示请假
  reason            TEXT,                      -- '请假调班' / '加班' / '临时换人' / 自定义
  created_by        TEXT REFERENCES auth_user(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, date, dingtalk_user_id)
);

CREATE INDEX schedule_override_account_date_idx ON schedule_override (account_id, date);
```

**语义**：override 是「针对某主播的当天替代排班」，不是「整天 reset」。

```
default（账号 X）：
  · 邓明星  09-13
  · 李四    14-18

override（账号 X，2026-05-06）：
  · 张三    12-14   ← 临时加班

→ effective 当天排班：
  · 邓明星  09-13   ← 走 default
  · 张三    12-14   ← 走 override
  · 李四    14-18   ← 走 default
```

`slots=[]` 表示该主播当天请假（覆盖其 default 全部时段）。

### 3.3 `placement_import_batch` — 上传批次审计

```sql
CREATE TABLE placement_import_batch (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          TEXT NOT NULL,                    -- 'excel-upload' / 'pro3-migration'
  file_name       TEXT,
  file_size_bytes INTEGER,
  dataset_id      TEXT NOT NULL,
  date_range_from DATE,
  date_range_to   DATE,
  row_count       INTEGER NOT NULL DEFAULT 0,
  rows_inserted   INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  rows_skipped    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL,                    -- 'parsing' / 'completed' / 'failed' / 'partial'
  error_log       JSONB,                             -- [{row, reason}, ...]
  uploaded_by     TEXT REFERENCES auth_user(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX placement_import_batch_uploaded_at_idx ON placement_import_batch (uploaded_at DESC);
```

### 3.4 Migration 编号

新 migration：`src/db/migrations/0024_phase_2_2_placements.sql`（Phase 2.1 用到 0023）。

### 3.5 数据规模预估

| 表 | 5 年规模 | 说明 |
|---|---|---|
| `placement_row` | ~100w 行 | 8.4w 历史 + 每天 ~500 行 × 5 年 |
| `schedule_override` | ~1.8w 行 | 每天 ~10 条 × 5 年 |
| `placement_import_batch` | ~5k 行 | 每天 3 个文件 × 5 年 |

无性能压力，索引足以应付。

---

## 4. Excel 上传 + 累计→增量算法

### 4.1 列名 alias 表

```typescript
const COLUMN_ALIAS = {
  account_name:    ["账户名称", "直播间", "广告账户"],
  cost_yuan:       ["消耗", "花费", "成本"],
  activations:     ["激活数", "激活"],
  payment_yuan:    ["激活当日付费金额", "当日付费金额"],
  start_download:  ["开始下载数"],
  finish_download: ["下载完成数"],
  date_text:       ["日期", "日期【X年X月X日】"],
  hour_text:       ["小时", "小时【X点】", "小时【x点】"],
  time_text:       ["时间"],
} satisfies Record<string, string[]>;
```

忽略列：`备注` / `arpu` / `ROI` / 空 None 列。

### 4.2 日期解析三级 fallback

```
1. 优先：「日期」列（"2026年05月06日"）+「小时」列（"19"）
   regex 解析年月日：/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/
2. 次选：「时间」列（"19:00"，无日期）
   → 从文件名 regex 提取：/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/
3. 单日范围（from==to）直接用；跨日范围 → ❌ 整文件 reject
```

### 4.3 数据清洗规则

| 输入 | 处理 |
|---|---|
| `"19 "`（带空格）| trim |
| `"2026年05月06日"` | regex 解析年月日 |
| `"19:00 "`（时间列）| `match(/^(\d{1,2}):/)` 取小时整数 |
| 数值列为 `None` / `""` | 落 0 |
| `"5746元"`（PRO3 历史）| `parseUnitNumber()`：strip `[元¥％%,空格]\|分钟\|小时\|秒` 后 cast，实现位置 `src/modules/placement/parse-utils.ts` |

### 4.4 累计→增量算法（PRO3 移植）

PRO3 来源：`/Users/zhangjin/miracle-pro3/server/routes/dataset.routes.js:36-79` `computeIncrements()`

实现位置：`src/modules/placement/incremental.ts`

```typescript
export function computeIncrements(rows: RawPlacementRow[]): IncrementalRow[] {
  // 1. 按 (account_id, dataset_id) 分组（PRO3 原是 anchorName + 账户名称）
  // 2. 每组内按 (date, hour) 升序排序
  // 3. 从第 2 行起，每行 = 当前累计 - 前一行累计
  // 4. 重置点检测：任一主要列骤降 < 前一行 * 0.3 → 重置行保留原值不做差
  //    主要列：消耗 / 激活数 / 付费金额 / 开始下载 / 下载完成
  // 5. 增量 floor 到 0：max(0, curr - prev)
}
```

### 4.5 上传流程（事务边界）

```typescript
async function processUpload(file: File, datasetId: string, userId: string) {
  // ① 解析 Excel → rawRows
  // ② match 账户名称 → live_account（精确匹配 placement_label，不 fuzzy）
  // ③ computeIncrements
  // ④ 事务：
  //   - INSERT placement_import_batch (status='parsing')
  //   - 批量 INSERT placement_row ON CONFLICT (date, hour, dataset_id, account_id)
  //     DO UPDATE SET ... attribution_dirty = TRUE
  //   - UPDATE placement_import_batch SET status='completed', rows_inserted, rows_updated
  // ⑤ 异步触发归因 job（不阻塞响应）
}
```

### 4.6 多文件上传

每个文件 = **独立的 import_batch**。原因：每个文件对应一个广告账户，batch 详情页能精确追溯。

UI：拖拽 N 个文件 → 每个独立预览（日期范围 / 账号匹配率）→ 一次确认 → 后台并行处理 N batch。

### 4.7 重传行为

- 同 (date, hour, dataset_id, account_id) → **UPDATE**（让运营能修正错误）
- `attribution_dirty = TRUE` 重置 → 触发归因 job 重算
- batch 详情页显示「8 行被覆盖更新」给运营反馈
- **不**做版本快照（实测增量数据修正频率低，存版本徒增复杂度）

### 4.8 错误处理

| 情况 | 行为 |
|---|---|
| Excel 列名不识别 | 整文件 reject，error_log 记录缺失列 |
| 单行解析失败（数值带异常字符）| 跳过该行，error_log 记录原始 row + reason |
| `账户名称` 匹配不到 live_account | 跳过该行，error_log 记录"未匹配账号: xxx" |
| 增量算法遇重置点 | 静默保留原值（PRO3 同款）|
| 文件 > 10MB / > 5w 行 | reject，提示先拆分 |
| 跨日 Excel 范围 | reject，提示「请按天上传」|

---

## 5. 归因算法 + 快照机制

### 5.1 单行归因决策树

```
对一行 placement_row(account_id, date, hour):

  Step 1: 查 override(account_id, date) + default(account_id)
          → mergeWithOverride 得到 effective schedule（每个 anchor 标记 source 来源）

  Step 2: 过滤 effective schedule（rest_days 包含当天 ISO weekday 的 anchor 剔除）

  Step 3: 找 effective schedule 中 time_slots 覆盖 hour 的候选
          ├── 1 个候选 ──→ user = 该 anchor, source = 该候选来源（'override' / 'default'）
          ├── 多个候选 ─→ user = NULL,      source = 'conflict'
          └── 0 个候选 ─→ user = NULL,      source = 'unmatched'
```

### 5.2 effective schedule merge

```typescript
function mergeWithOverride(
  defaults: AnchorSchedule[],     // [{user, slots, rest_days}]
  overrides: AnchorOverride[],    // [{user, slots}]
): EffectiveSchedule[] {
  const overrideUserIds = new Set(overrides.map(o => o.user));
  // override 替换 default 中相同 user 的 slots
  const fromDefault = defaults
    .filter(d => !overrideUserIds.has(d.user))
    .map(d => ({ user: d.user, slots: d.slots, rest_days: d.rest_days }));
  // override 中的所有人（包括 default 没有的）
  const fromOverride = overrides.map(o => ({ user: o.user, slots: o.slots, rest_days: [] }));
  return [...fromDefault, ...fromOverride];
}
```

### 5.3 跨天时段判定

```typescript
function coversHour(slot: [string, string], hour: number): boolean {
  const [sh, eh] = [parseHour(slot[0]), parseHour(slot[1])];
  if (sh < eh)  return hour >= sh && hour < eh;   // 09-13: 9,10,11,12 命中
  if (sh > eh)  return hour >= sh || hour < eh;   // 22-04: 22,23,0,1,2,3 命中
  return false;
}
```

跨天语义：`22-04` 的排班，row.date 当天 `hour=2` 仍命中（"昨晚 22 点开始的排班延续到今天 4 点"）。**不**去查前一天的排班兜底。

### 5.4 触发时机

| 事件 | 行为 |
|---|---|
| Excel 上传完成 | 新行 dirty=TRUE → trigger job 处理这批 batch_id |
| override 编辑（CREATE/UPDATE/DELETE）| UPDATE 受影响 (account, date) 所有 placement_row.dirty=TRUE → trigger job |
| account_anchor_default 编辑 | **不自动触发重算**（保留历史归因结果不被翻案，符合 §1.4 决策） |
| 手动「重算未归因」按钮 | UPDATE WHERE attribution_source IN ('unmatched','conflict') OR attributed_user IS NULL SET dirty=TRUE → trigger job |
| cron 兜底 | 每天 04:00 扫所有 dirty=TRUE 行（防遗漏，通常为空）|

**说明**：default 是常态化排班，修改它不应回溯改历史归因（否则 6 个月前的数据会被今天的 default 改动翻案）。运营如果想让历史 unmatched 行重新归因，应该走「手动重算未归因」按钮（仅扫未归因的行，不动已成功归因的行）。该按钮位于 `/placements/batches` 页右上角，仅 admin 可点。

### 5.5 性能优化

```typescript
async function runAttributionJob(opts?: { batch_id?: string; max_rows?: number }) {
  // 批次拉 1000 行 dirty=TRUE
  // 按 (account_id, date) 分组（同组内 hour 不同 → 复用同一份 schedule 查询）
  // 每组：
  //   1. 查 override(account_id, date) 一次
  //   2. 查 default(account_id) 一次
  //   3. 内存中遍历 24 个 hour 算归因
  //   4. 批量 UPDATE placement_row SET attributed_user, source, dirty=FALSE
}
```

性能预估：100w 行全量重算 ≈ 5-8 分钟。增量重算（dirty 子集）通常 < 10 秒。

### 5.6 冲突场景处理

```
default:
  · A: time_slots=[[14:00,18:00]]
  · B: time_slots=[[14:00,18:00]]

placement_row(hour=15) → 两个候选都命中 → attribution_source='conflict', user=NULL
```

UI 显示：
- batch 详情：「⚠ 12 行因排班冲突未归因，去 /live-accounts 修正」
- 看板：conflict 行单独一桶 「冲突未归因」，不污染主播分数
- 可手工解：通过 schedule_override 强制覆盖

---

## 6. schedule_override UI

### 6.1 入口（MVP 1 个）

```
/live-accounts → 选账号 → 抽屉 → 「主播 / 排班」tab
                                   ├── 子 tab：默认排班（Phase 2.1 已有）
                                   └── 子 tab：临时调整 ← 新增
```

### 6.2 「临时调整」子 tab 交互

```
┌── 日期：[2026-05-06 ▾]  ─────────────────────────────┐
│                                                       │
│  当天有效排班（default + 调整 merge）：              │
│  ┌─────────────────────────────────────────────────┐ │
│  │  09─12  邓明星 (默认)                            │ │
│  │  12─14  ⚠ 张三 (临时调整 · 请假调班)             │ │
│  │  14─18  李四 (默认)                              │ │
│  │  18─22  无人 (unmatched)                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  该日临时调整 (1 条)：                              │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 张三  12:00-14:00  请假调班  [创建人: 王五]   ✕  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  [ + 添加临时调整 ]                                   │
└───────────────────────────────────────────────────────┘
```

### 6.3 添加流程

```
点「+ 添加临时调整」：
  1. 选主播（searchable combobox，从 live_anchor）
  2. 设时段（[14:00, 18:00]，可加多段）
  3. 选原因：[请假调班 / 加班 / 临时换人 / 自定义]
  4. 保存 → INSERT schedule_override
  5. 自动标该 (account, date) 当天 placement_row.dirty=TRUE
  6. 异步触发归因 job
  7. 1-3 秒后看板反映新归因
```

### 6.4 删除

行右侧「✕」→ 二次确认 → DELETE → 标 dirty → 自动重算。**不软删**。

### 6.5 权限

| 角色 | 读 | 写 |
|---|---|---|
| admin | 全部 | 全部 |
| 直播一部主管 / 经纪人 | 全部 | 全部 |
| 普通主播 | 仅涉及自己的 | 不可写 |
| 其他业务线 | 看不到 | 不可写 |

权限走现有 `resolvePermission(userId, 'placement')`（沿用新增 module key）。

---

## 7. 投放看板

### 7.1 路由结构

```
/placements                   → redirect /placements/by-account
/placements/by-account        # A 视角
/placements/by-anchor         # B 视角
/placements/by-hour           # C 视角
/placements/upload            # 上传页
/placements/batches           # 批次列表
/placements/batches/[id]      # 单批次详情
```

### 7.2 共享筛选条（顶部）

```
[日期: 最近 7 天 ▾]  [产品: 捕鱼 + UE4 ▾]  [搜索账号/主播 🔍]
```

- 日期 preset：今天 / 昨天 / 最近 7 天 / 最近 30 天 / 自定义
- dataset 多选：捕鱼 / UE4 / URP / 全部
- 业务线：默认勾选用户有权限的（直播一部 → 捕鱼）

### 7.3 A 视角：/by-account（PRO3 复刻）

| 列 | 数据来源 | 备注 |
|---|---|---|
| 账号名 | `live_account.account_name` | 头像 + 平台 badge |
| 投放标签 | `live_account.placement_label` | 灰字小号 |
| 消耗 | `SUM(cost_yuan)` | ¥18,432 |
| 激活数 | `SUM(activations)` | |
| 激活单价 | `cost / activations` | 派生 |
| 当日付费 | `SUM(payment_yuan)` | |
| ROI | `payment / cost` | 颜色：绿 ≥ 0.5 / 红 < 0.3 |
| 趋势 | mini sparkline | 7 天消耗 |

默认按消耗降序，分页 25/50/100。

### 7.4 B 视角：/by-anchor（投放主播效能）

| 列 | 数据来源 | 备注 |
|---|---|---|
| 主播 | `live_anchor` join `dingtalk_user` | 头像 + 业务线 chip |
| 归因消耗 | `SUM(cost) WHERE attributed_user = ?` | |
| 激活数 | `SUM(activations) WHERE ...` | |
| 当日付费 | `SUM(payment) WHERE ...` | |
| 投放 ROI | `payment / cost` | |
| 覆盖账号 | `COUNT(DISTINCT account_id)` | |
| 行点击 | → 抽屉 | |

底部固定行：
- **冲突未归因**：source='conflict' 汇总
- **未匹配**：source='unmatched' 汇总
- **未匹配账号**：placement_label 找不到 live_account 的（按 raw 中"账户名称"分组）

### 7.5 C 视角：/by-hour（24h 时段矩阵）

```
       00 01 02 ... 13 14 15 16 17 18 19 20 21 22 23
账号 A  ─  ─  ─     ¥0 ¥0 ¥0 ¥0 ¥3k ¥5k ¥17k ¥3k ¥0 ¥0 ─
账号 B  ¥1k ¥0 ─    ¥2k ¥0 ¥0 ─  ─  ─  ─  ─  ─  ─  ─
```

格子颜色梯度（消耗 → 蓝色深浅），hover tooltip 显示账号 / 时段 / 消耗 / 激活 / 当时归因主播。

切换：消耗 / 激活 / 单价 / 付费 4 个 metric。

### 7.6 抽屉

复用 dashboard-drawer 模式：
- A 视角：点账号 → 4 KPI + 主曲线 + 24h 分布 + 日明细 + CSV
- B 视角：点主播 → 主播档案卡 + 4 KPI + 主曲线 + 关联账号 list + 日明细 + CSV

### 7.7 CSV 导出

每个 tab 右上角「⬇ 导出 CSV」：当前筛选下全量数据 / UTF-8 BOM / 文件名 `投放-按账号-2026-05-01_2026-05-06.csv`。

### 7.8 与 /dashboard 的关系

**不合并**。/dashboard = 业务总览给主管看 / /placements = 投放工作台给运营每天用。

后续 /dashboard Section 2 可加 metric tab `投放消耗`（聚合 placement_row）— 不在本期范围。

---

## 8. PRO3 历史数据迁移

### 8.1 思路：迁移走和 Excel 上传同一管道

```
PRO3 SQLite ──→ pro3Adapter ──┐
Excel 文件 ──→ xlsxAdapter ──┴──→ 共享 ingest pipeline
                                    (match / increment / insert / dirty / job)
```

**优点**：迁移和日常上传共享算法，少一处 bug。

### 8.2 PRO3 字段映射

| PRO3 JSON key | placement_row 字段 |
|---|---|
| `消耗` | cost_yuan |
| `激活数` | activations |
| `账户名称` | match placement_label |
| `dataDate` | date（fallback `business_data.data_date` 列）|
| `dataHour` | hour |
| `开始下载数` | start_download |
| `下载完成数` | finish_download |
| `激活当日付费金额` | payment_yuan |

### 8.3 CLI

```bash
NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local \
  src/scripts/migrate-pro3-placements.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --datasets product_buyu,product_ue4,product_urp \
  --date-range 2025-01-01:2026-04-30 \
  --dry-run
```

### 8.4 Dry-run 报告（沿用 Phase 2.1 风格）

```
=== PRO3 投放数据迁移 Dry-Run 报告 ===
数据来源：custom-ds-product_buyu  68,107 行
        custom-ds-product_ue4    8,196 行
        custom-ds-product_urp    7,535 行
总计：83,838 行
日期范围：2025-01-15 ~ 2026-05-05

账户匹配：✓ 142 / 156 个账号成功 / ⚠ 14 个未匹配
按 dataset 分布：buyu 65k / ue4 8k / urp 6k 可迁
归因预测：matched 56% / conflict 3% / unmatched 41%
  → unmatched 主因 2025 年排班数据不存在
```

### 8.5 unmatched 处理（决策 C）

历史 unmatched 不做模糊归因。原因：
- 模糊归因可能错归人头，看板呈现错误数据更不如显示空白
- 老板看历史投放主要看趋势 / 总额，不看个人主播

行为：
- 历史 unmatched 行 attribution_source='unmatched'
- A 视角看板看：账号汇总不受影响（数据完整）
- B 视角看板看：unmatched 行进入「未匹配」桶，老板能看到桶汇总，但不点开主播明细

### 8.6 边界

- 数据库 sqlite path 不存在 → CLI 报错退出
- `--force-reimport` 才能覆盖已有 batch（默认禁止）
- PRO3 数值带单位字符串 → 复用 `parseUnitNumber()` 工具
- `dataDate` 为空 → fallback 到 `business_data.data_date` 列
- `dataHour` 缺失 → 跳过该行 + error_log

### 8.7 校验脚本

```bash
pnpm tsx src/scripts/verify-placement-migration.ts \
  --pro3-db ... \
  --sample-account "ldl-直播-蓝V" \
  --date 2025-12-01

# 输出：
# PRO3 该日总消耗：¥18,432.5
# qjhy-pro 该日总消耗：¥18,432.5  ✅
```

3-5 抽样（覆盖每个 dataset），允许 0.01% 误差（bigint round）。

### 8.8 一次性 UI

`/placement-migration` 页（仿 Phase 2.1 `/live-account-migration`）：上传 CLI 出的 JSON 报告 → 浏览器查看 → **不在 UI 写库**。完成后保留作 audit。

---

## 9. 错误处理矩阵

| 错误类型 | 检测点 | 行为 | 用户可见 |
|---|---|---|---|
| Excel 列名不识别 | upload | 整文件 reject | batch 详情错误明细 |
| 单行解析失败 | upload | 跳过 + error_log | 「N 行解析失败」 |
| 账号未匹配 | upload | 跳过 + error_log | 「14 个账号未匹配」+ 列表 |
| 累计→增量重置点 | upload | 静默保留原值 | batch 元数据记录 |
| 重复 (date,hour,dataset,account) | upload | UPDATE + 标 dirty | 「8 行被更新」 |
| 归因冲突 | job | source='conflict' user=NULL | 看板「冲突未归因」桶 |
| 归因 unmatched | job | source='unmatched' user=NULL | 看板「未匹配」桶 |
| 归因 job 异常 | job | 失败行保持 dirty=TRUE，cron 重试 | 钉钉机器人报错 |
| override 触发 job 失败 | UI | 「调整已保存，归因稍后更新」 | toast |
| 跨日 Excel | upload | reject 整文件 | 「请按天上传」|

---

## 10. 测试策略

### 10.1 unit 测试（vitest）

```
computeIncrements          (8: 单日 / 跨日 / 重置点 / None / 单位字符串 / 空 / 单行 / 多组)
attributeRow               (8: override / default / 跨天 / rest_days / conflict / unmatched / merge / 同 user)
coversHour                 (4: 普通 / 跨天 / 边界 sh==eh / 边界 sh>eh)
parseUnitNumber            (4: 元 / % / 分钟 / 纯数字)
pro3Adapter                (3: 3 dataset 各一)
mergeWithOverride          (4: default 无 / 增加 / 替换 / slots=[] 移除)
parseDateText              (3: 中文格式 / 数字格式 / fallback 文件名)
parseExcelHeader           (3: 3 种文件结构)
```

### 10.2 integration 测试

```
ingest pipeline E2E        (2: 成功 / 部分失败)
override 编辑 → 重算       (1)
default 编辑 → 重算         (1)
重传 → UPDATE + dirty       (1)
```

### 10.3 e2e（手工，写到上线 checklist）

```
1. 上传 3 个真实 Excel → batch 详情对得上
2. 加 override → 看板归因变化
3. PRO3 历史迁移 dry-run + verify 抽样
4. 权限：admin 看全部 / 普通主播看自己 / 斗地主主播看不到捕鱼
```

### 10.4 覆盖率目标

> 70%（按 Phase 2.1 标准）。`vitest --coverage` 必须通过 CI。

---

## 11. 权限实现

### 11.1 新增 module key

`src/modules/permissions/modules.ts`：
```typescript
export const MODULE_KEYS = [
  "dashboard", "anchors", "crawler", "permissions",
  "live_account", "live_anchor", "live_room",
  "placement",  // ← 新增
] as const;

MODULE_LABEL.placement = "投放数据";
MODULE_DESC.placement = "投放消耗 / 激活 / 主播归因看板";
```

### 11.2 默认配置

为现有 `role_default_permission` 表中的所有 8 个 role 各加一行 `placement` module 配置。原则：

| role 类型 | placement 默认 |
|---|---|
| admin / 部门负责人 | read=TRUE / write=TRUE / scope='all' |
| 各类运营经纪人（线上 / 线下 / 捕鱼）| read=TRUE / write=TRUE / scope='team' |
| 主播（正式签约） | read=TRUE / write=FALSE / scope='self' |
| 试播 / 未激活 | read=FALSE / write=FALSE / scope='none' |

具体 role 名字以 `src/modules/permissions/role-defaults.ts` 当前定义为准（plan 阶段实施时取实际 role 列表逐一配置）。新增 8 行 INSERT 语句直接 seed 在 `0024_phase_2_2_placements.sql` migration 末尾。

### 11.3 查询头部 scope 注入

```typescript
const scope = await resolvePermission(userId, 'placement');
if (scope.kind === 'none') return [];
if (scope.kind === 'all') {/* 全表 */}
if (scope.kind === 'team') {/* WHERE attributed_user IN (team) */}
if (scope.kind === 'self') {/* WHERE attributed_user = userId */}
```

按 Phase 1 三层权限（admin override / dept_leader / team），自动覆盖。

---

## 12. 上线步骤

```
Step 1: migration 0024（3 张新表 + 索引）           5 min
Step 2: 模块代码上线（不开 UI 入口）                 1 day
Step 3: 单元测试 + integration 测试通过             ────
Step 4: PRO3 历史迁移 dry-run                        30 min
Step 5: review dry-run 报告 → --execute 真迁         1 hour
Step 6: 灰度：admin 先看 /placements 跑 1-2 天      2 days
Step 7: 邀请 1 主管 + 1 运营测试                    2 days
Step 8: 通过 → 开放给所有直播一部主管 + 运营        ────
Step 9: 通知运营每天 Excel 切到 qjhy-pro            ────
Step 10: 1 周后 PRO3 投放板块停用                   ────

工期估：8-10 工作日（含历史迁移 + 灰度）
```

---

## 13. 监控

| 监控项 | 阈值 | 通知 |
|---|---|---|
| 归因 job 失败率 | > 1% / 24h | 钉钉机器人「报错」 |
| dirty 行积压 | > 1w 行（cron 跑完仍剩）| 钉钉机器人 |
| 上传 batch 失败 | 任何一次 | 上传者钉钉 + admin |
| placement_row 总行数 | 同比上周 ±50% | 周报 |

钉钉机器人复用 `src/lib/dingtalk/notifier.ts`（Phase 1 已有）。

---

## 14. 配套文档

- `docs/ops/placement-upload-guide.md` — 运营操作手册（导出 / 上传 / 处理未匹配 / 加 override）
- `docs/dev/placement-attribution-algorithm.md` — 开发笔记（归因算法 / 时段判定 / 跨天处理）
- 本 spec：`docs/superpowers/specs/2026-05-06-phase-2-2-placement-migration-design.md`
- Phase 2.2 plan（待写）：`docs/superpowers/plans/2026-05-06-phase-2-2-placement-migration.md`

---

## 15. Open questions

无。所有关键决策已与用户对齐（详见 §1.4 决策记录）。

---

## 附录 A：Phase 2.2 module key 与 Phase 1 兼容

新增 `placement` module key 不破坏现有权限系统。`auth_permission_override` 和 `role_default_permission` 表都按 module 维度独立行，不需要改 schema。

## 附录 B：与 Phase 2.1 的衔接点

- `live_account.placement_label`（Phase 2.1 已建）→ 是 Excel `账户名称` 的归宿
- `account_anchor_default`（Phase 2.1 已建）→ 归因 default schedule 数据来源
- `live_anchor` join `dingtalk_user`（Phase 2.1 已建）→ B 视角看板主播信息
- `name-matcher.ts`（Phase 2.1 已写）→ 不被 Phase 2.2 复用（精确匹配 placement_label，不 fuzzy）

## 附录 C：Phase 2.3 衔接预留

- `placement_row.attributed_dingtalk_user_id` 与 Phase 2.3 的「主播综合效能」共用 anchor 维度
- 投放消耗 + 直播流水 = ROI 计算 = 主播综合效能页核心 KPI
- Phase 2.3 不需要改 Phase 2.2 schema
