"use client";

import {
  BUSINESS_LINE_TABS,
  blStyle,
  type BusinessLineTabKey,
} from "./anchor-business-line-styles";

interface AnchorPillTabsProps {
  active: BusinessLineTabKey;
  onChange: (key: BusinessLineTabKey) => void;
  counts: Record<BusinessLineTabKey, number>;
}

export function AnchorPillTabs({ active, onChange, counts }: AnchorPillTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {BUSINESS_LINE_TABS.map((t) => {
        const isActive = t.key === active;
        if (t.key === "all") {
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-500 font-semibold text-white"
                  : "border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                  isActive ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {counts[t.key] ?? 0}
              </span>
            </button>
          );
        }
        const s = blStyle(t.key);
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              isActive
                ? `${s.chipBg} ${s.chipFg} ${s.chipBd} font-semibold`
                : "border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className={`h-2 w-2 rounded-full bg-gradient-to-br ${s.gradient}`} />
            {t.label}
            <span
              className={`rounded-full px-1.5 text-[10px] tabular-nums ${
                isActive ? "bg-white/70 text-current" : "bg-slate-100 text-slate-500"
              }`}
            >
              {counts[t.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
