"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface DateRangeValue {
  from: string;
  to: string;
}

type Shortcut = "today" | "week" | "month" | "twoMonths";

function dateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function monthStart(value: string): Date {
  const [year = 1970, month = 1] = (value || todayKey()).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function shiftMonth(value: Date, amount: number): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + amount, 1));
}

function calendarCells(month: Date): (Date | null)[] {
  const firstWeekday = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  ).getUTCDay();
  const days = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), index + 1)),
    ),
  ];
}

function monthLabel(value: Date): string {
  return `${value.getUTCFullYear()}年 ${value.getUTCMonth() + 1}月`;
}

function todayKey(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shortcutRange(key: Shortcut): DateRangeValue {
  const today = new Date();
  const to = todayKey();
  if (key === "today") return { from: to, to };
  if (key === "week")
    return {
      from: formatLocal(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)),
      to,
    };
  if (key === "month") {
    return {
      from: formatLocal(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: formatLocal(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  return {
    from: formatLocal(new Date(today.getFullYear(), today.getMonth() - 2, 1)),
    to: formatLocal(new Date(today.getFullYear(), today.getMonth(), 0)),
  };
}

function formatLocal(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function displayRange(value: DateRangeValue): string {
  if (!value.from && !value.to) return "全部日期";
  if (value.from === value.to) return value.from.replaceAll("-", "/");
  return `${value.from.replaceAll("-", "/")} 至 ${value.to.replaceAll("-", "/")}`;
}

export function DateRangePicker({
  value,
  onChange,
  label = "日期范围",
  className,
  presets,
  onAll,
  allFrom,
  maxDate,
  triggerOnlyLabel = false,
  disabled = false,
  singleDay = false,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  label?: string;
  className?: string;
  presets?: { label: string; value: DateRangeValue }[];
  onAll?: () => void;
  allFrom?: string;
  maxDate?: string;
  triggerOnlyLabel?: boolean;
  disabled?: boolean;
  singleDay?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [calendarMonth, setCalendarMonth] = useState(() => monthStart(value.from));

  const [selectingEnd, setSelectingEnd] = useState(false);
  function changeOpen(next: boolean): void {
    if (next) {
      setDraft(value);
      setCalendarMonth(monthStart(value.from));
      setSelectingEnd(false);
    }
    setOpen(next);
  }

  function chooseDate(next: string): void {
    if (singleDay) {
      onChange({ from: next, to: next });
      setOpen(false);
      return;
    }
    if (!selectingEnd) {
      setDraft({ from: next, to: next });
      setSelectingEnd(true);
      return;
    }
    const range =
      next < draft.from ? { from: next, to: draft.from } : { from: draft.from, to: next };
    setDraft(range);
    onChange(range);
    setOpen(false);
  }

  function chooseShortcut(key: Shortcut): void {
    const next = shortcutRange(key);
    setDraft(next);
    onChange(next);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        type="button"
        disabled={disabled}
        className={cn(
          "flex max-w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm transition hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-500",
          className,
        )}
        aria-expanded={open}
        aria-label={`选择${label}`}
      >
        <CalendarDays className="size-3.5 shrink-0 text-slate-500" />
        <span className="whitespace-nowrap">{label}</span>
        {!triggerOnlyLabel && (
          <span className="truncate text-slate-600">{displayRange(value)}</span>
        )}
        <ChevronDown className={cn("size-3.5 text-slate-400 transition", open && "rotate-180")} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={8} collisionPadding={12} className="z-[100]">
          <Popover.Popup
            aria-label={`选择${label}`}
            className="flex max-h-[var(--available-height)] w-[760px] max-w-[calc(100vw-24px)] flex-col overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl outline-none sm:flex-row"
          >
            <div className="shrink-0 border-b border-slate-200 p-4 sm:w-[190px] sm:border-r sm:border-b-0">
              <div className="mb-3 text-sm font-semibold text-slate-800">快捷选择</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-2">
                {presets
                  ? presets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          onChange(preset.value);
                          setOpen(false);
                        }}
                        className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {preset.label}
                      </button>
                    ))
                  : (
                      [
                        ["today", "当天"],
                        ["week", "前1周"],
                        ["month", "前1个月"],
                        ["twoMonths", "前2个月"],
                      ] as const
                    )
                      .filter(([key]) => !singleDay || key === "today")
                      .map(([key, text]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => chooseShortcut(key)}
                          className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          {text}
                        </button>
                      ))}
                {(onAll || allFrom) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onAll) onAll();
                      else if (allFrom) onChange({ from: allFrom, to: todayKey() });
                      setOpen(false);
                    }}
                    className="rounded-lg bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                  >
                    全部
                  </button>
                )}
              </div>
            </div>
            <div className="min-w-0 flex-1 p-4">
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="上个月"
                  onClick={() => setCalendarMonth((month) => shiftMonth(month, -1))}
                  className="flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="grid flex-1 grid-cols-2 text-center text-sm font-semibold text-slate-800">
                  <span>{monthLabel(calendarMonth)}</span>
                  <span className="hidden sm:inline">
                    {monthLabel(shiftMonth(calendarMonth, 1))}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="下个月"
                  onClick={() => setCalendarMonth((month) => shiftMonth(month, 1))}
                  className="flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {[calendarMonth, shiftMonth(calendarMonth, 1)].map((month, monthIndex) => (
                  <div key={month.toISOString()}>
                    {monthIndex === 1 && (
                      <div className="mb-3 text-center text-sm font-semibold text-slate-800 sm:hidden">
                        {monthLabel(month)}
                      </div>
                    )}
                    <div className="mb-2 grid grid-cols-7 text-center text-[11px] text-slate-500">
                      {"日一二三四五六".split("").map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 text-center">
                      {calendarCells(month).map((day, index) => {
                        if (!day) return <span key={`empty-${index}`} className="h-7" />;
                        const current = dateKey(day);
                        const active = current >= draft.from && current <= draft.to;
                        const edge = current === draft.from || current === draft.to;
                        return (
                          <button
                            key={current}
                            type="button"
                            aria-label={current}
                            aria-pressed={active}
                            disabled={!!maxDate && current > maxDate}
                            onClick={() => chooseDate(current)}
                            className={cn(
                              "mx-auto flex size-7 items-center justify-center rounded-md text-xs transition disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-blue-500",
                              edge
                                ? "bg-blue-600 font-semibold text-white"
                                : active
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-slate-700 hover:bg-slate-100",
                            )}
                          >
                            {day.getUTCDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                <span aria-live="polite">
                  {singleDay
                    ? "请选择日期"
                    : selectingEnd
                      ? "请选择结束日期，可再次点击选择单日"
                      : "请选择开始日期"}
                </span>
                <Popover.Close className="rounded-md px-2 py-1 hover:bg-slate-100">
                  取消
                </Popover.Close>
              </div>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
