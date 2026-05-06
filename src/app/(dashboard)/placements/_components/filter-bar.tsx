"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const PRESETS = [
  { id: "today", label: "今天" },
  { id: "yesterday", label: "昨天" },
  { id: "last7", label: "最近 7 天" },
  { id: "last30", label: "最近 30 天" },
];

interface FilterBarProps {
  anchorLabels?: string[];
}

export function FilterBar({ anchorLabels = [] }: FilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [preset, setPreset] = useState(sp.get("preset") ?? "last7");
  const [search, setSearch] = useState(sp.get("q") ?? "");
  const [anchor, setAnchor] = useState(sp.get("anchor") ?? "");

  const apply = () => {
    const usp = new URLSearchParams(sp.toString());
    usp.set("preset", preset);
    if (search) usp.set("q", search);
    else usp.delete("q");
    if (anchor) usp.set("anchor", anchor);
    else usp.delete("anchor");
    router.push(`/placements?${usp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
      {/* Date preset */}
      <select
        value={preset}
        onChange={(e) => setPreset(e.target.value)}
        className="rounded border border-slate-200 px-2 py-1 text-sm"
      >
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>

      {/* Anchor label filter */}
      {anchorLabels.length > 0 && (
        <select
          value={anchor}
          onChange={(e) => setAnchor(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">全部主播</option>
          {anchorLabels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && apply()}
        placeholder="搜索账号 / 主播"
        className="flex-1 rounded border border-slate-200 px-3 py-1 text-sm"
      />
      <button
        onClick={apply}
        className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white"
      >
        应用
      </button>
    </div>
  );
}
