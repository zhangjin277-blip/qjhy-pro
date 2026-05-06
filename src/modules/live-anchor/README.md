# live-anchor 模块

主播业务扩展（钉钉用户的"主播角色"扩展）。

- 表的存在 = "该用户是主播"的标记
- 钉钉同步覆盖 dingtalk_user 时**不会**动 live_anchor（业务字段隔离）
- 通过 account_anchor_default 关联多个 live_account（N:M）

## 入口
- `index.ts` — Server Actions + Zod schema + types
- `server.ts` — DB queries（仅 RSC / Server Action 用）

## 依赖
- `@/db/schema` (live_anchor 表, dingtalk_user 表)
- `@/lib/admin-guard` (仅 admin 可写)
- `@/lib/audit` (操作审计)
