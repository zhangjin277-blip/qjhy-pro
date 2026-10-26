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
import { z } from "zod";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

import {
  DingtalkAccessTokenResponse,
  DingtalkDeptListResponse,
  DingtalkUserListResponse,
  DingtalkUserDetailResponse,
  type DingtalkDept,
  type DingtalkUser,
  type DingtalkUserDetail,
} from "./types";

const DingtalkGetByUnionidResponse = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
  result: z
    .object({
      userid: z.string(),
      contact_type: z.number().optional(),
    })
    .optional(),
});

const NEW_API_BASE = "https://api.dingtalk.com";
const TOPAPI_BASE = "https://oapi.dingtalk.com";

let cachedToken: { token: string; expiresAt: number } | null = null;
/**
 * 正在进行中的 token 拉取请求（共享锁）。
 *
 * 当 N 个并发请求同时发现缓存失效时，只有第一个会真正发起 fetch，
 * 其余 N-1 个 await 同一个 Promise，避免对钉钉 token 接口造成 stampede
 * （限流 100 次/分钟/appkey）。
 */
let inflightTokenRequest: Promise<string> | null = null;

/**
 * 获取（带缓存 + 并发锁的）access_token。
 *
 * 钉钉 access_token 默认有效期 7200 秒，我们提前 100 秒刷新留余量。
 * check-then-act 中间用 inflight Promise 共享锁防止并发 stampede。
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (inflightTokenRequest) {
    return inflightTokenRequest;
  }
  inflightTokenRequest = fetchTokenFresh().finally(() => {
    inflightTokenRequest = null;
  });
  return inflightTokenRequest;
}

/**
 * 实际拉取一次新 token 并写入缓存。仅由 getAccessToken 调用，
 * 调用方负责并发控制（inflightTokenRequest 共享锁）。
 */
async function fetchTokenFresh(): Promise<string> {
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
async function callTopApi<T extends { errcode: number; errmsg?: string }>(
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

  const data = parsed.data;
  if (data.errcode !== 0) {
    throw new AppError(
      "DINGTALK_API_FAILED",
      `钉钉 API 业务错误 ${path}: errcode=${data.errcode} errmsg=${data.errmsg ?? ""}`,
      500,
      { path, errcode: data.errcode, errmsg: data.errmsg },
    );
  }

  return data;
}

/**
 * 拉取所有部门（深度递归）。
 *
 * 钉钉的 listsub 接口只返回直接子部门，需要递归遍历整棵树。
 * 根部门固定为 dept_id=1。
 *
 * 通过 visited set 防御异常脏数据导致的环路（钉钉理论上不会出现，但
 * 防御式编程更稳）。
 */
export async function fetchAllDepartments(): Promise<DingtalkDept[]> {
  const result: DingtalkDept[] = [];

  async function walk(parentId: number, visited: Set<number>): Promise<void> {
    if (visited.has(parentId)) return;
    visited.add(parentId);

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
      await walk(d.dept_id, visited);
    }
  }

  await walk(1, new Set<number>());
  return result;
}

/**
 * 拉取指定部门下所有用户（自动翻页）。
 *
 * 老版 listsimple 接口分页参数：cursor + size，size 最大 100，但 50 比较稳。
 * 返回 has_more=false 时翻页结束。
 *
 * 防护：
 * - 1000 页硬上限：单部门 50 * 1000 = 50000 用户，远超合理规模
 * - cursor 推进检查：如果 has_more=true 但 next_cursor 没动，立即报错
 *   避免无限循环
 */
export async function fetchUsersInDepartment(deptId: number): Promise<DingtalkUser[]> {
  const users: DingtalkUser[] = [];
  let cursor = 0;
  let hasMore = true;
  let pageCount = 0;

  while (hasMore) {
    if (pageCount++ > 1000) {
      throw new AppError("DINGTALK_PAGINATION_RUNAWAY", `部门 ${deptId} 分页超过 1000 页`, 500, {
        deptId,
        pageCount,
      });
    }

    const resp = await callTopApi(
      "/topapi/user/listsimple",
      { dept_id: deptId, cursor, size: 50 },
      DingtalkUserListResponse,
    );
    const list = resp.result?.list ?? [];
    users.push(...list);
    hasMore = resp.result?.has_more ?? false;
    const nextCursor = resp.result?.next_cursor ?? 0;

    // has_more=true 但 cursor 不前进 → 必定死循环，立即中断
    if (hasMore && nextCursor === cursor) {
      throw new AppError(
        "DINGTALK_PAGINATION_NO_PROGRESS",
        `部门 ${deptId} cursor 未推进（cursor=${cursor}, next_cursor=${nextCursor}）`,
        500,
        { deptId, cursor, nextCursor },
      );
    }
    cursor = nextCursor;
  }

  return users;
}

/**
 * 拉取组织内所有用户（按 userid 去重）。
 *
 * 同一用户可能挂在多个部门下，去重时合并 dept_id_list，记录 DFS 顺序中
 * 首次遇到的部门名作为 dept_name。⚠️ dept_name 不一定是钉钉里的"主部门"
 * （详见 types.ts 注释），仅用于展示。
 */
export async function fetchAllUsers(): Promise<DingtalkUser[]> {
  const depts = await fetchAllDepartments();
  const userMap = new Map<string, DingtalkUser>();

  // 根部门 dept_id=1 不在 fetchAllDepartments() 返回里（listsub(1) 只返子部门）。
  // 直接挂在企业根、未归任何子部门的员工只能从这里拉到，否则会漏。
  // 用 (root) 占位，不写回 dingtalk_dept 表。
  const ROOT_DEPT = { dept_id: 1, name: "（根部门）" };
  const allDepts = [ROOT_DEPT, ...depts];

  for (const dept of allDepts) {
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

/** 拉取单个人员的花名册详情，包括入职日期、岗位和完整部门列表。 */
export async function fetchUserDetail(userId: string): Promise<DingtalkUserDetail> {
  const response = await callTopApi(
    "/topapi/v2/user/get",
    { userid: userId, language: "zh_CN" },
    DingtalkUserDetailResponse,
  );
  if (!response.result) {
    throw new AppError("DINGTALK_USER_NOT_FOUND", "钉钉花名册中未找到该人员", 404, { userId });
  }
  return response.result;
}

/** 读取指定员工某天的考勤明细，字段原样保留给考勤模块解析。 */
export async function fetchUserAttendance(userId: string, workDate: string): Promise<Record<string, unknown>> {
  const response = await callTopApi(
    "/topapi/attendance/getupdatedata",
    { userid: userId, work_date: workDate },
    z.object({ errcode: z.number(), errmsg: z.string().optional(), result: z.record(z.string(), z.unknown()).optional() }),
  );
  return response.result ?? {};
}

/**
 * 通过钉钉 unionId 反查 userid（钉钉企业内通讯录的 userid）。
 *
 * 用途：钉钉 OAuth 登录后拿到 unionId，需要换成本企业 userid
 * 才能进入权限系统。
 *
 * 接口：POST /topapi/user/getbyunionid
 * 找不到时返回 null（钉钉会回 errcode=60121 不存在），调用方自行决定是否报错。
 */
export async function fetchUseridByUnionid(unionid: string): Promise<string | null> {
  try {
    const resp = await callTopApi(
      "/topapi/user/getbyunionid",
      { unionid },
      DingtalkGetByUnionidResponse,
    );
    return resp.result?.userid ?? null;
  } catch (err) {
    if (err instanceof AppError && err.code === "DINGTALK_API_FAILED") {
      return null;
    }
    throw err;
  }
}

const WorkNotificationResponse = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
  task_id: z.number().optional(),
  request_id: z.string().optional(),
});

/** 使用企业内部应用向指定员工发送工作通知。未配置 AgentId 时返回 false。 */
export async function sendWorkNotification(args: {
  userIds: string[];
  title: string;
  content: string;
  url: string;
}): Promise<boolean> {
  if (!env.DINGTALK_AGENT_ID || args.userIds.length === 0) return false;
  const agentId = Number(env.DINGTALK_AGENT_ID);
  if (!Number.isSafeInteger(agentId)) {
    throw new AppError("DINGTALK_AGENT_ID_INVALID", "DINGTALK_AGENT_ID 必须是数字", 500);
  }
  await callTopApi(
    "/topapi/message/corpconversation/asyncsend_v2",
    {
      agent_id: agentId,
      userid_list: args.userIds.join(","),
      to_all_user: false,
      msg: {
        msgtype: "oa",
        oa: {
          message_url: args.url,
          head: { bgcolor: "FF3370FF", text: "绩效考核" },
          body: { title: args.title, content: args.content },
        },
      },
    },
    WorkNotificationResponse,
  );
  return true;
}

/**
 * 仅供测试使用：清空 token 缓存 + inflight 锁。
 *
 * 生产代码不要调用——会导致下次请求多一次 token RTT。
 */
export function __resetTokenCacheForTest(): void {
  cachedToken = null;
  inflightTokenRequest = null;
}
