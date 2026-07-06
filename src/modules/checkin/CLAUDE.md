# checkin 模块（开播打卡 / 开播记录）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## 数据模型

`live_session_log`：主播扫码开播/下播的实时记录（uuid PK，live_account_id + anchor_dingtalk_user_id + start_at/end_at + status）。
status：in_progress / ended(正常下播) / auto_closed_by_next(被接班) / auto_closed_by_offline(系统检测离线) / auto_closed_by_cron(系统兜底)。

⚠️ 这张表和快手机构后台的 `kuaishou_live_session`（场次+总流水）是**两套独立数据**：前者是打卡（谁在播），后者是平台权威场次。开播记录页 6-21 有 67 场打卡 vs 快手后台 33 场，正常。

## 礼物列的算法（最常被问）

开播记录「礼物(元)」= 从 `kuaishou_live_trend`（1 分钟级累计流水快照）算：
```
按 live_account.platform_account_id = trend.member_id + 时间窗 [start_at, COALESCE(end_at, now())]
per_stream = MAX(valid_income_cents) - MIN(...) GROUP BY live_stream_id_str   -- 处理换场重置
session 礼物 = SUM(per_stream)
```
- trend 表由 ks-trend-sync(5min) 实时填；**cookie 断档期没快照 → 礼物显示「–」**
- 断档补救：采集监控「补更早范围 → 快手·补礼物数据」（从机构后台历史流水分时图按场回拉，见 crawler/CLAUDE.md）

## 投放数据按时长比例分摊

消耗/激活/付费来自 placement_row（小时粒度），按 session 在该小时的覆盖秒数占比分摊到各场次（多场重叠同一小时按秒数分）。

## admin 操作

强制下播（closed_by=admin_force）/ 改时间（重算时长；清空结束时间=改回进行中）/ 改主播 / 补时长（手动插一条已结束记录）。全部写 audit_log。

## UI（checkin-history）

甘特时间轴（当日 24h+次日 8h）+ 详细记录表（进行中置顶分组、sticky 表头、时间带 MM-DD 日期）。
