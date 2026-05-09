"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { PresetChip } from "@/components/patterns/preset-toolbar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRESET_DAYS: Record<string, number> = {
  today: 0,
  yesterday: 1,
  last7: 7,
  last30: 30,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetToRange(preset: string): { from: string; to: string } {
  const days = PRESET_DAYS[preset] ?? 7;
  const today = new Date();
  const to = new Date(today);
  const from = new Date(today);
  if (preset === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else if (preset !== "today") {
    from.setDate(from.getDate() - days);
  }
  return { from: isoDate(from), to: isoDate(to) };
}

interface AnchorLabelOption {
  label: string;
  account_name: string | null;
}

interface FilterBarProps {
  anchorLabels?: AnchorLabelOption[];
}

export function FilterBar({ anchorLabels = [] }: FilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  const fromUrl = sp.get("from") ?? "";
  const toUrl = sp.get("to") ?? "";
  const presetUrl = sp.get("preset") ?? "";
  const anchor = sp.get("anchor") ?? "";

  const effective =
    fromUrl && toUrl ? { from: fromUrl, to: toUrl } : presetToRange(presetUrl || "today");
  const activePreset = !fromUrl && !toUrl ? presetUrl || "today" : "";

  const [search, setSearch] = useState(sp.get("q") ?? "");

  function pushWith(patch: Record<string, string | null>) {
    const usp = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") usp.delete(k);
      else usp.set(k, v);
    }
    start(() => {
      router.push(`/placements?${usp.toString()}`);
    });
  }

  function applyPreset(p: string) {
    pushWith({ preset: p, from: null, to: null });
  }

  function applyDateChange(field: "from" | "to", value: string) {
    if (!value) return;
    const next =
      field === "from" ? { from: value, to: effective.to } : { from: effective.from, to: value };
    pushWith({ from: next.from, to: next.to, preset: null });
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        type="date"
        value={effective.from}
        onChange={(e) => applyDateChange("from", e.target.value)}
        className="w-[140px] shrink-0"
      />
      <span className="text-muted-foreground shrink-0">~</span>
      <Input
        type="date"
        value={effective.to}
        onChange={(e) => applyDateChange("to", e.target.value)}
        className="w-[140px] shrink-0"
      />

      <div className="flex shrink-0 gap-1">
        <PresetChip active={activePreset === "today"} onClick={() => applyPreset("today")}>
          今日
        </PresetChip>
        <PresetChip active={activePreset === "yesterday"} onClick={() => applyPreset("yesterday")}>
          昨日
        </PresetChip>
        <PresetChip active={activePreset === "last7"} onClick={() => applyPreset("last7")}>
          近 7 日
        </PresetChip>
        <PresetChip active={activePreset === "last30"} onClick={() => applyPreset("last30")}>
          近 30 日
        </PresetChip>
      </div>

      {anchorLabels.length > 0 && (
        <Select
          value={anchor || "all"}
          onValueChange={(v) => pushWith({ anchor: v === "all" ? null : v })}
        >
          <SelectTrigger className="w-[200px] shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部主播</SelectItem>
            {anchorLabels.map((opt) => (
              <SelectItem key={opt.label} value={opt.label}>
                {opt.account_name ?? opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Input
        placeholder="搜索账号昵称（回车）"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") pushWith({ q: search || null });
        }}
        onBlur={() => {
          if (search !== (sp.get("q") ?? "")) pushWith({ q: search || null });
        }}
        className="w-[240px] shrink-0"
      />

      {pending && <span className="text-xs text-slate-400">加载中...</span>}
    </div>
  );
}
