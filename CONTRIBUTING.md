# 贡献指南 (CONTRIBUTING)

> **本文档是 QJHY-Pro 的"宪法"**——任何提交（人或 AI）必须先读完此文档。
> 违反此规范的代码会被 ESLint / TypeScript / pre-commit hook 拒绝。

参考设计文档：[`docs/superpowers/specs/2026-04-30-qjhy-pro-design.md`](./docs/superpowers/specs/2026-04-30-qjhy-pro-design.md)

## 1. 命名规范

- 文件名：`kebab-case`（`anchor-profile.ts`）
- 变量/函数：`camelCase`
- 类/类型/接口：`PascalCase`
- 常量：`SCREAMING_SNAKE_CASE`
- 数据库表/列：`snake_case`
- 错误码：`SCREAMING_SNAKE_CASE` 格式 `{MODULE}_{TYPE}_{REASON}`，例：`ANCHOR_NOT_FOUND`

## 2. 文件结构规则

- **一个业务功能 = 一个 `src/modules/[feature]/` 文件夹**
- 每个模块**必须**有 `index.ts` 暴露公开 API
- 模块之间**只能** `import` 对方的 `index.ts`（ESLint 强制）
- **不允许**在 `src/app/` 里直接写业务逻辑（仅用作页面/路由）

## 3. TypeScript / Zod 规则

- TypeScript strict mode 必开（已配）
- **严禁** `any`（除非有 `// eslint-disable-next-line` + 详细理由）
- 所有 Server Action / Route Handler 必须以 `Schema.parse(input)` 开头
- TypeScript 类型从 Zod 推导（`z.infer`），**不重复定义类型**

## 4. 数据库 / Migration 规则

- 任何 schema 改动必须走 Drizzle migration（`pnpm db:generate` + `pnpm db:migrate`）
- **事实数据表必须有 `raw: jsonb` 字段**（爬虫表强制）
- **落库时严禁字段重命名、翻译、换算**（屎山防护核心）
- 数据查询必须经过 `applyScopeFilter`（除明确的管理员接口）

## 5. 错误处理规则

- **不允许** `throw new Error(...)`，必须 `throw new AppError(code, message, httpStatus)`
- 错误码格式 `{MODULE}_{TYPE}_{REASON}`
- 关键错误必须发钉钉机器人通知（含"报错"关键词）

## 6. Git / Commit 规则

- Conventional Commits（已用 commitlint 强制）
- 一个 commit 一个目的，**不混合修改**
- **严禁** `git commit --no-verify` 绕过 pre-commit hook
- **严禁**把 secret（token / 密码 / webhook）写进代码或 commit

## 7. 加新功能的标准动作

```bash
# 1. 创建模块
mkdir src/modules/[feature]

# 2. 标准文件
src/modules/[feature]/
├── schema.ts        # Zod 规则（必有）
├── actions.ts       # Server Actions
├── components/      # 前端组件
├── index.ts         # 对外 export（必有）
└── README.md        # 模块说明

# 3. 数据库 migration（如果有新表）
src/db/schema/[feature].ts
pnpm db:generate
pnpm db:migrate

# 4. 在导航/路由加入口
src/app/(dashboard)/[feature]/page.tsx

# 5. 在本文件第 8 节 "已注册模块" 加一行
```

## 8. 已注册模块清单

| 模块             | 路径                         | 简介                                            | 注册时间                |
| ---------------- | ---------------------------- | ----------------------------------------------- | ----------------------- |
| _基础设施_（非业务模块） | `src/lib/*`、`src/worker/*` | env、auth、errors、notify、worker scheduler | Phase 0 (2026-04-30) |
| permissions | `src/modules/permissions/` | 三层叠加权限计算 + Server Actions + ScopeFilter | Phase 1 (2026-05-01) |
| anchors | `src/modules/anchors/` | 主播档案查询（按权限过滤）| Phase 2 (2026-05-02) |
| brokers | `src/modules/brokers/` | 经纪人 ↔ 钉钉用户映射 + fuzzy matcher | Phase 2 (2026-05-02) |
| crawler | `src/modules/crawler/` | 抖音爬虫 + 队列 + Cookie | Phase 2 (2026-05-02) |
| dashboard | `src/modules/dashboard/` | 看板聚合查询 | Phase 2 (2026-05-02) |
| live-room | `src/modules/live-room/` | 线下物理直播间（B17/A20）CRUD | Phase 2.1 (2026-05-06) |
| live-account | `src/modules/live-account/` | 跨平台直播账号 + PRO3 迁移工具 + 姓名 fuzzy match + 时段命中算法 | Phase 2.1 (2026-05-06) |
| live-anchor | `src/modules/live-anchor/` | 主播业务扩展（钉钉用户的主播身份）+ N:M 默认排班关联 | Phase 2.1 (2026-05-06) |
| placement | `src/modules/placement/` | 投放数据 ingest + 看板（小时聚合 / 增量累计切换 / 5 列分配）| Phase 2.2 (2026-05-06) |
| placement-attribution | `src/modules/placement-attribution/` | 排班 ↔ 投放 attribution 兜底 cron + dirty mark | Phase 2.2 (2026-05-06) |
| schedule-override | `src/modules/schedule-override/` | 排班 override（个人+部门）+ audit | Phase 2.2 (2026-05-06) |
| column-presets | `src/modules/column-presets/` | 用户列偏好（per-platform）| Phase 2.2 |
| aliases | `src/modules/aliases/` | 字段别名（中文显示名）| Phase 2.2 |
| checkin | `src/modules/checkin/` | 主播开播打卡 + 5 列归因 + 强制下播 + 礼物 trend | Phase 2.2 (2026-05-15) |
| invite-codes | `src/modules/invite-codes/` | 邀请码注册 + 委托视图 | Phase 2.4 |
| product-config | `src/modules/product-config/` | 产品分类配置（display_short / category）| Phase 3.0 |
| editing-task | `src/modules/editing-task/` | 剪辑任务状态机 + 事件流 + 扣分 | Phase 3.0 (2026-05-26) |
| editing-editor | `src/modules/editing-editor/` | 剪辑师视图 + 工作量统计 | Phase 3.0 |
| editing-storage | `src/modules/editing-storage/` | NAS 文件存储健康检查 + 上传/下载 | Phase 3.0 |

> 每加一个业务模块，PR 里必须更新此表 + 在 `eslint.config.mjs` 加 zone。

## 9. Code Review 检查清单

- [ ] 新增功能是否在 `src/modules/[feature]/`？
- [ ] 是否所有 Server Action 都 `Schema.parse()`？
- [ ] 是否有跨模块 import 内部文件？（ESLint 已挡）
- [ ] 是否有 `any` / `as any` 偷懒？
- [ ] 数据查询是否经过 `applyScopeFilter`？
- [ ] 错误是否用 `AppError`？
- [ ] commit message 是否规范？

## 10. 严禁事项（MUST NOT）

| 严禁                             | 后果                       |
| -------------------------------- | -------------------------- |
| `throw new Error()`              | 用 AppError 替代           |
| 跨模块 import 内部文件           | ESLint 报错                |
| 落库前翻译字段                   | 整个项目的核心反模式       |
| 在数据库 schema 改字段名为中文   | 用 field_alias 配置        |
| `--no-verify` 绕过 hook          | 一旦发现，要求重写 commit  |
| 把 token/密码写进代码            | 用 `.env`                  |
| `as any` 偷懒                    | 加 Zod 校验                |

## 11. UI patterns（业务页面配方 · 强制使用）

为防止"切换一个板块好像全换了一样"的视觉漂移，所有数据看板页面必须用以下 3 个 pattern。
**禁止自己写筛选行 / chip / KPI 卡的 className**。

```
src/components/ui/        ← 原子（shadcn Input/Button/Select 等）
src/components/patterns/  ← 业务配方（DataToolbar/PresetToolbar/KpiGrid）
```

| Pattern              | 用途                                                       | 替代                                              |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `<DataToolbar>`      | 顶部「筛选 + 操作」行（filters slot + actions slot）       | 禁止写 `flex justify-between` 自拼                |
| `<PresetToolbar>`    | 「预设 / 筛选 chip」行（含 `<PresetToolbar.Divider/>`）    | 禁止写 `flex flex-wrap items-center gap-1.5` 自拼 |
| `<PresetChip>`       | 单个预设 chip（active 实心蓝 / inactive 描边）             | 禁止写 `rounded-full + border + px-2.5` 自拼      |
| `<PresetChipCount>`  | chip 内的小数字徽章                                        | 禁止写 `rounded px-1 text-[10px]` 自拼            |
| `<KpiGrid>`          | KPI 卡片网格，items 配置式（label/value/footer/onRemove）  | 禁止写 `grid grid-cols-* gap-3` + `kpi-value` 自拼 |

**新数据板块开工示例**：

```tsx
<DataToolbar
  filters={<><DateRange /><PresetButtons /><Search /></>}
  actions={<><CompareToggle /><ExportButton /><Button>自定义列</Button></>}
/>

<PresetToolbar label="预设:">
  <PresetChip active>捕鱼<PresetChipCount active>84</PresetChipCount></PresetChip>
  <PresetChip>UE4</PresetChip>
  <PresetToolbar.Divider />
  <PresetChip>主播汇总</PresetChip>
</PresetToolbar>

<KpiGrid items={[
  { key: "cost", label: "消耗", value: "20.64万", footer: <Footer ... /> },
  // ...
]} />
```

**页面外壳同样统一**（每个 page 或 layout 顶层）：

```tsx
<div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
  <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
    <span className="mr-2 px-3 py-1.5 text-sm font-semibold text-slate-700">
      板块名
    </span>
    {/* 可选 NavLink */}
  </div>
  {/* 内容 */}
</div>
```

## 12. 钉钉机器人 webhook

- 配置在 `.env` 文件：`DINGTALK_BOT_WEBHOOK=...`
- 关键词："报错"
- 严禁把真实 token 写进任何代码、文档、commit
