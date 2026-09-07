import Taro from "@tarojs/taro";
import type {
  DashboardResponse,
  MetricDetailResponse,
  MetricKey,
  ProjectKey,
} from "../types/dashboard";

interface ApiErrorBody {
  error?: string;
}

export async function fetchDashboardOverview(date: string): Promise<DashboardResponse> {
  const response = await Taro.request<DashboardResponse | ApiErrorBody>({
    url: `${MINI_PROGRAM_API_BASE_URL}/api/miniprogram/v1/dashboard/overview?date=${encodeURIComponent(date)}`,
    method: "GET",
    header: MINI_PROGRAM_DEV_USER_ID
      ? { "x-miniprogram-dev-user": MINI_PROGRAM_DEV_USER_ID }
      : undefined,
    timeout: 15000,
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as ApiErrorBody;
    if (response.statusCode === 401) {
      throw new Error("尚未配置小程序开发用户");
    }
    throw new Error(body.error ?? `数据请求失败 (${response.statusCode})`);
  }

  return response.data as DashboardResponse;
}

export async function fetchMetricDetail(
  date: string,
  project: ProjectKey,
  metric: MetricKey,
): Promise<MetricDetailResponse> {
  const query = `date=${encodeURIComponent(date)}&project=${project}&metric=${metric}`;
  const response = await Taro.request<MetricDetailResponse | ApiErrorBody>({
    url: `${MINI_PROGRAM_API_BASE_URL}/api/miniprogram/v1/dashboard/detail?${query}`,
    method: "GET",
    header: MINI_PROGRAM_DEV_USER_ID
      ? { "x-miniprogram-dev-user": MINI_PROGRAM_DEV_USER_ID }
      : undefined,
    timeout: 20000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = response.data as ApiErrorBody;
    throw new Error(body.error ?? `明细请求失败 (${response.statusCode})`);
  }
  return response.data as MetricDetailResponse;
}
