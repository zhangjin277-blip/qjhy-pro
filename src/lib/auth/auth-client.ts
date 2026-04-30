"use client";

import { createAuthClient } from "better-auth/react";
import { genericOAuthClient } from "better-auth/client/plugins";

/**
 * better-auth 客户端 SDK 实例。
 *
 * - genericOAuthClient 暴露 `authClient.signIn.oauth2({ providerId })` 用于触发钉钉 OAuth。
 * - baseURL 留空：默认走相对路径（同源），避免在浏览器里硬编码 NEXT_PUBLIC_APP_URL。
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
