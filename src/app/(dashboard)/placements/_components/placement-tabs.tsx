"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { PresetChip } from "@/components/patterns/preset-toolbar";

export function PlacementTabs({ current }: { current: "summary" | "time-range" }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function switchTo(next: "summary" | "time-range") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "time-range") {
      params.set("tab", "time-range");
      params.delete("anchor");
      params.delete("q");
      params.delete("chart");
      params.delete("view");
    } else {
      params.delete("tab");
      params.delete("startHour");
      params.delete("endHour");
      params.delete("anchorUser");
      params.delete("accountId");
      params.delete("page");
    }
    router.push(`/placements?${params.toString()}`);
  }

  return (
    <>
      <PresetChip active={current === "summary"} onClick={() => switchTo("summary")}>
        主播汇总
      </PresetChip>
      <PresetChip active={current === "time-range"} onClick={() => switchTo("time-range")}>
        时段查询
      </PresetChip>
    </>
  );
}
