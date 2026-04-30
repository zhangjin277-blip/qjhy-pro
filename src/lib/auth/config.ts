import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@/db/client";
import { auth_account, auth_session, auth_user, auth_verification } from "@/db/schema/auth";
import { env } from "@/lib/env";
import {
  dingtalkGetToken,
  dingtalkGetUserInfo,
  isDingtalkProviderConfigured,
} from "./dingtalk-provider";

/**
 * better-auth 实例。
 *
 * - 表通过 `schema` 显式映射 better-auth model name -> Drizzle 导出（因为我们的表名带 `auth_` 前缀）。
 * - emailAndPassword 用作应急后门通道（详见 emergency-login.ts）。
 * - 钉钉 OAuth 通过 `genericOAuth` 插件注册（Phase 1）：
 *   钉钉 token 端点返回 camelCase（accessToken/expireIn）、userinfo 端点用 x-acs-dingtalk-access-token header，
 *   两者都不符合标准 OAuth2，所以走 `getToken` + `getUserInfo` 自定义钩子。
 *   回调路径由 better-auth 提供：`/api/auth/oauth2/callback/dingtalk`。
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
  plugins: isDingtalkProviderConfigured()
    ? [
        genericOAuth({
          config: [
            {
              providerId: "dingtalk",
              clientId: env.DINGTALK_APP_KEY,
              clientSecret: env.DINGTALK_APP_SECRET,
              authorizationUrl: "https://login.dingtalk.com/oauth2/auth",
              // tokenUrl 必填（即使被 getToken override），better-auth 用它做配置完整性校验
              tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
              userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
              scopes: ["openid", "corpid"],
              // 钉钉 token endpoint 返回 camelCase，自己处理
              getToken: dingtalkGetToken,
              // 钉钉 userinfo 用 x-acs-dingtalk-access-token header，自己处理
              getUserInfo: dingtalkGetUserInfo,
            },
          ],
        }),
      ]
    : [],
});

export type Auth = typeof auth;
