"use client";
import { DateRangePicker } from "@/components/patterns/date-range-picker";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlacementAccountOption } from "@/modules/placement/server";

const START_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const END_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);

function hourLabel(hour: number): string {
  return hour === 24 ? "24:00" : `${String(hour).padStart(2, "0")}:00`;
}

interface TimeRangeFilterBarProps {
  dateFrom: string;
  dateTo: string;
  startHour: number;
  endHour: number;
  accountId?: string;
  accounts: PlacementAccountOption[];
}

export function TimeRangeFilterBar({
  dateFrom,
  dateTo,
  startHour,
  endHour,
  accountId,
  accounts,
}: TimeRangeFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pushWith(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.set("tab", "time-range");
    params.delete("page");
    startTransition(() => router.push(`/placements?${params.toString()}`));
  }

  const crossesMidnight = endHour < startHour;
  const fullDay = endHour === startHour;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <DateRangePicker
        label="直播日期"
        value={{ from: dateFrom, to: dateTo }}
        onChange={(next) => pushWith({ from: next.from, to: next.to, preset: null })}
      />

      <Select value={String(startHour)} onValueChange={(value) => pushWith({ startHour: value })}>
        <SelectTrigger className="w-[112px] shrink-0" aria-label="每日开始时间">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {START_HOURS.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="shrink-0 text-muted-foreground">至</span>
      <Select value={String(endHour)} onValueChange={(value) => pushWith({ endHour: value })}>
        <SelectTrigger className="w-[112px] shrink-0" aria-label="每日结束时间">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {END_HOURS.map((hour) => (
            <SelectItem key={hour} value={String(hour)}>
              {hourLabel(hour)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={accountId ?? "all"}
        onValueChange={(value) => pushWith({ accountId: value === "all" ? null : value })}
      >
        <SelectTrigger className="w-[220px] shrink-0" aria-label="直播账号">
          <SelectValue placeholder="全部账号" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部账号</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.account_id} value={account.account_id}>
              {account.account_name}
              {account.placement_label ? ` · ${account.placement_label}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-xs text-muted-foreground">
        {fullDay ? "相同时间按全天统计" : crossesMidnight ? "结束时间按次日计算" : "按每日时段统计"}
      </span>
      {pending && <span className="text-xs text-slate-400">加载中...</span>}
    </div>
  );
}
