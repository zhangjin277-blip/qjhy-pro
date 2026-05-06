# live-account 模块

跨平台直播账号档案。

- 第一公民：账号 = 账号；主播通过 account_anchor_default 关联
- 平台 ↔ 产品强校验（spec §5.2）
- 与 anchor_profile 通过 platform_account_id ↔ aweme_display_id 反向 join（不强制 FK）
- placement_label 1:1（投放归因，Phase 2.2 用）

## 子模块
- `name-matcher.ts` — 姓名 fuzzy 匹配（迁移用）
- `time-slots.ts` — 时段命中算法（排班归因用）
- `migration.ts` — PRO3 → qjhy-pro 迁移逻辑（Task 16-17）
