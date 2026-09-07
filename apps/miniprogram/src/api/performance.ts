import Taro from "@tarojs/taro";
import type { PerformanceResponse } from "../types/performance";

export async function fetchPerformance(month: string): Promise<PerformanceResponse> {
  const response = await Taro.request<PerformanceResponse | { error?: string }>({
    url: `${MINI_PROGRAM_API_BASE_URL}/api/miniprogram/v1/performance?month=${encodeURIComponent(month)}`,
    method: "GET",
    header: MINI_PROGRAM_DEV_USER_ID
      ? { "x-miniprogram-dev-user": MINI_PROGRAM_DEV_USER_ID }
      : undefined,
    timeout: 20000,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      (response.data as { error?: string }).error ?? `绩效请求失败 (${response.statusCode})`,
    );
  }
  return response.data as PerformanceResponse;
}
