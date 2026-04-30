/**
 * 钉钉开放平台 API 响应类型 + Zod schema。
 *
 * 当前混合使用了两套接口：
 *
 * - 新版 OAuth2 token 接口（api.dingtalk.com /v1.0/oauth2/accessToken）
 *   返回 camelCase 字段：accessToken / expireIn
 *
 * - 老版 topapi 部门/用户接口（oapi.dingtalk.com /topapi/...）
 *   返回 snake_case 字段：dept_id / parent_id / userid 等
 *   这部分接口在 PRO3（V9.5.0）已经验证可用，钉钉新版 contact API 字段
 *   命名不一致且分页机制不同，Phase 1 暂不迁移。
 */
import { z } from "zod";

// ---------- access_token（新版 v1.0 OAuth2）----------

export const DingtalkAccessTokenResponse = z.object({
  accessToken: z.string(),
  expireIn: z.number(),
});
export type DingtalkAccessTokenResponse = z.infer<typeof DingtalkAccessTokenResponse>;

// ---------- 部门 ----------

/** 老版 /topapi/v2/department/listsub 返回的部门项 */
export const DingtalkDept = z.object({
  dept_id: z.number(),
  name: z.string(),
  /** 上级部门 ID。根部门为 1，无 parent 时此字段可能缺失 */
  parent_id: z.number().nullable().optional(),
});
export type DingtalkDept = z.infer<typeof DingtalkDept>;

export const DingtalkDeptListResponse = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
  result: z.array(DingtalkDept).optional(),
  request_id: z.string().optional(),
});
export type DingtalkDeptListResponse = z.infer<typeof DingtalkDeptListResponse>;

// ---------- 用户 ----------

/**
 * 老版 /topapi/user/listsimple 返回的用户项。
 *
 * listsimple 是"简版"接口，只有 userid + name + 可选 unionid。
 * 不含 mobile / title / job_number 等详细字段——这些需要单独调
 * /topapi/v2/user/get 才能拿到。Phase 1 暂时只用 listsimple 同步基础信息，
 * 后续 Phase 3 同步详细资料时再扩展。
 */
export const DingtalkUser = z.object({
  userid: z.string(),
  name: z.string(),
  unionid: z.string().optional(),
  /** 由 fetchAllUsers 在去重时附加：用户所属的部门 ID 列表 */
  dept_id_list: z.array(z.number()).optional(),
  /**
   * DFS 顺序中第一次遇到该用户时的部门名（合成字段，非钉钉原生）。
   * ⚠️ 注意：这不一定是钉钉里设置的"主部门"——准确主部门需要从 dept_order_list（order 最小）取，
   * 但 listsimple 不返回该字段。Phase 3 接 /topapi/v2/user/get 时再补。
   * 当前用于快速展示，不要在权限/业务逻辑里依赖此字段做决策。
   */
  dept_name: z.string().optional(),
});
export type DingtalkUser = z.infer<typeof DingtalkUser>;

export const DingtalkUserListResult = z.object({
  list: z.array(DingtalkUser).optional(),
  has_more: z.boolean().optional(),
  next_cursor: z.number().optional(),
});
export type DingtalkUserListResult = z.infer<typeof DingtalkUserListResult>;

export const DingtalkUserListResponse = z.object({
  errcode: z.number(),
  errmsg: z.string().optional(),
  result: DingtalkUserListResult.optional(),
  request_id: z.string().optional(),
});
export type DingtalkUserListResponse = z.infer<typeof DingtalkUserListResponse>;
