"use client";

import { BUSINESS_LINE_TABS, blStyle } from "./anchor-business-line-styles";

interface AnchorStats {
  total: number;
  active: number;
  rest: number;
  leave: number;
  trial: number;
  unbound: number;
}

interface AnchorStatCardsProps {
  stats: AnchorStats;
  /** 业务线 → count，用于"主播总数"卡上方的频谱条 */
  byLine: Record<string, number>;
}

interface CardProps {
  label: string;
  value: number;
  accent: string; // bg-*, 给左侧 3px 色条用
  sub?: string;
  pulse?: boolean;
  children?: React.ReactNode;
}

function StatCard({ label, value, accent, sub, pulse, children }: CardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white px-4 py-3.5 shadow-xs">
      <span
        className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full ${accent}`}
        aria-hidden
      />
      <div className="pl-2">
        <div className="flex items-center gap-1.5 text-[11px] tracking-[0.04em] text-slate-500">
          {pulse && (
            <span className={`inline-block h-1.5 w-1.5 animate-pulse rounded-full ${accent}`} />
          )}
          {label}
        </div>
        <div className="mt-1.5 flex items-baseline gap-1 tabular-nums tracking-[-0.02em] text-slate-900">
          <span className="text-[28px] font-bold leading-none">{value}</span>
          <span className="text-[13px] font-medium text-slate-500">位</span>
        </div>
        {sub && <div className="mt-1 text-[11px] text-slate-400">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

export function AnchorStatCards({ stats, byLine }: AnchorStatCardsProps) {
  const blDist = BUSINESS_LINE_TABS.filter((t) => t.key !== "all").map((t) => {
    const count = byLine[t.key] ?? 0;
    return { key: t.key, count, style: blStyle(t.key) };
  });
  const blDistNonZero = blDist.filter((d) => d.count > 0);

  const pct = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <div className="lg:col-span-1">
        <StatCard label="主播总数" value={stats.total} accent="bg-blue-500">
          <div className="mt-2.5">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
              {blDistNonZero.map((d) => (
                <span
                  key={d.key}
                  title={`${d.key} · ${d.count}`}
                  className={`bg-gradient-to-br ${d.style.gradient}`}
                  style={{ flex: d.count }}
                />
              ))}
            </div>
            <div className="mt-1.5 text-[10.5px] tracking-[0.02em] text-slate-400">
              {blDistNonZero.length} 条业务线 · 各业务线占比
            </div>
          </div>
        </StatCard>
      </div>
      <StatCard
        label="在播中"
        value={stats.active}
        accent="bg-emerald-500"
        pulse
        sub={`占比 ${pct(stats.active)}%`}
      />
      <StatCard
        label="休息"
        value={stats.rest}
        accent="bg-amber-500"
        sub={`占比 ${pct(stats.rest)}%`}
      />
      <StatCard
        label="试播中"
        value={stats.trial}
        accent="bg-orange-500"
        sub={stats.trial > 0 ? `合作模式占比 ${pct(stats.trial)}%` : "暂无"}
      />
      <StatCard
        label="未绑账号"
        value={stats.unbound}
        accent="bg-slate-400"
        sub={stats.unbound > 0 ? "需要关注" : "全部已绑"}
      />
    </div>
  );
}
