# anchors 模块（主播明细：抖音 / 快手）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## 双平台配置化表格

UI 在 `app/(dashboard)/anchors/`：`generic-anchor-table.tsx` 一张通用表 + `platform-config.ts` 的 PlatformConfig（douyin-config / kuaishou-config 各自定义列、筛选、KPI、detail 抽屉）。

- 抖音数据源：anchor_profile + anchor_daily 等聚合；快手：kuaishou_member + kuaishou_live_session 按窗口聚合（live_amt 总流水）
- **经纪人筛选**：运营经纪人 = `anchor_profile.broker_name`、招募经纪人 = `recruit_broker_name`（都是快照字符串）；纯**客户端过滤**（brokerSel 不进 filters，不触发重新拉数）
- 列预设（user_column_preset）：存 列 + project + **brokerFilter**（jsonb，可空）。应用预设恢复列+经纪人筛选；系统预设清空筛选

## 口径

- 时间窗按「开播时间归属日期」（start_datetime >= cutoff），跨日直播算开播日
- 对比列（环比）用前一个等长窗口
- 数字格式：万/亿缩写、左对齐、涨红跌绿

## 坑

- DataToolbar 需要 `relative z-30`，否则下拉被 sticky 表头(z-20)穿透
- `anchor_profile.anchor_id` = 平台 UID；`live_account.platform_account_id` = 抖音号/快手号（**不同的 id 空间**，连接账号↔档案用 `live_account.platform_uid`）
- 招募经纪人「线上主播/线下主播」是占位名不是真人
