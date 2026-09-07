"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { DATASET_LABEL, type DatasetId } from "@/modules/placement";
import { PresetChip, PresetChipCount } from "@/components/patterns/preset-toolbar";

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
      usp.delete("ds");
    } else {
      usp.set("ds", id);
    }
    usp.delete("page");
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
    <>
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <PresetChip key={it.id} active={isActive} onClick={() => setActive(it.id)}>
            {it.label}
            <PresetChipCount active={isActive}>{it.count.toLocaleString()}</PresetChipCount>
          </PresetChip>
        );
      })}
    </>
  );
}
