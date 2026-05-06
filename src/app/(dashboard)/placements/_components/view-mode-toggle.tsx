"use client";
import { useRouter, useSearchParams } from "next/navigation";

const MODES = [
  { id: "detail", label: "单包" },
  { id: "summary", label: "汇总" },
  { id: "schedule", label: "主播-投放" },
] as const;

type ViewMode = "detail" | "summary" | "schedule";

interface ViewModeToggleProps {
  current: ViewMode;
}

export function ViewModeToggle({ current }: ViewModeToggleProps) {
  const router = useRouter();
  const sp = useSearchParams();

  function setMode(mode: ViewMode) {
    const usp = new URLSearchParams(sp.toString());
    usp.set("view", mode);
    router.push(`/placements?${usp.toString()}`);
  }

  return (
    <div className="flex gap-0 rounded-md border border-slate-200 p-0.5 bg-slate-50">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => setMode(m.id)}
          className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
            current === m.id
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
