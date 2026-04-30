import { env } from "@/lib/env";

/**
 * 钉钉 OAuth provider 占位配置。
 *
 * Phase 0：占位（DINGTALK_APP_KEY 为空时不注册）。
 * Phase 1：用户在钉钉开发者后台申请 H5 微应用后填入真实 token。
 */

export interface DingtalkProfile {
  unionid: string;
  openid: string;
  nick: string;
  avatarUrl: string;
  mobile?: string;
}

export const DINGTALK_OAUTH_CONFIG = {
  authorizationUrl: "https://login.dingtalk.com/oauth2/auth",
  tokenUrl: "https://api.dingtalk.com/v1.0/oauth2/userAccessToken",
  userInfoUrl: "https://api.dingtalk.com/v1.0/contact/users/me",
  scopes: ["openid", "corpid"],
  redirectURI: `${env.NEXT_PUBLIC_APP_URL}/api/auth/callback/dingtalk`,
};

export function isDingtalkProviderConfigured(): boolean {
  return Boolean(env.DINGTALK_APP_KEY && env.DINGTALK_APP_SECRET);
}

export function mapDingtalkProfileToUser(profile: DingtalkProfile) {
  return {
    id: profile.unionid,
    email: `${profile.unionid}@dingtalk.local`,
    name: profile.nick,
    image: profile.avatarUrl,
    emailVerified: true,
  };
}
