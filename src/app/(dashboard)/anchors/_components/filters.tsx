"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnchorListFilters, ProjectFilter } from "@/modules/anchors";

const transparentInput =
  "h-8 rounded border border-transparent bg-transparent px-2 text-sm placeholder:text-slate-400 hover:border-slate-200 focus:border-primary focus:bg-white focus:outline-none";

const yesterday = (): string => new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

export function Filters({
  filters,
  onChange,
}: {
  filters: AnchorListFilters;
  onChange: (f: AnchorListFilters) => void;
}): React.JSX.Element {
  function setRange(from: string, to: string): void {
    onChange({ ...filters, date_from: from, date_to: to });
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="date"
        value={filters.date_from}
        onChange={(e) => onChange({ ...filters, date_from: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />
      <span className="text-muted-foreground shrink-0">~</span>
      <input
        type="date"
        value={filters.date_to}
        onChange={(e) => onChange({ ...filters, date_to: e.target.value })}
        className={`${transparentInput} w-[140px] shrink-0`}
      />

      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={() => setRange(yesterday(), yesterday())}>
          昨日
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRange(daysAgo(7), yesterday())}>
          近 7 日
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRange(daysAgo(30), yesterday())}>
          近 30 日
        </Button>
      </div>

      <Select
        value={filters.project ?? "all"}
        onValueChange={(v) => onChange({ ...filters, project: v as ProjectFilter })}
      >
        <SelectTrigger className="w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部项目</SelectItem>
          <SelectItem value="ddz">斗地主</SelectItem>
          <SelectItem value="three">三国</SelectItem>
        </SelectContent>
      </Select>
      <input
        placeholder="搜索昵称/抖音号"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className={`${transparentInput} ml-auto min-w-0 flex-1 max-w-[240px]`}
      />
    </div>
  );
}
