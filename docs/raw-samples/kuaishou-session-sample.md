# 快手单场数据样本

> 来源：PRO3 项目 `/Users/zhangjin/miracle-pro3/database.sqlite` → `coin_recharge_records`（仅快币充值，**没有单场流水**）
> 采集时间：2026-04-30
> 已脱敏：✅
> ⚠ **重要警告：PRO3 项目完全没有快手单场流水数据，本文档只能展示快币充值字段。Phase 1 写真实快手 API 爬虫前必须重新探查。**

## 来源说明（实事求是）

**未找到合适的快手单场流水样本**——这是一个明确的"探查空缺"，必须在 Phase 1 实施前补全。

PRO3 项目里关于快手的数据流：

1. ❌ **没有快手平台 API 爬虫**：grep 整个 server 目录（`grep -ri 'kuaishou\|快手' server`）只找到：
   - `recruitment.routes.js`：默认招聘渠道里写了"快手私信"（业务字符串而已）
   - `dingtalk/dingtalkOpenService.js`：处理钉钉审批流时识别"快手ID："格式（提取充值申请里的快手账号 ID）
2. ❌ **没有快手 Excel 导入**：BatchImporter.jsx 里没有快手相关导入规则；`business_data` 表里所有 9 万行 `biz-anchor-live` 数据都是抖音（含"抖音号"字段）
3. ❌ **`kuaishou_monitor.sqlite` 是 0 字节**：曾经规划过，但从未启用
4. ✅ **唯一存在的快手数据**：`coin_recharge_records` 表里 33 条快币充值记录，来自钉钉审批流同步

也就是说：**长沙基地用快手开播但没有任何单场流水数据接入中台**。Phase 1 必须做的事就是写真正的快手 API 爬虫（候选：磁力开放平台 / 创作者后台 / 三方接口）。

## 字段清单（仅快币充值审批，不是单场流水）

来自 `coin_recharge_records` 表里 `recharge_type='kuaishou'` 的行：

| 字段名 | 类型 | 含义 | 是否高频查询 | 备注 |
|---|---|---|---|---|
| `instance_id` | string | 钉钉审批实例 ID | ✅ | 唯一 |
| `recharge_type` | enum | `kuaishou` / `douyin_official` / `douyin_personal` | ✅ | |
| `applicant_userid` / `applicant_name` | string | 申请人钉钉 ID/姓名 | ❌ | |
| `dept_name` | string | 申请部门 | ❌ | |
| `anchor_nickname` | string | 主播昵称（钉钉审批字段） | ✅ | |
| `account_id` | string | **快手 ID**（从"快手ID：xxx"格式中提取） | ✅ | |
| `product` | string | 业务线（"捕鱼3D" 等） | ❌ | |
| `amount` | number | 充值金额（元） | ✅ | |
| `coin_quantity` | string | 快币数量（字符串如"5000"） | ❌ | |
| `purpose` | string | 用途说明（"福利发放" 等） | ❌ | |
| `apply_time` / `finish_time` | datetime | 申请/完成时间 | ✅ | |

## 真实样本（脱敏后）

唯一能展示的快手相关数据是充值审批：

```json
{
  "id": 13,
  "instance_id": "DEMO_INSTANCE_4zRfWmlMTOacyHE241Rnhg",
  "recharge_type": "kuaishou",
  "applicant_userid": "DEMO_DD_USERID",
  "applicant_name": "运营A",
  "dept_name": "直播一部-运营",
  "anchor_nickname": "主播X",
  "anchor_name": "",
  "account_id": "DEMO_5170000000",
  "product": "捕鱼3D",
  "amount": 500.0,
  "coin_quantity": "5000",
  "purpose": "福利发放",
  "status": "COMPLETED",
  "result": "agree",
  "apply_time": "2026-03-07 19:21:05",
  "finish_time": "2026-03-10 11:14:58",
  "row_index": 0,
  "synced_at": "2026-03-11 11:57:24"
}
```

**这不是单场直播流水**，只是充值审批表的一行。设计 Phase 2 `kuaishou_session` 表时**完全不能参考这个**。

## 老中台 PRO3 的字段映射（仅充值字段，无流水可参考）

不适用——没有单场流水数据。

## Phase 2 schema 建议

⚠ **当前没有任何快手 API 字段信息**，无法给出可信的 `kuaishou_session` 表设计。

**Phase 1 必做的探查项（spec 11.2 节登记）：**

1. 调研快手开放能力：
   - 磁力开放平台（kuaishou.com 开放 API）
   - 创作者后台 API（`creator.kuaishou.com`）
   - MCN 后台 API（如有）
   - 第三方接口（飞瓜/新榜等数据服务）
2. 至少抓 3-5 场真实直播数据，落 `docs/raw-samples/kuaishou-session-sample.md`（覆盖本文件）
3. 据此再设计 `kuaishou_session` 事实表

**临时占位 schema**（仅作 Phase 0 骨架，Phase 1 必须重做）：

```sql
-- ⚠ 占位，字段不可信，Phase 1 拿到真实 API 数据后必须重新设计
CREATE TABLE kuaishou_session (
  id BIGSERIAL PRIMARY KEY,
  platform_account_id TEXT NOT NULL,
  data_date DATE NOT NULL,
  session_id TEXT,
  raw JSONB NOT NULL,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(platform_account_id, data_date, session_id)
);
```

骨架最小集 + raw jsonb，等 Phase 1 拿到真数据再 ALTER 加 extract 字段。
