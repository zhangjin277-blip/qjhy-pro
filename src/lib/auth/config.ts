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
 * - 钉钉 OAuth 通过 `genericOAuth` 插件注册：用钉钉**旧版 sns 扫码**协议
 *   （新版 OAuth + Contact.User.Read 实测无法走通，详见 dingtalk-provider.ts 注释）。
 *   `getToken` 直接用 code 调 sns/getuserinfo_bycode 拿 user_info，塞到 tokens.raw；
 *   `getUserInfo` 从 raw 读，不再发请求。
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
              // 旧版 sns 扫码授权页（注意是 oapi 域名，不是 login.dingtalk.com）
              authorizationUrl: "https://oapi.dingtalk.com/connect/qrconnect",
              // 旧版 sns 没有独立的 token endpoint。tokenUrl/userInfoUrl 必填仅用于
              // better-auth 的配置完整性校验，实际不会被调用（被 getToken/getUserInfo override）。
              tokenUrl: "https://oapi.dingtalk.com/sns/getuserinfo_bycode",
              userInfoUrl: "https://oapi.dingtalk.com/sns/getuserinfo_bycode",
              scopes: ["snsapi_login"],
              // 钉钉旧版 qrconnect 文档要求参数名是 `appid`（不是标准 OAuth2 的 `client_id`）。
              // better-auth 默认会发 client_id，这里额外补 appid 兼容。
              authorizationUrlParams: {
                appid: env.DINGTALK_APP_KEY,
              },
              // 旧版 sns：用 code 直接换 user_info，塞到 raw
              getToken: dingtalkGetToken,
              // 从 raw 读 user_info，不再调远端
              getUserInfo: dingtalkGetUserInfo,
            },
          ],
        }),
      ]
    : [],
});

export type Auth = typeof auth;
