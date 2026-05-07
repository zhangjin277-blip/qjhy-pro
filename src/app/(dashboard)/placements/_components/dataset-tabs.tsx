"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";
import { cn } from "@/lib/utils/cn";

interface DatasetTabsProps {
  counts: { dataset_id: string; count: number }[];
}

const ALL = "all";

export function DatasetTabs({ counts }: DatasetTabsProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const dsParam = sp.get("ds");
  // 没设 ds 时默认捕鱼；ds=all 表示全部
  const active = dsParam ?? "product_buyu";

  function setActive(id: string) {
    const usp = new URLSearchParams(sp.toString());
    if (id === "product_buyu") {
      // 默认值不写 url
      usp.delete("ds");
    } else {
      usp.set("ds", id);
    }
    router.push(`/placements?${usp.toString()}`);
  }

  const countMap = new Map(counts.map((c) => [c.dataset_id, c.count]));
  const totalCount = counts.reduce((s, c) => s + c.count, 0);

  const items: { id: string; label: string; count: number }[] = [
    ...(Object.keys(DATASET_LABEL) as DatasetId[]).map((id) => ({
      id,
      label: DATASET_LABEL[id],
      count: countMap.get(id) ?? 0,
    })),
    { id: ALL, label: "全部", count: totalCount },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground mr-1 text-xs">预设:</span>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => setActive(it.id)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {it.label}
            <span
              className={cn(
                "rounded px-1 text-[10px]",
                isActive ? "bg-white/20 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {it.count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
