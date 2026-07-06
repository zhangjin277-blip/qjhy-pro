# crawler 模块（抖音/快手采集）

> 读本目录文件时自动加载。只写代码看不出来的口径和坑。

## Job 架构

cron(worker/index.ts) → `enqueue` → pg-boss(`pgboss.job` 表) → handler(worker/jobs/handlers/)。
- Job 名全在 `types.ts` 的 `JOB_NAMES`；**新加 job 要同时**：JOB_NAMES + register.ts 接线（`boss.work`）+ register 顶部 createQueue 循环会自动建队列
- 手动入队（NAS 上）：`INSERT INTO pgboss.job (name, data) VALUES ('crawler:xxx', '{...}'::jsonb)` —— job 表只有 name 必填
- handler 返回值写进 `pgboss.job.output`，采集监控页展示

## 抖音 vs 快手两套体系

- **抖音**（basecamp cs/nc1/nc2）：puppeteer 打开百应后台注入 cookie，7 个 adapter（见 memory qjhy-pro-crawler-architecture）。链：check_data_ready → fetch_daily → 下游(portrait/game/minigame)
- **快手**（basecamp kuaishou）：机构后台 jigou.kuaishou.com + 666.kuaishou.com。members(02:30) / history_live(11:00, 拉 D-2~D-1) / today_live / live_snapshot(5min, 在播分时)

## Cookie

- 存 `crawler_cookie_session`（PK=basecamp，jsonb cookies）。失效→`markCookieExpired`（只在 active→expired 转换时通知：报错机器人 + COOKIE_ALERT_DINGTALK_WEBHOOK「更新」机器人）
- 快手续期流程见 memory qjhy-pro-crawler-architecture「快手 cookie 续期流程」：关键 `kuaishou.web.cp.api_st` 是 HttpOnly，只能从浏览器网络请求头抓
- jigou/666 的接口**纯 Node fetch 即可**（不需要 __NS_sig3 签名）；抖音百应必须 puppeteer（要前端 SDK 签名）

## 补数（采集监控「补更早范围」）

- 抖音 daily/profile/portrait/minigame/**game(推广游戏)**：`backfillRange`，每天一个 job
- 快手历史直播：`triggerKuaishouSync({type:"history", fromDate, toDate})`，单 job 吃整个范围（内部按月分段防 1000 条 cap）
- 快手补礼物（流水分时回补）：`type:"gift"` → BACKFILL_KUAISHOU_TREND。**依赖先有 kuaishou_live_session 场次**。原理：jigou「历史开播直播间→详情」`/rest/analysis/live/room/history/detail/data/trend` 用数字 liveStreamId 返回已结束场次的整场分时（LIVE_FLOW_AMT 累计流水,元）
- 推广游戏矩阵内不支持单 cell 重跑（intentional），但范围补数可以

## 坑

- **server action 不能 import ./server barrel**（拉到 puppeteer→lazy-cache，Turbopack 崩）；actions.ts 只从 ./queue、./cookie 导入
- 快手数据 T+1（今天的场次流水明天 11:00 才齐）；抖音分成数据 T+2
- `kuaishou_live_trend` 主键 (live_stream_id_str, ts)；实时 sync 用 666 的字符串 id，礼物回补用数字 id 转字符串——同一场会有两套 id 的点，checkin 按 member_id+时间窗聚合不受影响
