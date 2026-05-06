# Phase 2.1 Spec：直播账号 + 主播 + 默认排班 主数据（跨平台）

> 起草日期：2026-05-06
> 上一阶段：Phase 1 完成（v0.2.0-phase1，钉钉同步 + 三层权限）
> 上下游：本 spec 是 Phase 2.2（投放迁移 + 排班 override）和 Phase 2.3（快手 API + 主播效能）的**地基**
> brainstorming 全过程：本对话已完成，未单独存档

---

## 1. 目标与范围

### 1.1 业务目标

为 PRO3 老中台的「捕鱼投放」+「主播信息」+「直播排班」三个模块在新中台搭好地基，建立**直播业务**的跨平台主数据：

- **直播账号** `live_account`（PRO3 53 行，跨抖音 + 快手 6 个产品）— 第一公民
- **主播身份** `live_anchor`（约 50 人，钉钉用户的"主播角色"扩展）
- **直播间** `live_room`（B17/A20/B 区-09 这种线下物理空间编号）
- **默认排班** `account_anchor_default`（主播 ↔ 账号 N:M 关联 + 默认时段 + 休息日）

### 1.2 后续 Phase 衔接

| Phase | 范围 | 依赖本 Phase 的 |
|---|---|---|
| **2.2** | 投放迁移 + 排班 override + 投放主播效能 | `live_account.placement_label` + `account_anchor_default` 排班归因 |
| **2.3** | 快手 API + 直播 session 数据 + 主播综合效能页 | `live_account.platform_uid` + 排班归因 |

### 1.3 不在范围内（明确砍掉的）

- ❌ 抖音 `anchor_profile` 加 `dingtalk_user_id` 字段——Phase 2.1 ALTER TABLE 加列但不做手动绑定 UI（运营暂不需要绑）
- ❌ 投放数据迁移（属于 2.2）
- ❌ 快手 API 爬虫（属于 2.3）
- ❌ 排班 override（属于 2.2，2.1 只录默认排班）
- ❌ 排班视图（按时段聚合数据展示，属于 2.2）
- ❌ 主播音浪/消耗/激活手填功能——排班只管"谁在播"，业绩数据由各自数据源（API/Excel）自动填充
- ❌ 审批流（PRO3 有，新中台不要）
- ❌ 主播档案的非主数据字段（人设、培训、考核、试岗节点）——这些跟 Phase 2.1 的"主数据建设"目标不一致，留待后续

### 1.4 跨平台范围（已决策为 C）

PRO3 主播信息表跨平台：

| 业务/产品 | 平台 | 行数 |
|---|---|---|
| 途游斗地主 | 抖音 | 26 |
| 富豪麻将 | 抖音 | 0 |
| 三国冰河时代 | 抖音 | 11 |
| 捕鱼大作战 | 快手 | 9 |
| 途游休闲捕鱼 | 快手 | 3 |
| 电玩捕鱼 | 快手 | 2 |
| **合计** | — | **51（PRO3 实际数据库 53 行，截图显示 54）** |

抖音 26+11=37 行已经在 `anchor_profile` 表里有平台画像（爬虫维护），但**公司内部维护字段**（绑定手机/手机编号/直播间/排班/运营/游戏账号）只在 PRO3 这张表里。

**已决策方向 C**：表命名跨平台（`live_account` 而非 `ks_account`），加 `platform` 字段（'快手' / '抖音' / 'B 站' / '视频号'），迁全部 53 行。

`live_account` 与 `anchor_profile` 关系：
- `anchor_profile` 是**抖音平台爬虫数据**（每天 02:00 全量同步覆盖）
- `live_account` 是**公司维护账号档案**（运营手维护，永不被覆盖）
- 抖音账号同时在两表有行，通过 `live_account.platform_account_id == anchor_profile.aweme_display_id` 反向 join（不强制 FK，因为 PRO3 数据可能不规范）
- 快手账号只在 `live_account` 有行（无平台数据）

---

## 2. 核心实体模型

### 2.1 实体关系总览

```
dingtalk_user (Phase 1 已有，钉钉同步覆盖，146 人)
        ↓ 1:0/1
live_anchor (主播业务扩展，新建，约 50 行)
        ↓ 1:N
account_anchor_default (默认排班关联表)
        ↑ N:1
live_account (直播账号，新建，53 个，跨平台)
        ↑ N:1
live_room (直播间，新建)

anchor_profile (Phase 0 已有抖音号画像)
  + dingtalk_user_id (FK, nullable, ALTER TABLE 加列，不做 UI)
```

**关系语义**：

- 1 个 `dingtalk_user` ↔ 0/1 个 `live_anchor`（不是所有钉钉用户都是主播）
- 1 个 `live_anchor` ↔ N 个 `live_account`（一个真人可有多账号，如邓明星 2 个）
- 1 个 `live_account` ↔ N 个 `live_anchor`（一个账号可多人轮播，如捕鱼"小美-捕鱼大作战"4 主播）
- 中间表 `account_anchor_default` 承载 N:M + 排班属性
- 1 个 `live_account` ↔ 1 个 `live_room`（一个账号绑定一个物理直播间）

### 2.2 表 schema

#### `live_room` — 线下直播间

```sql
CREATE TABLE live_room (
  id            text PRIMARY KEY,
  room_no       text NOT NULL UNIQUE,    -- 'B17' / 'A20' / 'B区-09'
  location      text,                     -- 楼层/区域
  status        text NOT NULL DEFAULT 'active',  -- active/inactive
  raw           jsonb NOT NULL DEFAULT '{}',
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now()
);
```

#### `live_account` — 直播账号（核心维度表，跨平台）

```sql
CREATE TABLE live_account (
  id                       text PRIMARY KEY,         -- 业务主键，UUID
  account_name             text NOT NULL,            -- "三国冰河时代-财神"
  platform                 text NOT NULL,            -- '抖音' / '快手' / 'B站' / '视频号'
  platform_account_id      text,                     -- 平台展示号：抖音号/快手号
  platform_uid             text,                     -- 平台唯一 UID
  platform_real_name       text,                     -- 平台实名认证名字

  phone                    text,                     -- 绑定手机号
  phone_index              text,                     -- 公司资产编号 'SJ-250421-011'
  phone_real_name          text,                     -- 手机卡实名

  room_id                  text REFERENCES live_room(id),
  game_account_1           text,                     -- 游戏账号（捕鱼用 1，斗地主用 1-3）
  game_account_2           text,
  game_account_3           text,
  product                  text NOT NULL,            -- '捕鱼大作战' / '三国冰河时代' / '途游斗地主' / ...

  agent_dingtalk_user_id   text REFERENCES dingtalk_user(user_id),  -- 运营

  placement_label          text UNIQUE,              -- 投放标签 1:1（Phase 2.2 用）
  live_status              text NOT NULL DEFAULT 'unknown',  -- 直播中/未开播/封禁/未知（2.3 接 API 自动）

  raw                      jsonb NOT NULL DEFAULT '{}',
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now(),

  UNIQUE(platform, platform_uid)
);

CREATE INDEX idx_live_account_platform ON live_account(platform);
CREATE INDEX idx_live_account_product ON live_account(product);
CREATE INDEX idx_live_account_agent ON live_account(agent_dingtalk_user_id);
CREATE INDEX idx_live_account_room ON live_account(room_id);
CREATE INDEX idx_live_account_platform_account_id ON live_account(platform_account_id);
```

**为什么 `(platform, platform_uid)` 联合 UNIQUE 而非 `platform_uid` 单独 UNIQUE**：理论上不同平台的 UID 也可能撞，联合更严谨；同时允许 `platform_uid` 为空（PRO3 历史数据可能缺失）。

#### `live_anchor` — 主播业务扩展

```sql
CREATE TABLE live_anchor (
  dingtalk_user_id     text PRIMARY KEY REFERENCES dingtalk_user(user_id),

  business_line        text NOT NULL,            -- '捕鱼' / '斗地主' / '麻将'
  employment_type      text NOT NULL,            -- '正式' / '合作' / '试播'
  work_status          text NOT NULL DEFAULT 'active',  -- 'active'/'rest'/'leave'

  trial_start_date     date,
  contract_date        date,
  leave_date           date,

  external_name        text,                     -- 钉钉外的合作主播兜底名（dingtalk_user 留 stub 行）

  raw                  jsonb NOT NULL DEFAULT '{}',
  created_at           timestamp NOT NULL DEFAULT now(),
  updated_at           timestamp NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_anchor_business ON live_anchor(business_line);
CREATE INDEX idx_live_anchor_status ON live_anchor(work_status);
```

**关于"非钉钉来源主播"**（合作主播没钉钉账号）：
- 在 `dingtalk_user` 里手动插一行 stub（`source: 'manual'`），分配伪 user_id（`'manual_xxx'`）
- 该 stub 行不会被钉钉同步覆盖（同步逻辑只 upsert 钉钉返回的）
- `live_anchor.external_name` 存外部主播本名以便区分

#### `account_anchor_default` — 默认排班关联表（N:M + 排班）

```sql
CREATE TABLE account_anchor_default (
  id                  text PRIMARY KEY,
  account_id          text NOT NULL REFERENCES live_account(id) ON DELETE CASCADE,
  dingtalk_user_id    text NOT NULL REFERENCES live_anchor(dingtalk_user_id),

  time_slots          jsonb NOT NULL,    -- [["12:00","18:00"], ["20:00","23:00"]]
  rest_days           jsonb NOT NULL DEFAULT '[]',  -- [1,3] 表周一周三休（ISO weekday，1=周一）
  remark              text,

  effective_from      date NOT NULL DEFAULT CURRENT_DATE,
  effective_to        date,              -- null 表"持续生效"
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now(),

  UNIQUE(account_id, dingtalk_user_id, effective_from)
);

CREATE INDEX idx_account_anchor_default_account ON account_anchor_default(account_id);
CREATE INDEX idx_account_anchor_default_anchor ON account_anchor_default(dingtalk_user_id);
CREATE INDEX idx_account_anchor_default_effective ON account_anchor_default(effective_from, effective_to);
```

**为什么有 `effective_from`/`effective_to`**：换班调整不直接 UPDATE 旧排班，而是新建一行（`effective_from = today`），旧的设 `effective_to = today - 1`。便于追溯历史排班，也是 Phase 2.2 排班 override 的基础。

#### `anchor_profile` 改动（Phase 1 已有）

```sql
ALTER TABLE anchor_profile ADD COLUMN dingtalk_user_id text REFERENCES dingtalk_user(user_id);
CREATE INDEX idx_anchor_profile_dingtalk ON anchor_profile(dingtalk_user_id);
```

**只加列，不做手填绑定 UI**。该字段保留 nullable，后续真有抖音号 → 真人绑定需求时再做 UI。

---

## 3. 关键业务规则

### 3.1 投放标签 1:1 直播账号

- `live_account.placement_label` UNIQUE，每个账号最多绑定一个投放标签
- 一个真人可绑多个直播账号 → 该真人在投放数据中有多个标签出现（如"邓明星 A"/"邓明星 B"）
- 这是 Phase 2.2 投放归因的基础

### 3.2 排班归因路径（Phase 2.2/2.3 用）

```
任意时刻 (date, hour, account_id)
  → 查 account_anchor_default WHERE account_id = ?
       AND effective_from <= date AND (effective_to IS NULL OR effective_to >= date)
  → 过滤 rest_days 不包含 weekday(date) 的行（weekday 用 ISO 标准 1=周一 … 7=周日）
  → 过滤 time_slots 含 hour 的行：任一 [start, end] 满足 start <= hour < end，
       跨日时段（end < start，如 22-3）按"或"逻辑命中：hour >= start OR hour < end
  → 得到当前时段 N 个主播（个播 N=1，轮播 N≥1）
```

Phase 2.2 会加 override 表覆盖默认。

### 3.3 同步覆盖与业务字段隔离

- 钉钉每天 02:00 同步 `dingtalk_user`（覆盖式 upsert）
- 业务字段全部在 `live_anchor` 这个独立表，不会被同步覆盖
- 钉钉用户离职 → `dingtalk_user.active = false`，`live_anchor.work_status` 由运营手动改为 `leave`，**两者不自动联动**（避免误操作）

### 3.4 主播跨业务线

`live_anchor.business_line` 单值（不是数组）。某主播从捕鱼转去斗地主：直接修改字段值（不保留历史）。如未来有主播效能需要按"原业务线"看历史数据，那时再加 `business_line_history: jsonb`。**当前 YAGNI**。

### 3.5 抖音账号与 `anchor_profile` 关系

- `live_account.platform = '抖音'` 的行，应当能与 `anchor_profile` 一一对应
- 关联键：`live_account.platform_account_id ↔ anchor_profile.aweme_display_id`（PRO3 历史数据可能不全，**不强制 FK**）
- 业务后续可加报表："`live_account` 是抖音但在 `anchor_profile` 找不到画像"的清单 — 暴露脏数据
- 快手账号在 `anchor_profile` 没有对应行（因为 anchor_profile 是抖音爬虫专属），这是已知设计

---

## 4. 模块结构（feature-first）

按 qjhy-pro 既有规范（CLAUDE.md），新建以下模块：

```
src/modules/
├── live-room/
│   ├── index.ts          (client-safe: types, schemas, server actions)
│   ├── server.ts         ('server-only' tripwire, DB 读写)
│   ├── queries.ts
│   ├── actions.ts
│   ├── schema.ts         (Zod)
│   └── types.ts
├── live-account/
│   ├── index.ts / server.ts / queries.ts / actions.ts / schema.ts / types.ts
│   ├── migration.ts      (PRO3 → qjhy-pro 迁移工具)
│   └── name-matcher.ts   (姓名 fuzzy match 工具)
└── live-anchor/
    ├── index.ts / server.ts / queries.ts / actions.ts / schema.ts / types.ts
    └── account-bindings.ts  (默认排班 CRUD，挂在 live-anchor 下)
```

**设计原则（来自 CLAUDE.md）**：
- `index.ts` 只导 client-safe（types/schemas/server actions）
- `server.ts` 加 `import "server-only"` tripwire
- DB schema 文件统一放 `src/db/schema/`，按 feature 拆文件：`live-room.ts` / `live-account.ts` / `live-anchor.ts`

---

## 5. 关键 UI

### 5.1 主入口：直播账号列表页（A 视角）

路径：`/(dashboard)/live-accounts`

布局参考 PRO3 `AnchorListView`，做几处改良：

- 顶部 tab：按 `product` 分组（捕鱼大作战 / 三国冰河时代 / 途游斗地主 / 富豪麻将 / 途游休闲捕鱼 / 电玩捕鱼）+ "全部"
- 二级筛选：`platform`（抖音 / 快手 / 全部）
- 列：账号信息（含平台 badge）/ 主播（轮播多人时展开）/ 运营 / 业务/产品 / 绑定信息 / 直播间 / 排班概览 / 修改时间 / 操作
- 顶栏：导出 / 导入（CSV）/ 新增账号
- 行级操作：查看 / 编辑 / 删除

### 5.2 账号编辑抽屉

点列表行的"编辑" → 抽屉打开 → 标签页：

1. **基本信息**：账号名、platform（下拉）、platform_account_id、platform_uid、platform_real_name、phone、phone_index、phone_real_name、room（下拉绑 live_room）、product（下拉，仅显示对应平台允许的 product）、agent（下拉绑 dingtalk_user）、game_account_1/2/3、placement_label、live_status
2. **轮播主播**：N 行表格 — 每行（主播下拉绑 live_anchor）+ 时段（多段）+ rest_days + remark；底部"+ 添加主播"

**`platform` 与 `product` 联动校验**：
- 抖音：途游斗地主、富豪麻将、三国冰河时代
- 快手：捕鱼大作战、途游休闲捕鱼、电玩捕鱼
- 选错平台不允许选不匹配的产品

### 5.3 辅助入口：主播档案列表 + 编辑（B 视角）

路径：`/(dashboard)/live-anchors`

- 列：姓名（钉钉头像 + 名）/ 业务线 / 雇佣类型 / 试播日 / 签约日 / 状态 / 修改时间 / 操作
- 顶栏 tab：按 `business_line` 分组
- 编辑抽屉标签页：
  1. **基本信息**：钉钉资料（只读）+ 业务字段（business_line / employment_type / 三个日期 / work_status）
  2. **绑定账号**：列出该主播绑定的所有 live_account（含平台 badge），点击跳转到 5.2 抽屉

### 5.4 只读总览：默认排班矩阵（C 视角）

路径：`/(dashboard)/live-accounts/schedule-overview`

- 纵轴：账号（按 product 分组，含平台 badge）
- 横轴：24 小时时段
- 单元格：当前 default 排班的主播色块
- 点单元格 → 跳到 5.2 抽屉编辑
- **纯只读，不能在矩阵上录入**（避免双向编辑歧义）

### 5.5 路由权限

挂入 Phase 1 的 `module_per_position_permissions`，新增 module key：
- `live_account` / `live_anchor` / `live_room`
- 默认权限：直播部 leader 全权限，运营 read+update 自己负责的账号，HR 只读

---

## 6. PRO3 数据迁移工具

### 6.1 目标

把 PRO3 SQLite 中的 53 行账号数据一次性灌入 qjhy-pro PostgreSQL 的新表，并尽量自动绑定钉钉用户。

### 6.2 数据源

PRO3 SQLite：`/Users/zhangjin/miracle-pro3/server/database.sqlite`

- `business_data WHERE type='accounts'` — **53 行**，账号信息全部在 `content` 列的 JSON 里。字段映射详见 §6.3。**不做平台过滤**（按§1.4 决策 C，迁全部）
- `stream_accounts` 表 — 投放标签 `dataset_anchor_name` 映射（迁到 `live_account.placement_label`）
- `stream_schedules` 表 — Phase 2.1 不迁（属于 override，2.2 处理）

### 6.3 字段映射

| PRO3 `accounts` 字段 | qjhy-pro 落表 + 字段 | 处理 |
|---|---|---|
| `accountName` | `live_account.account_name` | 直存 |
| `platform` | `live_account.platform` | 直存（值已规范化：抖音 / 快手 / Bilibili / 视频号） |
| `platformAccountId` | `live_account.platform_account_id` | 直存 |
| `uid` | `live_account.platform_uid` | 直存 |
| `platformRealName` | `live_account.platform_real_name` | 直存 |
| `phone` | `live_account.phone` | 直存 |
| `phoneIndex` | `live_account.phone_index` | 直存 |
| `phoneRealName` | `live_account.phone_real_name` | 直存 |
| `room` | `live_room` 自动建 + `live_account.room_id` FK | 见 §6.4 |
| `product` | `live_account.product` | 直存 |
| `agent` | `live_account.agent_dingtalk_user_id` | 姓名 fuzzy match 钉钉用户 |
| `gameAccount1/2/3` | `live_account.game_account_1/2/3` | 直存 |
| `status` (PRO3 混合状态) | `live_account.live_status`（"直播中"/"未开播"）+ `live_anchor.work_status`（"离职"/"休"） | 拆分映射 |
| `anchorName` (个播) | `live_anchor` + `account_anchor_default` × 1 | 姓名 match + 关联 |
| `anchorList[]` (轮播) | `live_anchor` × N + `account_anchor_default` × N | 同上批量 |
| `anchorList[].schedules` | `account_anchor_default.time_slots` | 字符串"12:00-18:00"解析为数组 |
| `anchorList[].restDay` | `account_anchor_default.rest_days` | 数字（1-7）转 jsonb |
| `multiAnchor` | — | 丢弃（关联表行数自动反映） |
| 全行原始 JSON | `live_account.raw` | 字段原始性原则 |

| PRO3 `stream_accounts` 字段 | qjhy-pro 落表 + 字段 |
|---|---|
| `name` | 用于 join `live_account.account_name` 反查 |
| `dataset_anchor_name` | `live_account.placement_label` |

### 6.4 live_room 自动建表

- 扫描 `accounts.room` 全部唯一值（"B17"、"A20"、"B 区-09" 等）
- 每个唯一值 → 自动建 `live_room` 一行（`room_no` = 该值，`location` = null）
- 写回 `live_account.room_id` FK
- 空值 / null 不建 room 行

### 6.5 姓名 fuzzy match 算法

输入：PRO3 字符串姓名（如"刘森"、"袁睿"、"何依萌"）
匹配：`dingtalk_user.name` 全表 candidate

**匹配规则**：
1. **完全匹配**（去除空格后）→ 直接绑定
2. **包含匹配**（PRO3 名是钉钉名子串，或反之）→ 写入"待人工确认"队列
3. **拼音首字母匹配**（如"刘森"→"LS"）→ 写入"待人工确认"队列
4. **完全无匹配** → 写入"未匹配"队列

**人工确认 UI**：
- 迁移后页面 `/(dashboard)/live-account-migration`
- 列出"待确认"+"未匹配"两个 section
- 待确认：显示 PRO3 姓名 + 候选钉钉用户列表（含部门 + 头像），运营点击确认或换选
- 未匹配：选项 1️⃣ 人工搜钉钉用户绑定 / 2️⃣ 创建 stub 用户 + `external_name`

### 6.6 迁移命令

CLI（运维工具）：

```bash
pnpm tsx src/scripts/migrate-pro3-accounts.ts \
  --pro3-db /Users/zhangjin/miracle-pro3/server/database.sqlite \
  --dry-run    # 仅输出报告，不写库
```

**输出**：
- 成功创建：53 live_account / X live_room / Y live_anchor / Z account_anchor_default 行
- 平台分布：抖音 N 行 / 快手 M 行
- 待人工确认：N 条
- 未匹配：M 条
- JSON 报告写入 `migration-report-{timestamp}.json`

去掉 `--dry-run` 真正执行。**幂等设计**：再次运行会 update 已存在行而不是重复插入（按 `(platform, platform_uid)` 联合唯一性，缺失时按 `account_name` 兜底）。

---

## 7. 验收标准

### 7.1 功能验收

- [ ] 4 张新表 schema 落地，drizzle migrations 生成
- [ ] `live_account` 列表页能切 product tab + platform 筛选 + CRUD
- [ ] `live_anchor` 列表页能 CRUD + 看绑定账号
- [ ] `live_account` 编辑抽屉支持单/多主播绑定 + 默认排班 + platform/product 联动校验
- [ ] 排班矩阵只读总览能渲染
- [ ] PRO3 迁移工具 dry-run 跑通，输出正确报告
- [ ] PRO3 迁移工具实际执行后 53 个账号入库（含平台分布报告）
- [ ] 姓名 fuzzy match 在测试数据上准确率 ≥ 80%（剩余手工绑）
- [ ] 钉钉每日 02:00 同步不覆盖 `live_anchor` 业务字段

### 7.2 数据验收

- [ ] PRO3 中"小美-捕鱼大作战"的 4 个轮播主播迁移后正确成 4 行 `account_anchor_default`
- [ ] PRO3 中某真人有 2 个账号的，迁移后正确成 2 行（同 `dingtalk_user_id`，不同 `account_id`）
- [ ] 抖音账号迁移后能与 `anchor_profile` 通过 `platform_account_id ↔ aweme_display_id` 反向 join 成功
- [ ] 迁移后能查询「邓明星今天数据」走完§3.2 路径（虽然 placement_row / session_data 还没建，先看到排班归因 SQL 通）

### 7.3 测试覆盖

- [ ] schema migration 能通过 `pnpm test`
- [ ] 姓名 fuzzy match 算法单测：覆盖完全匹配/包含/拼音/无匹配 4 种 case
- [ ] PRO3 迁移工具 unit test：mock SQLite，验证 dry-run 报告正确（含平台分布）
- [ ] `live_account` server action 集成测试：创建/绑定/解绑/platform-product 联动校验

---

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| PRO3 SQLite 中数据不规范（同名不同人、合作主播没钉钉号、UID 缺失） | 迁移工具人工确认 UI；保留 `external_name` 兜底；UNIQUE 退化按 account_name 兜底 |
| 钉钉同步覆盖意外打到 `live_anchor` | 隔离表 + sync job 不动 `live_anchor` 表（代码层面验证） |
| 排班 `time_slots` jsonb 跨日时段（22:00-03:00）渲染异常 | UI 层判断 end < start 时拆为两段；查询层时段命中按"或"逻辑 |
| 多账号轮播主播录入耗时长 | 提供"复制上一个主播配置"+"应用模板"按钮（5.2 抽屉） |
| 抖音账号在 `anchor_profile` 没对应行（PRO3 数据脏） | 迁移报告暴露清单；不强制 FK，UI 上灰色提示"未关联画像" |
| 迁移失败回滚 | 迁移工具用一个事务 wrapping 整个迁移；失败一律 ROLLBACK |

---

## 9. 工期估算

| 任务块 | 估时 |
|---|---|
| 4 张表 schema + drizzle migrations | 0.5 天 |
| 3 个 feature 模块脚手架（按 CLAUDE.md 规范） | 0.5 天 |
| `live_account` 列表 + 编辑抽屉（含轮播 + 默认排班 UI + platform/product 联动） | 2 天 |
| `live_anchor` 列表 + 编辑抽屉 | 0.5 天 |
| 排班矩阵只读总览 | 0.5 天 |
| PRO3 迁移工具（解析 SQLite + 字段映射 + fuzzy match + 报告） | 1.5 天 |
| 姓名匹配人工确认 UI | 0.5 天 |
| 测试覆盖 | 1 天 |
| **合计** | **~7 天** |

工期较 §1.4 选项 A 增加 1 天，主要在 platform 字段、UI 平台筛选/联动校验、抖音 anchor_profile 关联校验、跨平台测试覆盖上。

---

## 10. 附：术语表

| 术语 | 定义 |
|---|---|
| **直播账号** (`live_account`) | 平台上的一个直播间账号，跨抖音/快手/B 站/视频号。有平台 UID、绑定手机、设备编号、所在物理直播间 |
| **平台** (`platform`) | 抖音 / 快手 / B 站 / 视频号 |
| **主播** (`live_anchor`) | 真人员工，在 `dingtalk_user` 上叠加业务属性。一个主播可同时播多个账号（含跨平台） |
| **轮播** | 1 个直播账号有 2+ 主播按时段轮流播（捕鱼业务常态） |
| **个播** | 1 个直播账号只有 1 个主播（斗地主/麻将业务常态） |
| **直播间** (`live_room`) | 物理直播工位，B17/A20 这种线下编号，跨平台共用 |
| **默认排班** | 每周固定的"主播 × 账号 × 时段"组合，运营建账号时录一次 |
| **投放标签** (`placement_label`) | 投放数据 Excel 里"账户名称"提取出的主播代号（"邓明星"/"蓝V"），1:1 映射到一个 `live_account` |
| **业务线** (`business_line`) | 主播所属的业务大类：捕鱼 / 斗地主 / 麻将 |
| **产品** (`product`) | 业务细分：捕鱼大作战 / 三国冰河时代 / 途游斗地主 / ... 挂在账号上 |
| **平台账号画像** (`anchor_profile`) | Phase 0 已有的抖音号画像表，每天爬虫覆盖。仅抖音账号在此有行。与 `live_account` 通过 `platform_account_id` 反向 join |

---

**spec 终点：** 用户 review → writing-plans 写实施计划 → subagent 实施。
