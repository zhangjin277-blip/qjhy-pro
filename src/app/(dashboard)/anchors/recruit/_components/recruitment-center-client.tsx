"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { DataToolbar } from "@/components/patterns/data-toolbar";
import { KpiGrid } from "@/components/patterns/kpi-grid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildMonthlyTrend,
  buildRecruiterMetrics,
  buildRecruitmentFunnel,
  getRecruitmentCenterAction,
  PIPELINE_STAGE_LABEL,
  syncRecruitmentPipelineFromDingtalkAction,
  type RecruitmentApplicationRow,
  type RecruitmentBoardData,
  type RecruitmentCenterData,
  type RecruitmentPipelineStage,
} from "@/modules/business-recruitment";

import { DemandDialog } from "./demand-dialog";
import { PipelineDialog } from "./pipeline-dialog";
import { PipelineImportDialog } from "./pipeline-import-dialog";
import { RecruitmentClient } from "./recruitment-client";

type OverviewPeriod = "all" | "month" | "thisWeek" | "lastWeek";

function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekRange(offset: number): { from: string; to: string } {
  const today = new Date();
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1 + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: localIsoDate(monday), to: localIsoDate(sunday) };
}

export function RecruitmentCenterClient({
  initialCenter,
  initialBoard,
  products,
}: {
  initialCenter: RecruitmentCenterData;
  initialBoard: RecruitmentBoardData;
  products: string[];
}) {
  const [center, setCenter] = useState(initialCenter);
  const [refreshing, startRefresh] = useTransition();

  const refresh = () => {
    startRefresh(async () => {
      try {
        setCenter(await getRecruitmentCenterAction({}));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "刷新失败");
      }
    });
  };

  return (
    <Tabs defaultValue="overview" className="gap-3">
      <div className="flex min-h-10 items-center justify-between border-b">
        <TabsList variant="line" className="h-10">
          <TabsTrigger value="overview">
            <BarChart3 />
            总览
          </TabsTrigger>
          <TabsTrigger value="pipeline">
            <Users />
            候选人
          </TabsTrigger>
          <TabsTrigger value="demand">
            <BriefcaseBusiness />
            招聘需求
          </TabsTrigger>
          <TabsTrigger value="review">线上招募</TabsTrigger>
        </TabsList>
        {refreshing && <LoaderCircle className="mr-2 size-4 animate-spin text-muted-foreground" />}
      </div>
      <TabsContent value="overview">
        <OverviewTab center={center} />
      </TabsContent>
      <TabsContent value="pipeline">
        <PipelineTab center={center} products={products} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="demand">
        <DemandTab center={center} onChanged={refresh} />
      </TabsContent>
      <TabsContent value="review">
        <RecruitmentClient initialBoard={initialBoard} products={products} />
      </TabsContent>
    </Tabs>
  );
}

function OverviewTab({ center }: { center: RecruitmentCenterData }) {
  const [month, setMonth] = useState("all");
  const [period, setPeriod] = useState<OverviewPeriod>("month");
  const [project, setProject] = useState("all");
  const [recruiter, setRecruiter] = useState("all");
  const projects = unique(
    center.applications
      .map((row) => row.project)
      .filter((value): value is string => Boolean(value)),
  );
  const recruiters = unique(
    center.applications
      .map((row) => row.recruiterName)
      .filter((value): value is string => Boolean(value)),
  );
  const rows = useMemo(
    () =>
      center.applications.filter((row) => {
        if (period === "month" && month !== "all" && !row.invitedDate.startsWith(month))
          return false;
        if (period === "thisWeek" || period === "lastWeek") {
          const range = getWeekRange(period === "thisWeek" ? 0 : -1);
          if (row.invitedDate < range.from || row.invitedDate > range.to) return false;
        }
        if (project !== "all" && row.project !== project) return false;
        if (recruiter !== "all" && row.recruiterName !== recruiter) return false;
        return true;
      }),
    [center.applications, month, period, project, recruiter],
  );
  const funnel = buildRecruitmentFunnel(rows);
  const metrics = buildRecruiterMetrics(rows);
  const trend = buildMonthlyTrend(rows);
  const invited = funnel[0]?.count ?? 0;
  const attended = funnel[1]?.count ?? 0;
  const joined = funnel[5]?.count ?? 0;
  const trialPassed = funnel[6]?.count ?? 0;

  return (
    <div className="space-y-4">
      <DataToolbar
        filters={
          <>
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-0.5">
              {(
                [
                  ["all", "全部"],
                  ["thisWeek", "本周"],
                  ["lastWeek", "上周"],
                  ["month", "按月"],
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={period === value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setPeriod(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Input
              type="month"
              className="w-[150px]"
              value={month === "all" ? "" : month}
              disabled={period !== "month"}
              onChange={(e) => {
                setMonth(e.target.value || "all");
                setPeriod("month");
              }}
            />
            <FilterSelect
              value={project}
              values={projects}
              allLabel="全部项目"
              onChange={setProject}
            />
            <FilterSelect
              value={recruiter}
              values={recruiters}
              allLabel="全部招聘人员"
              onChange={setRecruiter}
            />
          </>
        }
        actions={<span className="text-xs text-muted-foreground">当前口径：按邀约日期归属</span>}
      />

      <KpiGrid
        items={[
          { key: "invited", label: "邀约人数", value: invited },
          { key: "attendance", label: "到面率", value: percent(attended, invited) },
          { key: "joined", label: "到岗人数", value: joined },
          { key: "trial", label: "试播通过率", value: percent(trialPassed, joined) },
        ]}
      />

      <section className="border-y bg-card px-3 py-4">
        <h2 className="mb-3 text-sm font-semibold">招聘转化漏斗</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border md:grid-cols-7">
          {funnel.map((step) => (
            <div key={step.key} className="min-h-24 bg-card px-3 py-3">
              <div className="text-xs text-muted-foreground">{step.label}</div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">{step.count}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${invited ? Math.max(4, (step.count / invited) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {step.conversionRate === null
                  ? "起点"
                  : `上步转化 ${(step.conversionRate * 100).toFixed(1)}%`}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,1fr)]">
        <section className="min-w-0 border-b pb-4">
          <h2 className="mb-3 text-sm font-semibold">月度趋势</h2>
          <div className="h-72 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="invited" name="邀约" fill="#2563eb" radius={[2, 2, 0, 0]} />
                <Bar dataKey="attended" name="到面" fill="#0f766e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="joined" name="到岗" fill="#d97706" radius={[2, 2, 0, 0]} />
                <Bar dataKey="trialPassed" name="试播通过" fill="#16a34a" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="min-w-0 border-b pb-4">
          <h2 className="mb-3 text-sm font-semibold">招聘人员质量</h2>
          <div className="overflow-x-auto border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>招聘人员</TableHead>
                  <TableHead>邀约</TableHead>
                  <TableHead>到面率</TableHead>
                  <TableHead>到岗</TableHead>
                  <TableHead>试播通过</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((item) => (
                  <TableRow key={item.recruiterName}>
                    <TableCell className="font-medium">{item.recruiterName}</TableCell>
                    <TableCell>{item.invited}</TableCell>
                    <TableCell>{(item.attendanceRate * 100).toFixed(1)}%</TableCell>
                    <TableCell>{item.joined}</TableCell>
                    <TableCell>{item.trialPassed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}

function PipelineTab({
  center,
  products,
  onChanged,
}: {
  center: RecruitmentCenterData;
  products: string[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const [page, setPage] = useState(1);
  const [syncing, startSync] = useTransition();
  const rows = useMemo(
    () =>
      center.applications.filter((row) => {
        if (stage !== "all" && row.stage !== stage) return false;
        const needle = query.trim().toLowerCase();
        return (
          !needle ||
          `${row.candidateName} ${row.project ?? ""} ${row.recruiterName} ${row.channel}`
            .toLowerCase()
            .includes(needle)
        );
      }),
    [center.applications, query, stage],
  );
  useEffect(() => setPage(1), [query, stage]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  return (
    <div className="space-y-3">
      <DataToolbar
        filters={
          <>
            <div className="relative w-[260px] max-w-full">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索姓名、项目、招聘人员"
              />
            </div>
            <Select value={stage} onValueChange={(value) => setStage(value ?? "all")}>
              <SelectTrigger className="w-[150px]">
                <SelectValue>
                  {(value) =>
                    value && value !== "all"
                      ? PIPELINE_STAGE_LABEL[value as RecruitmentPipelineStage]
                      : "全部阶段"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部阶段</SelectItem>
                {Object.entries(PIPELINE_STAGE_LABEL).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <>
            {center.capabilities.canImport && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncing}
                  onClick={() => {
                    startSync(async () => {
                      try {
                        const result = await syncRecruitmentPipelineFromDingtalkAction({});
                        toast.success(
                          `钉钉同步完成：新增 ${result.imported} 条，更新 ${result.updated} 条` +
                            (result.unchanged ? `，无变化 ${result.unchanged} 条` : ""),
                        );
                        if (result.issues.length > 0) {
                          toast.warning(`有 ${result.issues.length} 条数据需要检查`);
                        }
                        onChanged();
                      } catch (error) {
                        toast.error(error instanceof Error ? error.message : "钉钉同步失败");
                      }
                    });
                  }}
                >
                  <RefreshCw className={syncing ? "animate-spin" : undefined} />
                  {syncing ? "同步中..." : "从钉钉更新"}
                </Button>
                <PipelineImportDialog onImported={onChanged} />
              </>
            )}
            {center.capabilities.canEditPipeline && (
              <PipelineDialog staff={center.staff} products={products} onSaved={onChanged} />
            )}
          </>
        }
      />
      <div className="overflow-x-auto border bg-card">
        <Table className="min-w-[1040px]">
          <TableHeader>
            <TableRow>
              <TableHead>候选人</TableHead>
              <TableHead>项目 / 渠道</TableHead>
              <TableHead>招聘人员</TableHead>
              <TableHead>当前阶段</TableHead>
              <TableHead>面试安排</TableHead>
              <TableHead>预计 / 实际到岗</TableHead>
              <TableHead>带教 / 合同</TableHead>
              <TableHead className="w-14" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((row) => (
              <PipelineRow
                key={row.id}
                row={row}
                center={center}
                products={products}
                onChanged={onChanged}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                  没有符合条件的候选人
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-3 py-3 text-sm text-muted-foreground">
        <span>
          第 {currentPage} / {pageCount} 页，共 {rows.length} 条
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft />
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          下一页
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

function PipelineRow({
  row,
  center,
  products,
  onChanged,
}: {
  row: RecruitmentApplicationRow;
  center: RecruitmentCenterData;
  products: string[];
  onChanged: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.candidateName}</div>
        <div className="text-xs text-muted-foreground">
          {row.phone ? maskPhone(row.phone) : "未登记电话"}
        </div>
      </TableCell>
      <TableCell>
        <div>{row.project ?? "未分配项目"}</div>
        <div className="text-xs text-muted-foreground">
          {row.channel}
          {row.sourceAccount ? ` · ${row.sourceAccount}` : ""}
        </div>
      </TableCell>
      <TableCell>{row.recruiterName}</TableCell>
      <TableCell>
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${stageClass(row.stage)}`}
        >
          {PIPELINE_STAGE_LABEL[row.stage]}
        </span>
      </TableCell>
      <TableCell>
        <div>{row.interviewDate ?? "待安排"}</div>
        <div className="text-xs text-muted-foreground">{row.interviewTime?.slice(0, 5) ?? ""}</div>
      </TableCell>
      <TableCell>
        <div>{row.expectedJoinDate ?? "-"}</div>
        <div className="text-xs text-muted-foreground">实际 {row.actualJoinDate ?? "-"}</div>
      </TableCell>
      <TableCell>
        <div>{row.mentorName ?? "未分配"}</div>
        <div className="text-xs text-muted-foreground">
          {row.contractStatus === "signed"
            ? "已签合同"
            : row.contractStatus === "declined"
              ? "不签约"
              : "待签合同"}
        </div>
      </TableCell>
      <TableCell>
        {center.capabilities.canEditPipeline && (
          <PipelineDialog
            application={row}
            staff={center.staff}
            products={products}
            onSaved={onChanged}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function DemandTab({
  center,
  onChanged,
}: {
  center: RecruitmentCenterData;
  onChanged: () => void;
}) {
  return (
    <div className="space-y-3">
      <DataToolbar
        filters={
          <span className="text-sm text-muted-foreground">项目目标与到岗、试播结果自动对账</span>
        }
        actions={center.capabilities.canManageDemand ? <DemandDialog onSaved={onChanged} /> : null}
      />
      <div className="overflow-x-auto border bg-card">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>月份</TableHead>
              <TableHead>类别</TableHead>
              <TableHead>项目</TableHead>
              <TableHead>目标</TableHead>
              <TableHead>已到岗</TableHead>
              <TableHead>试播通过</TableHead>
              <TableHead>缺口</TableHead>
              <TableHead>完成度</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {center.demands.map((demand) => {
              const gap = Math.max(0, demand.targetCount - demand.joinedCount);
              const progress = demand.targetCount
                ? Math.min(100, (demand.joinedCount / demand.targetCount) * 100)
                : 100;
              return (
                <TableRow key={demand.id}>
                  <TableCell>{demand.month.slice(0, 7)}</TableCell>
                  <TableCell>{demand.category ?? "-"}</TableCell>
                  <TableCell className="font-medium">{demand.project}</TableCell>
                  <TableCell>{demand.targetCount}</TableCell>
                  <TableCell>{demand.joinedCount}</TableCell>
                  <TableCell>{demand.trialPassedCount}</TableCell>
                  <TableCell className={gap > 0 ? "font-medium text-red-600" : "text-emerald-700"}>
                    {gap}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded bg-slate-100">
                        <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs tabular-nums">{progress.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {center.capabilities.canManageDemand && (
                      <DemandDialog demand={demand} onSaved={onChanged} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {center.demands.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-28 text-center text-muted-foreground">
                  尚未维护招聘需求
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  values,
  allLabel,
  onChange,
}: {
  value: string;
  values: string[];
  allLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "all")}>
      <SelectTrigger className="w-[150px]">
        <SelectValue>
          {(selected) => (selected && selected !== "all" ? selected : allLabel)}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {values.map((item) => (
          <SelectItem key={item} value={item}>
            {item}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
}
function percent(value: number, total: number): string {
  return total ? `${((value / total) * 100).toFixed(1)}%` : "0%";
}
function maskPhone(value: string): string {
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}
function stageClass(stage: RecruitmentPipelineStage): string {
  if (stage === "trial_pass" || stage === "joined")
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (stage === "rejected" || stage === "withdrawn" || stage === "left")
    return "bg-red-50 text-red-700 ring-red-200";
  if (stage === "invited") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}
