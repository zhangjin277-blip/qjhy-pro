import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 钉钉 OAuth provider 完整实现（Phase 1）。
 *
 * 接入方式：better-auth 1.6.9 的 `genericOAuth` 插件。
 * - 钉钉 token 端点返回 camelCase（accessToken/refreshToken/expireIn），
 *   不符合标准 OAuth2 snake_case，所以走 `getToken` 自定义钩子。
 * - 钉钉 userinfo 端点用 `x-acs-dingtalk-access-token` header（不是 Bearer），
 *   也走 `getUserInfo` 自定义钩子。
 *
 * 钉钉开发者后台需配置回调地址（better-auth genericOAuth 的回调路径）：
 *   http://localhost:3000/api/auth/oauth2/callback/dingtalk        (dev)
 *   https://qjhy.<domain>/api/auth/oauth2/callback/dingtalk        (prod)
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

/** 钉钉 /contact/users/me 接口实际返回（camelCase） */
export interface DingtalkProfile {
  unionId: string;
  openId: string;
  nick: string;
  avatarUrl: string;
  mobile?: string;
  email?: string;
  stateCode?: string;
}

/** 钉钉 token 响应（camelCase，非标准 OAuth2 snake_case） */
interface DingtalkTokenResponse {
  accessToken: string;
  refreshToken: string;
  expireIn: number;
  corpId?: string;
}

const TOKEN_URL = "https://api.dingtalk.com/v1.0/oauth2/userAccessToken";
const USERINFO_URL = "https://api.dingtalk.com/v1.0/contact/users/me";

/**
 * 用 authorization_code 换 user access token（用户级，区别于应用级 token）。
 */
export async function exchangeCodeForUserToken(code: string): Promise<DingtalkTokenResponse> {
  const res = await fetch(TOKEN_URL, {
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
      "DINGTALK_OAUTH_TOKEN_FAILED",
      `钉钉 OAuth 换 token 失败: ${res.status} ${body}`,
      500,
    );
  }
  return (await res.json()) as DingtalkTokenResponse;
}

/**
 * 用 user access token 拉取当前用户 profile。
 */
export async function fetchDingtalkProfile(userAccessToken: string): Promise<DingtalkProfile> {
  const res = await fetch(USERINFO_URL, {
    headers: { "x-acs-dingtalk-access-token": userAccessToken },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_OAUTH_PROFILE_FAILED",
      `钉钉获取用户信息失败: ${res.status} ${body}`,
      500,
    );
  }
  return (await res.json()) as DingtalkProfile;
}

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}

/**
 * 把钉钉 profile 映射为 better-auth 的 OAuth2UserInfo。
 *
 * 注意：钉钉返回 unionId（驼峰），但我们 db schema 的 dingtalk_user 用 unionid（小写）。
 * 关联在 Task 4（同步表）后做。
 */
export function mapDingtalkProfileToUser(profile: DingtalkProfile): OAuth2UserInfo {
  return {
    id: profile.unionId,
    email: profile.email ?? `${profile.unionId}@dingtalk.local`,
    name: profile.nick,
    image: profile.avatarUrl,
    emailVerified: true,
  };
}

/**
 * better-auth genericOAuth 的 `getToken` 钩子。
 * 把钉钉 camelCase 响应转成 better-auth 期待的 OAuth2Tokens 形态。
 */
export async function dingtalkGetToken(data: { code: string }): Promise<OAuth2Tokens> {
  const tokens = await exchangeCodeForUserToken(data.code);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + tokens.expireIn * 1000),
    scopes: ["openid", "corpid"],
    raw: tokens as unknown as Record<string, unknown>,
  };
}

/**
 * better-auth genericOAuth 的 `getUserInfo` 钩子。
 */
export async function dingtalkGetUserInfo(tokens: OAuth2Tokens): Promise<OAuth2UserInfo | null> {
  if (!tokens.accessToken) {
    return null;
  }
  const profile = await fetchDingtalkProfile(tokens.accessToken);
  return mapDingtalkProfileToUser(profile);
}
