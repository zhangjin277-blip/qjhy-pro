"use client";
import { BUYU_REPORT_COLUMNS } from "@/modules/buyu";
import { DateRangePicker } from "@/components/patterns/date-range-picker";
import {
  DEFAULT_TASK_ROI,
  EXTERNAL_PLACEMENT_ACCOUNTS,
  latestBuyuRows,
  summarizeBuyuProduct,
  buyuAccountDetails,
  type BuyuDailyRow as DailyRow,
} from "@/modules/buyu/live-summary";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Save,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { useProjectSharedState } from "@/hooks/use-project-shared-state";
import { AnchorMiniList } from "../../../live-accounts/_components/anchor-mini-list";
import { PlatformBadge } from "../../../live-accounts/_components/platform-badge";
import {
  ScheduleTimeline,
  type ScheduleBinding,
} from "../../../live-accounts/_components/schedule-timeline";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ViewKey = "overview" | "anchors" | "daily";
interface ProductSummary {
  id: string;
  label: string;
  cost: number;
  additions: number;
  cpi: number | null;
}
interface PlacementAccountOption {
  id: string;
  accountId: string;
  product: string;
  name: string;
}
interface AnchorRow {
  product: string;
  userId: string;
  name: string;
  employmentType: string;
  workStatus: string;
  sessionCount: number;
  durationSeconds: number;
  scheduleSlots: { start: string; end: string }[];
}
interface AnchorDailyRow {
  product: string;
  date: string;
  active: number;
  durationHours: number;
}
interface OperatorRow {
  userId: string | null;
  name: string;
  title: string | null;
  accountCount: number;
  livingCount: number;
}
interface BuyuManagementOperator {
  name: string;
  responsibility: string;
  accountIds?: string[];
}
type BuyuAnchorStage = "已开播" | "培训中" | "试岗中" | "封号" | "离职";
type BuyuAnchorType = "生态主播" | "竞价主播";
interface BuyuRosterAnchor {
  liveName: string;
  realName: string | null;
  anchorId?: string;
  douyinId?: string;
  liveRoomUrl?: string;
  source: "线下自营" | "线上机构";
  institution: string | null;
  operator: string;
  stage: BuyuAnchorStage;
  anchorType?: BuyuAnchorType;
  stageNote?: string;
  liveTimeSlots?: { start: string; end: string }[];
  accountIds?: string[];
}
interface BuyuManagementState {
  operators: BuyuManagementOperator[];
  anchors: BuyuRosterAnchor[];
}
interface AccountRow {
  id: string;
  product: string;
  accountName: string;
  platform: string;
  platformAccountId: string | null;
  platformUid: string | null;
  avatar: string | null;
  phoneIndex: string | null;
  placementLabel: string | null;
  liveStatus: string;
  roomNo: string | null;
  agentName: string;
  agentTitle: string | null;
  monthCost: number;
  monthRoi: number | null;
}
interface AnchorAccountRow {
  userId: string;
  accountId: string;
  accountName: string;
  platform: string;
  platformAccountId: string | null;
  platformUid: string | null;
  avatar: string | null;
  phoneIndex: string | null;
  roomNo: string | null;
  timeSlots: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
}

const VIEWS: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: "overview", label: "项目总览", icon: LayoutDashboard },
  { key: "anchors", label: "线下主播", icon: UsersRound },
  { key: "daily", label: "投流日志", icon: BarChart3 },
];
const INITIAL_MANAGEMENT_STATE: BuyuManagementState = { operators: [], anchors: [] };
const BUYU_DEFAULT_OPERATOR = "朱江源";

function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function initialRange(): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toDateInput(from), to: toDateInput(today) };
}

function money(value: number): string {
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
}

function number(value: number): string {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function percent(value: number | null): string {
  return value == null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(2)}%`;
}

export function BuyuProjectHub(): React.JSX.Element {
  const [view, setView] = useState<ViewKey>("overview");
  const [range, setRange] = useState(initialRange);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [placementAccounts, setPlacementAccounts] = useState<PlacementAccountOption[]>([]);
  const [anchors, setAnchors] = useState<AnchorRow[]>([]);
  const [operators, setOperators] = useState<OperatorRow[]>([]);
  const [anchorAccounts, setAnchorAccounts] = useState<AnchorAccountRow[]>([]);
  const [managementOpen, setManagementOpen] = useState(false);
  const seededRoster = useRef(false);
  const management = useProjectSharedState<BuyuManagementState>({
    projectKey: "buyu",
    stateKey: "management_staff",
    initialValue: INITIAL_MANAGEMENT_STATE,
    localStorageKey: "buyu-management-staff-v1",
  });

  useEffect(() => {
    if (!management.ready || seededRoster.current || anchors.length === 0 || operators.length === 0)
      return;
    const databaseOperators = operators
      .filter((operator) => operator.name !== "未配置")
      .map((operator) => ({
        name: operator.name,
        responsibility: operator.title ?? "捕鱼直播运营",
      }));
    const mergeOperators = (current: BuyuManagementOperator[]) => {
      const merged = current.filter((operator) => operator.name !== "未配置");
      for (const operator of [
        ...databaseOperators,
        { name: BUYU_DEFAULT_OPERATOR, responsibility: "捕鱼直播运营" },
      ]) {
        if (!merged.some((item) => item.name === operator.name)) merged.push(operator);
      }
      return merged;
    };
    if ((management.value.anchors?.length ?? 0) > 0) {
      seededRoster.current = true;
      const mergedOperators = mergeOperators(management.value.operators);
      if (mergedOperators.length !== management.value.operators.length) {
        void management.update((current) => ({
          ...current,
          operators: mergedOperators,
        }));
      }
      return;
    }
    seededRoster.current = true;
    void management.update((current) => ({
      ...current,
      operators: mergeOperators(current.operators),
      anchors: anchors.map((anchor) => ({
        liveName: anchor.name || "待定",
        realName: anchor.name || null,
        anchorId: anchor.userId,
        source: "线下自营",
        institution: null,
        operator: BUYU_DEFAULT_OPERATOR,
        stage: anchor.workStatus === "在职" ? "已开播" : "离职",
        anchorType: "生态主播",
        liveTimeSlots:
          anchor.scheduleSlots?.length > 0
            ? anchor.scheduleSlots
            : [{ start: "09:00", end: "13:00" }],
        accountIds: anchorAccounts
          .filter((binding) => binding.userId === anchor.userId)
          .map((binding) => binding.accountId),
      })),
    }));
  }, [anchors, anchorAccounts, management, operators]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const placementFrom = `${range.to.slice(0, 4)}-01-01`;
    fetch(
      `/api/projects/buyu/overview?date_from=${range.from}&date_to=${range.to}&placement_from=${placementFrom}`,
      {
        signal: controller.signal,
        cache: "no-store",
      },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error((await response.json().catch(() => null))?.error ?? "数据加载失败");
        return response.json() as Promise<{
          summary: ProductSummary[];
          daily: DailyRow[];
          accountOptions: PlacementAccountOption[];
          anchors: AnchorRow[];
          anchorDaily: AnchorDailyRow[];
          operators: OperatorRow[];
          accounts: AccountRow[];
          anchorAccounts: AnchorAccountRow[];
        }>;
      })
      .then((body) => {
        setDaily(body.daily ?? []);
        setPlacementAccounts(body.accountOptions ?? []);
        setAnchors(body.anchors ?? []);
        setOperators(body.operators ?? []);
        setAnchorAccounts(body.anchorAccounts ?? []);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "数据加载失败");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [range.from, range.to]);

  return (
    <div className="min-w-0 space-y-4 px-1 py-1 md:px-1.5 md:py-1.5">
      <header className="border-b border-slate-200 pb-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span>捕鱼中心</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-700">捕鱼直播</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">捕鱼直播</h1>
            <p className="mt-1 text-xs text-slate-500">3D、UE4、URP 三个产品的直播与投流数据</p>
          </div>
          <DateRangePicker
            label="直播日期"
            value={range}
            onChange={setRange}
            allFrom="2020-01-01"
          />
        </div>
      </header>

      <div
        className="overflow-x-auto border-b border-slate-200"
        role="tablist"
        aria-label="捕鱼项目视图"
      >
        <div className="flex min-w-max gap-1">
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = view === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(item.key)}
                className={cn(
                  "relative inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium",
                  active ? "text-primary" : "text-slate-500 hover:text-slate-800",
                )}
              >
                <Icon className="size-4" />
                {item.label}
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          数据加载失败：{error}
        </div>
      )}
      {view === "overview" && (
        <Overview daily={daily} loading={loading} dateFrom={range.from} dateTo={range.to} />
      )}
      {view === "anchors" && (
        <AnchorView
          anchorRows={anchors}
          daily={daily}
          operators={operators}
          anchorAccounts={anchorAccounts}
          managementOperators={management.value.operators}
          managementAnchors={management.value.anchors ?? []}
          managementReady={management.ready}
          managementOpen={managementOpen}
          onManagementOpenChange={setManagementOpen}
          onManagementSave={(next) => management.update(() => next)}
          managementSaving={management.saving}
          managementError={management.error}
          placementAccounts={placementAccounts}
          loading={loading}
        />
      )}
      {view === "daily" && (
        <DailyView
          rows={daily}
          accountOptions={placementAccounts}
          loading={loading}
          dateFrom={range.from}
          dateTo={range.to}
        />
      )}
    </div>
  );
}

function Overview({
  daily,
  loading,
  dateFrom,
  dateTo,
}: {
  daily: DailyRow[];
  loading: boolean;
  dateFrom: string;
  dateTo: string;
}): React.JSX.Element {
  const [productFilter, setProductFilter] = useState("3D");
  const [detailProduct, setDetailProduct] = useState<string | null>(null);
  const [taskRoiByMonth, setTaskRoiByMonth] = useState<Record<string, Record<string, number>>>({
    "2026-09": DEFAULT_TASK_ROI,
  });
  const [taskRoiMonth, setTaskRoiMonth] = useState(dateTo.slice(0, 7));
  const monthKey = taskRoiMonth;
  const taskRoi = taskRoiByMonth[monthKey] ?? DEFAULT_TASK_ROI;
  useEffect(() => {
    setTaskRoiMonth(dateTo.slice(0, 7));
  }, [dateTo]);
  useEffect(() => {
    const stored = window.localStorage.getItem("buyu-task-roi-by-month");
    if (!stored) return;
    try {
      setTaskRoiByMonth((current) => ({ ...current, ...JSON.parse(stored) }));
    } catch {
      // Keep defaults when local configuration is malformed.
    }
  }, []);
  const updateTaskRoi = (product: string, value: number) => {
    setTaskRoiByMonth((current) => {
      const next = {
        ...current,
        [monthKey]: { ...(current[monthKey] ?? DEFAULT_TASK_ROI), [product]: value },
      };
      window.localStorage.setItem("buyu-task-roi-by-month", JSON.stringify(next));
      return next;
    });
  };
  const scopedRows = daily.filter((row) => row.date >= dateFrom && row.date <= dateTo);
  const latestScopedRows = latestBuyuRows(scopedRows);
  // 日报中的每日行是所选日期内的日消耗/新增；项目总览的区间指标应汇总整个选择范围。
  // 账号 ROI 仍使用 latestScopedRows，避免同一账号在多个日报日期被重复计数。
  const totalCost = scopedRows.reduce((sum, row) => sum + row.cost, 0);
  const totalAdditions = scopedRows.reduce((sum, row) => sum + row.additions, 0);
  const productRows = scopedRows.filter((row) => row.product === productFilter);
  const chartData = productRows.reduce<
    Record<string, { date: string; cost: number; additions: number }>
  >((result, row) => {
    const current = result[row.date] ?? { date: row.date, cost: 0, additions: 0 };
    current.cost += row.cost;
    current.additions += row.additions;
    result[row.date] = current;
    return result;
  }, {});
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">项目数据分块</h2>
        <p className="mt-0.5 text-xs text-slate-500">三个产品数据与投流日志一致，按日展示</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{monthKey} 任务ROI</h3>
            <input
              type="month"
              value={monthKey}
              onChange={(event) => event.target.value && setTaskRoiMonth(event.target.value)}
              aria-label="选择任务ROI月份"
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-600"
            />
          </div>
          <span className="text-xs text-slate-400">考核指标：7日净ROI</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {["3D", "UE4", "URP"].map((product) => (
            <label
              key={product}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600"
            >
              <span>{product}目标</span>
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={((taskRoi[product] ?? DEFAULT_TASK_ROI[product] ?? 0) * 100).toString()}
                  onChange={(event) => updateTaskRoi(product, Number(event.target.value) / 100)}
                  className="h-7 w-16 rounded border border-slate-200 bg-white px-2 text-right text-xs"
                />
                <span>%</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.6fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <Metric label="消耗总和" value={loading ? "…" : money(totalCost)} />
            <Metric label="新增总和" value={loading ? "…" : number(totalAdditions)} />
          </div>
          {["3D", "UE4", "URP"].map((product) => {
            const target = taskRoi[product] ?? DEFAULT_TASK_ROI[product] ?? 0;
            const { cost, additions, achievement } = summarizeBuyuProduct(
              scopedRows,
              product,
              target,
            );
            return (
              <button
                key={product}
                type="button"
                onClick={() => setDetailProduct(product)}
                className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold text-slate-900">{product}</h3>
                  <span className="text-[11px] text-slate-400">单产品</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Metric label="消耗总和" value={loading ? "…" : money(cost)} />
                  <Metric
                    label="总 CPI 平均数"
                    value={loading ? "…" : additions > 0 ? money(cost / additions) : "—"}
                  />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px]">
                  <div className="rounded bg-emerald-50 px-1 py-1.5 text-emerald-700">
                    达标 {achievement.target}
                  </div>
                  <div className="rounded bg-blue-50 px-1 py-1.5 text-blue-700">
                    90%+ {achievement.ninety}
                  </div>
                  <div className="rounded bg-amber-50 px-1 py-1.5 text-amber-700">
                    80%+ {achievement.eighty}
                  </div>
                  <div className="rounded bg-red-50 px-1 py-1.5 text-red-700">
                    未达标 {achievement.below}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <TrendCard
          title="投流趋势"
          subtitle={`${productFilter} · 投流日志 · 按日`}
          data={Object.values(chartData).sort((left, right) => left.date.localeCompare(right.date))}
          dataKey="cost"
          unit="消耗"
          color="#5270ff"
          loading={loading}
          tabs={["3D", "UE4", "URP"]}
          activeTab={productFilter}
          onTabChange={setProductFilter}
        />
      </div>
      <ProductDetailDrawer
        product={detailProduct}
        rows={latestScopedRows}
        target={
          detailProduct ? (taskRoi[detailProduct] ?? DEFAULT_TASK_ROI[detailProduct] ?? null) : null
        }
        onClose={() => setDetailProduct(null)}
      />
    </section>
  );
}

function ProductDetailDrawer({
  product,
  rows,
  target,
  onClose,
}: {
  product: string | null;
  rows: DailyRow[];
  target: number | null;
  onClose: () => void;
}): React.JSX.Element {
  const accountRows = useMemo(() => {
    if (!product) return [];
    return buyuAccountDetails(rows, product, target);
  }, [product, rows, target]);
  const internalRows = accountRows.filter((row) => !EXTERNAL_PLACEMENT_ACCOUNTS.has(row.name));
  const externalRows = accountRows.filter((row) => EXTERNAL_PLACEMENT_ACCOUNTS.has(row.name));
  const renderAccountRows = (items: typeof accountRows) =>
    items.map((row) => (
      <tr key={row.name} className="border-t border-slate-100">
        <td className="whitespace-normal break-words px-4 py-3 font-medium text-slate-800">
          {displayPlacementAccountName(row.name)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{money(row.cost)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{number(row.additions)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {row.cpi == null ? "—" : money(row.cpi)}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">{percent(row.sevenDayRoi)}</td>
        <td className="px-4 py-3 text-right tabular-nums">
          {row.achievementRate == null ? "—" : percent(row.achievementRate)}
        </td>
      </tr>
    ));
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-dvh w-[min(1100px,calc(100vw-2rem))] max-w-none translate-x-0 translate-y-0 rounded-l-xl rounded-r-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{product ?? ""} 本月账号数据</DialogTitle>
          <DialogDescription>
            数据来自投流日志，按账号汇总当前月份；7日净ROI目标{" "}
            {target == null ? "—" : percent(target)}。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100dvh-150px)] overflow-auto rounded-md border border-slate-200">
          <table className="min-w-[900px] w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[220px]" />
              <col className="w-[150px]" />
              <col className="w-[120px]" />
              <col className="w-[140px]" />
              <col className="w-[140px]" />
              <col className="w-[140px]" />
            </colgroup>
            <thead className="sticky top-0 bg-slate-800 text-left text-xs text-white">
              <tr>
                <th className="px-4 py-3">账号</th>
                <th className="px-4 py-3 text-right">消耗</th>
                <th className="px-4 py-3 text-right">新增</th>
                <th className="px-4 py-3 text-right">CPI</th>
                <th className="px-4 py-3 text-right">7日净ROI</th>
                <th className="px-4 py-3 text-right">达成率</th>
              </tr>
            </thead>
            <tbody>
              {internalRows.length > 0 ? (
                <tr className="bg-slate-50">
                  <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-slate-600">
                    内部账号（{internalRows.length}）
                  </td>
                </tr>
              ) : null}
              {renderAccountRows(internalRows)}
              {externalRows.length > 0 ? (
                <tr className="bg-orange-50">
                  <td colSpan={6} className="px-4 py-2 text-xs font-semibold text-orange-700">
                    外部账号（{externalRows.length}）
                  </td>
                </tr>
              ) : null}
              {renderAccountRows(externalRows)}
              {accountRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                    暂无本月投流数据
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

function TrendCard({
  title,
  subtitle,
  data,
  dataKey,
  unit,
  color,
  loading,
  tabs,
  activeTab,
  onTabChange,
}: {
  title: string;
  subtitle: string;
  data: {
    date: string;
    cost?: number;
    additions?: number;
    active?: number;
    durationHours?: number;
  }[];
  dataKey: "cost" | "additions" | "active" | "durationHours";
  unit: string;
  color: string;
  loading: boolean;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle} · 按日</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{unit}</span>
          {tabs && onTabChange ? (
            <div className="flex items-center gap-1 rounded-md bg-slate-100 p-1" role="tablist">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => onTabChange(tab)}
                  className={cn(
                    "rounded px-3 py-1 text-xs font-medium transition",
                    activeTab === tab
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="mt-4 h-[300px] min-w-0 rounded-md bg-slate-50 px-2 py-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            数据加载中
          </div>
        ) : data.length < 2 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            暂无趋势数据
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`buyu-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(value) => [
                  typeof value === "number"
                    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
                    : "—",
                  unit,
                ]}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2.5}
                fill={`url(#buyu-${dataKey})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

function AnchorView({
  anchorRows,
  daily,
  operators,
  anchorAccounts,
  managementOperators,
  managementAnchors,
  managementReady,
  managementOpen,
  onManagementOpenChange,
  onManagementSave,
  managementSaving,
  managementError,
  placementAccounts,
  loading,
}: {
  anchorRows: AnchorRow[];
  daily: DailyRow[];
  operators: OperatorRow[];
  anchorAccounts: AnchorAccountRow[];
  managementOperators: BuyuManagementOperator[];
  managementAnchors: BuyuRosterAnchor[];
  managementReady: boolean;
  managementOpen: boolean;
  onManagementOpenChange: (open: boolean) => void;
  onManagementSave: (next: BuyuManagementState) => Promise<boolean>;
  managementSaving: boolean;
  managementError: string | null;
  placementAccounts: PlacementAccountOption[];
  loading: boolean;
}): React.JSX.Element {
  const [expandedOperators, setExpandedOperators] = useState<Record<string, boolean>>({});
  const [taskRoi, setTaskRoi] = useState(DEFAULT_TASK_ROI);
  useEffect(() => {
    const stored = window.localStorage.getItem("buyu-task-roi-by-month");
    if (!stored) return;
    try {
      const byMonth = JSON.parse(stored) as Record<string, Record<string, number>>;
      const currentMonth = new Date().toISOString().slice(0, 7);
      setTaskRoi(byMonth[currentMonth] ?? DEFAULT_TASK_ROI);
    } catch {
      // Keep defaults when local configuration is malformed.
    }
  }, []);
  const availableAccounts = useMemo(() => {
    const seen = new Set<string>();
    return placementAccounts.reduce<AccountRow[]>((result, option) => {
      const optionId = option.accountId ? `${option.accountId}|${option.name}` : "";
      if (!optionId || seen.has(optionId)) return result;
      seen.add(optionId);
      result.push({
        id: optionId,
        product: option.product,
        accountName: option.name,
        platform: "快手",
        platformAccountId: null,
        platformUid: null,
        avatar: null,
        phoneIndex: null,
        placementLabel: option.name,
        liveStatus: "offline",
        roomNo: null,
        agentName: "未配置",
        agentTitle: null,
        monthCost: 0,
        monthRoi: null,
      });
      return result;
    }, []);
  }, [placementAccounts]);
  const visibleOperatorCount = new Set([
    ...operators.filter((operator) => operator.name !== "未配置").map((operator) => operator.name),
    ...managementOperators.map((operator) => operator.name),
  ]).size;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">线下主播</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          左侧为人员与运营账号归属，右侧为开播趋势；按 3D、UE4、URP 分产品查看
        </p>
      </div>
      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
          数据加载中
        </div>
      ) : (
        <div className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">管理人员 / 运营</h3>
                <p className="mt-0.5 text-xs text-slate-500">人员配置与捕鱼直播账号运营归属</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{visibleOperatorCount} 人</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!managementReady}
                  onClick={() => onManagementOpenChange(true)}
                >
                  <UsersRound />
                  管理人员
                </Button>
              </div>
            </div>
            {operators.length === 0 && managementOperators.length === 0 ? (
              <div className="mt-3 text-xs text-slate-400">
                {managementReady ? "暂无运营归属数据，请点击“管理人员”配置" : "管理人员配置加载中"}
              </div>
            ) : (
              (() => {
                const mergedOperators = mergeOperatorRows(
                  operators.filter((operator) => operator.name !== "未配置"),
                  managementOperators,
                  managementAnchors,
                  availableAccounts,
                  anchorAccounts,
                  anchorRows,
                  taskRoi,
                  daily,
                );
                return (
                  <div className="mt-3 space-y-4">
                    {mergedOperators.map((operator) => (
                      <section
                        key={operator.key}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 text-left"
                          onClick={() =>
                            setExpandedOperators((current) => ({
                              ...current,
                              [operator.key]: !current[operator.key],
                            }))
                          }
                          aria-expanded={Boolean(expandedOperators[operator.key])}
                        >
                          <div className="flex items-center gap-2">
                            <Avatar name={operator.name} src={null} size="sm" />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-800">
                                {operator.name}
                              </div>
                              <div className="truncate text-[11px] text-slate-500">
                                {operator.title ?? operator.responsibility ?? "运营"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500">
                            <span>账号 {operator.accountCount}</span>
                            <span className="font-medium text-emerald-600">
                              达标 {operator.qualifiedCount}
                            </span>
                            <span>直播中 {operator.livingCount}</span>
                            <ChevronDown
                              className={`size-4 transition-transform ${expandedOperators[operator.key] ? "rotate-180" : ""}`}
                            />
                          </div>
                        </button>
                        {expandedOperators[operator.key] && operator.accountDisplays.length > 0 ? (
                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {operator.accountDisplays.map((display) => (
                              <SelectedAccountDisplay key={display.account.id} display={display} />
                            ))}
                          </div>
                        ) : expandedOperators[operator.key] ? (
                          <div className="mt-3 text-xs text-slate-400">暂无账号归属，待配置</div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                );
              })()
            )}
          </section>

          <BuyuManagementManager
            open={managementOpen}
            operators={managementOperators.filter((operator) => operator.name !== "未配置")}
            anchors={managementAnchors}
            accounts={availableAccounts}
            anchorAccounts={anchorAccounts}
            sourceAnchors={anchorRows}
            saving={managementSaving}
            serverError={managementError}
            onOpenChange={onManagementOpenChange}
            onSave={onManagementSave}
          />
        </div>
      )}
    </section>
  );
}

function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src: string | null;
  size?: "sm" | "md";
}): React.JSX.Element {
  const className = size === "sm" ? "size-9" : "size-11";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`${className} shrink-0 rounded-full object-cover ring-1 ring-slate-200`}
    />
  ) : (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-500 ring-1 ring-slate-200`}
    >
      {name.slice(0, 1) || "?"}
    </span>
  );
}

interface DisplayOperator {
  key: string;
  name: string;
  title: string | null;
  responsibility: string | null;
  accountCount: number;
  livingCount: number;
  qualifiedCount: number;
  accountDisplays: OperatorAccountDisplay[];
}

interface OperatorAccountDisplay {
  account: AccountRow;
  anchors: { name: string; slots: { start: string; end: string }[] }[];
}

function SelectedAccountDisplay({
  display,
}: {
  display: OperatorAccountDisplay;
}): React.JSX.Element {
  const { account } = display;
  const isLiving = account.liveStatus === "living";
  const scheduleBindings: ScheduleBinding[] = display.anchors.map((anchor, index) => ({
    dingtalk_user_id: `${account.id}-${index}-${anchor.name}`,
    anchor_name: anchor.name,
    time_slots: anchor.slots.map((slot) => [slot.start, slot.end]),
  }));
  return (
    <article
      className="relative grid rounded-[14px] border border-slate-100 bg-white p-[18px] pb-4 shadow-sm"
      style={{ gridTemplateColumns: "1.4fr 1fr", gap: "18px" }}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <Avatar name={account.accountName} src={account.avatar} size="sm" />
            <span className="truncate text-[15px] font-semibold leading-tight text-slate-900">
              {account.accountName}
            </span>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium ${isLiving ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"}`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${isLiving ? "bg-green-500" : "bg-slate-400"}`}
            />
            {isLiving ? "直播中" : account.liveStatus === "banned" ? "封禁" : "未开播"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-slate-500">
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">
            平台 / 产品
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">运营</div>
          <div className="flex items-center gap-1 text-slate-700">
            <PlatformBadge platform={account.platform} size="xs" />
            <span>{account.product}</span>
          </div>
          <div className="text-slate-700">{account.agentName || "—"}</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">直播间</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">手机编号</div>
          <div className="text-slate-700">
            {account.roomNo ?? <span className="text-slate-300">未绑定</span>}
          </div>
          <div className="text-slate-700">
            {account.phoneIndex ?? <span className="text-slate-300">未绑定</span>}
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">UID</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">投放标签</div>
          <div className="text-slate-700">
            {account.platformUid ?? <span className="text-slate-300">未绑定</span>}
          </div>
          <div>
            {account.placementLabel ? (
              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-[2px] text-[11px] font-medium text-purple-700">
                <span className="text-[9px] opacity-60">投放</span>
                {account.placementLabel}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
          <div>
            <div className="text-[10.5px] text-slate-400">本月消耗</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
              {money(account.monthCost)}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] text-slate-400">本月ROI</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800">
              {percent(account.monthRoi)}
            </div>
          </div>
        </div>
        <ScheduleTimeline bindings={scheduleBindings} />
      </div>
      <div className="min-w-0">
        <AnchorMiniList bindings={scheduleBindings} />
      </div>
    </article>
  );
}

function mergeOperatorRows(
  rows: OperatorRow[],
  configured: BuyuManagementOperator[],
  anchors: BuyuRosterAnchor[],
  accounts: AccountRow[],
  anchorAccounts: AnchorAccountRow[],
  sourceAnchors: AnchorRow[],
  taskRoi: Record<string, number>,
  daily: DailyRow[],
): DisplayOperator[] {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const placementRowsForAccount = (account: AccountRow) => {
    const product =
      account.product === "捕鱼大作战"
        ? "3D"
        : account.product === "途游休闲捕鱼"
          ? "UE4"
          : account.product === "电玩捕鱼"
            ? "URP"
            : account.product;
    const [accountId, ...nameParts] = account.id.split("|");
    const reportName = nameParts.join("|") || account.accountName;
    const liveName = account.accountName.replace(/[（(]外部[）)]/g, "").trim();
    const rows = daily.filter((row) => {
      const rowAccountId = row.accountId?.split("|")[0];
      if (rowAccountId !== accountId || row.product !== product) return false;
      if (!row.accountName) return true;
      const rowName = row.accountName.trim();
      return (
        rowName === reportName ||
        rowName === liveName ||
        liveName.startsWith(`${rowName}-`) ||
        liveName.startsWith(`${rowName}（`) ||
        rowName.startsWith(`${liveName}-`)
      );
    });
    return rows.length > 0
      ? rows
      : daily.filter(
          (row) =>
            row.accountId?.split("|")[0] === accountId &&
            row.accountName === reportName &&
            row.product === product,
        );
  };
  const sourceAnchorById = new Map(sourceAnchors.map((anchor) => [anchor.userId, anchor]));
  const selectedByOperator = new Map<string, Set<string>>();
  const accountAnchorById = new Map<
    string,
    Map<string, { name: string; slots: { start: string; end: string }[] }>
  >();
  for (const anchor of anchors) {
    const accountIds = anchor.accountIds?.length
      ? anchor.accountIds
      : anchorAccounts
          .filter((binding) => binding.userId === anchor.anchorId)
          .map((binding) => binding.accountId);
    const sourceAnchor = sourceAnchorById.get(anchor.anchorId ?? "");
    const anchorDisplay = {
      name: anchor.realName || anchor.liveName || "未命名主播",
      slots: sourceAnchor?.scheduleSlots ?? anchor.liveTimeSlots ?? [],
    };
    for (const accountId of accountIds) {
      const byAnchor = accountAnchorById.get(accountId) ?? new Map();
      byAnchor.set(anchor.anchorId ?? anchorDisplay.name, anchorDisplay);
      accountAnchorById.set(accountId, byAnchor);
    }
  }
  for (const operator of configured) {
    const ids = selectedByOperator.get(operator.name) ?? new Set<string>();
    for (const accountId of operator.accountIds ?? []) ids.add(accountId);
    selectedByOperator.set(operator.name, ids);
  }
  const boundAccounts = (name: string) => {
    const configuredIds = selectedByOperator.get(name);
    const ids = configuredIds?.size
      ? [...configuredIds]
      : accounts.filter((account) => account.agentName === name).map((account) => account.id);
    return ids
      .map((id) => {
        const account = accountById.get(id);
        if (!account) return null;
        const placementRows = placementRowsForAccount(account);
        const latest = [...placementRows].sort((left, right) =>
          right.date.localeCompare(left.date),
        )[0];
        const realtimeRoi =
          latest?.summaryMetrics?.month?.["实时净ROI"] ??
          latest?.reportMetrics["实时净ROI"] ??
          null;
        const monthCost = latest?.summaryMetrics?.month?.["消耗"] ?? latest?.cost ?? 0;
        return {
          ...account,
          monthCost,
          monthRoi: realtimeRoi,
        };
      })
      .filter((account): account is AccountRow => Boolean(account));
  };
  const accountDisplays = (name: string) =>
    boundAccounts(name).map((account) => ({
      account,
      anchors: [...(accountAnchorById.get(account.id)?.values() ?? [])],
    }));
  const qualifiedCount = (name: string) =>
    boundAccounts(name).filter((account) => {
      const product =
        account.product === "捕鱼大作战"
          ? "3D"
          : account.product === "途游休闲捕鱼"
            ? "UE4"
            : account.product === "电玩捕鱼"
              ? "URP"
              : account.product;
      const target = taskRoi[product] ?? DEFAULT_TASK_ROI[product];
      return target != null && account.monthRoi != null && account.monthRoi >= target;
    }).length;
  const accountSummary = (name: string) => {
    const bound = boundAccounts(name);
    return {
      accountCount: bound.length,
      livingCount: bound.filter((account) => account.liveStatus === "living").length,
    };
  };
  const merged = new Map<string, DisplayOperator>();
  for (const row of rows) {
    const summary = accountSummary(row.name);
    merged.set(row.name, {
      key: row.userId ?? row.name,
      name: row.name,
      title: row.title,
      responsibility: null,
      ...summary,
      qualifiedCount: qualifiedCount(row.name),
      accountDisplays: accountDisplays(row.name),
    });
  }
  for (const person of configured.filter((operator) => operator.name !== "未配置")) {
    const current = merged.get(person.name);
    if (current) {
      current.responsibility = person.responsibility;
    } else {
      const summary = accountSummary(person.name);
      merged.set(person.name, {
        key: person.name,
        name: person.name,
        title: null,
        responsibility: person.responsibility,
        ...summary,
        qualifiedCount: qualifiedCount(person.name),
        accountDisplays: accountDisplays(person.name),
      });
    }
  }
  return [...merged.values()];
}

function BuyuManagementManager({
  open,
  operators,
  anchors,
  accounts,
  anchorAccounts: _anchorAccounts,
  sourceAnchors,
  saving,
  serverError,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  operators: BuyuManagementOperator[];
  anchors: BuyuRosterAnchor[];
  accounts: AccountRow[];
  anchorAccounts: AnchorAccountRow[];
  sourceAnchors: AnchorRow[];
  saving: boolean;
  serverError: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (next: BuyuManagementState) => Promise<boolean>;
}): React.JSX.Element {
  const [view] = useState<"anchors" | "operators">("operators");
  const [draft, setDraft] = useState<BuyuManagementState>(INITIAL_MANAGEMENT_STATE);
  const [selectedOperatorIndex, setSelectedOperatorIndex] = useState(0);
  const [selectedAnchorIndex, setSelectedAnchorIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const scheduleByAnchor = new Map(
      sourceAnchors.map((anchor) => [anchor.userId, anchor.scheduleSlots]),
    );
    setDraft({
      operators: operators.map((operator) => ({ ...operator })),
      anchors: anchors.map((anchor) => ({
        ...anchor,
        liveTimeSlots: (anchor.anchorId
          ? (scheduleByAnchor.get(anchor.anchorId) ?? anchor.liveTimeSlots)
          : anchor.liveTimeSlots
        )?.map((slot) => ({ ...slot })),
      })),
    });
    setSelectedOperatorIndex(0);
    setError(null);
    // Only hydrate the draft when the dialog opens. Polling the shared state while
    // editing must not replace the user's in-progress input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const updateOperator = (index: number, patch: Partial<BuyuManagementOperator>) => {
    setDraft((current) => ({
      ...current,
      operators: current.operators.map((operator, currentIndex) =>
        currentIndex === index ? { ...operator, ...patch } : operator,
      ),
    }));
  };
  const selectedOperator = draft.operators[selectedOperatorIndex] ?? null;
  const selectedAnchor =
    draft.anchors[selectedAnchorIndex] ??
    ({
      liveName: "待定",
      realName: null,
      source: "线下自营",
      institution: null,
      operator: "",
      stage: "培训中",
      anchorType: "生态主播",
    } satisfies BuyuRosterAnchor);
  const updateAnchor = (patch: Partial<BuyuRosterAnchor>) =>
    setDraft((current) => ({
      ...current,
      anchors: current.anchors.map((anchor, index) =>
        index === selectedAnchorIndex ? { ...anchor, ...patch } : anchor,
      ),
    }));
  const selectedAccountIds = new Set(selectedOperator?.accountIds ?? []);
  const accountsByProduct = useMemo(() => {
    const order = ["3D", "UE4", "URP"];
    const groups = new Map<string, AccountRow[]>();
    for (const account of accounts.filter((item) => item.platform === "快手")) {
      const product = account.product || "其他";
      const group = groups.get(product) ?? [];
      group.push(account);
      groups.set(product, group);
    }
    return [...groups.entries()].sort(
      ([left], [right]) =>
        (order.indexOf(left) === -1 ? 99 : order.indexOf(left)) -
        (order.indexOf(right) === -1 ? 99 : order.indexOf(right)),
    );
  }, [accounts]);
  const fieldClass =
    "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const timeOptions = Array.from(
    { length: 48 },
    (_, index) => `${String(Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
  );

  const save = async () => {
    const normalized: BuyuManagementState = {
      operators: draft.operators.map((operator) => ({
        name: operator.name.trim(),
        responsibility: operator.responsibility.trim() || "捕鱼直播运营",
        accountIds: operator.accountIds ?? [],
      })),
      anchors: draft.anchors.map((anchor) => ({
        ...anchor,
        liveName: anchor.liveName.trim() || "待定",
        realName: anchor.realName?.trim() || null,
        operator: anchor.operator.trim(),
      })),
    };
    if (normalized.operators.some((operator) => !operator.name)) {
      setError("运营人员姓名不能为空");
      return;
    }
    if (
      new Set(normalized.operators.map((operator) => operator.name)).size !==
      normalized.operators.length
    ) {
      setError("运营人员姓名不能重复");
      return;
    }
    if (await onSave(normalized)) onOpenChange(false);
  };

  const updateSelectedOperatorAccounts = (accountIds: string[]) => {
    if (selectedOperatorIndex < 0) return;
    setDraft((current) => ({
      ...current,
      operators: current.operators.map((operator, index) =>
        index === selectedOperatorIndex ? { ...operator, accountIds } : operator,
      ),
    }));
  };
  const deleteAnchor = () => undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[min(1080px,96vw)] !max-w-[1080px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-200 px-6 py-4">
          <DialogTitle>线下主播人员管理</DialogTitle>
          <DialogDescription>维护运营成员与快手账号归属，保存后全员同步。</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-6 py-2.5">
          <div className="rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-xs font-medium text-white">
            运营人员 {draft.operators.length}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft((current) => ({
                ...current,
                operators: [
                  ...current.operators,
                  {
                    name: `新运营 ${current.operators.length + 1}`,
                    responsibility: "捕鱼直播运营",
                    accountIds: [],
                  },
                ],
              }));
              setSelectedOperatorIndex(draft.operators.length);
            }}
          >
            <Plus className="size-4" />
            新增运营
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "anchors" ? (
            <div className="grid min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)]">
              <div className="border-b border-slate-200 md:border-r md:border-b-0">
                <div className="max-h-[520px] overflow-y-auto p-2">
                  {draft.anchors.map((anchor, index) => (
                    <button
                      key={`anchor-${index}`}
                      type="button"
                      onClick={() => setSelectedAnchorIndex(index)}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left",
                        selectedAnchorIndex === index
                          ? "bg-blue-50 ring-1 ring-blue-200"
                          : "hover:bg-slate-50",
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {(anchor.realName ?? anchor.liveName).slice(0, 1)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {anchor.realName || "实名待补充"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {anchor.liveName} · {anchor.anchorType ?? "生态主播"} ·{" "}
                          {anchor.operator || "未分配"}
                        </span>
                      </span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {anchor.stage}
                      </span>
                    </button>
                  ))}
                  {!draft.anchors.length && (
                    <div className="grid min-h-40 place-items-center text-sm text-slate-400">
                      暂无主播
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 md:p-6">
                {selectedAnchor ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <UsersRound className="size-4 text-blue-600" />
                        <h3 className="font-semibold text-slate-900">编辑主播</h3>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={deleteAnchor}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="size-4" />
                        删除主播
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <Label>真实姓名</Label>
                        <Input
                          value={selectedAnchor.realName ?? ""}
                          onChange={(event) =>
                            updateAnchor({ realName: event.target.value || null })
                          }
                          placeholder="线下主播必填"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>抖音昵称</Label>
                        <Input
                          value={selectedAnchor.liveName}
                          onChange={(event) => updateAnchor({ liveName: event.target.value })}
                          placeholder="未开播可填“待定”"
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>当前阶段</Label>
                        <select
                          className={fieldClass}
                          value={selectedAnchor.stage}
                          onChange={(event) =>
                            updateAnchor({ stage: event.target.value as BuyuAnchorStage })
                          }
                        >
                          {["已开播", "培训中", "试岗中", "封号", "离职"].map((stage) => (
                            <option key={stage}>{stage}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>主播类型</Label>
                        <select
                          className={fieldClass}
                          value={selectedAnchor.anchorType ?? "生态主播"}
                          onChange={(event) =>
                            updateAnchor({ anchorType: event.target.value as BuyuAnchorType })
                          }
                        >
                          <option>生态主播</option>
                          <option>竞价主播</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>运营负责人</Label>
                        <select
                          className={fieldClass}
                          value={selectedAnchor.operator}
                          onChange={(event) => updateAnchor({ operator: event.target.value })}
                        >
                          <option value="">请选择运营</option>
                          {draft.operators.map((operator) => (
                            <option key={operator.name}>{operator.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>人员来源</Label>
                        <select
                          className={fieldClass}
                          value={selectedAnchor.source}
                          onChange={(event) =>
                            updateAnchor({
                              source: event.target.value as BuyuRosterAnchor["source"],
                            })
                          }
                        >
                          <option>线下自营</option>
                          <option>线上机构</option>
                        </select>
                      </label>
                      <label className="grid gap-1.5">
                        <Label>线上机构</Label>
                        <Input
                          value={selectedAnchor.institution ?? ""}
                          onChange={(event) =>
                            updateAnchor({ institution: event.target.value || null })
                          }
                          disabled={selectedAnchor.source !== "线上机构"}
                          placeholder="线上机构主播填写"
                        />
                      </label>
                      <div className="grid gap-1.5 sm:col-span-2">
                        <Label>快手账号（多人轮播）</Label>
                        <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
                          {accounts
                            .filter((account) => account.platform === "快手")
                            .map((account) => (
                              <label
                                key={account.id}
                                className="flex items-center gap-2 rounded bg-white px-2 py-2 text-xs"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedAccountIds.has(account.id)}
                                  onChange={(event) =>
                                    updateAnchor({
                                      accountIds: event.target.checked
                                        ? [...selectedAccountIds, account.id]
                                        : [...selectedAccountIds].filter((id) => id !== account.id),
                                    })
                                  }
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {account.accountName}
                                </span>
                                <span className="text-slate-400">
                                  {account.platformAccountId ?? account.platformUid ?? "无号"}
                                </span>
                              </label>
                            ))}
                          {accounts.filter((account) => account.platform === "快手").length ===
                            0 && (
                            <span className="text-xs text-slate-400">
                              暂无可选快手账号，请先在直播账号-捕鱼中维护
                            </span>
                          )}
                        </div>
                        {accounts.filter((account) => selectedAccountIds.has(account.id)).length >
                          0 && (
                          <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                            <div className="text-[11px] text-slate-400">已选快手账号</div>
                            <div className="mt-1 space-y-1">
                              {accounts
                                .filter((account) => selectedAccountIds.has(account.id))
                                .map((account) => (
                                  <div key={account.id} className="text-sm text-slate-700">
                                    {account.accountName}
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500">
                          同一主播可选择多个快手账号，适用于多人轮播。
                        </p>
                      </div>
                      <label className="grid gap-1.5">
                        <Label>直播间地址</Label>
                        <Input
                          value={selectedAnchor.liveRoomUrl ?? ""}
                          onChange={(event) => updateAnchor({ liveRoomUrl: event.target.value })}
                          placeholder="例如：https://live.kuaishou.com/..."
                        />
                      </label>
                    </div>
                    <label className="grid gap-1.5">
                      <Label>阶段备注</Label>
                      <Textarea
                        value={selectedAnchor.stageNote ?? ""}
                        onChange={(event) => updateAnchor({ stageNote: event.target.value })}
                        placeholder="例如：试岗第 3 天、等待首播、培训考核中"
                        rows={2}
                      />
                    </label>
                    <div className="grid gap-2">
                      <Label>直播时间段</Label>
                      <p className="text-xs text-slate-500">
                        默认 1 个时段，可增加第 2 个，支持整点和半点。
                      </p>
                      {(selectedAnchor.liveTimeSlots?.length
                        ? selectedAnchor.liveTimeSlots
                        : [{ start: "09:00", end: "13:00" }]
                      )
                        .slice(0, 2)
                        .map((slot, slotIndex, slots) => (
                          <div
                            key={slotIndex}
                            className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2"
                          >
                            <select
                              className={fieldClass}
                              value={slot.start}
                              onChange={(event) =>
                                updateAnchor({
                                  liveTimeSlots: slots.map((item, index) =>
                                    index === slotIndex
                                      ? { ...item, start: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            >
                              {timeOptions.map((time) => (
                                <option key={time}>{time}</option>
                              ))}
                            </select>
                            <span className="text-xs text-slate-400">至</span>
                            <select
                              className={fieldClass}
                              value={slot.end}
                              onChange={(event) =>
                                updateAnchor({
                                  liveTimeSlots: slots.map((item, index) =>
                                    index === slotIndex
                                      ? { ...item, end: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            >
                              {timeOptions.map((time) => (
                                <option key={time}>{time}</option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={slotIndex === 0}
                              onClick={() => updateAnchor({ liveTimeSlots: slots.slice(0, 1) })}
                            >
                              ×
                            </Button>
                          </div>
                        ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-fit"
                        disabled={(selectedAnchor.liveTimeSlots?.length ?? 1) >= 2}
                        onClick={() =>
                          updateAnchor({
                            liveTimeSlots: [
                              ...(selectedAnchor.liveTimeSlots?.length
                                ? selectedAnchor.liveTimeSlots
                                : [{ start: "09:00", end: "13:00" }]),
                              { start: "18:00", end: "22:00" },
                            ],
                          })
                        }
                      >
                        ＋ 增加时间段
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-72 place-items-center text-sm text-slate-400">
                    新增一名主播后即可编辑资料
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)]">
              <div className="border-b border-slate-200 md:border-r md:border-b-0">
                <div className="p-2">
                  {draft.operators.map((operator, index) => (
                    <button
                      key={`operator-${index}`}
                      type="button"
                      onClick={() => setSelectedOperatorIndex(index)}
                      className={cn(
                        "mb-1 flex w-full items-center gap-2 rounded-md px-3 py-3 text-left",
                        selectedOperatorIndex === index
                          ? "bg-blue-50 ring-1 ring-blue-200"
                          : "hover:bg-slate-50",
                      )}
                    >
                      <Avatar name={operator.name} src={null} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {operator.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {operator.responsibility || "捕鱼直播运营"} · 已选{" "}
                          {operator.accountIds?.length ?? 0} 个账号
                        </span>
                      </span>
                    </button>
                  ))}
                  {!draft.operators.length && (
                    <div className="grid min-h-40 place-items-center text-sm text-slate-400">
                      暂无运营成员
                    </div>
                  )}
                </div>
              </div>
              <div className="p-5 md:p-6">
                {selectedOperator ? (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <UsersRound className="size-4 text-blue-600" />
                        <h3 className="font-semibold text-slate-900">{selectedOperator.name}</h3>
                      </div>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft((current) => ({
                            ...current,
                            operators: current.operators.filter(
                              (_, index) => index !== selectedOperatorIndex,
                            ),
                          }));
                          setSelectedOperatorIndex((index) => Math.max(0, index - 1));
                        }}
                        className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="删除运营成员"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-1.5">
                        <Label>运营成员</Label>
                        <Input
                          value={selectedOperator.name}
                          onChange={(event) =>
                            updateOperator(selectedOperatorIndex, { name: event.target.value })
                          }
                        />
                      </label>
                      <label className="grid gap-1.5">
                        <Label>职责</Label>
                        <Input
                          value={selectedOperator.responsibility}
                          onChange={(event) =>
                            updateOperator(selectedOperatorIndex, {
                              responsibility: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>快手账号（可多选）</Label>
                      <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                        {accountsByProduct.map(([product, productAccounts]) => (
                          <div key={product} className="space-y-1.5">
                            <div className="px-1 text-xs font-semibold text-slate-600">
                              {product}
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {productAccounts.map((account) => (
                                <label
                                  key={account.id}
                                  className="flex items-center gap-2 rounded bg-white px-2 py-2 text-xs"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedAccountIds.has(account.id)}
                                    onChange={(event) =>
                                      updateSelectedOperatorAccounts(
                                        event.target.checked
                                          ? [...selectedAccountIds, account.id]
                                          : [...selectedAccountIds].filter(
                                              (id) => id !== account.id,
                                            ),
                                      )
                                    }
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {account.accountName}
                                  </span>
                                  <span className="text-slate-400">
                                    {account.platformAccountId ?? account.platformUid ?? "无号"}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        {accountsByProduct.length === 0 && (
                          <span className="text-xs text-slate-400">投流日志暂无可选账号</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        仅显示快手账号，可为同一运营选择多个轮播账号。
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-72 place-items-center text-sm text-slate-400">
                    请先添加运营成员
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {error || serverError ? (
          <p className="border-t border-red-100 bg-red-50 px-6 py-2 text-sm text-red-700">
            {error ?? serverError}
          </p>
        ) : null}
        <DialogFooter className="border-t border-slate-200 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            <Save className="size-4" />
            {saving ? "保存中..." : "保存并同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DAILY_COLUMNS = ["日期", ...BUYU_REPORT_COLUMNS];

function displayPlacementAccountName(name: string): string {
  return EXTERNAL_PLACEMENT_ACCOUNTS.has(name) ? `${name}（外部）` : name;
}

function DailyView({
  rows,
  accountOptions: placementAccounts,
  loading,
  dateFrom,
  dateTo,
}: {
  rows: DailyRow[];
  accountOptions: PlacementAccountOption[];
  loading: boolean;
  dateFrom: string;
  dateTo: string;
}): React.JSX.Element {
  const PAGE_SIZE = 31;
  const [productFilter, setProductFilter] = useState("3D");
  const [accountFilter, setAccountFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [monthExpansionOverrides, setMonthExpansionOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const defaultAccountInitialized = useRef(false);
  const productOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.product))].sort((left, right) =>
        left.localeCompare(right, "zh-CN"),
      ),
    [rows],
  );
  const accountRows = useMemo(
    () => (productFilter === "all" ? rows : rows.filter((row) => row.product === productFilter)),
    [productFilter, rows],
  );
  const accountOptions = useMemo(() => {
    const source = placementAccounts
      .filter((account) => productFilter === "all" || account.product === productFilter)
      .map(
        (account) => [account.id, displayPlacementAccountName(account.name)] as [string, string],
      );
    if (source.length > 0)
      return source.sort(([, left], [, right]) => left.localeCompare(right, "zh-CN"));
    return [
      ...new Map(
        accountRows.map((row) => [
          row.accountId ?? "",
          displayPlacementAccountName(row.accountName ?? "未绑定账号"),
        ]),
      ).entries(),
    ].sort(([, left], [, right]) => left.localeCompare(right, "zh-CN"));
  }, [accountRows, placementAccounts, productFilter]);
  const selectedAccountId = accountFilter;
  useEffect(() => {
    if (accountFilter !== "all" && !accountOptions.some(([id]) => id === accountFilter)) {
      setAccountFilter("all");
    }
  }, [accountFilter, accountOptions]);
  useEffect(() => {
    if (defaultAccountInitialized.current || placementAccounts.length === 0) return;
    const defaultAccount = placementAccounts.find(
      (account) => account.product === "3D" && account.name === "捕鱼大作战",
    );
    if (defaultAccount) setAccountFilter(defaultAccount.id);
    defaultAccountInitialized.current = true;
  }, [placementAccounts]);
  const filteredRows = rows.filter(
    (row) =>
      (productFilter === "all" || row.product === productFilter) &&
      (accountFilter === "all" || (row.accountId ?? "") === selectedAccountId),
  );
  const buildSummaryRow = (
    source: DailyRow[],
    label: string,
    period: "year" | "month",
  ): DailyRow | null => {
    if (source.length === 0) return null;
    const sourceSummary = source.find((row) => row.summaryMetrics?.[period])?.summaryMetrics?.[
      period
    ];
    if (sourceSummary) {
      const cost = sourceSummary["消耗"] ?? 0;
      const additions = sourceSummary["新增"] ?? 0;
      const realtimeRoi = sourceSummary["实时净ROI"] ?? null;
      return {
        product: productFilter === "all" ? "全部产品" : productFilter,
        datasetId: "summary",
        date: label,
        cost,
        additions,
        cpi: sourceSummary["总CPI"] ?? (additions > 0 ? cost / additions : null),
        realtimeRoi,
        payment: 0,
        accountId: null,
        accountName:
          accountFilter === "all"
            ? "全部账号"
            : (accountOptions.find(([id]) => id === accountFilter)?.[1] ?? "未绑定账号"),
        reportMetrics: sourceSummary,
      };
    }
    const cost = source.reduce((total, row) => total + row.cost, 0);
    const additions = source.reduce((total, row) => total + row.additions, 0);
    const payment = source.reduce((total, row) => total + row.payment, 0);
    const reportMetrics: Record<string, number | null> = {};
    const sumColumns = new Set(["消耗", "新增", "自然量新增"]);
    for (const column of DAILY_COLUMNS) {
      if (column === "日期") continue;
      if (column === "消耗") reportMetrics[column] = cost;
      else if (column === "新增") reportMetrics[column] = additions;
      else if (column === "总CPI") reportMetrics[column] = additions > 0 ? cost / additions : null;
      else if (column === "实时净ROI") reportMetrics[column] = cost > 0 ? payment / cost : null;
      else {
        const values = source
          .map((row) => ({ value: row.reportMetrics?.[column], weight: row.additions || 1 }))
          .filter(({ value }) => value != null && Number.isFinite(value));
        if (values.length === 0) reportMetrics[column] = null;
        else if (sumColumns.has(column)) {
          reportMetrics[column] = values.reduce((total, item) => total + (item.value ?? 0), 0);
        } else {
          const weight = values.reduce((total, item) => total + item.weight, 0);
          reportMetrics[column] =
            weight > 0
              ? values.reduce((total, item) => total + (item.value ?? 0) * item.weight, 0) / weight
              : null;
        }
      }
    }
    return {
      product: productFilter === "all" ? "全部产品" : productFilter,
      datasetId: "summary",
      date: label,
      cost,
      additions,
      cpi: additions > 0 ? cost / additions : null,
      realtimeRoi: cost > 0 ? payment / cost : null,
      payment,
      accountId: null,
      accountName:
        accountFilter === "all"
          ? "全部账号"
          : (accountOptions.find(([id]) => id === accountFilter)?.[1] ?? "未绑定账号"),
      reportMetrics,
    };
  };
  const year = dateTo.slice(0, 4);
  const yearSummary = buildSummaryRow(
    filteredRows.filter((row) => row.date.startsWith(year)),
    `${year}年`,
    "year",
  );
  const rowsByMonth = new Map<string, DailyRow[]>();
  for (const row of filteredRows) {
    const monthKey = row.date.slice(0, 7);
    const monthRows = rowsByMonth.get(monthKey);
    if (monthRows) monthRows.push(row);
    else rowsByMonth.set(monthKey, [row]);
  }
  const monthlyRows = [...rowsByMonth.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([monthKey, monthRows]) => {
      const selectedRows = monthRows.filter((row) => row.date >= dateFrom && row.date <= dateTo);
      const expanded = monthExpansionOverrides[monthKey] ?? selectedRows.length > 0;
      return {
        monthKey,
        expanded,
        details: expanded ? (selectedRows.length > 0 ? selectedRows : monthRows) : [],
        summary: buildSummaryRow(
          monthRows,
          `${monthKey.slice(0, 4)}年${Number(monthKey.slice(5))}月`,
          "month",
        ),
      };
    })
    .filter(
      (
        month,
      ): month is typeof month & {
        summary: DailyRow;
      } => month.summary !== null,
    );
  const expandedDetailRows = monthlyRows.flatMap((month) =>
    month.details.map((row) => ({ monthKey: month.monthKey, row })),
  );
  const pageCount = Math.max(1, Math.ceil(expandedDetailRows.length / PAGE_SIZE));
  const pagedDetailRows = expandedDetailRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedDetailsByMonth = new Map<string, DailyRow[]>();
  for (const { monthKey, row } of pagedDetailRows) {
    const monthRows = pagedDetailsByMonth.get(monthKey);
    if (monthRows) monthRows.push(row);
    else pagedDetailsByMonth.set(monthKey, [row]);
  }
  const displayRows = [
    ...(yearSummary ? [{ kind: "year" as const, row: yearSummary }] : []),
    ...monthlyRows.flatMap((month) => [
      {
        kind: "month" as const,
        row: month.summary,
        monthKey: month.monthKey,
        expanded: month.expanded,
      },
      ...(pagedDetailsByMonth.get(month.monthKey) ?? []).map((row) => ({
        kind: "detail" as const,
        row,
        monthKey: month.monthKey,
      })),
    ]),
  ];
  useEffect(() => {
    setPage(1);
    setMonthExpansionOverrides({});
  }, [productFilter, accountFilter, rows, dateFrom, dateTo]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const percentColumns = new Set([
    "再归因新增占比",
    "首日付费率",
    "首日净ROI",
    "再归因首日ROI占比",
    "三日净ROI",
    "七日净ROI",
    "再归因七日ROI占比",
    "次留",
    "七留",
    "自然量新增占比",
    "自然量首日付费占比",
    "自然量3日付费占比",
    "自然量7日付费占比",
    "实时净ROI",
  ]);
  const moneyColumns = new Set(["消耗", "总CPI", "首日付费成本"]);
  const formatReportMetric = (row: DailyRow, column: string): string => {
    const value = row.reportMetrics?.[column];
    if (value == null || !Number.isFinite(value)) {
      if (column === "消耗") return money(row.cost);
      if (column === "新增") return number(row.additions);
      if (column === "总CPI") return row.cpi == null ? "—" : money(row.cpi);
      if (column === "实时净ROI") return percent(row.realtimeRoi);
      return "—";
    }
    if (percentColumns.has(column)) return percent(value);
    if (moneyColumns.has(column)) return money(value);
    if (column === "新增" || column === "自然量新增") return number(value);
    return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  };
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold text-slate-900">投流日志</h2>
        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">按产品、直播账号、日期展示；只保留 A 至 T 列</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={productFilter}
              onChange={(event) => setProductFilter(event.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="筛选产品"
            >
              <option value="all">全部产品</option>
              {productOptions.map((product) => (
                <option key={product} value={product}>
                  {product}
                </option>
              ))}
            </select>
            <select
              value={accountFilter}
              onChange={(event) => setAccountFilter(event.target.value)}
              className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
              aria-label="筛选直播账号"
            >
              <option value="all">全部</option>
              {accountOptions.map(([id, name]) => (
                <option key={id || "unbound"} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-[2360px] table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: 72 }} />
            <col style={{ width: 156 }} />
            {DAILY_COLUMNS.map((column) => (
              <col key={column} style={{ width: column === "日期" ? 98 : 108 }} />
            ))}
          </colgroup>
          <thead className="bg-slate-800 text-left text-white">
            <tr>
              <th className="sticky left-0 z-30 w-[72px] border-r border-slate-600 bg-slate-800 px-2 py-2">
                产品
              </th>
              <th className="sticky left-[72px] z-30 w-[156px] border-r border-slate-600 bg-slate-800 px-2 py-2">
                直播账号
              </th>
              {DAILY_COLUMNS.map((column) => (
                <th
                  key={column}
                  className={cn(
                    "whitespace-normal break-words px-2 py-2 font-medium leading-tight text-center",
                    column === "日期" &&
                      "sticky left-[228px] z-30 w-[98px] border-r border-slate-600 bg-slate-800",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={DAILY_COLUMNS.length + 2}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  数据加载中
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={DAILY_COLUMNS.length + 2}
                  className="px-3 py-8 text-center text-slate-400"
                >
                  暂无投流数据
                </td>
              </tr>
            ) : (
              displayRows.map((displayRow) => {
                const { row } = displayRow;
                const isYearSummary = displayRow.kind === "year";
                const isMonthSummary = displayRow.kind === "month";
                return (
                  <tr
                    key={`${displayRow.kind}-${row.datasetId}-${row.accountId ?? "unknown"}-${row.date}`}
                    className={cn(
                      "border-t border-slate-100",
                      isYearSummary && "bg-sky-50 font-semibold",
                      isMonthSummary && "bg-amber-50 font-semibold",
                    )}
                  >
                    <td
                      className={cn(
                        "sticky left-0 z-20 w-[72px] border-r border-slate-200 px-2 py-1.5 font-medium text-slate-800 shadow-[1px_0_0_0_rgba(226,232,240,0.9)]",
                        isYearSummary ? "bg-sky-50" : isMonthSummary ? "bg-amber-50" : "bg-white",
                      )}
                    >
                      {row.product}
                    </td>
                    <td
                      className={cn(
                        "sticky left-[72px] z-20 w-[156px] max-w-[156px] truncate border-r border-slate-200 px-2 py-1.5 text-slate-700 shadow-[1px_0_0_0_rgba(226,232,240,0.9)]",
                        isYearSummary ? "bg-sky-50" : isMonthSummary ? "bg-amber-50" : "bg-white",
                      )}
                    >
                      {displayPlacementAccountName(row.accountName ?? "未绑定账号")}
                    </td>
                    {DAILY_COLUMNS.map((column) => (
                      <td
                        key={column}
                        className={cn(
                          "whitespace-nowrap px-2 py-1.5 tabular-nums",
                          column === "日期" &&
                            cn(
                              "sticky left-[228px] z-20 w-[98px] border-r border-slate-200 text-slate-700 shadow-[1px_0_0_0_rgba(226,232,240,0.9)]",
                              isYearSummary
                                ? "bg-sky-50"
                                : isMonthSummary
                                  ? "bg-amber-50"
                                  : "bg-white",
                            ),
                        )}
                      >
                        {column === "日期" ? (
                          isMonthSummary ? (
                            <button
                              type="button"
                              aria-label={`${displayRow.expanded ? "折叠" : "展开"}${row.date}`}
                              aria-expanded={displayRow.expanded}
                              onClick={() => {
                                const monthKey = displayRow.monthKey;
                                setMonthExpansionOverrides((current) => ({
                                  ...current,
                                  [monthKey]: !displayRow.expanded,
                                }));
                                setPage(1);
                              }}
                              className="flex w-full items-center gap-1 text-left font-semibold text-slate-800 hover:text-sky-700"
                            >
                              {displayRow.expanded ? (
                                <ChevronDown className="size-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="size-3.5 shrink-0" />
                              )}
                              <span>{row.date}</span>
                            </button>
                          ) : (
                            row.date
                          )
                        ) : column === "直播账号" ? (
                          displayPlacementAccountName(row.accountName ?? "未绑定账号")
                        ) : (
                          formatReportMetric(row, column)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {!loading && expandedDetailRows.length > 0 ? (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            共 {expandedDetailRows.length} 条明细 · {monthlyRows.length} 个月 · 第 {page} /{" "}
            {pageCount} 页
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="上一页"
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="下一页"
              disabled={page >= pageCount}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
