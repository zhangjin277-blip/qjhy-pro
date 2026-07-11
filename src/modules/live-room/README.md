# live-room 模块

线下物理直播间（B17/A20/B 区-09）。

- 跨平台共用，不绑定具体平台
- 仅 admin / 直播部 leader 可 CRUD
- live_account 通过 room_id FK 关联

## 入口
- `index.ts` — Server Actions + Zod schema + types
- `server.ts` — DB queries（仅 RSC / Server Action 用）

## 依赖
- `@/db/schema` (live_room 表)
- `@/lib/admin-guard` (仅 admin 可写)
- `@/lib/audit` (操作审计)

## 直播间平面图（/live-accounts/floor-plan）

代码看不出来的口径和坑：

- **布局是手写配置**（`floorplan.ts` 的 `FLOOR_SECTIONS`），按 PRO3 老系统平面图 1:1 转录，
  坐标网格（col/row/w/h）。房号忌 4（无 x4/x14/x24）是真实门牌编号，不是漏抄。
  房间增减/挪位 = 改配置重部署，没有后台编辑器（办公室布局不常变，刻意不做）。
- **房号归一化匹配**：库里 room_no 格式混杂（`A1` 和 `A区-15` 并存，PRO3 迁移遗留），
  `normalizeRoomNo` 两边归一成 `A-01` 再匹配；同一格子在库里两种写法并存时账号合并显示。
  归一失败或配置里没有的房 → 页面底部「未上图房间」条，不静默丢。
- **「在播」两路信号取并集**：
  1. 打卡 `live_session_log` in_progress → 蓝卡 + 主播名 + 开播时间（只有捕鱼系产品开了打卡）；
  2. 爬虫 `kuaishou_live_trend` 最近 15 分钟有快照（job 5min 一跑，容 2 次空窗）→「在播·未打卡」。
     **不要用 `live_account.live_status`** —— 它只在每日 02:30 成员同步时写，白天全是隔夜值。
  - 抖音产品（斗地主/三国/线上招募）两路信号都没有，永远显示空闲态；
    以后抖音在播爬虫接上（写 trend 或打卡）自动点亮，平面图代码不用动。
  - 快手 cookie 断档 → 爬虫信号消失，只剩打卡信号（降级不报错）。
- **今日休**：房间所有账号都有默认排班绑定、且所有绑定的 rest_days（ISO weekday）含今天
  （Asia/Shanghai）才判休；有账号没绑排班就不判。
- 大直播间 D1-D5 库里没有对应 live_room，按功能区（zone）渲染；以后建了 D 房号把
  cell 的 kind 改成 room 即可接数据。
