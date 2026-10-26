# permissions 模块

## 职责

实现 QJHY-Pro 的岗位通用权限与个人定制权限。2026-10-17 起，个人设置优先于岗位及管理部门默认范围。

## 公开 API（通过 `index.ts`）

- Types: `Scope`, `Permission`, `ResolvedPermission`, `PermissionSource`
- Schemas: `ScopeSchema`, `PermissionSchema`, `SetDeptLeaderInput`, `UpsertOverrideInput`, `UpsertRoleDefaultInput`
- Seed: `ROLE_DEFAULTS_SEED`
- (Task 10 起) `resolvePermission`, `mergePermissions`, `scopeAtLeast`, `MAX_SCOPE`
- (Task 11 起) `buildScopeWhereClause`, `getManagedDeptIds`
- (Task 12 起) Server Actions: `setDeptLeader`, `removeDeptLeader`, `upsertOverride`, `upsertRoleDefault`

## 通用与个人权限

```
通用数据范围 = MAX(岗位默认范围, 是否 dept_leader (是→TEAM, 否→NONE))
最终数据范围 = 个人范围非 null ? 个人范围 : 通用数据范围
最终操作权限 = 个人权限点非 null ? 个人权限点 : 岗位默认权限点
```

`MAX` 仅用于通用范围，顺序为 `NONE < SELF < TEAM < ALL`。个人范围可以扩大、收窄或设为 `NONE`，部门负责人身份不再覆盖明确的个人设置。

范围和操作权限分别继承：个人只改范围时保留岗位操作权限；只改操作权限时保留通用范围。`null` 或未设置表示继承，空权限点数组表示清空操作权限。个人设置过期或移除后恢复通用权限；后续调整岗位不会覆盖仍有效的个人设置。“复用员工权限”保留被复制员工的 `NONE` 范围。

## 必读

- 任何业务模块查询数据，**必须**经过 `applyScopeFilter`（Task 11 提供），不允许裸查询。
- 权限改动**必须**写 `audit_log`（reason 字段非空）。

考勤例外：全员本人、后台“管理部门”负责人本人及负责部门/子部门、独立超级管理员及应急管理员全部；考勤固定数据范围，不采用旧岗位/覆盖的范围或委托视图。操作权限点仍可单独授予，全员默认具备范围内审批读取。

超级管理员：`auth_super_admin` 独立存储，只对在职内部钉钉账号生效；在岗位、覆盖、考勤固定范围和委托视图之前返回全部数据范围及注册表全部权限点。赋权须核对唯一钉钉 userid 并记录 `SUPER_ADMIN_GRANTED` 审计，不能通过普通岗位或权限覆盖提权。0080 迁移仅建表，不默认赋权。
