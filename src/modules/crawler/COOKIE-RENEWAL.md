# 抖音百应 Cookie 续期手册（cs basecamp）

> 给任何会话/模型的可执行 runbook。整个流程约 5 分钟 + 补数每天约 3 分钟。
> 快手（basecamp=kuaishou）另有流程，见 memory `qjhy-pro-crawler-architecture`，本文只讲抖音。

## 0. 什么时候需要续期

满足任一即可确认是 cookie 失效（而不是别的故障）：

- `pgboss.job` 里 `crawler:check_data_ready` 输出 `{"ready": false, "detail": "status_code=20011"}`（20011 = 百应未登录）
- 或直接报 `No active cookie for basecamp=cs`（说明已被 `markCookieExpired` 标记）
- 抖音 4 张表（`anchor_daily` / `anchor_portrait_daily` / `anchor_game_promo_daily` / `anchor_minigame_daily`）停更
- **注意空壳行陷阱**：cookie 失效后 `anchor_daily` 可能仍每天产生约 1355 行零值行（`total_fan_ticket` 全 0），别被行数骗了。判定 SQL：

```sql
SELECT date, COUNT(*), SUM(total_fan_ticket),
       COUNT(*) FILTER (WHERE total_fan_ticket > 0) AS nonzero
FROM anchor_daily WHERE date >= '<疑似断档起点>' GROUP BY date ORDER BY date;
-- nonzero=0 的日期就是要补的（正常日 nonzero 约 100~140）
```

**经验值**：cookie 标称 30 天（sid_guard），实际约 28 天就掉。历史记录：5/9 抓 → 6/1 掉；6/3 抓 → 7/1 掉；7/6 抓 → 预计 8/2 前后掉。

## 1. 打开登录页，让用户扫码/登录

用 chrome-devtools MCP（不是 buyin.jinritemai.com！正确入口是**字节公会平台**）：

```
mcp__chrome-devtools__new_page → https://union.bytedance.com/open/portal/anchor/list
```

- 未登录会跳到 `union.bytedance.com/open/` 登录页（手机号 15679982012 通常已预填）
- 如报 "browser is already running for .../chrome-profile"：`pkill -f "chrome-devtools-mcp/chrome-profile"` 后重试
- **然后停下来等用户说登录好了**（密码/验证码/抖音扫码都行，用户自己操作）

## 2. 抓完整 Cookie（含 HttpOnly）

`document.cookie` 只能拿到约 8 个非 HttpOnly 的，**不够**。必须从网络请求头抓：

1. 登录后 `navigate_page` 到 `https://union.bytedance.com/open/portal/anchor/list`，等主播列表渲染（会触发一堆 XHR）
2. `list_network_requests`（resourceTypes: xhr/fetch）找一个打到 `union.bytedance.com/ark/api/...` 的请求
3. `get_network_request(reqid)` → Request Headers 里的 `cookie:` 行就是完整 cookie
4. 解析成 JSON object：**全收，只排除 `msToken`**（每请求轮换的临时值，puppeteer 打开页面后 SDK 会自己生成）。正常约 24 个 key，关键的有 `sessionid` / `sid_tt` / `sid_guard` / `ttwid` / `passport_csrf_token` / `odin_tt`
5. 顺手看 `sid_guard` 里的过期时间（URL-decode 后有 `Wed, 05-Aug-2026 ...` 字样），告诉用户新有效期

## 3. 写入 NAS 生产库

存储：表 `crawler_cookie_session`，PK=`basecamp`，值 `cs`，cookies 为 jsonb（k-v 均字符串）。

```sql
-- update_cs_cookie.sql
UPDATE crawler_cookie_session
SET cookies = '{ "sessionid": "...", ... 全部 key ... }'::jsonb,
    status = 'active', captured_at = NOW(), last_check_at = NOW(), updated_at = NOW()
WHERE basecamp = 'cs';
SELECT basecamp, status, captured_at,
       (SELECT COUNT(*) FROM jsonb_object_keys(cookies)) AS key_count
FROM crawler_cookie_session WHERE basecamp='cs';
```

执行（NAS postgres 容器 **/tmp 不可写**，必须 docker cp 到根目录）：

```bash
scp -O -i ~/.ssh/id_rsa_nas update_cs_cookie.sql 15679982012@172.16.39.61:/volume1/docker/qjhy/
ssh -i ~/.ssh/id_rsa_nas 15679982012@172.16.39.61 \
  "docker cp /volume1/docker/qjhy/update_cs_cookie.sql qjhy-postgres:/u.sql && \
   docker exec qjhy-postgres psql -U qjhy -d qjhy -f /u.sql"
```

`status='active'` 必须显式写——之前失败时被 `markCookieExpired` 置成了 expired。

## 4. 补断档数据

每个断档日期跑一次（在 NAS worker 容器内，会自动级联 profile/daily → portrait/game/minigame 全链）：

```bash
ssh -i ~/.ssh/id_rsa_nas 15679982012@172.16.39.61 \
  "for d in 2026-07-01 2026-07-02; do \
     docker exec -e DATE=\$d qjhy-worker pnpm exec tsx scripts/dispatch-check-ready.ts; done"
```

- 断档日已抓到一半的日期（比如只有 daily 没有 portrait）也直接重跑，全链 upsert 幂等
- 一天全链约 3 分钟，队列 batchSize=1 串行消化
- 当天（今天）不用补，明早 10:00 cron（crawl-orchestrator）自动抓

## 5. 验证

```sql
-- ① check 结果应为 ready=true（cookie 生效的直接证据）
SELECT name, state, data::text, output::text FROM pgboss.job
WHERE name LIKE 'crawler:%' AND created_on > NOW() - INTERVAL '30 minutes'
ORDER BY created_on;

-- ② 4 张表行数 + 非零校验（对照第 0 节的空壳行判定 SQL）
```

正常量级参考：anchor_daily 约 1355+ 行/天，portrait 110~150，game 约 410，minigame 约 55。

## 已知细节 / 坑

- worker 的 `openDouyinPage` 把 cookie 注入到 domain `.bytedance.com` 再 goto `union.bytedance.com/open/portal/anchor/list`（见 `src/lib/puppeteer/browser.ts`），所以抓 cookie 也必须在 union.bytedance.com 域抓，别去 buyin/fxg
- admin UI（/admin/crawler）的「扫码续期」按钮是占位的（alert），目前只能走本文的 SQL 流程
- 本地 dev 库和 NAS 生产库是两份 `crawler_cookie_session`，续期只动 NAS 的；本地要用再单独 UPDATE 本地
- cookie 失效告警发钉钉「更新」机器人（COOKIE_ALERT_DINGTALK_WEBHOOK），只在 active→expired 转换时发一次
