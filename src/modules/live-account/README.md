# live-account 模块

跨平台直播账号档案。

- 第一公民：账号 = 账号；主播通过 account_anchor_default 关联
- 平台 ↔ 产品强校验（spec §5.2）
- 与 anchor_profile 通过 platform_account_id ↔ aweme_display_id 反向 join（不强制 FK）
- placement_label 1:1（投放归因，Phase 2.2 用）
- **不提供删除**（2026-10-08 下线）：只能「标记废弃 / 恢复」（`deprecated_at`），列表折叠到底部「已废弃」分组，
  剪辑任务 / 开播记录 / 投放 / 排班历史全部保留。权限 = `account_edit` + `delete_request`（标签「废弃 / 恢复账号」）+ 账号在 scope 内。
  打卡 / 排班 / 主播绑定对 live_account 的 FK 已改 `ON DELETE RESTRICT`（0075），手写 SQL 删有历史的账号会被拒。
  `live_account_delete_request` 表仅作历史记录保留。
  - 废弃后屏蔽（新操作入口）：扫码开播（startSession 拒绝 + 扫码页提示）、剪辑建任务（搜索候选 + createTask 拒绝）、
    直播间平面图、排班矩阵、主播档案页的绑定列表；在播中的账号不能废弃。
  - 废弃后保留（历史统计）：投放看板 / 归因、开播记录、业务看板、捕鱼总览、剪辑任务列表等照常计入。

## 子模块
- `name-matcher.ts` — 姓名 fuzzy 匹配（迁移用）
- `time-slots.ts` — 时段命中算法（排班归因用）
- `migration.ts` — PRO3 → qjhy-pro 迁移逻辑（Task 16-17）
