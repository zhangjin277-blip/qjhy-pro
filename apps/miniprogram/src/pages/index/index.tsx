import { Button, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";
import { fetchDashboardOverview } from "../../api/dashboard";
import type { DashboardMetric, DashboardResponse, ProjectKey } from "../../types/dashboard";
import "./index.scss";

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDate(): string {
  return toIsoDate(new Date(Date.now() - 86_400_000));
}

function formatValue(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(2)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(2)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(value);
}

function changeText(change: number | null): string {
  if (change === null) return "暂无对比";
  if (Math.abs(change) < 0.01) return "较前一日持平";
  return `较前一日 ${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function MetricCard({
  metric,
  onClick,
}: {
  metric: DashboardMetric;
  onClick: () => void;
}): React.JSX.Element {
  const direction =
    metric.change_percent === null || Math.abs(metric.change_percent) < 0.01
      ? "flat"
      : metric.change_percent > 0
        ? "up"
        : "down";
  return (
    <View className="metric-card" hoverClass="metric-card--pressed" onClick={onClick}>
      <Text className="metric-label">{metric.label}</Text>
      <Text className="metric-value">{formatValue(metric.value)}</Text>
      <View className="metric-meta">
        <Text className={`metric-change metric-change--${direction}`}>
          {changeText(metric.change_percent)}
        </Text>
        <Text className="metric-anchor">{metric.anchor_count} 位主播</Text>
      </View>
      <View className="metric-link">
        <Text>查看排行</Text>
        <Text className="metric-link-arrow">›</Text>
      </View>
    </View>
  );
}

export default function DashboardPage(): React.JSX.Element {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [projectKey, setProjectKey] = useState<ProjectKey>("ddz");
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboardOverview(date));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "数据加载失败");
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }, []);

  useDidShow(() => {
    if (!data && !loading) void load(selectedDate);
  });
  usePullDownRefresh(() => void load(selectedDate));

  const handleDateChange = (event: { detail: { value: string } }): void => {
    const date = event.detail.value;
    setSelectedDate(date);
    void load(date);
  };

  const selectedProject = useMemo(
    () => data?.projects.find((project) => project.key === projectKey) ?? data?.projects[0],
    [data, projectKey],
  );

  const openRanking = (metric: DashboardMetric): void => {
    const project = selectedProject?.key ?? projectKey;
    void Taro.navigateTo({
      url: `/pages/ranking/index?date=${selectedDate}&project=${project}&metric=${metric.key}`,
    });
  };

  return (
    <View className="page-shell">
      <View className="summary-band">
        <View>
          <Text className="brand">QJHY 运营</Text>
          <Text className="summary-title">业务数据</Text>
        </View>
        <Picker
          mode="date"
          value={selectedDate}
          end={defaultDate()}
          start="2024-01-01"
          onChange={handleDateChange}
        >
          <View className="date-block">
            <Text className="date-label">数据日期 · 点击切换</Text>
            <View className="date-value-row">
              <Text className="date-value">{selectedDate}</Text>
              <Text className="date-chevron">›</Text>
            </View>
          </View>
        </Picker>
      </View>

      <View className="project-switch" role="tablist">
        {(
          data?.projects ?? [
            { key: "ddz" as const, label: "斗地主" },
            { key: "three" as const, label: "三国冰河时代" },
            { key: "zhaohua" as const, label: "造化仙府" },
          ]
        ).map((project) => (
          <Button
            key={project.key}
            className={`project-button${project.key === projectKey ? " project-button--active" : ""}`}
            onClick={() => setProjectKey(project.key)}
          >
            {project.label}
          </Button>
        ))}
      </View>

      {loading && !data ? <View className="state-line">正在读取业务数据...</View> : null}
      {error ? (
        <View className="error-state">
          <Text className="error-title">暂时无法加载</Text>
          <Text className="error-message">{error}</Text>
          <Button
            className="retry-button"
            loading={loading}
            onClick={() => void load(selectedDate)}
          >
            重新加载
          </Button>
        </View>
      ) : null}

      {!error && selectedProject ? (
        <View className="content-section">
          <View className="section-heading">
            <Text className="section-title">{selectedProject.label}</Text>
            <Button
              className="refresh-button"
              loading={loading}
              onClick={() => void load(selectedDate)}
            >
              刷新
            </Button>
          </View>
          <View className="metric-grid">
            {selectedProject.metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} onClick={() => openRanking(metric)} />
            ))}
          </View>
          <Text className="updated-at">
            更新于{" "}
            {new Date(data?.generated_at ?? "").toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
