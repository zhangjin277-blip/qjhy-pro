import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { auth_account, auth_session, auth_user, auth_verification } from "@/db/schema/auth";
import { env } from "@/lib/env";

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
    enabled: true,
    autoSignIn: true,
  },
});

export type Auth = typeof auth;
