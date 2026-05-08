# 主播明细 AnchorTable 通用化重构 — Handoff

> **目标**：抖音 / 快手两个 tab 100% 同款 UI 与交互。共用 `<GenericAnchorTable platformConfig>`。
>
> **当前进度**：Phase A/B/D 全部完成。Phase D 含 D-1/D-2/D-3 + 抽屉对齐。Phase C（DB 用户预设）未做。

## 已完成

### Phase A — ColumnCustomizer 通用化（commit 已合）
- `column-presets.ts:12` `ColumnDef<TKey extends string = ...>` 加 generic
- `column-customizer.tsx` 整体改成 `<TKey extends string>`，接 `allColumns?` / `groups?` / `groupSections?` / `getColumnsByGroup?` / `getColumnsBySubGroup?`

### Phase B — today/history 切换（commit 已合）
- `kuaishou-queries.ts:dateRangeToMs` 加 `dataSource: 'all'|'today'|'history'` 过滤
- `/api/anchors-kuaishou` 接 `data_source` query param

### Phase D — GenericAnchorTable 抽取（commit a83f393）
- 新增 `platform-config.ts` / `douyin-config.tsx` / `kuaishou-config.tsx` / `generic-anchor-table.tsx`
- 删除 `anchor-table.tsx` (1027) + `kuaishou-anchor-table.tsx` (1118) + `csv-export.tsx` (60)，共减 2221 行
- 切 platform 用 `key={platform}` 强制 React unmount + remount，重置全部 state（commit 6f0e420）

### D-1 快手字段扩展（commit 31ece21 + b45d3ec hotfix + a6f3dec 删推广）
- 字段从 25 → ~44（删推广 8 后）
- queries.ts SQL 子查询 + KS_COLUMNS + KuaishouRow + renderCell 全同步
- DISTINCT ON 拿最新一场 today_extra 9 字段（画像/分级/状态）
- 推广 8 字段全删（业务不需要）：sync today_extra 不写入 / queries / UI / dataSourceColumnPresets
- fans_male_rate / author_ratio 单位 0-100 范围 → SQL /100 转 0-1
- valid_play_duration_avg_ms 删（schema 无此字段）

### D-2 customizer 分组（commit 738c5be）
- 最终方案：与抖音一致 — 左栏 9 个业务 group 平铺（公会信息/直播表现/流量/涨粉/互动/送礼/违规/画像与状态）
- ColumnCustomizer 支持 `groupSections?` 两层分组（preserved，未来其他 platform 可用）

### D-3 dataSource chip 联动列集（commit 373e271）
- PlatformConfig 加 `dataSourceColumnPresets: { all/today/history: TKey[] }`
- 切 chip 同步覆盖 visibleKeys（不持久化）
- 快手三档预设：all 默认 7 列 / today 互动+送礼+画像 14 列 / history 流量+涨粉+互动+送礼 17 列

### 抽屉对齐（commit d40255c）
- 快手抽屉接 `visibleColumns` + `kpiColumns` props
- KPI 卡片用 kpiColumns（fallback 前 6 chartable）
- 趋势图按选中 KPI 动态切换
- 单场列表跟随主表 visibleColumns
- `listKuaishouLiveSessions` 改 raw SQL 把 schema 字段名 alias 成主表 ColKey（`live_amt → total_amt` 等）
- 删自带 COLUMNS / loadCols/saveCols / 列设置 popover

### 杂项
- `PAGE_SIZES` 加 15 / 快手默认 15 条/页（commit a5ec6dc）

## 待做 — Phase C

### 用户预设保存到 DB（让快手也开"保存为预设"）

**抖音现状**：
- `column_preset` 表（在 `src/db/schema/`）
- `/api/column-presets` GET/POST/PUT/DELETE
- GenericAnchorTable 已实现 `userPresets` state、CRUD 函数（受 `userPresetsEnabled` 控制）
- 抖音 `userPresetsEnabled=true`，快手 `userPresetsEnabled=false`

**做法**：
1. Migration: `column_preset` 表加 `platform text NOT NULL DEFAULT 'douyin'`，索引改 `(user_id, platform, name)`
2. `/api/column-presets` GET 接 `?platform=` filter；POST 入参带 `platform`
3. GenericAnchorTable 的 fetch/save/update 都加 `platform=config.id`
4. 快手 config 改 `userPresetsEnabled=true`
5. UserColumnPreset.project 字段 — 抖音用 `'all'|'ddz'|'three'`，快手用 product 名（"捕鱼大作战" 等）。需让 project 字段类型放宽成 string，或加 platform-specific column

**风险**：
- 抖音和快手的 ColKey 类型不兼容（不同字面量集合），`column_preset.columns` 字段是 `string[]`，runtime OK，type-system 需要 generic cast
- UserColumnPreset.project enum 太严格，需放宽

## 关键文件

- `src/app/(dashboard)/anchors/_components/platform-config.ts` — PlatformConfig 接口
- `src/app/(dashboard)/anchors/_components/generic-anchor-table.tsx` — 通用 table 主组件
- `src/app/(dashboard)/anchors/_components/douyin-config.tsx` — 抖音配置
- `src/app/(dashboard)/anchors/_components/kuaishou-config.tsx` — 快手配置
- `src/app/(dashboard)/anchors/_components/column-customizer.tsx` — 三栏自定义列
- `src/app/(dashboard)/anchors/_components/anchor-detail-drawer.tsx` — 抖音抽屉
- `src/app/(dashboard)/anchors/_components/kuaishou-anchor-detail-drawer.tsx` — 快手抽屉
- `src/modules/anchors/kuaishou-queries.ts` — 快手 SQL（主表聚合 + 单场 raw SQL）
- `src/app/api/column-presets/route.ts` — 用户预设 CRUD
- `src/db/schema/column-preset.ts` — 用户预设表 schema

## 已知坑

1. **chrome-devtools MCP 频繁断开** — typecheck 过基本就 OK
2. **抖音和快手字段语义不同** — 各 platform 单独定义聚合 + render
3. ~~**dataSource='all' 双计**~~ — 已确认不存在。同 live_stream_id 是 primary key，sync-history UPSERT 覆盖同行，data_source 字段从 'today' 改为 'history'，不会双计

## 后续可优化

- **GenericAnchorDrawer 抽取**（不急）— 抖音/快手抽屉粒度不同（按日 vs 按场），统一成本约 500-800 行。等第三个 platform 出现再抽
- **快手抽屉的同步 today_extra 画像**（每场显示该场画像而非"最新一场"）
- **fans_male_rate / author_ratio / settle_in_time 单位实测**
