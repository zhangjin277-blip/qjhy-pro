"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  ClipboardCheck,
  DatabaseZap,
  MonitorPlay,
  Music2,
  Radio,
  Settings2,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  AnchorDetailDrawer,
  type AnchorDetailIdentity,
} from "@/app/(dashboard)/anchors/_components/anchor-detail-drawer";
import { ALL_COLUMNS } from "@/app/(dashboard)/anchors/_components/column-presets";
import { KpiGrid, type KpiItem } from "@/components/patterns/kpi-grid";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useProjectSharedState } from "@/hooks/use-project-shared-state";
import { cn } from "@/lib/utils/cn";
import {
  COLLABORATION_ROLES,
  INITIAL_ECOLOGY_ROSTER,
  OFFICIAL_STAFF,
  type AnchorStage,
  type EcologyAnchorRecord,
  type EcologyRosterState,
} from "../_data/project-roster";
import { EcologyRosterManager } from "./ecology-roster-manager";
import { OfficialAnchorRoster } from "./official-anchor-roster";
import { OfficialDataPanel } from "./official-data-panel";
import { OfficialRotationSchedule } from "./official-rotation-schedule";
import { ExecutionTaskBoard } from "./execution-task-board";

type BusinessLineKind = "ecosystem" | "official";

interface OperatorSummary {
  operator: string;
  fan: number;
  liveHours: number;
  active: number;
  activate: number;
  rod: number;
  projectFlow: number;
}
interface AnchorMetricSummary {
  operator: string;
  anchorId: string;
  fan: number;
  liveHours: number;
  activate: number;
  projectFlow: number;
  active: number;
  rod: number;
}
interface AnchorProfileSummary {
  anchorId: string;
  nickName: string | null;
  avatar: string | null;
  douyinId: string | null;
}

type SummaryPreset = "last7" | "last30" | "thisMonth" | "previousMonth";

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSummaryPresetRange(preset: SummaryPreset): [string, string] {
  const today = new Date();
  const end = formatDateInput(today);
  if (preset === "last7" || preset === "last30") {
    const start = new Date(today);
    start.setDate(start.getDate() - (preset === "last7" ? 6 : 29));
    return [formatDateInput(start), end];
  }
  if (preset === "thisMonth") {
    return [formatDateInput(new Date(today.getFullYear(), today.getMonth(), 1)), end];
  }
  return [
    formatDateInput(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    formatDateInput(new Date(today.getFullYear(), today.getMonth(), 0)),
  ];
}

const PROJECT_DETAIL_COLUMN_KEYS = new Set([
  "controller_total_amount",
  "total_fan_ticket",
  "live_duration",
  "live_days",
  "show_uv",
  "watch_uv",
  "g_watch_ucnt",
  "g_active_ucnt",
  "g_total_amount",
  "v_total_amount",
]);
const PROJECT_DETAIL_KPI_KEYS = new Set([
  "controller_total_amount",
  "total_fan_ticket",
  "show_uv",
  "g_active_ucnt",
]);
const PROJECT_DETAIL_COLUMNS = ALL_COLUMNS.filter((column) =>
  PROJECT_DETAIL_COLUMN_KEYS.has(column.key),
);
const PROJECT_DETAIL_KPI_COLUMNS = PROJECT_DETAIL_COLUMNS.filter((column) =>
  PROJECT_DETAIL_KPI_KEYS.has(column.key),
);

export function BusinessLineView({
  kind,
  dateFrom,
  dateTo,
}: {
  kind: BusinessLineKind;
  dateFrom: string;
  dateTo: string;
}): React.JSX.Element {
  return kind === "ecosystem" ? (
    <EcosystemView dateFrom={dateFrom} dateTo={dateTo} />
  ) : (
    <OfficialView />
  );
}

function EcosystemView({
  dateFrom,
  dateTo,
}: {
  dateFrom: string;
  dateTo: string;
}): React.JSX.Element {
  const [selectedAnchor, setSelectedAnchor] = useState<EcologyAnchorRecord | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);
  const [summaryFrom, setSummaryFrom] = useState(dateFrom);
  const [summaryTo, setSummaryTo] = useState(dateTo);
  const {
    value: roster,
    update: updateRoster,
    saving: rosterSaving,
    error: rosterError,
  } = useProjectSharedState<EcologyRosterState>({
    projectKey: "zhaohua",
    stateKey: "ecology_roster",
    initialValue: INITIAL_ECOLOGY_ROSTER,
    localStorageKey: "zhaohua-ecology-roster-v1",
  });
  const anchors = roster.anchors;
  const operators = roster.operators;
  const [operatorSummaries, setOperatorSummaries] = useState<OperatorSummary[]>([]);
  const [anchorProfiles, setAnchorProfiles] = useState<AnchorProfileSummary[]>([]);
  const [anchorMetrics, setAnchorMetrics] = useState<AnchorMetricSummary[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [ranking, setRanking] = useState<{
    operator: string | null;
    key: keyof Omit<AnchorMetricSummary, "operator" | "anchorId">;
  } | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setSummaryFrom(dateFrom);
    setSummaryTo(dateTo);
  }, [dateFrom, dateTo]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/projects/zhaohua/ecology-summary?date_from=${summaryFrom}&date_to=${summaryTo}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("summary"))))
      .then(
        (body: {
          rows?: OperatorSummary[];
          profiles?: AnchorProfileSummary[];
          anchorMetrics?: AnchorMetricSummary[];
        }) => {
          setOperatorSummaries(body.rows ?? []);
          setAnchorProfiles(body.profiles ?? []);
          setAnchorMetrics(body.anchorMetrics ?? []);
        },
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setOperatorSummaries([]);
      });
    return () => controller.abort();
  }, [summaryFrom, summaryTo]);
  const summaryByOperator = useMemo(
    () => new Map(operatorSummaries.map((summary) => [summary.operator, summary])),
    [operatorSummaries],
  );
  const profileByAnchor = useMemo(
    () => new Map(anchorProfiles.map((profile) => [profile.anchorId, profile])),
    [anchorProfiles],
  );
  const detailIdentity = useMemo<AnchorDetailIdentity | null>(() => {
    if (!selectedAnchor?.anchorId) return null;
    return {
      anchor_id: selectedAnchor.anchorId,
      nick_name: selectedAnchor.liveName,
      is_threekingdoms: false,
      avatar: null,
      aweme_display_id: selectedAnchor.douyinId ?? null,
      broker_name: selectedAnchor.operator,
      recruit_broker_name: "造化仙府",
      projectLabel: "造化仙府",
    };
  }, [selectedAnchor]);
  const liveCount = anchors.filter((anchor) => anchor.stage === "已开播").length;
  const trainingCount = anchors.filter(
    (anchor) => anchor.source === "线下自营" && anchor.stage !== "已开播",
  ).length;
  const offlineLiveCount = anchors.filter(
    (anchor) => anchor.source === "线下自营" && anchor.stage === "已开播",
  ).length;
  const institutionLiveCount = anchors.filter(
    (anchor) => anchor.source === "线上机构" && anchor.stage === "已开播",
  ).length;
  const institutionGroups = Array.from(
    new Set(
      anchors
        .map((anchor) => anchor.institution)
        .filter((institution): institution is string => institution !== null),
    ),
  ).map((institution) => ({
    institution,
    anchors: anchors.filter((anchor) => anchor.institution === institution),
  }));
  const institutionCount = institutionGroups.reduce(
    (total, group) => total + group.anchors.length,
    0,
  );
  const kpis: KpiItem[] = [
    {
      key: "pool",
      label: "线下主播池",
      value: `${anchors.length} 人`,
      footer: "线下 + 线上机构",
    },
    {
      key: "live",
      label: "已开播",
      value: `${liveCount} 人`,
      footer: `线下 ${offlineLiveCount} · 机构 ${institutionLiveCount}`,
    },
    { key: "training", label: "培训 / 试岗", value: `${trainingCount} 人`, footer: "不含线上机构" },
    {
      key: "operator",
      label: "线下运营",
      value: `${operators.length} 人`,
      footer: "负责人 丁友发",
    },
  ];

  return (
    <div className="space-y-5">
      <BusinessHeader
        title="线下主播"
        subtitle="线下自营主播孵化与线上机构协同经营"
        icon={UsersRound}
        tone="bg-emerald-50 text-emerald-700 ring-emerald-100"
        status="运营中"
        links={[
          { label: "主播明细", href: "/anchors" },
          { label: "线上招募", href: "/anchors/recruit" },
        ]}
      />

      <KpiGrid items={kpis} />

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">运营分工</h3>
            <p className="mt-0.5 text-xs text-slate-500">丁友发统筹线下孵化运营并兼管线上机构</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ["last7", "近7天"],
                  ["last30", "近30天"],
                  ["thisMonth", "本月"],
                  ["previousMonth", "上月"],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    const [from, to] = getSummaryPresetRange(preset);
                    setSummaryFrom(from);
                    setSummaryTo(to);
                  }}
                  className="rounded px-2 py-1 text-[11px] text-slate-600 transition-colors hover:bg-white hover:text-primary"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <input
                type="date"
                value={summaryFrom}
                onChange={(event) => setSummaryFrom(event.target.value)}
                className="h-8 w-[126px] rounded-md border border-slate-200 bg-white px-2 text-slate-700"
                aria-label="线下主播统计开始日期"
              />
              <span>至</span>
              <input
                type="date"
                value={summaryTo}
                onChange={(event) => setSummaryTo(event.target.value)}
                className="h-8 w-[126px] rounded-md border border-slate-200 bg-white px-2 text-slate-700"
                aria-label="线下主播统计结束日期"
              />
            </div>
            {rosterError ? <span className="text-xs text-red-600">{rosterError}</span> : null}
            <Button type="button" size="sm" variant="outline" onClick={() => setManagerOpen(true)}>
              <Settings2 className="size-4" />
              管理人员
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {operators.map((operator) => {
            const assigned = anchors.filter((anchor) => anchor.operator === operator.name);
            const activeAssigned = assigned.filter((anchor) => anchor.stage !== "离职");
            const resignedAssigned = assigned.filter((anchor) => anchor.stage === "离职");
            const assignedLive = assigned.filter((anchor) => anchor.stage === "已开播").length;
            const assignedTraining = assigned.length - assignedLive;
            const summary = summaryByOperator.get(operator.name);
            return (
              <article
                key={operator.name}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-slate-900">{operator.name}</h4>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
                    {assigned.length} 名主播
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  跟进 {assignedLive} 名已开播主播
                  {assignedTraining > 0 ? `、${assignedTraining} 名培训/试岗主播` : ""}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 border-y border-slate-100 py-2.5 sm:grid-cols-3">
                  {[
                    [
                      "项目流水",
                      summary
                        ? `¥${summary.projectFlow.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
                        : "—",
                    ],
                    ["音浪", summary ? summary.fan.toLocaleString("zh-CN") : "—"],
                    ["开播时长", summary ? `${summary.liveHours.toFixed(1)}h` : "—"],
                    ["开播主播", summary ? `${summary.active} 人` : "—"],
                    ["激活", summary ? `${summary.activate} 人` : "—"],
                    ["挂摇杆", summary ? `${summary.rod} 人` : "—"],
                  ].map(([label, value]) => {
                    const metricKey = (
                      {
                        项目流水: "projectFlow",
                        音浪: "fan",
                        开播时长: "liveHours",
                        开播主播: "active",
                        激活: "activate",
                        挂摇杆: "rod",
                      } as Record<string, keyof Omit<AnchorMetricSummary, "operator" | "anchorId">>
                    )[label as string];
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={!metricKey}
                        onClick={() =>
                          metricKey
                            ? setRanking({ operator: operator.name, key: metricKey })
                            : undefined
                        }
                        className="min-w-0 text-left transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-inherit"
                      >
                        <div className="truncate text-[10px] text-slate-400">{label}</div>
                        <div className="mt-0.5 truncate text-xs font-semibold tabular-nums text-slate-700">
                          {value}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 overflow-hidden border-t border-slate-100">
                  {activeAssigned.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">暂未分配主播</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-[minmax(0,1fr)_110px_92px_16px] gap-2 border-b border-slate-100 py-2 text-[10px] text-slate-400">
                        <span>主播信息</span>
                        <span>开播时间</span>
                        <span>类型 / 阶段</span>
                        <span />
                      </div>
                      {activeAssigned.map((anchor) => (
                        <button
                          key={`${anchor.liveName}-${anchor.realName ?? "unknown"}`}
                          type="button"
                          onClick={() => setSelectedAnchor(anchor)}
                          className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_110px_92px_16px] items-center gap-2 border-b border-slate-100 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                        >
                          <AnchorProfileCell
                            anchor={anchor}
                            profile={profileByAnchor.get(anchor.anchorId ?? "")}
                            isOnAir={isAnchorOnAir(anchor, now)}
                          />
                          <span className="flex flex-col gap-0.5 text-[11px] tabular-nums text-slate-500">
                            {anchor.liveTimeSlots?.filter((slot) => slot.start && slot.end)
                              .length ? (
                              anchor.liveTimeSlots
                                .filter((slot) => slot.start && slot.end)
                                .map((slot) => (
                                  <span key={`${slot.start}-${slot.end}`}>
                                    {slot.start}-{slot.end}
                                  </span>
                                ))
                            ) : (
                              <span>待设置</span>
                            )}
                          </span>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                anchor.anchorType === "竞价主播"
                                  ? "bg-violet-50 text-violet-700"
                                  : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {anchor.anchorType === "竞价主播" ? "竞" : "生"}
                            </span>
                            <StageBadge stage={anchor.stage} note={anchor.stageNote} />
                          </span>
                          <ChevronRight className="ml-auto size-3.5 shrink-0 text-slate-300" />
                        </button>
                      ))}
                    </>
                  )}
                  {resignedAssigned.length > 0 ? (
                    <details className="group border-t border-slate-100 pt-1">
                      <summary className="cursor-pointer list-none rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight className="size-3 transition-transform group-open:rotate-90" />
                          已离职主播 · {resignedAssigned.length} 人
                        </span>
                      </summary>
                      <div className="border-t border-slate-100 bg-slate-50/60">
                        {resignedAssigned.map((anchor) => (
                          <button
                            key={`${anchor.liveName}-${anchor.realName ?? "unknown"}`}
                            type="button"
                            onClick={() => setSelectedAnchor(anchor)}
                            className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_110px_92px_16px] items-center gap-2 border-b border-slate-100 px-1 py-2 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                          >
                            <AnchorProfileCell
                              anchor={anchor}
                              profile={profileByAnchor.get(anchor.anchorId ?? "")}
                              isOnAir={isAnchorOnAir(anchor, now)}
                            />
                            <span className="flex flex-col gap-0.5 text-[11px] tabular-nums text-slate-500">
                              {anchor.liveTimeSlots?.filter((slot) => slot.start && slot.end)
                                .length ? (
                                anchor.liveTimeSlots
                                  .filter((slot) => slot.start && slot.end)
                                  .map((slot) => (
                                    <span key={`${slot.start}-${slot.end}`}>
                                      {slot.start}-{slot.end}
                                    </span>
                                  ))
                              ) : (
                                <span>待设置</span>
                              )}
                            </span>
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                  anchor.anchorType === "竞价主播"
                                    ? "bg-violet-50 text-violet-700"
                                    : "bg-slate-100 text-slate-600",
                                )}
                              >
                                {anchor.anchorType === "竞价主播" ? "竞" : "生"}
                              </span>
                              <StageBadge stage={anchor.stage} note={anchor.stageNote} />
                            </span>
                            <ChevronRight className="ml-auto size-3.5 shrink-0 text-slate-300" />
                          </button>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">线上机构清单</h3>
            <p className="mt-0.5 text-xs text-slate-500">丁友发兼管机构对接与主播经营</p>
          </div>
          <span className="text-xs text-slate-500">
            {institutionGroups.length} 家机构 · {institutionCount} 名主播
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {institutionGroups.map(({ institution, anchors }) => (
            <article key={institution} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">{institution}</h4>
                  <p className="mt-1 text-xs text-slate-500">对接负责人：丁友发</p>
                </div>
                <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">
                  {anchors.length} 名主播
                </span>
              </div>
              <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                {anchors.map((anchor) => (
                  <button
                    key={anchor.liveName}
                    type="button"
                    onClick={() => setSelectedAnchor(anchor)}
                    className="flex w-full min-w-0 items-center gap-2 py-2.5 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label={`查看 ${anchor.liveName} 的主播详情`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-blue-600">
                        <Music2 className="size-3 shrink-0" />
                        <span className="truncate">{anchor.liveName}</span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        直播：
                        {anchor.liveTimeSlots
                          ?.filter((slot) => slot.start && slot.end)
                          .map((slot) => `${slot.start}-${slot.end}`)
                          .join(" / ") || "时间待设置"}
                      </span>
                    </span>
                    <StageBadge stage={anchor.stage} note={anchor.stageNote} />
                    <ChevronRight className="size-3.5 shrink-0 text-slate-300" />
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <AnchorDetailDrawer
        anchor={detailIdentity}
        dateFrom={summaryFrom}
        dateTo={summaryTo}
        kpiColumns={PROJECT_DETAIL_KPI_COLUMNS}
        visibleColumns={PROJECT_DETAIL_COLUMNS}
        onOpenChange={(open) => {
          if (!open) setSelectedAnchor(null);
        }}
      />
      <UnboundAnchorDrawer
        anchor={selectedAnchor && !selectedAnchor.anchorId ? selectedAnchor : null}
        onOpenChange={(open) => {
          if (!open) setSelectedAnchor(null);
        }}
      />
      <AnchorRankingDrawer
        ranking={ranking}
        operators={operators.map((operator) => operator.name)}
        onRankingChange={setRanking}
        anchors={anchors}
        metrics={anchorMetrics}
        profiles={profileByAnchor}
        onOpenChange={(open) => {
          if (!open) setRanking(null);
        }}
      />
      <EcologyRosterManager
        open={managerOpen}
        roster={roster}
        saving={rosterSaving}
        serverError={rosterError}
        onOpenChange={setManagerOpen}
        onSave={(next) => updateRoster(() => next)}
      />
    </div>
  );
}

function AnchorProfileCell({
  anchor,
  profile,
  isOnAir = false,
}: {
  anchor: EcologyAnchorRecord;
  profile?: AnchorProfileSummary;
  isOnAir?: boolean;
}): React.JSX.Element {
  const nickname = profile?.nickName ?? anchor.liveName;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex w-12 shrink-0 flex-col items-center gap-1">
        <span
          className="relative cursor-pointer"
          role="link"
          tabIndex={0}
          title="打开直播间"
          onClick={(event) => {
            event.stopPropagation();
            const liveUrl = getAnchorLiveRoomUrl(anchor, profile);
            if (liveUrl) window.open(liveUrl, "_blank", "noopener,noreferrer");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              const liveUrl = getAnchorLiveRoomUrl(anchor, profile);
              if (liveUrl) window.open(liveUrl, "_blank", "noopener,noreferrer");
            }
          }}
        >
          {profile?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar}
              alt=""
              className={cn(
                "size-9 rounded-full object-cover ring-1",
                isOnAir ? "ring-rose-500 ring-2" : "ring-slate-200",
              )}
            />
          ) : (
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 ring-1",
                isOnAir ? "ring-rose-500 ring-2" : "ring-slate-200",
              )}
            >
              {nickname.slice(0, 1)}
            </span>
          )}
          {isOnAir ? (
            <span className="absolute -right-1 -bottom-0.5 flex size-4 items-center justify-center rounded-full border-2 border-white bg-rose-500 text-white">
              <Radio className="size-2.5" />
            </span>
          ) : null}
        </span>
        <span
          className="w-full truncate text-center text-[10px] font-medium leading-3 text-slate-700"
          title={anchor.realName ?? "实名待补充"}
        >
          {anchor.realName ?? "实名待补充"}
        </span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-slate-800">{nickname}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">
          抖音号：{profile?.douyinId ?? anchor.douyinId ?? "待绑定"}
        </span>
        <span className="block truncate text-[11px] text-slate-400">
          UID：{anchor.anchorId ?? "待绑定"}
        </span>
      </span>
    </span>
  );
}

function AnchorIdentity({
  anchor,
  compact = false,
}: {
  anchor: EcologyAnchorRecord;
  compact?: boolean;
}): React.JSX.Element {
  const isLive = anchor.stage === "已开播";
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span
        className={cn(
          "truncate font-medium",
          compact ? "text-xs" : "text-sm",
          isLive && anchor.realName ? "text-slate-800" : "text-amber-700",
        )}
      >
        {anchor.realName ?? "实名待补充"}
      </span>
      {isLive ? (
        <span
          className={cn(
            "flex min-w-0 items-center gap-1 truncate text-blue-600",
            compact ? "text-[11px]" : "text-xs",
          )}
          title={anchor.liveName}
        >
          <Music2 className="size-3 shrink-0" />
          <span className="truncate">{anchor.liveName}</span>
        </span>
      ) : (
        <span className={cn("truncate text-amber-600", compact ? "text-[11px]" : "text-xs")}>
          {formatStageLabel(anchor.stage, anchor.stageNote)}
        </span>
      )}
      <span className="truncate text-[11px] text-slate-400">
        直播：
        {anchor.liveTimeSlots
          ?.filter((slot) => slot.start && slot.end)
          .map((slot) => `${slot.start}-${slot.end}`)
          .join(" / ") || "时间待设置"}
      </span>
    </span>
  );
}

function AnchorRankingDrawer({
  ranking,
  operators,
  onRankingChange,
  anchors,
  metrics,
  profiles,
  onOpenChange,
}: {
  ranking: {
    operator: string | null;
    key: keyof Omit<AnchorMetricSummary, "operator" | "anchorId">;
  } | null;
  operators: string[];
  onRankingChange: (ranking: {
    operator: string | null;
    key: keyof Omit<AnchorMetricSummary, "operator" | "anchorId">;
  }) => void;
  anchors: EcologyAnchorRecord[];
  metrics: AnchorMetricSummary[];
  profiles: Map<string, AnchorProfileSummary>;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [sortKey, setSortKey] =
    useState<keyof Omit<AnchorMetricSummary, "operator" | "anchorId">>("projectFlow");
  const [sortDescending, setSortDescending] = useState(true);
  useEffect(() => {
    if (ranking) {
      setSortKey(ranking.key);
      setSortDescending(true);
    }
  }, [ranking]);
  const rows = ranking
    ? metrics
        .filter((item) => !ranking.operator || item.operator === ranking.operator)
        .map((item) => ({
          ...item,
          anchor: anchors.find((anchor) => anchor.anchorId === item.anchorId),
        }))
        .sort((a, b) => (sortDescending ? 1 : -1) * (Number(b[sortKey]) - Number(a[sortKey])))
    : [];
  const metricColumns: {
    key: keyof Omit<AnchorMetricSummary, "operator" | "anchorId">;
    label: string;
    format: (value: number) => string;
  }[] = [
    {
      key: "projectFlow",
      label: "项目流水",
      format: (value) => `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`,
    },
    { key: "fan", label: "音浪", format: (value) => value.toLocaleString("zh-CN") },
    { key: "liveHours", label: "开播时长", format: (value) => `${value.toFixed(1)}h` },
    { key: "active", label: "开播主播", format: (value) => `${value}天` },
    { key: "activate", label: "激活", format: (value) => `${value}人` },
    { key: "rod", label: "挂摇杆", format: (value) => `${value}天` },
  ];
  return (
    <Sheet open={ranking !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[760px] !max-w-[96vw] gap-0 p-0 sm:max-w-none">
        <div className="border-b border-slate-200 px-6 py-5">
          <SheetTitle className="text-base">主播经营排名</SheetTitle>
          <SheetDescription className="mt-1 text-xs">当前日期范围内的主播数据汇总</SheetDescription>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {[
              { value: null, label: "全部运营" },
              ...operators.map((operator) => ({ value: operator, label: operator })),
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => ranking && onRankingChange({ ...ranking, operator: option.value })}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs transition-colors",
                  ranking?.operator === option.value
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">暂无可排名数据</p>
          ) : (
            <>
              <div className="grid min-w-[800px] grid-cols-[28px_260px_88px_repeat(6,minmax(72px,1fr))] gap-2 border-b border-slate-200 pb-2 text-[10px] text-slate-400">
                <span>#</span>
                <span>主播信息</span>
                <span>运营</span>
                {metricColumns.map((column) => (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => {
                      if (sortKey === column.key) setSortDescending((value) => !value);
                      else {
                        setSortKey(column.key);
                        setSortDescending(true);
                      }
                    }}
                    className={cn(
                      "text-right transition-colors hover:text-primary",
                      sortKey === column.key && "font-semibold text-primary",
                    )}
                  >
                    {column.label}
                    {sortKey === column.key ? (sortDescending ? " ↓" : " ↑") : ""}
                  </button>
                ))}
              </div>
              {rows.map((row, index) => {
                const anchor = row.anchor;
                const profile = profiles.get(row.anchorId);
                const name = profile?.nickName ?? anchor?.liveName ?? "未命名主播";
                return (
                  <div
                    key={row.anchorId}
                    className="grid min-w-[800px] grid-cols-[28px_260px_88px_repeat(6,minmax(72px,1fr))] items-center gap-2 border-b border-slate-100 py-3"
                  >
                    <span className="w-5 text-center text-xs font-semibold text-slate-400">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex w-12 shrink-0 flex-col items-center gap-1">
                        <span className="size-10 shrink-0 overflow-hidden rounded-full bg-slate-100 text-center text-sm leading-10 text-slate-500">
                          {profile?.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar} alt="" className="size-full object-cover" />
                          ) : (
                            (anchor?.realName ?? name).slice(0, 1)
                          )}
                        </span>
                        <span className="w-full truncate text-center text-[10px] font-medium leading-3 text-slate-700">
                          {anchor?.realName ?? "实名待补充"}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">
                          {name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          抖音号：{profile?.douyinId ?? anchor?.douyinId ?? "待绑定"}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          UID：{row.anchorId}
                        </span>
                      </span>
                    </span>
                    <span className="truncate text-xs text-slate-500">{row.operator}</span>
                    {metricColumns.map((column) => (
                      <span
                        key={column.key}
                        className={cn(
                          "text-right text-xs font-semibold tabular-nums",
                          ranking?.key === column.key ? "text-primary" : "text-slate-700",
                        )}
                      >
                        {column.format(Number(row[column.key]))}
                      </span>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function UnboundAnchorDrawer({
  anchor,
  onOpenChange,
}: {
  anchor: EcologyAnchorRecord | null;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  return (
    <Sheet open={anchor !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[460px] !max-w-[92vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">
          {anchor?.realName ?? anchor?.liveName ?? "主播"}详情
        </SheetTitle>
        <SheetDescription className="sr-only">线下主播人员档案与数据绑定状态</SheetDescription>
        {anchor ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-xs text-slate-500">线下主播 · 人员档案</p>
              <div className="mt-3 flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {(anchor.realName ?? anchor.liveName).slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <AnchorIdentity anchor={anchor} />
                  <div className="mt-2">
                    <StageBadge stage={anchor.stage} note={anchor.stageNote} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-start gap-3 border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                <DatabaseZap className="mt-0.5 size-4 shrink-0" />
                <p>
                  {anchor.stage === "已开播"
                    ? "平台 UID 尚未绑定，经营数据暂不可用。补充 UID 后会自动接入主播明细。"
                    : "尚未开播，当前仅展示人员与培养阶段信息。"}
                </p>
              </div>
              <dl className="mt-5 divide-y divide-slate-100 border-y border-slate-100">
                {[
                  ["真实姓名", anchor.realName ?? "待补充"],
                  ["抖音昵称", anchor.stage === "已开播" ? anchor.liveName : "待定"],
                  ["人员来源", anchor.source],
                  ["线上机构", anchor.institution ?? "—"],
                  ["运营负责人", anchor.operator],
                  ["当前阶段", anchor.stageNote ?? anchor.stage],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 py-3 text-sm"
                  >
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="break-words font-medium text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OfficialView(): React.JSX.Element {
  const liveAnchors = OFFICIAL_STAFF.filter(
    (person) => person.role === "主播" && person.stage === "在播",
  ).length;
  const trainingAnchors = OFFICIAL_STAFF.filter(
    (person) => person.role === "主播" && person.stage === "培训中",
  ).length;
  const operators = OFFICIAL_STAFF.filter((person) => person.role.startsWith("运营")).length;
  const controllers = OFFICIAL_STAFF.filter((person) => person.role === "场控").length;
  const teamSummary = `长沙班组 ${OFFICIAL_STAFF.length} 人 · 主播 ${
    liveAnchors + trainingAnchors
  }（在播 ${liveAnchors} / 培训 ${trainingAnchors}）· 场控 ${controllers} · 运营 ${operators}`;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-100">
            <MonitorPlay className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">官号直播</h2>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            抖音运营中
          </span>
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <span className="size-1.5 rounded-full bg-amber-500" />
            视频号筹备中
          </span>
        </div>
      </section>

      <OfficialDataPanel teamSummary={teamSummary} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <OfficialRotationSchedule />
        <OfficialAnchorRoster />
      </div>
    </div>
  );
}

function BusinessHeader({
  title,
  subtitle,
  icon: Icon,
  tone,
  status,
  links,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: string;
  status: string;
  links: { label: string; href: string }[];
}): React.JSX.Element {
  return (
    <section className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg ring-1",
            tone,
          )}
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:border-primary/30 hover:text-primary"
          >
            {link.label}
            <ArrowRight className="size-3.5" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function isAnchorOnAir(anchor: EcologyAnchorRecord, now: Date): boolean {
  if (anchor.stage !== "已开播") return false;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return (anchor.liveTimeSlots ?? []).some((slot) => {
    const parse = (value: string): number | null => {
      const match = value.match(/^(\d{1,2}):(\d{2})$/);
      if (!match) return null;
      return Number(match[1]) * 60 + Number(match[2]);
    };
    const start = parse(slot.start);
    const end = parse(slot.end);
    if (start === null || end === null || start === end) return false;
    return start < end
      ? currentMinutes >= start && currentMinutes < end
      : currentMinutes >= start || currentMinutes < end;
  });
}

function getAnchorLiveRoomUrl(
  anchor: EcologyAnchorRecord,
  profile?: AnchorProfileSummary,
): string | null {
  if (anchor.liveRoomUrl?.trim()) return anchor.liveRoomUrl.trim();
  if (anchor.realName === "吴思君" || anchor.liveName.includes("杜康"))
    return "https://live.douyin.com/844388807672";
  return anchor.anchorId
    ? `https://live.douyin.com/${encodeURIComponent(anchor.anchorId)}`
    : profile?.douyinId
      ? `https://live.douyin.com/${encodeURIComponent(profile.douyinId)}`
      : null;
}

function formatStageLabel(stage: AnchorStage, note?: string): string {
  if (stage === "试岗中") {
    const arabicNumber = note?.match(/\d+/)?.[0];
    if (arabicNumber) return `试岗-${arabicNumber}`;

    const chineseNumber = note?.match(/(?:第)?([一二两三四五六七八九十]+)天/)?.[1];
    const chineseToArabic: Record<string, number> = {
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
    };
    if (chineseNumber && chineseToArabic[chineseNumber]) {
      return `试岗-${chineseToArabic[chineseNumber]}`;
    }
    return "试岗";
  }

  if (stage === "培训中") return "培训";
  return stage;
}

function StageBadge({ stage, note }: { stage: AnchorStage; note?: string }): React.JSX.Element {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium",
        stage === "已开播"
          ? "bg-emerald-50 text-emerald-700"
          : stage === "培训中"
            ? "bg-blue-50 text-blue-700"
            : "bg-amber-50 text-amber-700",
      )}
      title={note}
    >
      {formatStageLabel(stage, note)}
    </span>
  );
}

export function ExecutionView(): React.JSX.Element {
  return <ExecutionTaskBoard />;
}

export function TeamView(): React.JSX.Element {
  return (
    <div className="space-y-5">
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">团队与协作</h2>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            关系已确认
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">长沙负责业务执行，深圳恒星负责运营与投放协作</p>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <TeamSummaryCard
          title="长沙执行团队"
          subtitle="线下主播与官号直播"
          icon={Building2}
          tone="bg-blue-50 text-blue-700 ring-blue-100"
          rows={[
            ["线下主播", "丁友发 + 3名运营 + 16名线下主播"],
            ["线上机构", "桃桃乐 / 掀桌子，共5名主播"],
            ["官号直播", "3名运营 + 2名场控 + 10名主播"],
          ]}
        />
        <TeamSummaryCard
          title="深圳恒星"
          subtitle="项目协作方"
          icon={BriefcaseBusiness}
          tone="bg-violet-50 text-violet-700 ring-violet-100"
          rows={[
            ["运营对接", "杨钢"],
            ["投放对接", "傅晓烽"],
            ["恒星负责人", "杨晨"],
          ]}
        />
        <TeamSummaryCard
          title="管理沟通"
          subtitle="要求确认与内部承接"
          icon={ClipboardCheck}
          tone="bg-amber-50 text-amber-700 ring-amber-100"
          rows={[
            ["长沙", "黄建良"],
            ["恒星", "杨晨"],
            ["沟通内容", "项目要求、阶段决策与资源协调"],
          ]}
        />
      </section>

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">核心协作角色</h3>
          <p className="mt-0.5 text-xs text-slate-500">业务负责人、对接人与管理层沟通关系</p>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[130px_150px_170px_minmax(320px,1fr)] bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-500">
              <span>姓名</span>
              <span>组织</span>
              <span>项目角色</span>
              <span>职责范围</span>
            </div>
            {COLLABORATION_ROLES.map((person) => (
              <div
                key={`${person.organization}-${person.name}`}
                className="grid grid-cols-[130px_150px_170px_minmax(320px,1fr)] items-center border-t border-slate-100 px-4 py-3 text-sm"
              >
                <span className="font-medium text-slate-800">{person.name}</span>
                <span className="text-slate-600">{person.organization}</span>
                <span className="text-slate-600">{person.role}</span>
                <span className="text-slate-600">{person.responsibility}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function TeamSummaryCard({
  title,
  subtitle,
  icon: Icon,
  tone,
  rows,
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  tone: string;
  rows: string[][];
}): React.JSX.Element {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg ring-1", tone)}
        >
          <Icon className="size-4.5" />
        </span>
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
        {rows.map(([label, value]) => (
          <div key={label} className="py-2.5">
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium leading-5 text-slate-700">{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
