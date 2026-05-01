import { z } from "zod";

export const ScopeSchema = z.enum(["none", "self", "team", "all"]);
export type Scope = z.infer<typeof ScopeSchema>;

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
  scope: ScopeSchema.optional(),
  can_edit: z.boolean().optional(),
  can_export: z.boolean().optional(),
  can_admin: z.boolean().optional(),
  reason: z.string().min(1, "必须填变更理由"),
  expires_at: z.string().datetime().optional(),
});
export type UpsertOverrideInput = z.infer<typeof UpsertOverrideInput>;

export const UpsertRoleDefaultInput = z.object({
  position: z.string().min(1),
  scope: ScopeSchema,
  can_edit: z.boolean(),
  can_export: z.boolean(),
  can_admin: z.boolean(),
  description: z.string().optional(),
});
export type UpsertRoleDefaultInput = z.infer<typeof UpsertRoleDefaultInput>;
