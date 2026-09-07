# dashboard 模块（首页业务看板）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## 项目 × 分组 二维口径（anchorGroupCte，全看板共用）

每个主播(anchor_profile) 映射到 (project, group)：
- **project**：`recruit_broker_name='造化仙府'` → zhaohua（优先）；否则 `is_threekingdoms` → three(三国) / ddz(斗地主)
- **group**（线上/线下/其他）：`broker_name → 同名 dingtalk_user → 首部门 dept_ids->>0 → entity_alias.alias`
  - 别名「线上运营」→ online；「线下运营」→ offline；broker_name='线上主播' 兜底 online；其余 other

⚠️ 钉钉里有 **4 个「一组」+ 4 个「二组」**（不同上级：运营/后期/综合部…），只有运营那对配了别名（一组 1071549417=线上运营、二组 1072488184=线下运营）。同名≠运营组，别乱补别名。
⚠️ broker 离职后名字匹配不上钉钉用户 → 落 other，**这是预期**（不算 bug）。
⚠️ 「捕鱼运营」别名 → other（捕鱼不进斗地主/三国/造化仙府看板；捕鱼有独立 buyu-section 走 placement KPI）。

## 指标口径（queries.ts）

- **flow（流水）**：斗地主/造化仙府 = game_promo `cps_all` 全 scene：`(anchor_active_pay + faction_active_pay)/0.4 + download_pay`；三国 = minigame `before_divided_income`
- **live_flow/video_flow**：斗地主/造化仙府同上加 `promote_scene` 限定；三国 live=minigame、video=0
- **install_or_activate**：斗地主/造化仙府 = cps install_finish（显示「安装」）；三国 = minigame gm_active_ucnt（显示「激活」）
- **fan/active/看播**：anchor_daily / anchor_portrait_daily
- 同期对比：单日窗口显示 前一日+上周同期；多日窗口只显示 上一周期（避免近7日两行相同的老 bug）

## UI 结构

Section1 核心 KPI（含 14 天 sparkline，fetchCoreTrend）→ Section2 业务细分：3 个项目矩阵，每项目按总计/线上/线下/其他展示。默认 metric=flow、日期=昨天。点数值开抽屉（主播列表+CSV）。
