import { describe, expect, it } from "vitest";
import type { DashboardOverviewResponse, Section2Metric } from "@/modules/dashboard";
import { toMiniProgramDashboard, toMiniProgramMetricDetail } from "@/modules/miniprogram";

function overview(): DashboardOverviewResponse {
  const metrics: Section2Metric[] = [
    "total_fan_ticket",
    "flow",
    "active_anchor_count",
    "new_anchor_count",
    "first_live_anchor_count",
  ];
  return {
    date_from: "2026-08-10",
    date_to: "2026-08-10",
    core: {
      total_fan_ticket: { current: 0, prev_day: null, prev_week: null },
      flow: { current: 0, prev_day: null, prev_week: null },
      active_anchor_count: { current: 0, prev_day: null, prev_week: null },
      new_anchor_count: { current: 0, prev_day: null, prev_week: null },
      first_live_anchor_count: { current: 0, prev_day: null, prev_week: null },
    },
    breakdown: metrics.map((metric, metricIndex) => ({
      metric,
      ddz: project("ddz", metricIndex + 1),
      three: project("three", metricIndex + 11),
      zhaohua: project("zhaohua", metricIndex + 21),
    })),
  };
}

function project(projectKey: "ddz" | "three" | "zhaohua", value: number) {
  const cell = {
    project: projectKey,
    group: "all" as const,
    value,
    prev_value: value - 1,
    vs_prev: 10,
    anchor_count: 3,
    sparkline: [value - 1, value],
  };
  return {
    project: projectKey,
    total: cell,
    online: { ...cell, group: "online" as const },
    offline: { ...cell, group: "offline" as const },
    other: { ...cell, group: "other" as const },
  };
}

describe("toMiniProgramDashboard", () => {
  it("returns five mobile KPI values for every project", () => {
    const result = toMiniProgramDashboard(overview(), "2026-08-11T00:00:00.000Z");

    expect(result.date).toBe("2026-08-10");
    expect(result.projects).toHaveLength(3);
    expect(result.projects[0]?.metrics).toHaveLength(5);
    expect(result.projects[0]?.metrics[0]).toMatchObject({
      key: "total_fan_ticket",
      label: "音浪",
      value: 1,
      previous: 0,
      anchor_count: 3,
    });
    expect(result.projects[2]?.metrics[4]?.value).toBe(25);
  });

  it("maps dashboard drawer anchors into a mobile ranking response", () => {
    const result = toMiniProgramMetricDetail(
      {
        title: "斗地主",
        kpis: [],
        daily_rows: [],
        prev_daily_rows: [],
        total_anchors: 1,
        top_anchors: [
          {
            anchor_id: "anchor-1",
            nick_name: "测试主播",
            avatar: null,
            aweme_display_id: "douyin-1",
            broker_name: "测试经纪人",
            metric_value: 12345,
          },
        ],
      },
      "2026-05-21",
      "ddz",
      "total_fan_ticket",
    );

    expect(result).toMatchObject({
      date: "2026-05-21",
      project_label: "斗地主",
      metric_label: "音浪",
      total_anchors: 1,
      items: [
        {
          anchor_id: "anchor-1",
          nickname: "测试主播",
          display_id: "douyin-1",
          value: 12345,
        },
      ],
    });
  });
});
