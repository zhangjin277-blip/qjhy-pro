import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { auth_account, auth_session, auth_user, auth_verification } from "@/db/schema/auth";
import { env } from "@/lib/env";
import { isDingtalkProviderConfigured } from "./dingtalk-provider";

/**
 * better-auth 实例。
 *
 * - 表通过 `schema` 显式映射 better-auth model name -> Drizzle 导出（因为我们的表名带 `auth_` 前缀）。
 * - Phase 0：仅 email/password（应急后门），钉钉 OAuth Phase 1 接入。
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: auth_user,
      session: auth_session,
      account: auth_account,
      verification: auth_verification,
    },
  }),
  secret: env.AUTH_SECRET,
  baseURL: env.NEXT_PUBLIC_APP_URL,
  emailAndPassword: {
    enabled: true, // 应急后门
    autoSignIn: true,
  },
  // socialProviders: 在 Phase 1 实施时根据 better-auth 当时最新文档完成钉钉 OAuth 接入
});

export type Auth = typeof auth;

// 占位：Phase 1 启用真实 OAuth 时会消费此值
export const _dingtalkConfigured = isDingtalkProviderConfigured();
