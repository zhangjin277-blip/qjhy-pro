import { Button, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { fetchPerformance } from "../../api/performance";
import type { PerformanceMetric, PerformanceResponse } from "../../types/performance";
import "./index.scss";

function currentMonth(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatValue(value: number, key: PerformanceMetric["key"]): string {
  if (key === "active_anchor_count") return `${Math.round(value)} 人`;
  if (Math.abs(value) >= 10000) return `${(value / 10000).toFixed(2)} 万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

export default function PerformancePage(): React.JSX.Element {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextMonth: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchPerformance(nextMonth));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "绩效加载失败");
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }, []);
  useDidShow(() => {
    if (!data && !loading) void load(month);
  });
  usePullDownRefresh(() => void load(month));

  return (
    <View className="performance-page">
      <View className="performance-header">
        <View>
          <Text className="performance-brand">QJHY 运营</Text>
          <Text className="performance-title">我的绩效</Text>
        </View>
        <Picker
          mode="date"
          fields="month"
          value={`${month}-01`}
          end={`${currentMonth()}-01`}
          onChange={(event) => {
            const next = event.detail.value.slice(0, 7);
            setMonth(next);
            void load(next);
          }}
        >
          <View className="month-picker">
            <Text>绩效月份</Text>
            <Text className="month-value">{month} ›</Text>
          </View>
        </Picker>
      </View>
      {error ? (
        <View className="performance-state">
          <Text>{error}</Text>
          <Button onClick={() => void load(month)}>重新加载</Button>
        </View>
      ) : null}
      {!error && data ? (
        <View className="performance-content">
          <View className="identity-row">
            <View>
              <Text className="identity-name">{data.user.name}</Text>
              <Text className="identity-meta">统计截至 {data.dateTo}</Text>
            </View>
            <View className="anchor-count">
              <Text className="anchor-count-value">{data.managedAnchorCount}</Text>
              <Text>管理主播</Text>
            </View>
          </View>
          {data.brokerNames.length === 0 ? (
            <View className="binding-warning">当前账号尚未绑定经纪人，请联系管理员配置</View>
          ) : null}
          <View className="progress-list">
            {data.metrics.map((metric) => (
              <View key={metric.key} className="progress-card">
                <View className="progress-heading">
                  <Text className="progress-label">{metric.label}</Text>
                  <Text className="progress-percent">
                    {metric.completionPercent === null
                      ? "未设置目标"
                      : `${metric.completionPercent.toFixed(1)}%`}
                  </Text>
                </View>
                <Text className="progress-value">{formatValue(metric.value, metric.key)}</Text>
                <View className="progress-track">
                  <View
                    className="progress-fill"
                    style={{ width: `${Math.min(metric.completionPercent ?? 0, 100)}%` }}
                  />
                </View>
                <View className="progress-footer">
                  <Text>
                    目标 {metric.target === null ? "--" : formatValue(metric.target, metric.key)}
                  </Text>
                  <Text>
                    剩余{" "}
                    {metric.remaining === null ? "--" : formatValue(metric.remaining, metric.key)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {loading && !data ? <View className="performance-state">正在读取本月数据...</View> : null}
    </View>
  );
}
