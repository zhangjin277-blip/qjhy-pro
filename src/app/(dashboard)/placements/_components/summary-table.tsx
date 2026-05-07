"use client";
import { useMemo, useState } from "react";
import type { SummaryRowExt, SubAccountRow, BoardFilter } from "@/modules/placement/server";
import { AnchorDetailDrawer } from "./anchor-detail-drawer";

interface SummaryTableProps {
  rows: SummaryRowExt[];
  subAccounts: SubAccountRow[];
  filter: BoardFilter;
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

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-[22px] w-[90px]" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const W = 90;
  const H = 22;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none">
      <polyline fill="none" stroke="#1677ff" strokeWidth={1.4} points={points} />
    </svg>
  );
}

function avatarChar(label: string): string {
  return label.length <= 2 ? label : label.slice(0, 2);
}

function PlatformBadge({ platforms }: { platforms: string[] }) {
  if (platforms.length === 0) return null;
  return (
    <div className="flex gap-1">
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
    </div>
  );
}

function DeltaPill({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0) return null;
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 0.5)
    return <span className="ml-1.5 text-[11px] text-muted-foreground/70">— 持平</span>;
  const up = delta > 0;
  return (
    <span
      className={`ml-1.5 text-[11px] ${up ? "text-[var(--change-up)]" : "text-[var(--change-down)]"}`}
    >
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function SummaryTable({ rows, subAccounts, filter }: SummaryTableProps) {
  const [selected, setSelected] = useState<string | null>(null);

  // 按 placement_label 分组 sub accounts
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
        <span>按消耗降序 · 点击行查看明细</span>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "20%" }}
                >
                  主播
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "9%" }}
                >
                  投放包
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "13%" }}
                >
                  消耗 ▼
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "9%" }}
                >
                  激活
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "11%" }}
                >
                  激活单价
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "13%" }}
                >
                  付费金额
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "11%" }}
                >
                  ARPU
                </th>
                <th
                  className="px-3 py-2.5 text-left text-[11.5px] font-medium text-muted-foreground"
                  style={{ width: "14%" }}
                >
                  趋势
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const label = r.anchor_label ?? "（无标签）";
                const isSelected = selected === label;
                const isKuaishou = r.platforms.some((p) => p.includes("快手"));
                const cpa = r.activations > 0 ? r.cost / r.activations : null;
                const arpu = r.activations > 0 ? r.payment / r.activations : null;

                return (
                  <tr
                    key={label}
                    onClick={() => setSelected(label)}
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-[var(--hover-bg)] ${
                      isSelected ? "bg-primary/10 shadow-[inset_3px_0_0_var(--primary)]" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold text-white shadow-sm ${
                            isKuaishou
                              ? "bg-gradient-to-br from-[#ffedd5] to-[#ff7d00]"
                              : "bg-gradient-to-br from-[#d1e9ff] to-[#1677ff]"
                          }`}
                        >
                          {avatarChar(label)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-semibold text-foreground">
                            {label}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <PlatformBadge platforms={r.platforms} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {r.account_count} 包
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[12.5px] text-foreground">{fmtMoney(r.cost)}</span>
                      <DeltaPill cur={r.cost} prev={r.prev_cost} />
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      {fmtChinese(r.activations)}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      {cpa == null ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `¥${cpa.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      {fmtMoney(r.payment)}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">
                      {arpu == null ? (
                        <span className="text-muted-foreground/40">—</span>
                      ) : (
                        `¥${arpu.toFixed(2)}`
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Sparkline values={r.sparkline} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
