"use client";
import { useEffect, useState } from "react";
import type {
  SummaryRowExt,
  SubAccountRow,
  AccountHourlyRow,
  BoardFilter,
  ScheduleRow,
  ScheduleYesterdayHourly,
} from "@/modules/placement/server";
import { fetchAccountHourly, fetchAnchorSchedule, fetchAnchorCheckin } from "../actions";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface AnchorDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  anchor: SummaryRowExt | null;
  subAccounts: SubAccountRow[]; // 该主播的所有投放包
  filter: BoardFilter;
  prevCost: number;
}

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}
function avatarChar(s: string): string {
  return s.length <= 2 ? s : s.slice(0, 2);
}
function deltaText(cur: number, prev: number): string {
  if (prev === 0) return "";
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5) return "持平";
  const up = delta > 0;
  return `${up ? "↑" : "↓"} ${Math.abs(delta).toFixed(1)}%`;
}

interface HourlyState {
  data?: AccountHourlyRow[];
  loading: boolean;
}

interface ScheduleState {
  rows: ScheduleRow[];
  yesterdayHourly: ScheduleYesterdayHourly;
  loading: boolean;
}

export function AnchorDetailDrawer({
  open,
  onClose,
  anchor,
  subAccounts,
  filter,
  prevCost,
}: AnchorDetailDrawerProps) {
  const [openPkg, setOpenPkg] = useState<string | null>(null);
  const [hourlyMap, setHourlyMap] = useState<Record<string, HourlyState>>({});
  const [selectedScheduleKey, setSelectedScheduleKey] = useState<string | null>(null);
  const [scheduleState, setScheduleState] = useState<ScheduleState>({
    rows: [],
    yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
    loading: false,
  });
  const [checkinState, setCheckinState] = useState<ScheduleState>({
    rows: [],
    yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
    loading: false,
  });

  // 切换主播时重置内部状态
  useEffect(() => {
    setOpenPkg(null);
    setHourlyMap({});
    setSelectedScheduleKey(null);
    setScheduleState({
      rows: [],
      yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
      loading: false,
    });
    setCheckinState({
      rows: [],
      yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
      loading: false,
    });
  }, [anchor?.anchor_label]);

  useEffect(() => {
    if (!open || !anchor) return;
    setScheduleState((state) => ({ ...state, loading: true }));
    fetchAnchorSchedule(filter, anchor.anchor_label)
      .then((data) => setScheduleState({ ...data, loading: false }))
      .catch(() =>
        setScheduleState({
          rows: [],
          yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
          loading: false,
        }),
      );

    // 同步拉一份"按开播记录"归因
    setCheckinState((state) => ({ ...state, loading: true }));
    fetchAnchorCheckin(filter, anchor.anchor_label)
      .then((rows) =>
        setCheckinState({
          rows,
          yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
          loading: false,
        }),
      )
      .catch(() =>
        setCheckinState({
          rows: [],
          yesterdayHourly: { byAccount: {}, cutoffHour: 24 },
          loading: false,
        }),
      );
  }, [open, anchor, filter]);

  useEffect(() => {
    if (scheduleState.loading || checkinState.loading) return;
    setSelectedScheduleKey((current) => {
      // selectedKey 形如 `${subKey}|${scheduleKey(row)}` — 检查是否还在任一 section
      if (
        current &&
        (scheduleState.rows.some((r) => `schedule|${scheduleKey(r)}` === current) ||
          checkinState.rows.some((r) => `checkin|${scheduleKey(r)}` === current))
      ) {
        return current;
      }
      // 默认选第一个非空 section 的第一行
      if (scheduleState.rows[0]) return `schedule|${scheduleKey(scheduleState.rows[0])}`;
      if (checkinState.rows[0]) return `checkin|${scheduleKey(checkinState.rows[0])}`;
      return null;
    });
  }, [scheduleState.rows, scheduleState.loading, checkinState.rows, checkinState.loading]);

  // 单包主播：打开抽屉自动展开唯一包
  useEffect(() => {
    if (open && subAccounts.length === 1 && subAccounts[0]) {
      setOpenPkg(subAccounts[0].account_id);
    }
  }, [open, subAccounts]);

  async function loadHourly(accountId: string) {
    if (hourlyMap[accountId]) return;
    setHourlyMap((m) => ({ ...m, [accountId]: { loading: true } }));
    try {
      const data = await fetchAccountHourly(filter, accountId);
      setHourlyMap((m) => ({ ...m, [accountId]: { data, loading: false } }));
    } catch {
      setHourlyMap((m) => ({ ...m, [accountId]: { loading: false } }));
    }
  }

  // 一旦展开包：拉取该包小时数据
  useEffect(() => {
    if (openPkg) void loadHourly(openPkg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPkg]);

  if (!anchor) {
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-[1100px] !max-w-[92vw] gap-0 p-0 sm:max-w-none">
          <SheetTitle className="sr-only">投放数据详情</SheetTitle>
        </SheetContent>
      </Sheet>
    );
  }

  const label = anchor.anchor_label ?? "（无标签）";
  const isKuaishou = anchor.platforms.some((p) => p.includes("快手"));
  const cpa = anchor.activations > 0 ? anchor.cost / anchor.activations : null;
  const arpu = anchor.activations > 0 ? anchor.payment / anchor.activations : null;
  const delta = deltaText(anchor.cost, prevCost);
  const deltaUp = anchor.cost > prevCost;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex w-[1100px] !max-w-[92vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <SheetTitle className="sr-only">{label} 投放数据详情</SheetTitle>
        <SheetDescription className="sr-only">
          {label} 在 {filter.date_from} ~ {filter.date_to} 的投放数据明细
        </SheetDescription>
        {/* HEADER */}
        <div className="border-b border-border bg-gradient-to-b from-primary/[0.06] to-white px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {anchor.avatar ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={anchor.avatar}
                  alt={anchor.account_name ?? label}
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm ${
                    isKuaishou
                      ? "bg-gradient-to-br from-[#ffedd5] to-[#ff7d00]"
                      : "bg-gradient-to-br from-[#d1e9ff] to-[#1677ff]"
                  }`}
                >
                  {avatarChar(label)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-[18px] font-semibold text-foreground">
                  {anchor.account_name ?? label}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                  {anchor.platforms.map((p) => {
                    const douyin = p.includes("抖音");
                    const ks = p.includes("快手");
                    return (
                      <span
                        key={p}
                        className={`rounded px-1.5 py-px text-[10px] font-medium ${
                          douyin
                            ? "bg-[#fff1f0] text-[#cf1322]"
                            : ks
                              ? "bg-[#fffbe6] text-[#d48806]"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {p}
                      </span>
                    );
                  })}
                  {anchor.platform_account_id && (
                    <span className="tabular-nums">{anchor.platform_account_id}</span>
                  )}
                  {anchor.anchor_label && (
                    <span className="rounded bg-purple-50 px-1.5 py-px text-[10.5px] text-purple-700">
                      {anchor.anchor_label}
                    </span>
                  )}
                  <span>{anchor.account_count} 个投放包</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    {filter.date_from} ~ {filter.date_to}
                  </span>
                </div>
              </div>
            </div>
            <div className="w-8" />
          </div>

          {/* KPI SUMMARY */}
          <div className="mt-4 grid grid-cols-5 gap-3 rounded-lg border border-primary/20 bg-primary/[0.08] p-3">
            <div>
              <div className="text-[11px] text-muted-foreground">消耗</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">
                {fmtMoney(anchor.cost)}
              </div>
              {delta && (
                <div
                  className={`mt-0.5 text-[10.5px] ${deltaUp ? "text-[var(--change-up)]" : "text-[var(--change-down)]"}`}
                >
                  {delta} 较前期
                </div>
              )}
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">激活</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">
                {fmtChinese(anchor.activations)}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                {cpa == null ? "—" : `单价 ¥${cpa.toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">激活单价</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">
                {cpa == null ? "—" : `¥${cpa.toFixed(2)}`}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">CPA</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">付费金额</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">
                {fmtMoney(anchor.payment)}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">激活当日</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">ARPU</div>
              <div className="mt-0.5 text-[16px] font-semibold tabular-nums text-foreground">
                {arpu == null ? "—" : `¥${arpu.toFixed(2)}`}
              </div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">付费 / 激活</div>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ScheduleTimelineSection
            title="主播 × 投放时段（排班 + 开播打卡 双视图）"
            countLabel="时段"
            selectedKey={selectedScheduleKey}
            onSelect={(key) => setSelectedScheduleKey(key)}
            sections={[
              {
                key: "schedule",
                title: "按排班归因",
                emptyText: "暂无可归因排班时段",
                state: scheduleState,
              },
              {
                key: "checkin",
                title: "按开播打卡归因",
                emptyText: "暂无开播打卡记录",
                state: checkinState,
              },
            ]}
          />

          <div className="mb-3 flex items-center justify-between text-[12px] text-muted-foreground">
            <span>
              <span className="font-medium text-foreground/90">
                {subAccounts.length === 1 ? "每日小时明细" : "投放包明细"}
              </span>
              <span className="mx-2 text-muted-foreground/40">·</span>
              <span>
                {subAccounts.length === 1
                  ? "首日默认展开 · 点击日期切换"
                  : `${subAccounts.length} 个包，按消耗降序 · 点击包卡查看`}
              </span>
            </span>
          </div>

          <div className="space-y-2">
            {subAccounts.map((s) => {
              const isOpen = openPkg === s.account_id;
              const sCpa = s.activations > 0 ? s.cost / s.activations : null;
              const sArpu = s.activations > 0 ? s.payment / s.activations : null;
              const state = hourlyMap[s.account_id];
              const onlyOnePkg = subAccounts.length === 1;

              return (
                <div
                  key={s.account_id}
                  className={
                    onlyOnePkg
                      ? ""
                      : `overflow-hidden rounded-lg border transition-colors ${
                          isOpen
                            ? "border-primary/40 bg-primary/[0.04] shadow-sm"
                            : "border-border bg-white"
                        }`
                  }
                >
                  {/* 单包主播：不显示包卡头（信息已在抽屉头部 KPI），直接展示日期表 */}
                  {!onlyOnePkg && (
                    <button
                      onClick={() => setOpenPkg(isOpen ? null : s.account_id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span
                        className={`text-[10px] text-muted-foreground/70 transition-transform ${
                          isOpen ? "rotate-90 text-primary" : ""
                        }`}
                      >
                        ▶
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12.5px] font-medium text-foreground">
                          {s.account_name}
                        </div>
                        {s.platform && (
                          <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                            {s.platform}
                          </div>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-5 text-[12.5px] tabular-nums">
                        <span className="text-foreground/90">
                          <span className="text-[10.5px] text-muted-foreground/70">消耗 </span>
                          <b className="font-semibold">{fmtMoney(s.cost)}</b>
                        </span>
                        <span className="text-foreground/90">
                          <span className="text-[10.5px] text-muted-foreground/70">激活 </span>
                          <b className="font-semibold">{fmtChinese(s.activations)}</b>
                        </span>
                        <span className="text-foreground/90">
                          <span className="text-[10.5px] text-muted-foreground/70">单价 </span>
                          <b className="font-semibold">
                            {sCpa == null ? "—" : `¥${sCpa.toFixed(2)}`}
                          </b>
                        </span>
                        <span className="text-foreground/90">
                          <span className="text-[10.5px] text-muted-foreground/70">付费 </span>
                          <b className="font-semibold">{fmtMoney(s.payment)}</b>
                        </span>
                        <span className="text-foreground/90">
                          <span className="text-[10.5px] text-muted-foreground/70">ARPU </span>
                          <b className="font-semibold">
                            {sArpu == null ? "—" : `¥${sArpu.toFixed(2)}`}
                          </b>
                        </span>
                      </div>
                    </button>
                  )}

                  {(isOpen || onlyOnePkg) && (
                    <div
                      className={onlyOnePkg ? "" : "border-t border-primary/20 bg-white px-4 py-3"}
                    >
                      {state?.loading && (
                        <div className="py-4 text-center text-[12px] text-muted-foreground/70">
                          加载小时数据...
                        </div>
                      )}
                      {!state?.loading && state?.data && state.data.length > 0 && (
                        <DayHourTables rows={state.data} />
                      )}
                      {!state?.loading && state?.data && state.data.length === 0 && (
                        <div className="py-4 text-center text-[12px] text-muted-foreground/70">
                          该投放包在选定时间范围内暂无数据
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function parseHour(t: string): number {
  return Number.parseInt(t.split(":")[0] ?? "0", 10);
}

function scheduleKey(row: ScheduleRow): string {
  return `${row.date}:${row.account_id}:${row.anchor_user_id}:${row.time_slot[0]}-${row.time_slot[1]}`;
}

function schedulePosition(slot: [string, string], axisEnd: number) {
  const start = parseHour(slot[0]);
  let end = parseHour(slot[1]);
  if (end < start) end += 24;
  return {
    left: (start / axisEnd) * 100,
    width: ((end - start) / axisEnd) * 100,
    start,
    end,
  };
}

function sumScheduleYesterday(
  state: ScheduleYesterdayHourly,
  accountId: string,
  startHour: number,
  endHour: number,
) {
  const byHour = state.byAccount[accountId];
  if (!byHour) return null;
  let cost = 0;
  let acts = 0;
  let payment = 0;
  let hasData = false;
  for (let hour = startHour; hour < endHour; hour++) {
    const cell = byHour[hour % 24];
    if (!cell) continue;
    cost += cell.cost;
    acts += cell.acts;
    payment += cell.payment;
    hasData = true;
  }
  return hasData ? { cost, acts, payment } : null;
}

function sumRowsYesterday(state: ScheduleYesterdayHourly, rows: ScheduleRow[]) {
  let cost = 0;
  let acts = 0;
  let payment = 0;
  let hasData = false;
  for (const row of rows) {
    const start = parseHour(row.time_slot[0]);
    let end = parseHour(row.time_slot[1]);
    if (end < start) end += 24;
    const prev = sumScheduleYesterday(state, row.account_id, start, end);
    if (!prev) continue;
    cost += prev.cost;
    acts += prev.acts;
    payment += prev.payment;
    hasData = true;
  }
  return hasData ? { cost, acts, payment } : null;
}

function sumScheduleRows(rows: ScheduleRow[]) {
  const cost = rows.reduce((sum, row) => sum + row.personal_cost, 0);
  const acts = rows.reduce((sum, row) => sum + row.personal_acts, 0);
  const payment = rows.reduce((sum, row) => sum + row.personal_payment, 0);
  return {
    cost,
    acts,
    payment,
    cpa: acts > 0 ? cost / acts : null,
  };
}

function pctDelta(cur: number, prev: number | null | undefined) {
  if (prev == null || prev === 0) return null;
  const pct = ((cur - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { text: "持平", up: null as boolean | null };
  return { text: `${pct > 0 ? "↑" : "↓"} ${Math.abs(pct).toFixed(0)}%`, up: pct > 0 };
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return `¥${n.toFixed(0)}`;
}

function fmtSlot(slot: [string, string]): string {
  return `${slot[0]} - ${slot[1]}`;
}

interface TimelineSubSection {
  key: string; // 唯一前缀，防 selectedKey 跨 section 冲突
  title: string;
  emptyText: string;
  state: ScheduleState;
}

function ScheduleTimelineSection({
  sections,
  selectedKey,
  onSelect,
  title,
  countLabel,
}: {
  sections: TimelineSubSection[];
  selectedKey: string | null;
  onSelect: (key: string, row: ScheduleRow) => void;
  title: string;
  countLabel: string;
}) {
  // 整体 loading：所有 subSection 都还在 loading
  const allLoading = sections.every((s) => s.state.loading);
  if (allLoading) {
    return (
      <section className="mb-4 rounded-lg border border-border bg-white p-4 text-center text-[12px] text-muted-foreground">
        加载 {title}...
      </section>
    );
  }

  // 解析每个 sub 的分组结果 + 累计
  const subResults = sections.map((sub) => {
    const groups = new Map<
      string,
      {
        date: string;
        accountId: string;
        accountName: string;
        placementLabel: string | null;
        rows: ScheduleRow[];
        cost: number;
        acts: number;
        payment: number;
        axisEnd: number;
      }
    >();
    for (const row of sub.state.rows) {
      const key = `${row.date}:${row.account_id}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          date: row.date,
          accountId: row.account_id,
          accountName: row.account_name,
          placementLabel: row.placement_label,
          rows: [],
          cost: 0,
          acts: 0,
          payment: 0,
          axisEnd: 24,
        };
        groups.set(key, group);
      }
      group.rows.push(row);
      group.cost += row.personal_cost;
      group.acts += row.personal_acts;
      group.payment += row.personal_payment;
      const start = parseHour(row.time_slot[0]);
      let end = parseHour(row.time_slot[1]);
      if (end < start) end += 24;
      group.axisEnd = Math.max(group.axisEnd, end);
    }
    const list = [...groups.values()].sort((a, b) => {
      if (a.date !== b.date) return a.date > b.date ? -1 : 1;
      return b.cost - a.cost;
    });
    return { sub, list };
  });

  // 找当前选中 row：所有 sections 里查 selectedKey 包含 sub.key 前缀
  let selectedRow: ScheduleRow | null = null;
  let selectedSubRows: ScheduleRow[] = [];
  let selectedYesterday: ScheduleYesterdayHourly = { byAccount: {}, cutoffHour: 24 };
  for (const sub of sections) {
    const found = sub.state.rows.find((row) => `${sub.key}|${scheduleKey(row)}` === selectedKey);
    if (found) {
      selectedRow = found;
      selectedSubRows = sub.state.rows;
      selectedYesterday = sub.state.yesterdayHourly;
      break;
    }
  }
  // 默认选第一个非空 section 的第一行
  if (!selectedRow) {
    for (const sub of sections) {
      if (sub.state.rows[0]) {
        selectedRow = sub.state.rows[0];
        selectedSubRows = sub.state.rows;
        selectedYesterday = sub.state.yesterdayHourly;
        break;
      }
    }
  }

  const totalRows = sections.reduce((sum, s) => sum + s.state.rows.length, 0);
  const totalGroups = subResults.reduce((sum, r) => sum + r.list.length, 0);

  if (totalRows === 0) {
    return (
      <section className="mb-4 rounded-lg border border-border bg-white p-4">
        <div className="text-[12px] font-medium text-foreground">{title}</div>
        <div className="mt-2 text-[12px] text-muted-foreground">
          {sections[0]?.emptyText ?? "暂无数据"}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-lg border border-border bg-white">
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div>
          <div className="text-[12px] font-medium text-foreground">{title}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {totalRows} {countLabel} · {totalGroups} 个账号日期组合
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {subResults.map(({ sub, list }, subIdx) => (
            <div key={sub.key} className="space-y-3">
              {sections.length > 1 && (
                <div className="flex items-center gap-2 border-b border-border/40 pb-1">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${
                      subIdx === 0 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {sub.title}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {sub.state.rows.length} 条
                  </span>
                </div>
              )}
              {sub.state.loading ? (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11.5px] text-muted-foreground">
                  加载中...
                </div>
              ) : sub.state.rows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border/60 p-3 text-center text-[11.5px] text-muted-foreground">
                  {sub.emptyText}
                </div>
              ) : (
                list.map((group) => (
                  <div
                    key={`${sub.key}:${group.date}:${group.accountId}`}
                    className="rounded-md border border-border/70"
                  >
                    <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-3 py-2">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {group.placementLabel ?? "无标签"}
                      </span>
                      <span className="font-medium text-[12.5px] text-foreground">
                        {group.accountName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{group.date}</span>
                      <div className="ml-auto flex gap-4 text-[11px] tabular-nums text-muted-foreground">
                        <span>
                          消耗 <strong className="text-foreground">{fmtMoney(group.cost)}</strong>
                        </span>
                        <span>
                          激活 <strong className="text-foreground">{group.acts}</strong>
                        </span>
                        <span>
                          CPA{" "}
                          <strong className="text-foreground">
                            {group.acts > 0 ? `¥${(group.cost / group.acts).toFixed(0)}` : "—"}
                          </strong>
                        </span>
                        <span>
                          付费{" "}
                          <strong className="text-foreground">{fmtMoney(group.payment)}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="px-3 pb-3 pt-2">
                      <div className="relative h-4 text-[10px] tabular-nums text-muted-foreground/60">
                        {[0, 3, 6, 9, 12, 15, 18, 21, group.axisEnd].map((hour, index, arr) => {
                          if (index > 0 && hour === arr[index - 1]) return null;
                          return (
                            <span
                              key={hour}
                              className="absolute top-0 -translate-x-1/2"
                              style={{ left: `${(hour / group.axisEnd) * 100}%` }}
                            >
                              {hour > 24 ? `${hour - 24}+1` : hour}
                            </span>
                          );
                        })}
                      </div>
                      <div className="relative h-[112px] rounded-md border border-slate-100 bg-slate-50/50">
                        {[3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
                          <div
                            key={hour}
                            className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-100"
                            style={{ left: `${(hour / group.axisEnd) * 100}%` }}
                          />
                        ))}
                        {group.rows.map((row) => {
                          const pos = schedulePosition(row.time_slot, group.axisEnd);
                          const fullKey = `${sub.key}|${scheduleKey(row)}`;
                          const isSelected = selectedKey === fullKey;
                          const palette =
                            subIdx === 0
                              ? "border-blue-500 bg-blue-50/90 text-blue-700"
                              : "border-emerald-500 bg-emerald-50/90 text-emerald-700";
                          return (
                            <button
                              key={fullKey}
                              type="button"
                              onClick={() => onSelect(fullKey, row)}
                              className={`absolute inset-y-3 flex flex-col overflow-hidden rounded-md border-l-[3px] ${palette.split(" ").slice(0, 2).join(" ")} px-3 py-3 text-left transition hover:shadow-md ${
                                isSelected ? "ring-2 ring-primary shadow-md" : ""
                              }`}
                              style={{
                                left: `${pos.left}%`,
                                width: `calc(${pos.width}% - 2px)`,
                              }}
                              title={`${row.anchor_name ?? "未命名"} · ${fmtSlot(row.time_slot)} · 消耗 ${fmtMoney(row.personal_cost)} · 激活 ${row.personal_acts} · CPA ${fmtPrice(row.personal_unit_price)} · 付费 ${fmtMoney(row.personal_payment)}`}
                            >
                              <div className="min-w-0">
                                <div
                                  className={`truncate text-[13px] font-semibold leading-4 ${palette.split(" ")[2] ?? ""}`}
                                >
                                  {row.anchor_name ?? "未命名"}
                                </div>
                                <div className="mt-1 truncate text-[11px] tabular-nums text-muted-foreground">
                                  {fmtSlot(row.time_slot)}
                                </div>
                              </div>
                              <div className="mt-4 min-w-0">
                                <span className="block truncate whitespace-nowrap text-[16px] font-semibold tabular-nums leading-none text-slate-900">
                                  {fmtMoney(row.personal_cost)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
        <ScheduleDetailPanel
          row={selectedRow}
          rows={selectedSubRows}
          yesterdayHourly={selectedYesterday}
        />
      </div>
    </section>
  );
}

function ScheduleDetailPanel({
  row,
  rows,
  yesterdayHourly,
}: {
  row: ScheduleRow | null;
  rows: ScheduleRow[];
  yesterdayHourly: ScheduleYesterdayHourly;
}) {
  if (!row) {
    return (
      <aside className="rounded-lg border border-border bg-white p-4 text-[12px] text-muted-foreground xl:sticky xl:top-3">
        点击左侧时段查看投放详情。
      </aside>
    );
  }

  const start = parseHour(row.time_slot[0]);
  let end = parseHour(row.time_slot[1]);
  if (end < start) end += 24;
  const prev = sumScheduleYesterday(yesterdayHourly, row.account_id, start, end);
  const cpaPrev = prev && prev.acts > 0 ? prev.cost / prev.acts : null;
  const anchorRows = rows.filter(
    (item) =>
      item.account_id === row.account_id &&
      item.date === row.date &&
      item.anchor_user_id === row.anchor_user_id,
  );
  const anchorSummary = sumScheduleRows(anchorRows);
  const anchorPrev = sumRowsYesterday(yesterdayHourly, anchorRows);
  const anchorCpaPrev =
    anchorPrev && anchorPrev.acts > 0 ? anchorPrev.cost / anchorPrev.acts : null;

  return (
    <aside className="h-fit overflow-hidden rounded-lg border border-border bg-white shadow-sm xl:sticky xl:top-3">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="text-[12px] font-semibold text-foreground">投放详情</div>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {row.placement_label ?? "无标签"}
          </span>
          <span className="truncate text-[14px] font-semibold text-slate-900">
            {row.anchor_name ?? "未命名"}
          </span>
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{row.account_name}</div>
        <div className="mt-1 truncate text-[10.5px] tabular-nums text-muted-foreground/70">
          ID: {row.account_id}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground">时间</div>
            <div className="mt-1 text-[14px] font-semibold tabular-nums text-slate-900">
              {fmtSlot(row.time_slot)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">日期</div>
            <div className="mt-1 text-[13px] font-medium tabular-nums text-slate-900">
              {row.date}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium text-slate-700">当前时段</div>
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric
              label="消耗"
              value={fmtMoney(row.personal_cost)}
              delta={pctDelta(row.personal_cost, prev?.cost)}
            />
            <DetailMetric
              label="激活"
              value={String(row.personal_acts)}
              delta={pctDelta(row.personal_acts, prev?.acts)}
            />
            <DetailMetric
              label="CPA"
              value={fmtPrice(row.personal_unit_price)}
              delta={pctDelta(row.personal_unit_price ?? 0, cpaPrev)}
            />
            <DetailMetric
              label="付费"
              value={fmtMoney(row.personal_payment)}
              delta={pctDelta(row.personal_payment, prev?.payment)}
            />
          </div>
        </div>

        <div className="rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-700">当前主播汇总</span>
            <span className="text-[10px] text-muted-foreground">{anchorRows.length} 班次</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DetailMetric
              label="消耗"
              value={fmtMoney(anchorSummary.cost)}
              delta={pctDelta(anchorSummary.cost, anchorPrev?.cost)}
            />
            <DetailMetric
              label="激活"
              value={String(anchorSummary.acts)}
              delta={pctDelta(anchorSummary.acts, anchorPrev?.acts)}
            />
            <DetailMetric
              label="CPA"
              value={fmtPrice(anchorSummary.cpa)}
              delta={pctDelta(anchorSummary.cpa ?? 0, anchorCpaPrev)}
            />
            <DetailMetric
              label="付费"
              value={fmtMoney(anchorSummary.payment)}
              delta={pctDelta(anchorSummary.payment, anchorPrev?.payment)}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}

function DetailMetric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: { text: string; up: boolean | null } | null;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-white px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold tabular-nums text-slate-900">{value}</span>
        {delta && (
          <span
            className={
              delta.up === null
                ? "text-[10px] text-muted-foreground"
                : delta.up
                  ? "text-[10px] text-[var(--change-up)]"
                  : "text-[10px] text-[var(--change-down)]"
            }
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}

function DayHourTables({ rows }: { rows: AccountHourlyRow[] }) {
  // 按日期分组
  const byDate = new Map<string, AccountHourlyRow[]>();
  for (const r of rows) {
    if (r.cost === 0 && r.activations === 0 && r.payment === 0) continue;
    const arr = byDate.get(r.date) ?? [];
    arr.push(r);
    byDate.set(r.date, arr);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a > b ? -1 : 1));

  // 默认只展开第一日（最近的日期）
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set(dates.slice(0, 1)));

  if (dates.length === 0) {
    return (
      <div className="py-4 text-center text-[12px] text-muted-foreground/70">
        该投放包在选定时间范围内暂无数据
      </div>
    );
  }

  function toggleDate(d: string) {
    setOpenDates((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {dates.map((d) => {
        const day = (byDate.get(d) ?? []).slice().sort((a, b) => b.hour - a.hour);
        const dCost = day.reduce((s, r) => s + r.cost, 0);
        const dActs = day.reduce((s, r) => s + r.activations, 0);
        const dPay = day.reduce((s, r) => s + r.payment, 0);
        const dCpa = dActs > 0 ? dCost / dActs : null;
        const dArpu = dActs > 0 ? dPay / dActs : null;
        const isDayOpen = openDates.has(d);
        return (
          <div key={d} className="overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => toggleDate(d)}
              className="flex w-full items-center justify-between bg-primary/[0.06] px-3 py-2 text-left transition-colors hover:bg-primary/[0.12]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`text-[9px] text-primary transition-transform ${
                    isDayOpen ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
                <span className="text-[12px] font-semibold text-primary">{d}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="truncate text-[11px] tabular-nums text-muted-foreground">
                  消耗 {fmtMoney(dCost)} · 激活 {fmtChinese(dActs)} · 付费 {fmtMoney(dPay)}
                </span>
              </span>
              <span className="shrink-0 text-[10.5px] text-muted-foreground">
                {isDayOpen ? "收起" : "展开"}
              </span>
            </button>
            {isDayOpen && (
              <table className="w-full text-[11.5px] tabular-nums">
                <thead>
                  <tr className="bg-muted/40 text-[10.5px] text-muted-foreground/70">
                    <th
                      className="px-3 py-1.5 text-left font-medium whitespace-nowrap"
                      style={{ width: "18%" }}
                    >
                      时段
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium" style={{ width: "16%" }}>
                      消耗
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium" style={{ width: "14%" }}>
                      激活
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium" style={{ width: "17%" }}>
                      激活单价
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium" style={{ width: "18%" }}>
                      付费金额
                    </th>
                    <th className="px-3 py-1.5 text-left font-medium" style={{ width: "17%" }}>
                      ARPU
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {day.map((r) => {
                    const cpa = r.activations > 0 ? r.cost / r.activations : null;
                    const arpu = r.activations > 0 ? r.payment / r.activations : null;
                    return (
                      <tr
                        key={`${r.date}-${r.hour}`}
                        className="border-t border-border/50 transition-colors hover:bg-muted/40"
                      >
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap text-muted-foreground">
                          {/* 区间 = (上一行 hour, 当前 hour]，即 [prev+1:00 .. hour+1:00) */}
                          {((r.prev_hour == null ? 0 : r.prev_hour + 1) % 24)
                            .toString()
                            .padStart(2, "0")}
                          :00 — {((r.hour + 1) % 24).toString().padStart(2, "0")}:00
                        </td>
                        <td className="px-3 py-1.5 text-foreground/90">{fmtMoney(r.cost)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {fmtChinese(r.activations)}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {cpa == null ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            `¥${cpa.toFixed(2)}`
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{fmtMoney(r.payment)}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {arpu == null ? (
                            <span className="text-muted-foreground/40">—</span>
                          ) : (
                            `¥${arpu.toFixed(2)}`
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-primary/20 bg-primary/[0.035] font-semibold text-foreground">
                    <td className="px-3 py-1.5 whitespace-nowrap">合计</td>
                    <td className="px-3 py-1.5">{fmtMoney(dCost)}</td>
                    <td className="px-3 py-1.5">{fmtChinese(dActs)}</td>
                    <td className="px-3 py-1.5">
                      {dCpa == null ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `¥${dCpa.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-3 py-1.5">{fmtMoney(dPay)}</td>
                    <td className="px-3 py-1.5">
                      {dArpu == null ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `¥${dArpu.toFixed(2)}`
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
