# 投放归因算法说明

## 决策树

输入：placement_row(account_id, date, hour)

1. mergeWithOverride(default, override) → effective schedule
2. 过滤 rest_days 包含当天 ISO weekday 的 anchor
3. 找 effective slots 覆盖 hour 的候选
   - 1 个 → 归他，source 取自候选来源（'override' / 'default'）
   - 多个 → conflict
   - 0 个 → unmatched

## 跨天时段判定

`coversHour([22:00, 04:00], 2) === true` — 22-04 排班的 row.date hour=2 仍命中。
不查前一天的排班兜底（语义简化）。

## 触发时机

- Excel 上传：dirty=TRUE → 异步 job
- override CRUD：标受影响 (account, date) dirty → 异步 job
- default 编辑：**不**自动触发（保留历史归因不翻案）
- 手动重算未归因按钮：标 source IN (unmatched, conflict) 的 dirty → 异步 job
- cron 04:00：兜底扫 dirty

## 性能

100w 行全量重算约 5-8 分钟（按 (account, date) 分组查 schedule，避免 N+1）。增量重算（dirty 子集）通常 < 10 秒。

## 模块结构

```
src/modules/placement-attribution/
  ├── attribute.ts         # 单行归因 attributeRow
  ├── job.ts               # 批量 job runAttributionJob
  ├── triggers.ts          # markDirtyByAccountDate / markDirtyByBatch / markDirtyUnattributed
  ├── cron.ts              # runCronAttributionSweep
  └── server.ts            # barrel
```
