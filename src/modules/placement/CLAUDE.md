# placement 模块（投放数据 / Excel 上传）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## 数据流

Excel(巨量/omni 报表) 上传 → detect-dataset 识别模板 → adapter 解析 → `ingestRows` 写 placement_row（小时粒度，date+hour+live_account_id）→ 归因(attribution) 把投放行绑定到账号。

## ⚠️ ingestRows 必须配 runAttributionJob

只 ingest 不跑归因 → 数据进库但 UI 按主播聚合全是 0，`placement_attribution_dirty` 永远 true 等次日 cron。手动补数后必须触发归因（见 memory feedback_ingestrows_attribution）。

## 口径

- 账号绑定靠 `live_account.placement_label`（投放标签 1:1 unique）
- 「直播间/渠道报表账户备注」等新列名 omni adapter 已适配（93358e6）
- PRO3 历史投放数据**不迁移**（2026-06-10 决定），新数据全走 Excel 上传
- 开播记录页的消耗/激活/付费从 placement_row 按 session 时长比例分摊（见 checkin/CLAUDE.md）
