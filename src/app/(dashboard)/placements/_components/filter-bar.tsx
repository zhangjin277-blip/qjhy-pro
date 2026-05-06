"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

const PRESETS = [
  { id: "today", label: "今天", days: 0 },
  { id: "yesterday", label: "昨天", days: 1 },
  { id: "last7", label: "最近 7 天", days: 7 },
  { id: "last30", label: "最近 30 天", days: 30 },
];

export function FilterBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const [preset, setPreset] = useState(sp.get("preset") ?? "last7");
  const [datasets, setDatasets] = useState<string[]>(
    sp.get("ds")?.split(",").filter(Boolean) ?? Object.keys(DATASET_LABEL),
  );
  const [search, setSearch] = useState(sp.get("q") ?? "");

  const apply = () => {
    const usp = new URLSearchParams();
    usp.set("preset", preset);
    usp.set("ds", datasets.join(","));
    if (search) usp.set("q", search);
    router.push(`?${usp.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
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

      <div className="flex gap-1">
        {(Object.keys(DATASET_LABEL) as DatasetId[]).map((k) => {
          const active = datasets.includes(k);
          return (
            <button
              key={k}
              onClick={() =>
                setDatasets(active ? datasets.filter((d) => d !== k) : [...datasets, k])
              }
              className={`rounded px-2 py-1 text-xs ${
                active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {DATASET_LABEL[k]}
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
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
