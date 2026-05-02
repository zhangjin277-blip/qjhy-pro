"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AnchorListFilters, ProjectFilter } from "@/modules/anchors";

export function Filters({
  filters,
  onChange,
}: {
  filters: AnchorListFilters;
  onChange: (f: AnchorListFilters) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={filters.date}
        onChange={(e) => onChange({ ...filters, date: e.target.value })}
        className="max-w-[160px]"
      />
      <Select
        value={filters.project ?? "all"}
        onValueChange={(v) => onChange({ ...filters, project: v as ProjectFilter })}
      >
        <SelectTrigger className="max-w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部</SelectItem>
          <SelectItem value="ddz">斗地主</SelectItem>
          <SelectItem value="three">三国</SelectItem>
        </SelectContent>
      </Select>
      <Input
        placeholder="搜索昵称/抖音号"
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="max-w-[200px]"
      />
    </div>
  );
}
