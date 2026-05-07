"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

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
    <div className="flex items-center gap-1.5">
      {MODES.map((m) => {
        const isActive = current === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
