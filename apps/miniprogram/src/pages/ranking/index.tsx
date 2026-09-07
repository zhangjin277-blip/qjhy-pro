import { Button, Text, View } from "@tarojs/components";
import Taro, { useLoad, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useState } from "react";
import { fetchMetricDetail } from "../../api/dashboard";
import type {
  MetricDetailResponse,
  MetricKey,
  ProjectKey,
  RankingItem,
} from "../../types/dashboard";
import "./index.scss";

interface RankingParams {
  date?: string;
  project?: string;
  metric?: string;
}

function formatNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
}

function displayValue(item: RankingItem, metric: MetricKey): string {
  if (metric === "new_anchor_count" || metric === "first_live_anchor_count") {
    return item.display_date ?? "--";
  }
  if (metric === "active_anchor_count") return `${formatNumber(item.value)} 天`;
  return formatNumber(item.value);
}

export default function RankingPage(): React.JSX.Element {
  const [params, setParams] = useState<{
    date: string;
    project: ProjectKey;
    metric: MetricKey;
  } | null>(null);
  const [data, setData] = useState<MetricDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (nextParams = params) => {
      if (!nextParams) return;
      setLoading(true);
      setError(null);
      try {
        setData(await fetchMetricDetail(nextParams.date, nextParams.project, nextParams.metric));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "明细加载失败");
      } finally {
        setLoading(false);
        Taro.stopPullDownRefresh();
      }
    },
    [params],
  );

  useLoad((query: RankingParams) => {
    if (!query.date || !query.project || !query.metric) {
      setError("缺少排行筛选条件");
      setLoading(false);
      return;
    }
    const nextParams = {
      date: query.date,
      project: query.project as ProjectKey,
      metric: query.metric as MetricKey,
    };
    setParams(nextParams);
    void load(nextParams);
  });
  usePullDownRefresh(() => void load());

  return (
    <View className="ranking-page">
      {data ? (
        <View className="ranking-summary">
          <View>
            <Text className="ranking-eyebrow">{data.project_label}</Text>
            <Text className="ranking-title">{data.metric_label}排行</Text>
          </View>
          <View className="ranking-date">
            <Text>数据日期</Text>
            <Text className="ranking-date-value">{data.date}</Text>
          </View>
        </View>
      ) : null}

      {loading && !data ? <View className="ranking-state">正在读取主播明细...</View> : null}
      {error ? (
        <View className="ranking-error">
          <Text className="ranking-error-title">暂时无法加载</Text>
          <Text className="ranking-error-message">{error}</Text>
          <Button className="ranking-retry" loading={loading} onClick={() => void load()}>
            重新加载
          </Button>
        </View>
      ) : null}

      {!error && data ? (
        <View className="ranking-content">
          <View className="ranking-count-row">
            <Text>Top {data.items.length}</Text>
            <Text>共 {data.total_anchors} 位主播</Text>
          </View>
          {data.items.length === 0 ? (
            <View className="ranking-empty">当日暂无达成主播</View>
          ) : (
            <View className="ranking-list">
              {data.items.map((item, index) => (
                <View className="ranking-row" key={item.anchor_id}>
                  <View className={`ranking-number ranking-number--${index + 1}`}>{index + 1}</View>
                  <View className="ranking-person">
                    <Text className="ranking-name">{item.nickname}</Text>
                    <Text className="ranking-meta">
                      {item.display_id ? `抖音号 ${item.display_id}` : "暂无抖音号"}
                      {item.broker_name ? ` · ${item.broker_name}` : ""}
                    </Text>
                  </View>
                  <Text className="ranking-value">{displayValue(item, data.metric)}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
