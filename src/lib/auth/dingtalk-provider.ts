import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

/**
 * 钉钉旧版 sns 扫码登录 provider 实现。
 *
 * 背景：钉钉新版 OAuth (api.dingtalk.com/v1.0/oauth2/userAccessToken + Contact.User.Read)
 * 多次实测都返回 403 / token 不带 Contact.User.Read scope，无法走通。
 * 切换到钉钉**旧版 sns 扫码**——这是钉钉公开扫码登录的标准方式，所有应用类型都支持，
 * 只需 `snsapi_login` scope（默认）+ HMAC-SHA256 签名换 user info。
 *
 * 接入方式：仍走 better-auth 1.6.9 的 `genericOAuth` 插件，但 `getToken` 把
 * "用 code 换 user info" 这一步直接做完，user_info 塞到 tokens.raw；
 * `getUserInfo` 从 tokens.raw 直接读，不再调远端。
 *
 * 钉钉开发者后台需配置回调地址（在「登录与分享」→「扫码登录」处）：
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

/** 钉钉 sns/getuserinfo_bycode 接口实际返回（小写下划线风格） */
export interface DingtalkSnsUserInfo {
  nick: string;
  unionid: string;
  openid: string;
  /** 钉钉历史字段，部分账号还会带 */
  dingId?: string;
  /** 文档里没明确声明，但实测部分账号会返回 */
  avatar?: string;
}

const SNS_USERINFO_URL = "https://oapi.dingtalk.com/sns/getuserinfo_bycode";

/**
 * 用 timestamp 和 APP_SECRET 算 HMAC-SHA256 签名（钉钉 sns 接口要求）。
 * 钉钉文档：signature = Base64(HMAC-SHA256(timestamp_ms, APP_SECRET))
 */
function signTimestamp(timestamp: string): string {
  return createHmac("sha256", env.DINGTALK_APP_SECRET).update(timestamp).digest("base64");
}

/**
 * 用 tmp_auth_code 换用户信息（钉钉 sns 旧版接口）。
 * 旧版 sns 没有独立的 token endpoint，code 直接换 user_info。
 */
export async function fetchSnsUserInfoByCode(code: string): Promise<DingtalkSnsUserInfo> {
  const timestamp = String(Date.now());
  const signature = signTimestamp(timestamp);
  const url = new URL(SNS_USERINFO_URL);
  url.searchParams.set("signature", signature);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("accessKey", env.DINGTALK_APP_KEY);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tmp_auth_code: code }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_SNS_HTTP_ERROR",
      `钉钉 sns 接口 HTTP 错误: ${res.status} ${body}`,
      500,
    );
  }
  const data = (await res.json()) as {
    errcode?: number;
    errmsg?: string;
    user_info?: DingtalkSnsUserInfo;
  };
  if (data.errcode !== 0 || !data.user_info) {
    throw new AppError(
      "DINGTALK_SNS_API_FAILED",
      `钉钉 sns 接口返回错误: errcode=${data.errcode} errmsg=${data.errmsg}`,
      500,
      { errcode: data.errcode, errmsg: data.errmsg },
    );
  }
  return data.user_info;
}

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}

/**
 * 把钉钉 sns user_info 映射为 better-auth 的 OAuth2UserInfo。
 *
 * 注意：钉钉 sns 返回 unionid（小写），与我们 db schema 的 dingtalk_user.unionid 一致。
 * 新版 OAuth 返回的是 unionId（驼峰），如果以后切回需注意大小写。
 */
export function mapSnsUserInfoToUser(info: DingtalkSnsUserInfo): OAuth2UserInfo {
  return {
    id: info.unionid,
    email: `${info.unionid}@dingtalk.local`,
    name: info.nick,
    image: info.avatar,
    emailVerified: true,
  };
}

/**
 * better-auth genericOAuth 的 `getToken` 钩子。
 * 钉钉旧版 sns 没有标准 token endpoint——直接用 code 拉 user_info，
 * 把 user_info 塞到 tokens.raw 里（getUserInfo 从 raw 读，不再调远端）。
 */
export async function dingtalkGetToken(data: { code: string }): Promise<OAuth2Tokens> {
  const userInfo = await fetchSnsUserInfoByCode(data.code);
  return {
    accessToken: `sns:${userInfo.unionid}`, // 占位 token，旧版 sns 不发 access_token
    scopes: ["snsapi_login"],
    raw: userInfo as unknown as Record<string, unknown>,
  };
}

/**
 * better-auth genericOAuth 的 `getUserInfo` 钩子。
 * 直接从 tokens.raw 拿 user_info，不再发请求。
 */
export async function dingtalkGetUserInfo(tokens: OAuth2Tokens): Promise<OAuth2UserInfo | null> {
  const raw = tokens.raw as DingtalkSnsUserInfo | undefined;
  if (!raw || !raw.unionid) {
    return null;
  }
  return mapSnsUserInfoToUser(raw);
}
