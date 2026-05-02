import { z } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 钉钉统一授权登录 provider 实现。
 *
 * 这里使用新版 `login.dingtalk.com/oauth2/auth`，它支持已登录桌面钉钉的一键确认；
 * 旧版 sns/qrconnect 只能扫码，无法识别本机钉钉登录态。
 *
 * 钉钉的 token/userinfo 接口不是标准 OAuth2 形态：
 * - token 交换需要 JSON body: { clientId, clientSecret, code, grantType }
 * - userinfo 需要 header: x-acs-dingtalk-access-token
 * 所以仍走 better-auth genericOAuth，但覆写 `getToken` / `getUserInfo`。
 *
 * 钉钉开发者后台需配置回调地址（在「登录与分享」→「扫码登录」处）：
 *   http://localhost:3000/api/auth/oauth2/callback/dingtalk        (dev)
 *   https://qjhy.<domain>/api/auth/oauth2/callback/dingtalk        (prod)
 *
 * 同时需要在「权限管理」里给应用开通「通讯录个人信息读权限」等个人权限；
 * OAuth URL 的 scope 只传 `openid`，不要把接口权限名塞进 scope。
 */

/**
 * better-auth 1.6.9 generic-oauth 钩子签名所需的类型。
 * 不直接 import `@better-auth/core/oauth2`（它是 better-auth 的传递依赖、未在 package.json
 * 直接声明，import 不稳）。这里复刻签名所需字段，与上游 OAuth2Tokens / OAuth2UserInfo 兼容。
 */
interface OAuth2Tokens {
  tokenType?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes?: string[];
  idToken?: string;
  raw?: Record<string, unknown>;
}

interface OAuth2UserInfo {
  id: string | number;
  name?: string;
  email?: string | null;
  image?: string;
  emailVerified: boolean;
}

const DINGTALK_USER_ACCESS_TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const DINGTALK_USER_INFO_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

const dingtalkTokenSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  expireIn: z.number().optional(),
  corpId: z.string().optional(),
});

const dingtalkUserInfoSchema = z.object({
  nick: z.string().optional(),
  unionId: z.string().min(1),
  avatarUrl: z.string().optional(),
  openId: z.string().optional(),
  mobile: z.string().optional(),
  stateCode: z.string().optional(),
});

export type DingtalkOAuthUserInfo = z.infer<typeof dingtalkUserInfoSchema>;

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}

export async function fetchDingtalkUserAccessToken(code: string): Promise<OAuth2Tokens> {
  const res = await fetch(DINGTALK_USER_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env.DINGTALK_APP_KEY,
      clientSecret: env.DINGTALK_APP_SECRET,
      code,
      grantType: "authorization_code",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_OAUTH_TOKEN_HTTP_ERROR",
      `钉钉用户 token 接口 HTTP 错误: ${res.status} ${body}`,
      500,
    );
  }

  const json = (await res.json()) as unknown;
  const parsed = dingtalkTokenSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      "DINGTALK_OAUTH_TOKEN_INVALID_RESPONSE",
      `钉钉用户 token 接口响应格式异常: ${parsed.error.message}`,
      500,
      { response: json },
    );
  }

  const token = parsed.data;
  return {
    tokenType: "Bearer",
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    accessTokenExpiresAt: token.expireIn ? new Date(Date.now() + token.expireIn * 1000) : undefined,
    scopes: ["openid"],
    raw: token,
  };
}

export async function fetchDingtalkUserInfo(accessToken: string): Promise<DingtalkOAuthUserInfo> {
  const res = await fetch(DINGTALK_USER_INFO_URL, {
    method: "GET",
    headers: {
      "x-acs-dingtalk-access-token": accessToken,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_OAUTH_USERINFO_HTTP_ERROR",
      `钉钉用户信息接口 HTTP 错误: ${res.status} ${body}`,
      500,
    );
  }

  const json = (await res.json()) as unknown;
  const parsed = dingtalkUserInfoSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      "DINGTALK_OAUTH_USERINFO_INVALID_RESPONSE",
      `钉钉用户信息接口响应格式异常: ${parsed.error.message}`,
      500,
      { response: json },
    );
  }
  return parsed.data;
}

export function mapDingtalkUserInfoToUser(info: DingtalkOAuthUserInfo): OAuth2UserInfo {
  return {
    id: info.unionId,
    email: `${info.unionId}@dingtalk.local`,
    name: info.nick,
    image: info.avatarUrl,
    emailVerified: true,
  };
}

/**
 * better-auth genericOAuth 的 `getToken` 钩子。
 * 钉钉 token endpoint 使用 JSON body，不兼容标准 form-urlencoded 换 token。
 */
export async function dingtalkGetToken(data: { code: string }): Promise<OAuth2Tokens> {
  return fetchDingtalkUserAccessToken(data.code);
}

/**
 * better-auth genericOAuth 的 `getUserInfo` 钩子。
 * 钉钉用户信息接口使用 `x-acs-dingtalk-access-token`，不兼容标准 Bearer header。
 */
export async function dingtalkGetUserInfo(tokens: OAuth2Tokens): Promise<OAuth2UserInfo | null> {
  if (!tokens.accessToken) {
    return null;
  }
  const userInfo = await fetchDingtalkUserInfo(tokens.accessToken);
  return mapDingtalkUserInfoToUser(userInfo);
}
