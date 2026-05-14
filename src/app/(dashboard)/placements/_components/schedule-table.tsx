"use client";

import { useMemo, useState } from "react";
import type { ScheduleRow } from "@/modules/placement/server";
import { cn } from "@/lib/utils/cn";

interface YesterdayKpi {
  cost: number;
  acts: number;
  payment: number;
}

/** 昨日按小时聚合的数据：byAccount[accountId][hour] = {cost, acts, payment} */
type YesterdayHourly = Record<string, Record<number, YesterdayKpi>>;

interface ScheduleTableProps {
  rows: ScheduleRow[];
  /** 昨日按 (account, hour) 维度的数据，可选 */
  yesterdayHourly?: YesterdayHourly;
  /** 用于 account 级 KPI 同比的 cutoff hour（看今天=当前小时；看历史=24） */
  yesterdayCutoffHour?: number;
}

/** 把 byHour 里 [startHour, endHour) 的累计加起来；endHour > 24 时支持跨夜（hour mod 24） */
function sumYesterdayRange(
  byHour: Record<number, YesterdayKpi> | undefined,
  startHour: number,
  endHour: number,
): YesterdayKpi | null {
  if (!byHour) return null;
  let cost = 0;
  let acts = 0;
  let payment = 0;
  let hasData = false;
  for (let h = startHour; h < endHour; h++) {
    const cell = byHour[h % 24];
    if (cell) {
      cost += cell.cost;
      acts += cell.acts;
      payment += cell.payment;
      hasData = true;
    }
  }
  return hasData ? { cost, acts, payment } : null;
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

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return "¥" + n.toFixed(0);
}

function fmtSlot(slot: [string, string]): string {
  return `${slot[0]} - ${slot[1]}`;
}

function parseHour(t: string): number {
  return parseInt(t.split(":")[0] ?? "0", 10);
}

interface Group {
  date: string;
  accountId: string;
  accountName: string;
  placementLabel: string | null;
  rows: ScheduleRow[];
  totalCost: number;
  totalActs: number;
  totalPayment: number;
  totalUnitPrice: number | null;
  maxEndHour: number; // 用于决定 axis 是否扩展（跨夜场景）
}

interface AnchorRollup {
  anchorUserId: string;
  anchorName: string | null;
  shifts: number;
  cost: number;
  acts: number;
  payment: number;
  unit: number | null;
}

function groupRows(rows: ScheduleRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.date}::${r.account_id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        date: r.date,
        accountId: r.account_id,
        accountName: r.account_name,
        placementLabel: r.placement_label,
        rows: [],
        totalCost: 0,
        totalActs: 0,
        totalPayment: 0,
        totalUnitPrice: null,
        maxEndHour: 24,
      };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  for (const g of map.values()) {
    g.totalCost = g.rows.reduce((s, r) => s + r.total_cost, 0);
    g.totalActs = g.rows.reduce((s, r) => s + r.total_acts, 0);
    g.totalPayment = g.rows.reduce((s, r) => s + r.total_payment, 0);
    g.totalUnitPrice = g.totalActs > 0 ? g.totalCost / g.totalActs : null;
    g.rows.sort((a, b) => a.time_slot[0].localeCompare(b.time_slot[0]));
    g.maxEndHour = Math.max(
      24,
      ...g.rows.map((r) => {
        const eh = parseHour(r.time_slot[1]);
        const sh = parseHour(r.time_slot[0]);
        // 跨夜（eh < sh）按 eh + 24 处理
        return eh < sh ? eh + 24 : eh;
      }),
    );
  }
  return [...map.values()].sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return b.totalCost - a.totalCost;
  });
}

function rollupAnchors(rows: ScheduleRow[]): AnchorRollup[] {
  const map = new Map<string, AnchorRollup>();
  for (const r of rows) {
    let a = map.get(r.anchor_user_id);
    if (!a) {
      a = {
        anchorUserId: r.anchor_user_id,
        anchorName: r.anchor_name,
        shifts: 0,
        cost: 0,
        acts: 0,
        payment: 0,
        unit: null,
      };
      map.set(r.anchor_user_id, a);
    }
    a.shifts += 1;
    a.cost += r.personal_cost;
    a.acts += r.personal_acts;
    a.payment += r.personal_payment;
  }
  for (const a of map.values()) {
    a.unit = a.acts > 0 ? a.cost / a.acts : null;
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost);
}

function rowKey(row: ScheduleRow): string {
  return `${row.date}::${row.account_id}::${row.anchor_user_id}::${row.time_slot[0]}-${row.time_slot[1]}`;
}

// 计算班次在时间轴上的位置（百分比），跨夜处理
function shiftPosition(
  slot: [string, string],
  axisEnd: number,
): { left: number; width: number; overnight: boolean } {
  const sh = parseHour(slot[0]);
  let eh = parseHour(slot[1]);
  const overnight = eh < sh || eh > 24;
  if (eh < sh) eh += 24;
  const left = (sh / axisEnd) * 100;
  const width = ((eh - sh) / axisEnd) * 100;
  return { left, width, overnight };
}

function ShiftBlock({
  row,
  axisEnd,
  yesterdayByHour,
  selected,
  onSelect,
}: {
  row: ScheduleRow;
  axisEnd: number;
  yesterdayByHour?: Record<number, YesterdayKpi>;
  selected: boolean;
  onSelect: (row: ScheduleRow) => void;
}) {
  const { left, width, overnight } = shiftPosition(row.time_slot, axisEnd);
  // 时段宽度过窄时（< 10%）压缩 stat label 为 1 字
  const compact = width < 10;
  // 班次同时段昨日同比：按 [start, end) 求和昨日小时数据
  const sh = parseHour(row.time_slot[0]);
  let eh = parseHour(row.time_slot[1]);
  if (eh < sh) eh += 24;
  // 班次块只在头部消耗显示同比，底部 mini stat 太窄不显
  const prev = sumYesterdayRange(yesterdayByHour, sh, eh);
  const dCost = kpiDelta(row.personal_cost, prev?.cost);
  const tone = overnight
    ? {
        border: "border-amber-500",
        bg: "bg-amber-50/80",
        text: "text-amber-700",
        divider: "border-amber-500/15",
      }
    : {
        border: "border-blue-500",
        bg: "bg-blue-50/90",
        text: "text-blue-700",
        divider: "border-blue-500/15",
      };
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={cn(
        "absolute inset-y-2 flex flex-col overflow-hidden rounded-md border-l-[3px] px-2 py-1.5 text-left transition hover:shadow-md",
        tone.border,
        tone.bg,
        selected && "ring-2 ring-primary shadow-md",
      )}
      style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}
    >
      {/* 头部：主播名 / 消耗 + 同比 */}
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate text-[12.5px] font-semibold ${tone.text}`}>
          {row.anchor_name ?? "未命名"}
        </span>
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="text-[12.5px] font-semibold tabular-nums text-slate-900">
            {fmtMoney(row.personal_cost)}
          </span>
          <DeltaArrow delta={dCost} />
        </span>
      </div>
      {/* 底部：3 列 mini stat（窄空间，不显同比，避免数值被截）*/}
      <div className={`mt-auto grid grid-cols-3 gap-1 border-t pt-1 ${tone.divider}`}>
        <ShiftStat label={compact ? "激" : "激活"} value={`${row.personal_acts}`} />
        <ShiftStat label="CPA" value={fmtPrice(row.personal_unit_price)} />
        <ShiftStat label={compact ? "付" : "付费"} value={fmtMoney(row.personal_payment)} />
      </div>
    </button>
  );
}

function ShiftStat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: KpiDelta | null;
}) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-slate-400">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1">
        <span className="truncate text-[11px] font-semibold tabular-nums text-slate-900">
          {value}
        </span>
        <DeltaArrow delta={delta} compact />
      </span>
    </div>
  );
}

function InlineMetric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: KpiDelta | null;
}) {
  return (
    <div className="min-w-[92px] border-l border-border/70 pl-3 leading-tight first:border-l-0 first:pl-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[14px] font-semibold text-slate-900 tabular-nums">{value}</span>
        <DeltaArrow delta={delta} compact />
      </div>
    </div>
  );
}

function DeltaArrow({ delta, compact = false }: { delta?: KpiDelta | null; compact?: boolean }) {
  if (!delta) return null;
  const cls =
    delta.arrow === "up"
      ? "text-[var(--change-up)]"
      : delta.arrow === "down"
        ? "text-[var(--change-down)]"
        : "text-muted-foreground/60";
  const size = compact ? "text-[9px]" : "text-[10px]";
  return (
    <span className={`${size} font-medium tabular-nums ${cls}`}>
      {delta.arrow === "up" ? "↑" : delta.arrow === "down" ? "↓" : "—"}
      {delta.arrow !== "flat" && Math.abs(delta.pct).toFixed(0) + "%"}
    </span>
  );
}

function AxisTicks({ axisEnd }: { axisEnd: number }) {
  // 整点刻度：每 3 小时一个标签
  const step = 3;
  const ticks: number[] = [];
  for (let h = 0; h <= axisEnd; h += step) ticks.push(h);
  if (!ticks.includes(axisEnd)) ticks.push(axisEnd);
  return (
    <div className="relative h-5">
      {ticks.map((h) => {
        const display = h > 24 ? `${h - 24}` : `${h}`;
        const isCrossNight = h === 24 && axisEnd > 24;
        return (
          <span
            key={h}
            className={`absolute top-0 -translate-x-1/2 text-[10px] tabular-nums tracking-wider ${
              isCrossNight ? "font-medium text-amber-600" : "text-muted-foreground/60"
            }`}
            style={{ left: `${(h / axisEnd) * 100}%` }}
          >
            {display}
            {h > 24 && <span className="ml-0.5 text-[9px] text-amber-500">+1</span>}
          </span>
        );
      })}
    </div>
  );
}

function GridLines({ axisEnd }: { axisEnd: number }) {
  // 每 3 小时一道虚线 + 24 点处加深线（如果跨夜）
  const lines: { hour: number; key: string; cls: string }[] = [];
  for (let h = 3; h < axisEnd; h += 3) {
    lines.push({
      hour: h,
      key: `g${h}`,
      cls: h === 24 ? "border-amber-300/60" : "border-slate-100",
    });
  }
  return (
    <>
      {lines.map((l) => (
        <div
          key={l.key}
          className={`pointer-events-none absolute inset-y-0 border-l border-dashed ${l.cls}`}
          style={{ left: `${(l.hour / axisEnd) * 100}%` }}
        />
      ))}
    </>
  );
}

interface KpiDelta {
  pct: number; // 百分比变化（正负）
  arrow: "up" | "down" | "flat";
  prevText: string; // "昨日 ¥X" 副文本
}

function kpiDelta(curr: number | null, prev: number | null | undefined): KpiDelta | null {
  if (prev == null || curr == null) return null;
  if (prev === 0) {
    if (curr === 0) return { pct: 0, arrow: "flat", prevText: "昨日 0" };
    return null; // 昨日为 0 时百分比无意义
  }
  const pct = ((curr - prev) / prev) * 100;
  const arrow = Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down";
  // prevText 由调用方决定（数字格式不一），这里只算 pct/arrow，prevText 留空字符串
  return { pct, arrow, prevText: "" };
}

function GroupCard({
  g,
  yesterdayByHour,
  cutoffHour,
  selectedKey,
  onSelect,
}: {
  g: Group;
  yesterdayByHour?: Record<number, YesterdayKpi>;
  cutoffHour: number;
  selectedKey: string | null;
  onSelect: (row: ScheduleRow) => void;
}) {
  const rollups = rollupAnchors(g.rows);
  const axisEnd = g.maxEndHour;
  // account 级同比：累加昨日 0~cutoffHour（看历史时 cutoffHour=24）
  const yesterdayKpi = sumYesterdayRange(yesterdayByHour, 0, cutoffHour);
  const cpaToday = g.totalActs > 0 ? g.totalCost / g.totalActs : null;
  const cpaPrev =
    yesterdayKpi && yesterdayKpi.acts > 0 ? yesterdayKpi.cost / yesterdayKpi.acts : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
        <div className="min-w-[220px] flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {g.placementLabel ?? "无标签"}
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
              {g.accountName}
            </span>
          </div>
          <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {g.date} · {g.rows.length} 班次 · {rollups.length} 主播
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InlineMetric
            label="消耗"
            value={fmtMoney(g.totalCost)}
            delta={kpiDelta(g.totalCost, yesterdayKpi?.cost)}
          />
          <InlineMetric
            label="激活"
            value={fmtChinese(g.totalActs)}
            delta={kpiDelta(g.totalActs, yesterdayKpi?.acts)}
          />
          <InlineMetric
            label="CPA"
            value={fmtPrice(g.totalUnitPrice)}
            delta={kpiDelta(cpaToday, cpaPrev)}
          />
          <InlineMetric
            label="付费"
            value={fmtMoney(g.totalPayment)}
            delta={kpiDelta(g.totalPayment, yesterdayKpi?.payment)}
          />
        </div>
      </div>

      <div className="px-4 pb-3 pt-3">
        <AxisTicks axisEnd={axisEnd} />
        <div className="relative mt-1 h-[86px] rounded-md border border-slate-100 bg-slate-50/40">
          <GridLines axisEnd={axisEnd} />
          {g.rows.map((r) => (
            <ShiftBlock
              key={rowKey(r)}
              row={r}
              axisEnd={axisEnd}
              yesterdayByHour={yesterdayByHour}
              selected={selectedKey === rowKey(r)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ScheduleTable({
  rows,
  yesterdayHourly,
  yesterdayCutoffHour = 24,
}: ScheduleTableProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const groups = useMemo(() => groupRows(rows), [rows]);
  const selectedRow = useMemo(() => {
    if (!selectedKey) return rows[0] ?? null;
    return rows.find((row) => rowKey(row) === selectedKey) ?? rows[0] ?? null;
  }, [rows, selectedKey]);
  const activeKey = selectedRow ? rowKey(selectedRow) : null;

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-12 text-center">
        <div className="text-sm text-muted-foreground/70">暂无主播-投放排班数据</div>
        <div className="mt-1 text-xs text-muted-foreground/40">
          需先在「主播管理」配置账号-主播默认排班
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
        <span>
          <strong className="font-medium text-slate-700">{rows.length}</strong> 班次 ·
          <strong className="ml-1 font-medium text-slate-700">{groups.length}</strong> (账号 × 日期)
          组合
        </span>
        <span className="text-muted-foreground/50">
          班次块宽度 = 时长 · 跨夜班次（橙色）以 24+ 显示
        </span>
      </div>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          {groups.map((g) => (
            <GroupCard
              key={`${g.date}::${g.accountId}`}
              g={g}
              yesterdayByHour={yesterdayHourly?.[g.accountId]}
              cutoffHour={yesterdayCutoffHour}
              selectedKey={activeKey}
              onSelect={(row) => setSelectedKey(rowKey(row))}
            />
          ))}
        </div>
        <ScheduleDetailPanel
          row={selectedRow}
          yesterdayByHour={selectedRow ? yesterdayHourly?.[selectedRow.account_id] : undefined}
        />
      </div>
    </div>
  );
}

function ScheduleDetailPanel({
  row,
  yesterdayByHour,
}: {
  row: ScheduleRow | null;
  yesterdayByHour?: Record<number, YesterdayKpi>;
}) {
  if (!row) {
    return (
      <aside className="hidden w-[320px] shrink-0 rounded-lg border border-border bg-white p-4 shadow-sm xl:block">
        <div className="text-sm font-medium text-slate-900">时段详情</div>
        <div className="mt-2 text-xs text-muted-foreground">点击左侧时间轴里的班次查看明细。</div>
      </aside>
    );
  }

  const sh = parseHour(row.time_slot[0]);
  let eh = parseHour(row.time_slot[1]);
  if (eh < sh) eh += 24;
  const prev = sumYesterdayRange(yesterdayByHour, sh, eh);
  const cpaPrev = prev && prev.acts > 0 ? prev.cost / prev.acts : null;
  const cpaDelta = kpiDelta(row.personal_unit_price, cpaPrev);

  return (
    <aside className="hidden h-fit w-[320px] shrink-0 rounded-lg border border-border bg-white shadow-sm xl:sticky xl:top-3 xl:block">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="text-xs text-muted-foreground">时段详情</div>
        <div className="mt-1 text-base font-semibold text-slate-900">
          {row.anchor_name ?? "未命名"}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {row.account_name} · {row.date} · {fmtSlot(row.time_slot)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-4">
        <DetailMetric
          label="个人消耗"
          value={fmtMoney(row.personal_cost)}
          delta={kpiDelta(row.personal_cost, prev?.cost)}
        />
        <DetailMetric
          label="激活"
          value={String(row.personal_acts)}
          delta={kpiDelta(row.personal_acts, prev?.acts)}
        />
        <DetailMetric label="CPA" value={fmtPrice(row.personal_unit_price)} delta={cpaDelta} />
        <DetailMetric
          label="付费"
          value={fmtMoney(row.personal_payment)}
          delta={kpiDelta(row.personal_payment, prev?.payment)}
        />
      </div>

      <div className="border-t border-border/70 px-4 py-3">
        <div className="mb-2 text-xs font-medium text-slate-700">账号当日累计</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <span className="text-muted-foreground">累计消耗</span>
          <span className="text-right font-semibold text-slate-900">
            {fmtMoney(row.total_cost)}
          </span>
          <span className="text-muted-foreground">累计激活</span>
          <span className="text-right font-semibold text-slate-900">{row.total_acts}</span>
          <span className="text-muted-foreground">累计 CPA</span>
          <span className="text-right font-semibold text-slate-900">
            {fmtPrice(row.total_unit_price)}
          </span>
          <span className="text-muted-foreground">累计付费</span>
          <span className="text-right font-semibold text-slate-900">
            {fmtMoney(row.total_payment)}
          </span>
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
  delta: KpiDelta | null;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-slate-50/60 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[15px] font-semibold text-slate-900 tabular-nums">{value}</span>
        <DeltaArrow delta={delta} compact />
      </div>
    </div>
  );
}
