import { z } from "zod";
import { ModuleKeySchema, ScopeSchema } from "@/modules/permissions";

export const InviteCodePermSpecSchema = z.object({
  module: ModuleKeySchema,
  scope: ScopeSchema,
  can_edit: z.boolean().default(false),
  can_export: z.boolean().default(false),
  can_admin: z.boolean().default(false),
});

export const GenerateInviteCodeInput = z.object({
  perms: z.array(InviteCodePermSpecSchema).min(1, "至少配置一个模块权限"),
  max_uses: z.number().int().min(1).max(1000).default(1),
  /** ISO 字符串；null 表示永不过期 */
  expires_at: z.string().datetime().nullable().optional(),
  /** 注册出来的账号本身有效期 ISO；null 表示永久账号 */
  account_expire_at: z.string().datetime().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
});

export const RevokeInviteCodeInput = z.object({
  code: z.string().min(6),
});

export const RegisterByInviteInput = z.object({
  code: z.string().min(6),
  email: z.string().email("邮箱格式不正确"),
  password: z.string().min(8, "密码至少 8 位"),
  name: z.string().min(1, "请填写姓名").max(40),
});

export type GenerateInviteCodeInputType = z.infer<typeof GenerateInviteCodeInput>;
export type RegisterByInviteInputType = z.infer<typeof RegisterByInviteInput>;
