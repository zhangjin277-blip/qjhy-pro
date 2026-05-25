import { z } from "zod";
import { MODULE_KEYS } from "./modules";

export const ScopeSchema = z.enum(["none", "self", "team", "all"]);
export type Scope = z.infer<typeof ScopeSchema>;

export const ModuleKeySchema = z.enum(MODULE_KEYS);

export const PermissionSchema = z.object({
  scope: ScopeSchema,
  can_edit: z.boolean(),
  can_export: z.boolean(),
  can_admin: z.boolean(),
});
export type Permission = z.infer<typeof PermissionSchema>;

export const SetDeptLeaderInput = z.object({
  dept_id: z.string().min(1),
  user_id: z.string().min(1),
});
export type SetDeptLeaderInput = z.infer<typeof SetDeptLeaderInput>;

export const RemoveDeptLeaderInput = z.object({
  dept_id: z.string().min(1),
  user_id: z.string().min(1),
});
export type RemoveDeptLeaderInput = z.infer<typeof RemoveDeptLeaderInput>;

export const UpsertOverrideInput = z.object({
  user_id: z.string().min(1),
  module: ModuleKeySchema,
  scope: ScopeSchema.optional(),
  can_edit: z.boolean().optional(),
  can_export: z.boolean().optional(),
  can_admin: z.boolean().optional(),
  reason: z.string().min(1, "必须填变更理由"),
  expires_at: z.string().datetime().optional(),
});
export type UpsertOverrideInput = z.infer<typeof UpsertOverrideInput>;

/**
 * 批量写一个用户在多个 module 上的 override（UI 抽屉一次保存多个板块用）。
 */
export const UpsertOverrideBatchInput = z.object({
  user_id: z.string().min(1),
  reason: z.string().min(1, "必须填变更理由"),
  entries: z
    .array(
      z.object({
        module: ModuleKeySchema,
        scope: ScopeSchema.nullable(),
        can_edit: z.boolean().nullable().optional(),
        can_export: z.boolean().nullable().optional(),
        can_admin: z.boolean().nullable().optional(),
      }),
    )
    .min(1),
  /**
   * 委托视图：用户级别共享一组，写入每个 scope !== null 的 override 行。
   * - undefined / 不传：不动 delegated_user_ids（保留原值）
   * - null / 空数组：清除委托
   * - 非空数组：所有 module 行用同一组
   */
  delegated_user_ids: z.array(z.string()).nullable().optional(),
});
export type UpsertOverrideBatchInput = z.infer<typeof UpsertOverrideBatchInput>;

export const AssignUserPositionInput = z.object({
  user_id: z.string().min(1),
  position: z.string().min(1).nullable(), // null 表示清除分配（回落到钉钉 title）
  reason: z.string().min(1, "必须填变更理由"),
});
export type AssignUserPositionInput = z.infer<typeof AssignUserPositionInput>;

export const UpsertRoleDefaultInput = z.object({
  position: z.string().min(1),
  module: ModuleKeySchema,
  scope: ScopeSchema,
  can_edit: z.boolean(),
  can_export: z.boolean(),
  can_admin: z.boolean(),
  description: z.string().optional(),
});
export type UpsertRoleDefaultInput = z.infer<typeof UpsertRoleDefaultInput>;
