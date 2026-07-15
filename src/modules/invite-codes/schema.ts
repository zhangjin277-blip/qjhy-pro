import { z } from "zod";
import { ModuleKeySchema, ScopeSchema } from "@/modules/permissions";

export const InviteCodePermSpecSchema = z.object({
  module: ModuleKeySchema,
  scope: ScopeSchema,
  points: z.array(z.string().min(1)).max(64).default([]),
});

export const GenerateInviteCodeInput = z.object({
  perms: z.array(InviteCodePermSpecSchema).min(1, "至少配置一个模块权限"),
  max_uses: z.number().int().min(1).max(1000).default(1),
  /** ISO 字符串；null 表示永不过期 */
  expires_at: z.string().datetime().nullable().optional(),
  /** 注册出来的账号本身有效期 ISO；null 表示永久账号 */
  account_expire_at: z.string().datetime().nullable().optional(),
  note: z.string().max(200).nullable().optional(),
  /**
   * 委托视图：指定一组员工 user_id，注册账号将"代他们的 self 视角"看数据。
   * 空数组/未传 = 不启用委托，按 perms 里的 scope 走。
   */
  delegated_user_ids: z.array(z.string()).optional(),
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
