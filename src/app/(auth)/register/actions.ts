"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { auth_user } from "@/db/schema";
import { RegisterByInviteInput } from "@/modules/invite-codes";
import { consumeInviteCodeAndCreateUser, previewInviteCode } from "@/modules/invite-codes/server";

type RegisterErrorCode =
  | "INVALID_INPUT"
  | "INVITE_NOT_FOUND"
  | "INVITE_REVOKED"
  | "INVITE_EXPIRED"
  | "INVITE_EXHAUSTED"
  | "EMAIL_TAKEN"
  | "SIGNUP_FAILED"
  | "INTERNAL";

export type RegisterResult =
  | { ok: true; redirectTo: string }
  | {
      ok: false;
      code: RegisterErrorCode;
      message: string;
      issues?: { path: string; message: string }[];
    };

/**
 * 邀请码注册：原子流程
 * 1. zod 校验
 * 2. previewInviteCode 预查（未过期/未撤销/未用完）
 * 3. signUpEmail 创建 auth_user + 自动签 session
 * 4. consumeInviteCodeAndCreateUser 创建 ext dingtalk_user + 写权限 override + used_count++
 *    若失败：删 auth_user 回滚
 * 5. 标记 auth_user.is_external + expire_at
 */
export async function registerByInvite(input: unknown): Promise<RegisterResult> {
  const parsed = RegisterByInviteInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "表单校验失败",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    };
  }
  const data = parsed.data;

  // 步骤 2：预查（注意：consumeInviteCodeAndCreateUser 内部会 FOR UPDATE 再校验一遍，
  // 这里是早期 fail-fast 给用户更友好的提示）
  const preview = await previewInviteCode(data.code);
  if (!preview.ok) {
    const codeMap: Record<typeof preview.reason, RegisterResult> = {
      not_found: { ok: false, code: "INVITE_NOT_FOUND", message: "邀请码不存在" },
      revoked: { ok: false, code: "INVITE_REVOKED", message: "邀请码已被撤销" },
      expired: { ok: false, code: "INVITE_EXPIRED", message: "邀请码已过期" },
      exhausted: { ok: false, code: "INVITE_EXHAUSTED", message: "邀请码已用尽" },
    };
    return codeMap[preview.reason];
  }

  // 步骤 3：better-auth 创建账号
  let authUserId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: data.email, password: data.password, name: data.name },
      headers: await headers(),
    });
    if (!result.user?.id) {
      return { ok: false, code: "SIGNUP_FAILED", message: "账号创建失败（无返回 ID）" };
    }
    authUserId = result.user.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知错误";
    // better-auth 邮箱重复抛 "User already exists" 之类
    if (/exist|duplicate|unique/i.test(msg)) {
      return { ok: false, code: "EMAIL_TAKEN", message: "该邮箱已被注册" };
    }
    return { ok: false, code: "SIGNUP_FAILED", message: `账号创建失败：${msg}` };
  }

  // 步骤 4：消费邀请码 + 建 ext dingtalk_user + 写权限
  try {
    const { accountExpireAt } = await consumeInviteCodeAndCreateUser({
      code: data.code,
      authUserId,
      name: data.name,
    });

    // 步骤 5：标记 auth_user 为外部用户 + 账号有效期
    await db
      .update(auth_user)
      .set({
        isExternal: true,
        expireAt: accountExpireAt,
        updatedAt: new Date(),
      })
      .where(eq(auth_user.id, authUserId));

    return { ok: true, redirectTo: "/dashboard" };
  } catch (err) {
    // 回滚：删除 auth_user（cascade 删 auth_account / auth_session）
    await db.delete(auth_user).where(eq(auth_user.id, authUserId));
    const msg = err instanceof Error ? err.message : "INTERNAL";
    const map: Record<string, { code: RegisterErrorCode; message: string }> = {
      INVITE_NOT_FOUND: { code: "INVITE_NOT_FOUND", message: "邀请码不存在（被并发占用）" },
      INVITE_REVOKED: { code: "INVITE_REVOKED", message: "邀请码已被撤销" },
      INVITE_EXPIRED: { code: "INVITE_EXPIRED", message: "邀请码已过期" },
      INVITE_EXHAUSTED: { code: "INVITE_EXHAUSTED", message: "邀请码已用尽（被并发占用）" },
    };
    const hit = map[msg];
    if (hit) return { ok: false, ...hit };
    return { ok: false, code: "INTERNAL", message: `内部错误：${msg}` };
  }
}

/** 注册页加载时调用，预览邀请码状态（不消费） */
export async function previewInviteCodeAction(
  code: string,
): Promise<
  | { ok: true; remaining: number; modules: string[]; note: string | null }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "exhausted" }
> {
  const result = await previewInviteCode(code);
  if (!result.ok) return result;
  return {
    ok: true,
    remaining: result.remaining,
    modules: result.perms.map((p) => p.module),
    note: result.note,
  };
}
