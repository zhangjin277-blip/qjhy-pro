/**
 * 钉钉开放平台 API client。
 *
 * 设计要点：
 * - access_token 走新版 OAuth2 接口（api.dingtalk.com /v1.0/oauth2/accessToken）
 * - 部门/用户走老版 topapi 接口（oapi.dingtalk.com /topapi/...）—— 沿用 PRO3
 *   V9.5.0 已验证可用的路径，钉钉新版 contact API 命名/分页都有差异，Phase 1
 *   不迁移。
 * - token 缓存在模块级变量里，提前 100 秒刷新。Next.js 16 server-side 是
 *   常驻 Node.js 进程，模块变量在同一进程内会保留——这正是我们想要的。
 *   未来如部署到 edge runtime 需换成 KV 缓存。
 * - 所有错误用 AppError 抛出，code 走 DINGTALK_* 前缀。
 *
 * 参考实现：miracle-pro3/server/services/dingtalk/dingtalkOpenService.js
 */
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

import {
  DingtalkAccessTokenResponse,
  DingtalkDeptListResponse,
  DingtalkUserListResponse,
  type DingtalkDept,
  type DingtalkUser,
} from "./types";

const NEW_API_BASE = "https://api.dingtalk.com";
const TOPAPI_BASE = "https://oapi.dingtalk.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 获取（带缓存的）access_token。
 *
 * 钉钉 access_token 默认有效期 7200 秒，我们提前 100 秒刷新留余量。
 * 钉钉对 token 接口有限流（每个 appkey 100 次/分钟），但有缓存就不会触发。
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  if (!env.DINGTALK_APP_KEY || !env.DINGTALK_APP_SECRET) {
    throw new AppError("DINGTALK_NOT_CONFIGURED", "钉钉 APP_KEY 或 APP_SECRET 未配置", 500);
  }

  const res = await fetch(`${NEW_API_BASE}/v1.0/oauth2/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: env.DINGTALK_APP_KEY,
      appSecret: env.DINGTALK_APP_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new AppError(
      "DINGTALK_TOKEN_FAILED",
      `获取 access_token 失败: HTTP ${res.status} ${body}`,
      500,
      { status: res.status },
    );
  }

  const json: unknown = await res.json();
  const parsed = DingtalkAccessTokenResponse.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      "DINGTALK_TOKEN_INVALID_RESPONSE",
      `access_token 响应格式异常: ${parsed.error.message}`,
      500,
      { raw: json },
    );
  }

  cachedToken = {
    token: parsed.data.accessToken,
    // 提前 100 秒过期（钉钉默认 expireIn=7200）
    expiresAt: Date.now() + (parsed.data.expireIn - 100) * 1000,
  };
  return cachedToken.token;
}

/**
 * 调用老版 topapi 接口（POST + access_token query 参数）。
 *
 * 老版返回结构：{ errcode, errmsg, result, request_id }
 * errcode === 0 才是成功。响应外层用 envelopeSchema 校验。
 */
async function callTopApi<T>(
  path: string,
  body: Record<string, unknown>,
  envelopeSchema: import("zod").ZodType<T>,
): Promise<T> {
  const token = await getAccessToken();
  const url = `${TOPAPI_BASE}${path}?access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(
      "DINGTALK_API_HTTP_ERROR",
      `钉钉 API HTTP 错误 ${path}: ${res.status} ${text}`,
      500,
      { path, status: res.status },
    );
  }

  const json: unknown = await res.json();
  const parsed = envelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new AppError(
      "DINGTALK_API_INVALID_RESPONSE",
      `钉钉 API 响应格式异常 ${path}: ${parsed.error.message}`,
      500,
      { path, raw: json },
    );
  }

  // 所有 topapi 响应都有 errcode 字段，我们在 schema 里强制要求
  const data = parsed.data as { errcode: number; errmsg?: string };
  if (data.errcode !== 0) {
    throw new AppError(
      "DINGTALK_API_FAILED",
      `钉钉 API 业务错误 ${path}: errcode=${data.errcode} errmsg=${data.errmsg ?? ""}`,
      500,
      { path, errcode: data.errcode, errmsg: data.errmsg },
    );
  }

  return parsed.data;
}

/**
 * 拉取所有部门（深度递归）。
 *
 * 钉钉的 listsub 接口只返回直接子部门，需要递归遍历整棵树。
 * 根部门固定为 dept_id=1。
 */
export async function fetchAllDepartments(): Promise<DingtalkDept[]> {
  const result: DingtalkDept[] = [];

  async function walk(parentId: number): Promise<void> {
    const resp = await callTopApi(
      "/topapi/v2/department/listsub",
      { dept_id: parentId },
      DingtalkDeptListResponse,
    );
    const depts = resp.result ?? [];
    for (const d of depts) {
      result.push({
        dept_id: d.dept_id,
        name: d.name,
        parent_id: parentId,
      });
      // 递归子部门
      await walk(d.dept_id);
    }
  }

  await walk(1);
  return result;
}

/**
 * 拉取指定部门下所有用户（自动翻页）。
 *
 * 老版 listsimple 接口分页参数：cursor + size，size 最大 100，但 50 比较稳。
 * 返回 has_more=false 时翻页结束。
 */
export async function fetchUsersInDepartment(deptId: number): Promise<DingtalkUser[]> {
  const users: DingtalkUser[] = [];
  let cursor = 0;
  let hasMore = true;

  while (hasMore) {
    const resp = await callTopApi(
      "/topapi/user/listsimple",
      { dept_id: deptId, cursor, size: 50 },
      DingtalkUserListResponse,
    );
    const list = resp.result?.list ?? [];
    users.push(...list);
    hasMore = resp.result?.has_more ?? false;
    cursor = resp.result?.next_cursor ?? 0;
  }

  return users;
}

/**
 * 拉取组织内所有用户（按 userid 去重）。
 *
 * 同一用户可能挂在多个部门下，去重时合并 dept_id_list，记录首次出现的
 * 部门名作为 dept_name（与 PRO3 行为一致）。
 */
export async function fetchAllUsers(): Promise<DingtalkUser[]> {
  const depts = await fetchAllDepartments();
  const userMap = new Map<string, DingtalkUser>();

  for (const dept of depts) {
    const users = await fetchUsersInDepartment(dept.dept_id);
    for (const u of users) {
      const existing = userMap.get(u.userid);
      if (existing) {
        const ids = existing.dept_id_list ?? [];
        if (!ids.includes(dept.dept_id)) {
          ids.push(dept.dept_id);
        }
        existing.dept_id_list = ids;
      } else {
        userMap.set(u.userid, {
          ...u,
          dept_id_list: [dept.dept_id],
          dept_name: dept.name,
        });
      }
    }
  }

  return Array.from(userMap.values());
}

/**
 * 仅供测试使用：清空 token 缓存。
 *
 * 生产代码不要调用——会导致下次请求多一次 token RTT。
 */
export function __resetTokenCacheForTest(): void {
  cachedToken = null;
}
