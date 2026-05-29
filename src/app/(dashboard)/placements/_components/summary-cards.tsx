"use client";
import { useMemo, useState } from "react";
import type {
  SummaryRowExt,
  SubAccountRow,
  BoardFilter,
  CheckinSlot,
} from "@/modules/placement/server";
import { AnchorDetailDrawer } from "./anchor-detail-drawer";

interface SummaryCardsProps {
  rows: SummaryRowExt[];
  subAccounts: SubAccountRow[];
  checkinByLabel: Record<string, CheckinSlot[]>;
  filter: BoardFilter;
}

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e6) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function avatarChar(label: string): string {
  return label.length <= 2 ? label : label.slice(0, 2);
}

/** "HH:MM" → 小时小数（24:00→24） */
function parseHour(t: string): number {
  const parts = t.split(":");
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h + m / 60;
}

function PlatformBadge({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) return null;
  return (
    <>
      {platforms.map((p) => {
        const isDouyin = p.includes("抖音");
        const isKuaishou = p.includes("快手");
        return (
          <span
            key={p}
            className={`rounded px-1.5 py-px text-[10px] font-medium ${
              isDouyin
                ? "bg-[#fff1f0] text-[#cf1322]"
                : isKuaishou
                  ? "bg-[#fffbe6] text-[#d48806]"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {p}
          </span>
        );
      })}
    </>
  );
}

interface Segment {
  slotStart: string;
  slotEnd: string;
}

interface MergedAnchor {
  anchorName: string | null;
  cost: number;
  segments: Segment[];
}

/** 同一主播的多个开播时段合并成一条：消耗累加、时段汇总 */
function mergeByAnchor(slots: CheckinSlot[]): MergedAnchor[] {
  const map = new Map<string, MergedAnchor>();
  for (const s of slots) {
    const key = s.anchorName ?? "—";
    let m = map.get(key);
    if (!m) {
      m = { anchorName: s.anchorName, cost: 0, segments: [] };
      map.set(key, m);
    }
    m.cost += s.cost;
    m.segments.push({ slotStart: s.slotStart, slotEnd: s.slotEnd });
  }
  return [...map.values()];
}

/** 24h 迷你时间条：标出该主播的全部开播时段（多段） */
function TimeBar({ segments }: { segments: Segment[] }) {
  return (
    <div className="relative h-[7px] overflow-hidden rounded-[4px] bg-slate-100">
      {segments.map((seg, i) => {
        const start = parseHour(seg.slotStart);
        let end = parseHour(seg.slotEnd);
        if (end <= start) end += 24; // 跨午夜
        const left = Math.max(0, Math.min(100, (start / 24) * 100));
        const width = Math.max(2, Math.min(100 - left, ((end - start) / 24) * 100));
        return (
          <span
            key={i}
            className="absolute top-0 h-full rounded-[4px] bg-gradient-to-r from-[#3b82f6] to-[#1677ff]"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

export function SummaryCards({ rows, subAccounts, checkinByLabel, filter }: SummaryCardsProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const subByLabel = useMemo(() => {
    const m = new Map<string, SubAccountRow[]>();
    for (const s of subAccounts) {
      const key = s.placement_label ?? "（无标签）";
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [subAccounts]);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white py-16 text-center text-sm text-muted-foreground/70">
        暂无投放数据
      </div>
    );
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const selectedRow = selected
    ? (rows.find((r) => (r.anchor_label ?? "（无标签）") === selected) ?? null)
    : null;
  const selectedSubs = selected ? (subByLabel.get(selected) ?? []) : [];

  return (
    <>
      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs tabular-nums">
        <span>
          范围 <strong className="text-foreground">{filter.date_from}</strong> ~{" "}
          <strong className="text-foreground">{filter.date_to}</strong>
        </span>
        <span>
          主播 <strong className="text-foreground">{rows.length}</strong>
        </span>
        <span>
          合计消耗 <strong className="text-foreground">{fmtMoney(totalCost)}</strong>
        </span>
        <span>按消耗降序 · 点击卡片查看明细</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const label = r.anchor_label ?? "（无标签）";
          const isKuaishou = r.platforms.some((p) => p.includes("快手"));
          const cpa = r.activations > 0 ? r.cost / r.activations : null;
          const arpu = r.activations > 0 ? r.payment / r.activations : null;
          const delta = r.prev_cost > 0 ? ((r.cost - r.prev_cost) / r.prev_cost) * 100 : null;
          const deltaUp = delta != null && delta > 0;
          const slots = checkinByLabel[label] ?? [];
          const mergedAnchors = mergeByAnchor(slots);

          return (
            <div
              key={label}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(label)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(label);
                }
              }}
              className="grid cursor-pointer grid-cols-[1.35fr_1fr] gap-4 rounded-[14px] border border-slate-100 bg-white p-4 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {/* 左栏：账号 + 投放数据 */}
              <div className="flex min-w-0 flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  {r.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.avatar}
                      alt={r.account_name ?? label}
                      className="h-9 w-9 shrink-0 rounded-[9px] object-cover ring-1 ring-slate-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-[10.5px] font-semibold text-white shadow-sm ${
                        isKuaishou
                          ? "bg-gradient-to-br from-[#ffedd5] to-[#ff7d00]"
                          : "bg-gradient-to-br from-[#d1e9ff] to-[#1677ff]"
                      }`}
                    >
                      {avatarChar(label)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-foreground">
                      {r.account_name ?? label}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <PlatformBadge platforms={r.platforms} />
                      {label !== "（无标签）" && (
                        <span className="rounded bg-purple-50 px-1.5 py-px text-[10px] text-purple-700">
                          {label}
                        </span>
                      )}
                      {r.platform_account_id && (
                        <span className="text-[10.5px] tabular-nums text-muted-foreground/80">
                          {r.platform_account_id}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 消耗 */}
                <div>
                  <div className="flex items-center text-[10.5px] text-muted-foreground">
                    消耗
                    {delta != null &&
                      (Math.abs(delta) < 0.5 ? (
                        <span className="ml-1.5 text-muted-foreground/70">— 持平</span>
                      ) : (
                        <span
                          className={`ml-1.5 font-medium ${deltaUp ? "text-[var(--change-up)]" : "text-[var(--change-down)]"}`}
                        >
                          {deltaUp ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
                        </span>
                      ))}
                  </div>
                  <div className="text-[22px] font-bold leading-none tabular-nums text-foreground">
                    {fmtMoney(r.cost)}
                  </div>
                </div>

                {/* 4 指标竖排 */}
                <div className="flex flex-col gap-1.5">
                  {[
                    { k: "激活", v: fmtChinese(r.activations) },
                    { k: "激活单价", v: cpa == null ? "—" : `¥${cpa.toFixed(2)}` },
                    { k: "付费", v: fmtMoney(r.payment) },
                    { k: "ARPU", v: arpu == null ? "—" : `¥${arpu.toFixed(2)}` },
                  ].map((m, i, a) => (
                    <div
                      key={m.k}
                      className={`flex items-baseline justify-between pb-1 text-[11.5px] ${
                        i < a.length - 1 ? "border-b border-dashed border-slate-100" : ""
                      }`}
                    >
                      <span className="text-muted-foreground">{m.k}</span>
                      <span className="font-semibold tabular-nums text-foreground">{m.v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* 右栏：按开播记录的主播 */}
              <div className="flex min-w-0 flex-col gap-2 border-l border-slate-100 pl-3.5">
                <div className="flex items-center justify-between text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground/80">
                  <span>开播主播</span>
                  <span
                    className={`tabular-nums ${mergedAnchors.length ? "text-blue-600" : "text-slate-400"}`}
                  >
                    {mergedAnchors.length}
                  </span>
                </div>
                {mergedAnchors.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2 py-4 text-center text-[11px] text-slate-400">
                    暂无开播记录
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {mergedAnchors.map((m, i) => (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-[11.5px]">
                          <span className="truncate font-semibold text-foreground">
                            {m.anchorName ?? "—"}
                          </span>
                          <span className="ml-auto shrink-0 font-semibold tabular-nums text-blue-600">
                            {fmtMoney(m.cost)}
                          </span>
                        </div>
                        <TimeBar segments={m.segments} />
                        <div className="text-[9.5px] tabular-nums text-muted-foreground/80">
                          {m.segments.map((s) => `${s.slotStart}–${s.slotEnd}`).join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AnchorDetailDrawer
        open={!!selectedRow}
        onClose={() => setSelected(null)}
        anchor={selectedRow}
        subAccounts={selectedSubs}
        filter={filter}
        prevCost={selectedRow?.prev_cost ?? 0}
      />
    </>
  );
}
