/**
 * 钉钉开放平台 API client 公开入口。
 *
 * 仅暴露业务函数和类型，不暴露内部 token 缓存或 callTopApi 等实现细节。
 */
export { fetchAllDepartments, fetchUsersInDepartment, fetchAllUsers } from "./client";

export type { DingtalkDept, DingtalkUser, DingtalkAccessTokenResponse } from "./types";
