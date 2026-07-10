# 直播录制板块(recording)设计 Spec

> 2026-07-10 brainstorming 定稿。目标:把 NAS 上已稳定运行的 go-auto-uploader 录制器(容器 `go-recorder`)集成进 QJHY-Pro,新增「直播录制」板块——录制任务管理页 + 录像文件管理页。**Go 引擎零改动**。

## 背景与已验证事实

线上录制器 = [go-auto-uploader](https://github.com/Xiaoxusheng/go-auto-uploader) 的 2026-03-17 构建,容器名 `go-recorder`,NAS 端口 `8080`,连续稳定运行 7 周。用户长期使用、高度信任其稳定性,因此**集成而非重写**。

以下事实已于 2026-07-10 对线上实例实测验证:

| 事实 | 详情 |
|---|---|
| 二进制 | 容器内 `/app/go-auto-uploader`,启动参数 `-dirs /app/downloads -server http://localhost:3000 -web-port 8080` |
| 上传引擎 | **关闭**(`running:false`,上传目标是假地址)。只用内置录制引擎,录像留在 NAS |
| 录像目录 | 宿主 `/volume1/docker/live-recorder/downloads/<主播名>/*.ts`(+`Screenshots/` 子目录截图) |
| 录制配置 | uhd 画质、不分段(单场直播一个 ts)、30 秒轮询开播 |
| API 加密 | **开启**(与新版仓库默认关闭不同)。RSA-OAEP(SHA-256) 换 32 字节 AES 密钥 → AES-256-GCM(payload = base64(nonce12 ∥ ciphertext ∥ tag16)),session 有效 24h |
| 登录 | `admin`/`admin`(硬编码),`POST /api/v1/auth/login`(加密载荷)→ Bearer token |
| 状态推送 | `ws://…/ws/live?session_id=…`,**连接建立即推** `builtinTasks`(此后每 2 秒),消息同样 AES-GCM 加密 |
| builtinTasks 字段 | platform / room_id / anchor_name / avatar / quality / status(录制中·监控中·已暂停·检测异常等) / update_time / is_paused / file_size(该主播累计体积) / duration |
| systemStatus 字段 | 同一 WS 每 2 秒推送,含 `diskFree`(NAS 剩余空间) |
| 写接口 | `POST /api/v1/builtin_recorder/add` / `control`(pause·resume·delete) / `control_all` / `config`。读接口已实测;写接口在 3 月构建中与 config 同函数注册,存在性高置信但未实测(见「实施验证」) |
| 版本差异 | 3 月构建缺新版部分接口(如 `/api/v1/streamers` 404)。**实现只面向线上构建,不升级容器** |
| 主播名单旁路 | `builtin_urls.txt` 挂载于宿主,引擎 3 秒热重载;但引擎自身会写回该文件(固化主播名),**外部直写有竞态,弃用**,统一走 API |

验证脚本(可作 client.ts 实现参考):会话 tmp 目录 `test-recorder-api.mjs`(握手+登录+读配置)、`test-recorder-ws.mjs`(WS 快照解密)。

## 需求决策(用户拍板)

1. **权限口径**:照搬软件库——全员 scope=all(可浏览录制状态、浏览/下载录像),`can_edit`(默认仅总监/老板,可单独授权)才能:增删/暂停录制任务、改录制配置、删除录像文件。
2. **不关联 live_anchor**(一期):录制名单独立管理,文件按主播名文件夹浏览。
3. **导航**:顶层独立「直播录制」,与软件库同级。

## 架构

```
┌─ QJHY-Pro (qjhy-web 容器) ───────────────────────────┐
│  /recording 录制任务页      /recording/files 文件页    │
│  recording 模块 server.ts                             │
│    ├─ client.ts   加密 API 客户端(握手+session/token 缓存,401 自动重握手)│
│    ├─ snapshot.ts WS 按需快照(builtinTasks+systemStatus,5s TTL 进程内缓存)│
│    └─ files.ts    直读挂载卷(列表/删除/流式下载)        │
└──────┬────────────────────────┬──────────────────────┘
       │ RECORDER_API_URL        │ RECORDINGS_DIR 挂载卷
┌──────▼──────────┐   ┌─────────▼─────────────────────┐
│ go-recorder 容器 │→写│ /volume1/docker/live-recorder/ │
│ (零改动)         │   │ downloads/<主播名>/*.ts         │
└─────────────────┘   └───────────────────────────────┘
```

- 无新业务表(状态在引擎内存、文件在文件系统);仅权限种子 migration。
- QJHY 宕机不影响录制;go-recorder 宕机只影响任务页(降级横幅),文件页照常。
- worker 无任何改动。

## 模块结构(照 software-library 模板)

`src/modules/recording/`:

| 文件 | 职责 |
|---|---|
| `index.ts` | client-safe:类型 + Zod schema + Server Actions re-export |
| `server.ts` | server-only 入口(`import "server-only"`) |
| `client.ts` | 加密 API 客户端:pubkey→exchange→login,session/token 进程内缓存,遇 401/Session Invalid 自动重握手重试一次;超时 5s |
| `snapshot.ts` | 按需连 WS 收第一帧 `builtinTasks` + `systemStatus` 即断;进程内 5 秒 TTL 缓存;8 秒超时视为离线 |
| `files.ts` | 列主播文件夹(文件数/总大小)、列文件(过滤 `Screenshots/`)、删除(录制中保护)、下载流(Range) |
| `authz.ts` | `requireRecordingViewer`(scope!==none)/ `requireRecordingWriter`(can_edit),照 software-library/authz.ts |
| `actions/` | add-streamer / control-streamer(pause·resume·delete) / update-config / delete-file |
| `types.ts` `schema.ts` | 领域类型 / Zod 输入校验 |

ESLint zone 注册一行(`!(index|server).ts`)。

## 页面

### 录制任务页 `/recording`

- 顶部状态条:go-recorder 在线/离线徽章、NAS 剩余空间(`systemStatus.diskFree`)。
- 主播列表:头像、主播名、平台、状态徽章(录制中🔴/监控中/已暂停/检测异常)、累计体积、当前场次时长。头像统一走 QJHY 新增 API route `GET /api/recording/avatar?path=…` 服务端转发 go-recorder 的 `proxy_image`(浏览器不直连录制器,避免鉴权/加密问题)。列表形态(卡片 vs 表格)按项目惯例在实施阶段用 huashu-design 出变体定。
- 前端 10 秒轮询 server action 刷新快照。
- can_edit 操作:添加主播(粘贴直播间链接或房间号 → `add`)、暂停/恢复/删除(`control`,删除需确认对话框)、全局配置(画质/分段/轮询间隔 → `config`)。
- 离线降级:横幅「录制器离线,任务管理暂不可用」,列表显示最后一次成功快照(如有)。

### 录像文件页 `/recording/files`

- 左侧:主播文件夹列表(名称、文件数、总大小,按总大小降序);右侧:选中主播的文件表(文件名、大小、修改时间,按时间降序)。
- 下载:流式 + Range(复用软件库 download route 模式);全员可用。
- 删除(can_edit + 确认对话框):**物理删除**(目的即释放空间)。**录制中保护**:满足任一则禁删——① WS 快照中该主播 status 含「录制中」;② 文件 mtime 距今 < 2 分钟。快照不可得(录制器离线)时仅用 mtime 规则。
- `Screenshots/` 子目录及非 `.ts` 文件不展示、不可删。
- 空间统计:页面顶部展示 downloads 总占用 + NAS 剩余空间。

## 权限与导航

- `MODULE_KEYS` 增加 `recording`,label「直播录制」,desc「直播录制任务与录像文件管理」。
- `role-defaults.ts` 特例(照 software_library 写法,四字段显式):全员 `scope:"all"`,`can_edit`/`can_admin` 仅 总监/老板,`can_export:false`。
- 权限种子 migration:手写 SQL(下一个序号),**psql 手动应用**(本地 + NAS,`pnpm db:migrate` 不可用——见 drizzle migration 手动流程 memory)。
- `src/lib/nav.ts` NAV 增加顶层单项:key `recording`,href `/recording`,module `recording`,icon `Video`(lucide)。

## 部署与配置

- NAS `/volume1/docker/qjhy/docker-compose.yml`:qjhy-web 增加挂载 `/volume1/docker/live-recorder/downloads:/mnt/recordings`(**rw**,删除功能需要),重建 qjhy-web(go-recorder 不碰)。
- 环境变量(`.env.local` / NAS env,均不进 git):
  - `RECORDER_API_URL`(默认 `http://172.16.39.61:8080`;本地开发同值,公司内网可达)
  - `RECORDER_ADMIN_USER` / `RECORDER_ADMIN_PASS`(admin/admin)
  - `RECORDINGS_DIR`(生产 `/mnt/recordings`;本地开发指向测试目录,如 `~/qjhy-recordings-dev`)

## 错误处理

- client.ts 所有调用 5s 超时;网络错误/超时归一为「录制器离线」错误码,任务页降级、写操作报错提示。
- 加密失败/401:重握手重试一次,再失败按离线处理。
- 文件删除:目标不存在(已被引擎轮转或人工删)→ 幂等成功;权限不足(挂载卷只读误配)→ 明确报错提示检查挂载。
- 下载中文件被删:流中断,客户端收到不完整文件——可接受,不做额外处理。

## 测试

- `client.ts`:加解密对拍单测(用 Go 端相同算法生成的固定向量:给定 key/nonce/plaintext → 期望密文);握手状态机(401 重试一次)mock 单测。
- `files.ts`:临时目录 fixture——列表排序/Screenshots 过滤/录制中保护(mtime 新文件禁删)/幂等删除。
- `authz.ts`:scope=none 拒绝、can_edit 判定(照 software-library 测试样式)。
- 集成:实施期对线上实例手动验证(见下),不进 CI。

## 实施验证(第一个 task 必做)

写接口未实测,实施第一步用**假房间号**(如 `999999999999`)对线上做一次 `add → control(delete)` 往返:确认路由存在、加密写载荷格式正确、任务出现又被清除。若 add 路由缺失(404),回退方案:该构建确认缺失后,评估直写 `builtin_urls.txt`(接受竞态,写后校验)或升级容器(需用户批准),**不得擅自升级**。

## 一期明确不做

live_anchor 关联、cookie 管理页、录像在线播放预览、多平台(抖音外)专项优化、升级 go-recorder、录像自动清理策略、worker 侧任何常驻订阅。

## 成功标准

1. 全员能在 QJHY 看到录制状态和录像文件并下载;总监/老板能增删/暂停录制、删文件。
2. 全程未改动 go-recorder 容器及其配置文件。
3. `pnpm typecheck && pnpm lint && pnpm test` 全过;两页在生产 NAS 可用。
