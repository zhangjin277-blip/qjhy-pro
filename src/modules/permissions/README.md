# permissions 模块

## 职责

实现 QJHY-Pro 的三层叠加权限模型，参考 spec 第 5 节。

## 公开 API（通过 `index.ts`）

- Types: `Scope`, `Permission`, `ResolvedPermission`, `PermissionSource`
- Schemas: `ScopeSchema`, `PermissionSchema`, `SetDeptLeaderInput`, `UpsertOverrideInput`, `UpsertRoleDefaultInput`
- Seed: `ROLE_DEFAULTS_SEED`
- (Task 10 起) `resolvePermission`, `mergePermissions`, `scopeAtLeast`, `MAX_SCOPE`
- (Task 11 起) `buildScopeWhereClause`, `getManagedDeptIds`
- (Task 12 起) Server Actions: `setDeptLeader`, `removeDeptLeader`, `upsertOverride`, `upsertRoleDefault`

## 三层叠加规则

```
最终权限 = MAX(
  岗位默认 (role_default_permission),
  是否 dept_leader (是→TEAM, 否→NONE),
  override (auth_permission_override)
)
```

`MAX` 在 scope 序上：`NONE < SELF < TEAM < ALL`。

## 必读

- 任何业务模块查询数据，**必须**经过 `applyScopeFilter`（Task 11 提供），不允许裸查询。
- 权限改动**必须**写 `audit_log`（reason 字段非空）。
