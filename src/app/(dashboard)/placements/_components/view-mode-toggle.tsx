"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { PresetChip } from "@/components/patterns/preset-toolbar";

const MODES = [
  { id: "summary", label: "主播汇总" },
  { id: "schedule", label: "主播 × 投放" },
] as const;

type ViewMode = "summary" | "schedule";

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
    <>
      {MODES.map((m) => (
        <PresetChip key={m.id} active={current === m.id} onClick={() => setMode(m.id)}>
          {m.label}
        </PresetChip>
      ))}
    </>
  );
}
