# 软件库（software-library）板块须知

## 口径

- **权限**：独立 module key `software_library`。全员 scope=all（可浏览/下载），上传/编辑/删除/分类管理需 can_edit（默认仅总监/老板，可在权限页单独授权）。种子在 migration 0055 + role-defaults.ts 特例（四字段显式覆盖，勿只改一处）。
- **分类是硬删**（无 deleted_at）：删除前 categoryHasActiveItems 保护；软删条目的残留引用靠 FK `ON DELETE SET NULL` 自动落回未分类。
- **软件是软删**：NAS 物理文件保留，恢复=把 deleted_at 置 NULL。
- **物理路径与分类解耦**：`软件库/{yyyymm}/{md5前12}-{文件名}`，改分类/改名只动 DB。
- **MD5 去重**：同 hash 未删条目直接复用（上传返回 deduped=true）。

## 已知限制（有意为之，勿当 bug 修）

- **download_count 口径**：仅统计非 Range 首请求；IDM/迅雷多线程下载（首请求带 Range）不计数。内部工具，计数仅参考。
- **上传时长上限**：`maxDuration=600` 在 NAS standalone 部署下是 no-op，真实天花板是 Node `requestTimeout` 默认 300s——内网千兆够传 30GB+，走 VPN 慢链路超 5 分钟会 408。
- **并发同文件上传**：file_hash 无唯一索引（与素材库同款决策），并发双传同文件会产生两行共享同一 nas_path——软删不动物理文件，无实际损坏。
- **categoryId 非法值**：上传时不预检分类存在性，GB 级文件传完才在 insert 撞 FK（补偿删除完好，不留孤儿）。UI 只发合法 id，命中率≈0。

## migration 注意

- 本项目 drizzle journal 与实际 migration 脱节（0010+ 全手写 SQL + psql 应用），`pnpm db:generate/db:migrate` 不可用。加字段请手写 `src/db/migrations/00XX_*.sql` 并 `docker exec -i qjhy-postgres psql -U qjhy -d qjhy < 文件` 应用，NAS 部署时同样手动执行。
