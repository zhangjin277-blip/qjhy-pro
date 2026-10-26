import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@/db/client";
import { auth_account, auth_session, auth_user, auth_verification } from "@/db/schema/auth";
import { env } from "@/lib/env";
import { getTrustedOrigins } from "./trusted-origins";
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
 * - 钉钉 OAuth 通过 `genericOAuth` 插件注册：用钉钉统一授权登录入口，
 *   让桌面端已登录钉钉时可以直接确认登录。
 *   钉钉 token/userinfo 接口不是标准 OAuth2 形态，详见 dingtalk-provider.ts。
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
  // 内网/外网多地址访问场景：NAS 内网 IP / 域名都要进白名单。
  // env 没配 TRUSTED_ORIGINS 时 fallback 到默认 baseURL。
  trustedOrigins: getTrustedOrigins(),
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
              tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
              userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
              scopes: ["openid"],
              prompt: "consent",
              getToken: dingtalkGetToken,
              getUserInfo: dingtalkGetUserInfo,
            },
          ],
        }),
      ]
    : [],
});

export type Auth = typeof auth;
