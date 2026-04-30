# 抖音单场数据样本

> 来源：PRO3 项目 `/Users/zhangjin/miracle-pro3/database.sqlite` → `business_data` 表（type=`biz-anchor-live`）
> 采集时间：2026-04-30
> 已脱敏：✅
> ⚠ **重要警告：本样本来自 Excel 导入而非 API 原文，仅供字段语义参考。Phase 1 写真实爬虫后必须重新探查平台 API 响应。**

## 来源说明

PRO3 项目本身没有抖音平台 API 爬虫，数据流如下：

1. 运营每天从**抖音百应后台**「主播-直播数据」页导出 Excel（CSV/XLSX）
2. 前端组件 `src/components/BatchImporter.jsx` 用 `xlsx` 库读 sheet
3. 把每行（key=Excel 表头中文名，value=单元格值）转成 JSON 对象
4. POST 到 `/api/business` → 服务端写到 SQLite `business_data` 表：
   - `type='biz-anchor-live'`（主播单场直播）
   - `data_date=Excel 中"数据日期"`
   - `base='长沙'`（手动选的基地）
   - `content=该行 JSON 字符串`

所以**样本里的字段名是百应后台 Excel 表头的中文翻译**，不是平台 API 原始字段名。

数据规模：长沙基地 `biz-anchor-live` 类型 7.7 万行，全国 9.3 万行。

## 字段清单（基于样本归纳）

| 字段名（Excel 表头中文） | 类型 | 含义 | 是否高频查询 | 备注 |
|---|---|---|---|---|
| `数据日期` | string `YYYY-MM-DD` | 该场数据所属日期 | ✅ | 应 extract 为 `data_date` |
| `昵称` | string | 主播抖音昵称 | ✅ | extract 为 `anchor_nickname`，可变需历史快照 |
| `抖音号` | string \| number | 抖音号（可能纯数字也可能字母） | ✅ | extract 为 `account_id`，类型应统一 string |
| `游戏名称` | string | 直播挂载的游戏名 | ❌ | 业务关键字段，但取值有限可走字典表 |
| `游戏看播人数` | number | 看播 UV | ❌ | raw 即可 |
| `安卓游戏下载完成人数` | number | 当日下载完成 | ❌ | raw 即可 |
| `直播-游戏流水(分成前)` | string `"NNN元"` | **核心 KPI**，但带"元"后缀 | ✅ | extract 为 `gross_revenue_cents` (整数，去"元"×100) |
| `游戏开播场次` | number | 当日开播次数 | ❌ | raw |
| `游戏开播时长` | string \| number | 单位"小时"或纯数字 | ❌ | raw（类型混乱，单位需归一） |
| `场均游戏开播时长` | string \| number | 同上 | ❌ | raw |
| `游戏看播时长` | string `"NNN分钟"` | 单位"分钟" | ❌ | raw |
| `人均游戏看播时长` | string `"N.NN分钟"` | 单位"分钟" | ❌ | raw |
| `ACU` | number | 平均同时在线 | ❌ | raw |
| `PCU` | number | 峰值同时在线 | ❌ | raw |
| `点赞人数` / `关注人数` / `评论人数` | number | 互动数据 | ❌ | raw |
| `点赞率` / `关注率` / `评论率` | string `"N.NN%"` | 百分比，带"%" | ❌ | raw（取消时需 ×100 转 int） |
| `游戏下载点击人数` | number | | ❌ | raw |
| `安卓游戏下载开始/完成人数` | number | | ❌ | raw |
| `游戏活跃用户数` | number | | ❌ | raw |
| `游戏内购付费用户数` | number | 当日付费用户 | ❌ | raw |
| `周` / `月` | number | ISO 周次/月份 | ❌ | 冗余字段，可由 data_date 推 |
| `项目` | string | 业务线（"线上主播"/"三国项目"/...） | ✅ | PRO3 中是核心维度 |
| `负责人` / `负责人员` | string | 主播运营 | ✅ | PRO3 双字段冗余（旧/新命名并存） |

## 真实样本（脱敏后）

```json
{
  "数据日期": "2025-04-16",
  "昵称": "主播A",
  "抖音号": "DEMO_77000000000",
  "游戏名称": "三国：冰河时代",
  "游戏看播人数": 0,
  "安卓游戏下载完成人数": 0,
  "直播-游戏流水(分成前)": "200元",
  "游戏开播场次": 0,
  "游戏开播时长": 0,
  "场均游戏开播时长": 0,
  "安卓游戏安装完成人数": 0,
  "游戏看播时长": "0分钟",
  "人均游戏看播时长": "0分钟",
  "ACU": 0,
  "PCU": 0,
  "点赞人数": 0,
  "关注人数": 0,
  "评论人数": 0,
  "点赞率": 0,
  "关注率": 0,
  "评论率": 0,
  "游戏下载点击人数": 0,
  "安卓游戏下载开始人数": 0,
  "游戏活跃用户数": 10,
  "游戏内购付费用户数": 1,
  "周": 16,
  "月": 4,
  "项目": "三国项目",
  "负责人": "运营X",
  "负责人员": "运营X"
}
```

第二个样本（数据更丰富的场次）：

```json
{
  "数据日期": "2025-02-03",
  "昵称": "主播B",
  "抖音号": "DEMO_77000000000",
  "游戏名称": "三国：冰河时代",
  "游戏看播人数": 700,
  "安卓游戏下载完成人数": 3,
  "直播-游戏流水(分成前)": "5000元",
  "游戏开播场次": 3,
  "游戏开播时长": 5.14,
  "场均游戏开播时长": 1.71,
  "安卓游戏安装完成人数": 5,
  "游戏看播时长": "2600分钟",
  "人均游戏看播时长": "3.73分钟",
  "ACU": 14,
  "PCU": 30,
  "点赞人数": 16,
  "关注人数": 29,
  "评论人数": 93,
  "点赞率": "2.25%",
  "关注率": "4.08%",
  "评论率": "13.10%",
  "游戏下载点击人数": 8,
  "安卓游戏下载开始人数": 3,
  "游戏活跃用户数": 7,
  "游戏内购付费用户数": 1,
  "周": 6,
  "月": 2,
  "项目": "三国项目",
  "负责人": "运营X",
  "负责人员": "运营X"
}
```

## 老中台 PRO3 的字段映射（翻译反面案例）

PRO3 把所有原始字段都翻译成了中文，丢失了平台 API 真正的字段名：

| 平台 API 字段（猜测） | PRO3 中的命名 | 评价 |
|---|---|---|
| `revenue` / `gross_amount` | `直播-游戏流水(分成前)` | ❌ 中文 + 带"元"字符串，过滤/聚合都要 string 处理 |
| `nickname` | `昵称` | ❌ 中文 key 无法直接用 ORM |
| `douyin_id` / `account_id` | `抖音号` | ❌ 类型在 JSON 里有时 string 有时 number，处理麻烦 |
| `live_duration_sec` | `游戏开播时长` | ❌ 单位混乱（小时/数字两种类型并存） |
| `like_rate` | `点赞率` | ❌ 带"%"字符串，无法直接做 numeric 运算 |
| `peak_concurrent_users` | `PCU` | ⚠ 缩写好但中文场景识别难 |
| `avg_concurrent_users` | `ACU` | ⚠ 同上 |
| `data_date` | `数据日期` | ❌ 中文 key |
| `business_unit` | `项目` | ❌ 中文 key 但语义模糊 |
| `operator` | `负责人` / `负责人员` | ❌ 双字段冗余（旧版改名没清理） |

新中台**直接落原始字段名**（要么平台 API 原文、要么内部统一英文 snake_case），中文展示走 `field_alias` 配置。

## Phase 2 schema 建议（基于当前 PRO3 样本，待 Phase 1 真爬虫数据校正）

```sql
-- 假设 Phase 1 接入抖音百应/巨量 API 拿到真实字段
CREATE TABLE douyin_session (
  id BIGSERIAL PRIMARY KEY,
  platform_account_id TEXT NOT NULL,           -- FK 到 platform_account
  data_date DATE NOT NULL,                      -- 该场数据日期（extract）
  session_id TEXT,                              -- 平台 session_id（extract，索引）
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  gross_revenue_cents BIGINT,                   -- 流水分（extract，整数，避免"元"字符串）
  raw JSONB NOT NULL,                           -- 平台 API 原始响应全文 ★
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform_account_id, data_date, session_id)
);
CREATE INDEX idx_douyin_session_date ON douyin_session(data_date);
CREATE INDEX idx_douyin_session_account_date ON douyin_session(platform_account_id, data_date);
```

骨架字段（4-6 个）：`id` / `platform_account_id` / `data_date` / `raw` / `crawled_at`

extract 字段（仅高频查询）：`session_id` / `start_time` / `end_time` / `gross_revenue_cents`

其他所有字段（点赞率、PCU、游戏名等）都在 `raw` 里，**用 `raw->>'field_name'` 取，按需再加索引**。
