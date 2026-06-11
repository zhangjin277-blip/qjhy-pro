# 全项目功能性代码审查 + 修复进度（2026-06-10）

> 三路并行 subagent 审查全项目功能性 bug 的发现清单与修复进度。
> 修复中途暂停（用户指示「晚点弄」）。恢复方法见文末。

## 修复完成（2026-06-11）

三域全部修复完毕，按域分三个 commit：

| 域 | Commit | 内容 |
|---|---|---|
| worker 域 | `151cf7e` | 快手三同步逐行容错 / 钉钉 80% 下限保护 / 补打卡鉴权 |
| 投放域 | `ad0add3` | 归因时区 / 删batch触发归因 / job 循环 / 排班标脏 / batch 防卡 parsing |
| 剪辑域 | `77303ad` | P0 秒传清理误删 / 12 action 越权补齐 / IDOR / 并发竞态守卫 / 时区统一 |

验证：typecheck ✅ / lint ✅ / 27 测试文件 198 通过（新增 23 个用例）。

### 遗留决策点（未修，需用户拍板）

1. **create-task 仅 requireUser**，未加 can_edit + scope（delete-task/delete-cover 已有更强校验）
2. **历史悬空数据**：修复前秒传产生的 duplicate_of 指向已物理删除任务的 id 未回填清理
3. **软删任务 30 天内仍可下载**（scope 内）——保留原行为，视为「找回文件」合理场景
4. **worker cron 时区**：容器 UTC，注释的 Shanghai 时刻实际偏 8 小时；anchor-penalty 日期算法已修为不依赖容器 TZ，现在设 TZ=Asia/Shanghai 是安全的，但会改变任务实际触发时刻
5. 投放设计决策类 4 项：累计回退 reset 语义 / Omni 同备注合并 / batch 归属漂移 / stub 投票污染
6. **部署提醒**：本轮 web 和 worker 都有改动，NAS 部署需要两个镜像都重建

---

## 发现清单

### 🔴 P0（数据丢失，最优先）

1. **MD5 秒传共享 × 30 天物理清理删活任务文件**
   `src/worker/jobs/editing-cleanup.ts:37` 对软删超 30 天任务无条件 unlink，不检查文件是否被其他存活任务（秒传复用同路径）引用。DB 已验证存在跨任务共享 MD5 的存活任务。
   修法：unlink 前查 `source_files/edited_files @> path` 且 `deleted_at IS NULL` 的其他任务，有引用跳过。

### 🟠 P1 — 剪辑域

2. `upload-source.ts:71` MD5 判重不排软删任务 → 新任务复用「待清理」路径。修法：判重加 `isNull(deleted_at)`。
3. **12 个写 action 不查 editing_workflow 权限**（claim-task / review-approve / review-reject / set-priority / mark-published / toggle-disqualified / reset-editing / assign-editor / record-watch / upload-source / upload-edited / upload-cover 只 requireUser）；`(dashboard)/editing/actions.ts` 的 loadTaskDetail / searchLiveAccounts 零鉴权。参考 delete-task.ts 的正确写法补 resolvePermission + buildEditingScopeWhere。
4. `api/editing/download/route.ts:14` IDOR：只查权限不查 scope，可遍历 taskId 拉全公司素材。修法：buildEditingScopeWhere EXISTS 校验。
5. upload-source/upload-edited route 先落盘后鉴权 → 未登录可刷生产 NAS。修法：鉴权提到 parseUploadToTemp 前。
6. `upload-source.ts:134`（upload-edited 同构）序号 TOCTOU：count→fileExists→rename 无锁，并发撞车 rename 静默覆盖。修法：排他落盘（link()+unlink() 或 COPYFILE_EXCL，EEXIST 时 seq++ 重试）。
7. `upload-source.ts:208`（upload-edited 同构）jsonb 数组 read-modify-write 并发丢更新。修法：SQL 原子追加 `|| ::jsonb`。
8. **全部状态转换无并发守卫**（claim/approve/reject/reset/mark-published/assign/upload-edited）：UPDATE WHERE 只有 id。修法：加 `AND status='<期望前状态>'`，rowCount=0 报「状态已变化」。
9. `match-douyin-video.ts:52` 自动绑定取最新视频且不排除已绑定 → 多任务绑同一视频。修法：NOT EXISTS 排除已绑 + ASC 取最早；alreadyBoundToTaskId 非空降级手填。
10. `scope.ts:37` scope=self 主播分支查 anchor_profile，但 anchor_id 现存钉钉 user_id → 主播看不到自己任务。修法：`eq(editing_task.anchor_id, userId)`。

### 🟠 P1 — 投放域

11. `placement/queries.ts:335,434` 打卡归因 join 缺 `AT TIME ZONE 'Asia/Shanghai'`，错位 8 小时（checkin/queries.ts:153 是正确写法）。
12. `filter-utils.ts:10` 今日/昨日预设用 UTC 日期，北京 0-8 点错一天。
13. `placements/actions.ts:42` deleteBatchAction 删后不触发归因（重算行 import_batch_id=null，batch 过滤选不到），最长 24h 显示 0。修法：删后调无 batch 过滤的 runAttributionJob 循环到 processed=0。
14. `placement-attribution/job.ts:27` max_rows 截断无循环、SELECT 无 ORDER BY → 晚间大上传尾部 dirty 滞留到次日 04:00。修法：内部 while 循环跑完。

### 🟠 P1 — worker 域

15. ✅(已改) 快手 today/history handler 单条脏数据中断整批。members.ts 还没改。

### 🟡 P2（已规划修复的）

- 剪辑：busboy 缺 `defParamCharset:"utf8"` 中文名乱码 + 不拒第二个 file part（upload-stream.ts）；换封面先删后写（upload-cover.ts）；事件与主表不同事务 + moveTemp 后失败不补偿（event-writer/route）；cleanup 加 .tmp 超 24h 清扫；group-by-date.ts / table/page.tsx / anchor-penalty.ts 时区统一 Asia/Shanghai。
- 投放：归因写回加 WHERE attribution_dirty=true 防 lost update（job.ts:131）；account-bindings upsert/delete 后 markDirtyByAccountDate + getActiveBindingsForAccount 补鉴权；ingest.ts batch 状态 try/finally 防卡 'parsing'。
- worker：✅(已改) 钉钉 deactivate 下限保护；✅(已改) checkin-history 鉴权。

### ⚪ 暂不修（设计决策类，需用户拍板）

- `incremental.ts:54` 累计回退 reset 语义：单日序列中平台向下修正会整段虚增（建议 clamp 0，但要确认业务语义）
- Omni 同备注多广告账户被 GREATEST 合并成 max 而非 sum（xlsx-omni-adapter.ts:151）
- batch 归属漂移：onConflict 无条件改写 import_batch_id（ingest.ts:161）
- dataset stub 投票自我强化污染（detect-dataset.ts）
- **worker cron 时区**：容器 UTC，注释写的 Shanghai 时刻实际全偏 8 小时（02:00 注释 = 实际北京 10:00 跑）。设 TZ=Asia/Shanghai 会改变现有任务触发时刻，且 anchor-penalty 日期算法目前靠「容器恰好 UTC」对齐——改 TZ 前必须先修 anchor-penalty（在剪辑域清单 #15）

---

## 另一件挂起的事：本地 qjhy-worker 容器更新失败

本地 worker 容器跑的还是 2026-04-30 的旧镜像。重建尝试了 4 次：
1-3. buildx/bake 全部卡死在网络拉取（基础镜像已手动 pull 解决）
4. legacy builder（DOCKER_BUILDKIT=0）推进到 `apk add chromium` 失败——alpine arm64 仓库 gtk+3.0/cairo 包依赖不齐（exit 7，cairo_device_destroy symbol not found），非本项目代码问题。

晚点的修法选项：① 等 alpine 仓库修复重试；② Dockerfile.worker 的 chromium 层 pin 包版本；③ 本地干脆 `docker stop qjhy-worker` 改用 `pnpm worker`（CLAUDE.md 推荐的开发方式）。
