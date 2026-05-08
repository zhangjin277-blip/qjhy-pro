"use client";
import { useEffect, useState } from "react";
import type {
  SummaryRowExt,
  SubAccountRow,
  AccountHourlyRow,
  BoardFilter,
} from "@/modules/placement/server";
import { fetchAccountHourly } from "../actions";
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

  // 切换主播时重置内部状态
  useEffect(() => {
    setOpenPkg(null);
    setHourlyMap({});
  }, [anchor?.anchor_label]);

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
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm ${
                  isKuaishou
                    ? "bg-gradient-to-br from-[#ffedd5] to-[#ff7d00]"
                    : "bg-gradient-to-br from-[#d1e9ff] to-[#1677ff]"
                }`}
              >
                {avatarChar(label)}
              </div>
              <div>
                <div className="text-[18px] font-semibold text-foreground">{label}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
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
                          {r.hour.toString().padStart(2, "0")}:00 —{" "}
                          {((r.hour + 1) % 24).toString().padStart(2, "0")}:00
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
