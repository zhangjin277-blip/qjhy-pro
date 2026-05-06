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
