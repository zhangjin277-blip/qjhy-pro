# 主播明细 AnchorTable 通用化重构 — Handoff

> **目标**：抖音 / 快手两个 tab 100% 同款 UI 与交互。当前两份独立代码（AnchorTable + KuaishouAnchorTable），未来共用 `<GenericAnchorTable platformConfig>`。
>
> **进度**：Phase A 已 commit (`ColumnCustomizer` 通用化)，Phase B 已 commit (today/history 数据源切换)。剩 Phase C/D。

## 已完成（不要再做）

### Phase A — ColumnCustomizer 通用化（commit 已合）
- `column-presets.ts:12` `ColumnDef<TKey extends string = ...>` 加 generic
- `column-customizer.tsx` 整体改成 `<TKey extends string>`，接受 4 个 props（带默认值兼容抖音）：
  - `allColumns?` / `groups?` / `getColumnsByGroup?` / `getColumnsBySubGroup?`
- 新建 `kuaishou-column-presets.ts`：28 列 + 8 分组（基础/公会信息/直播表现/流量/涨粉/互动/送礼/违规）
- KuaishouAnchorTable 删除 popover，用 `<ColumnCustomizer<KuaishouColKey>>` dialog

### Phase B — today/history 切换（commit 已合）
- `kuaishou-queries.ts:dateRangeToMs` 加 `dataSource: 'all'|'today'|'history'` 过滤
- `/api/anchors-kuaishou` 接受 `data_source` query param
- KuaishouAnchorTable 新增 PresetToolbar "数据:" chip 行（全部 / 历史权威 / 今日实时）+ URL 同步

## 待做

### Phase C — 用户预设保存到 DB（让快手也能"保存为预设"）

**抖音现状**：
- `column_preset` 表 (schema 在 `src/db/schema/column-preset.ts` 或类似)
- `/api/column-presets` GET/POST/DELETE
- AnchorTable 内有 `userPresets` state、`applyUserPreset` / `deleteUserPreset` / `pendingSaveColumns`
- ColumnCustomizer 接 `onUpdatePreset` / `onSaveAsNewPreset` 回调

**做法**：
1. **Migration 0035**: `column_preset` 表加 `platform text NOT NULL DEFAULT 'douyin'`，索引改 `(user_id, platform)`
2. `/api/column-presets` GET 接受 `?platform=` filter，POST 写入 platform
3. KuaishouAnchorTable 复制抖音的预设状态机（`useState<UserColumnPreset[]>` 等）
4. KuaishouAnchorTable 传 `onUpdatePreset` / `onSaveAsNewPreset` 给 ColumnCustomizer

**风险**：抖音和快手的 ColKey 类型不兼容（不同字面量集合），column_preset.columns 字段是 `string[]`，抖音/快手各自用不同字面量，runtime OK，type-system 需要 cast。

### Phase D — AnchorTable 整体 generic 化（删除 KuaishouAnchorTable）

**现状**：
- `anchor-table.tsx` (1027 行) 抖音 specific
- `kuaishou-anchor-table.tsx` (1000+ 行) 快手 specific（重复了 70% 逻辑）

**目标**：
```tsx
<GenericAnchorTable<TConfig>
  platformConfig={{
    apiEndpoint: string,
    allColumns: ColumnDef<TKey>[],
    groups: string[],
    presets: { id, label, keys }[],
    defaultColumns: TKey[],
    defaultKpiKeys: TKey[],
    DrawerComponent: ComponentType<{ row, onClose }>,
    rowSchema: ZodSchema, // 用于 fetch 后的 type-narrow
    fmtRowCell: (col, row) => ReactNode, // 各 platform 自定义 cell 渲染
  }}
/>
```

**实施步骤**（推荐顺序）：

1. **抽 platform-config 类型** (`platform-config.ts`)
   ```ts
   export interface PlatformConfig<TKey extends string, TRow> {
     id: 'douyin' | 'kuaishou';
     apiEndpoint: string;
     allColumns: ColumnDef<TKey>[];
     groups: string[];
     getColumnsByGroup: (g: string) => ColumnDef<TKey>[];
     getColumnsBySubGroup: (g: string) => { subGroup: string|null; columns: ColumnDef<TKey>[] }[];
     defaultColumns: TKey[];
     defaultKpiKeys: TKey[];
     presets: { id: string; label: string; keys: TKey[] }[];
     DrawerComponent: ComponentType<{ row: TRow | null; onOpenChange: (v: boolean) => void }>;
     // platform-specific fetch + URL params 转换
     buildApiParams: (filters: GenericFilters) => URLSearchParams;
     parseApiResponse: (json: unknown) => { rows: TRow[]; kpi: GenericKpi };
     // cell 渲染：fmt 不够时由 platform 决定
     renderCell?: (col: ColumnDef<TKey>, row: TRow) => ReactNode;
   }
   ```

2. **新建 douyin-config.ts / kuaishou-config.ts** 各自实现 PlatformConfig

3. **抽 GenericAnchorTable** — 把 anchor-table.tsx 改成接受 platformConfig prop。难点：
   - sortKey 从 `keyof AnchorListRow` 改成 `TKey`
   - aggregate / formatCompare 等用 fmt 自动判断
   - URL params (`date_from/to/project/search`) 是抖音-specific 命名 — 让 buildApiParams 自定义
   - PINNED_COLUMNS — 抖音是 nick_name+project，快手是 account_name+product（platform-specific）

4. **删除 KuaishouAnchorTable** + 更新 anchors-board.tsx：
   ```tsx
   const config = platform === 'douyin' ? douyinConfig : kuaishouConfig;
   return <GenericAnchorTable platformConfig={config} />;
   ```

5. **回归测试**两个 tab 完全一致 + KPI Picker 也通用化

**预估工作量**：4-6 小时（包含调试）。

## 关键文件 + 行号速查

- `src/app/(dashboard)/anchors/_components/anchor-table.tsx`（抖音版，1027 行）
- `src/app/(dashboard)/anchors/_components/kuaishou-anchor-table.tsx`（快手版，~1000 行）
- `src/app/(dashboard)/anchors/_components/column-customizer.tsx`（已通用化，275 行）
- `src/app/(dashboard)/anchors/_components/kpi-picker.tsx`（KPI 选择 dialog，待通用化）
- `src/app/(dashboard)/anchors/_components/filters.tsx`（顶部过滤器，已透明底，待 project 参数化）
- `src/app/(dashboard)/anchors/_components/column-presets.ts`（抖音列定义 1207 行 + ColumnDef generic 接口）
- `src/app/(dashboard)/anchors/_components/kuaishou-column-presets.ts`（快手列定义，新建）
- `src/modules/anchors/kuaishou-queries.ts`（含 dataSource 过滤）
- `src/app/api/anchors-kuaishou/route.ts`（含 data_source 参数）
- `src/app/api/column-presets/route.ts`（用户预设 CRUD）

## 已知坑

1. **chrome-devtools MCP 频繁断开** — 用户验证时可能要刷新好几次。typecheck 过了基本就 OK。
2. **抖音和快手字段语义不同** — 不能简单 SUM/AVG 通用，每个聚合字段要单独定义 fmt + render。
3. **today / history 数据 dataSource='all' 时**会双计 — 同一场直播在 today 和 history 各有一行（虽然 today 同步会 skip 已 history 的，但旧数据可能有重叠）。建议默认 dataSource='history'。

## 测试 checklist（Phase D 完成后）

- [ ] 抖音 tab 所有功能正常（日期/项目/搜索/列勾选/同比/预设/CSV 导出/KPI picker/抽屉）
- [ ] 快手 tab 所有功能正常（同上）
- [ ] 两个 tab 视觉/交互完全一致（同款 toolbar / 同款 KPI / 同款 dialog）
- [ ] URL 参数同步（刷新保留 filter）
- [ ] localStorage 用户预设跨设备不冲突（platform 区分）
