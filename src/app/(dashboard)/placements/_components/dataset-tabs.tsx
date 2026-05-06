"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";

interface DatasetTabsProps {
  counts: { dataset_id: string; count: number }[];
}

export function DatasetTabs({ counts }: DatasetTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const dsParam = sp.get("ds");
  const activeDsSet = dsParam
    ? new Set(dsParam.split(",").filter(Boolean))
    : new Set(Object.keys(DATASET_LABEL));

  function toggle(id: DatasetId) {
    const next = new Set(activeDsSet);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    const usp = new URLSearchParams(sp.toString());
    if (next.size === 0) {
      usp.delete("ds");
    } else {
      usp.set("ds", [...next].join(","));
    }
    router.push(`/placements?${usp.toString()}`);
  }

  const countMap = new Map(counts.map((c) => [c.dataset_id, c.count]));

  return (
    <div className="flex gap-1">
      {(Object.keys(DATASET_LABEL) as DatasetId[]).map((id) => {
        const active = activeDsSet.has(id);
        const count = countMap.get(id) ?? 0;
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {DATASET_LABEL[id]}
            <span
              className={`rounded-full px-1.5 py-0 text-[11px] font-normal ${
                active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
