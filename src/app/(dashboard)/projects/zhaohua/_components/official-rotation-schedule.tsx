"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useProjectSharedState } from "@/hooks/use-project-shared-state";
import { cn } from "@/lib/utils/cn";
import {
  OFFICIAL_ROTATION_SHIFTS,
  OFFICIAL_STAFF,
  type OfficialRotationShift,
  type OfficialShiftAssignment,
  type OfficialShiftRole,
} from "../_data/project-roster";

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const HOURS = [9, 12, 15, 18, 21, 24];
const GANTT_START = 9 * 60;
const GANTT_DURATION = 15 * 60;
const STORAGE_KEY = "zhaohua-official-rotation-shifts-v2";
const REVIEW_KEY = "zhaohua-official-shift-reviews-v1";
const TIME_OPTIONS = Array.from({ length: 30 }, (_, index) => {
  const totalMinutes = 9 * 60 + index * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});
const DURATION_OPTIONS = Array.from({ length: 9 }, (_, index) => index + 1);

interface TimedMemberDraft {
  name: string;
  startTime: string;
  endTime: string;
}

interface ShiftDraft {
  id: string | null;
  name: string;
  anchors: TimedMemberDraft[];
  controller: TimedMemberDraft;
  operator: TimedMemberDraft;
  note: string;
}

interface ShiftReview {
  rating: string;
  performance: string;
  highlights: string;
  issues: string;
  followUp: string;
  updatedAt: string;
}

const EMPTY_MEMBER: TimedMemberDraft = { name: "", startTime: "09:00", endTime: "12:00" };

function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthDay(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function minutes(time: string): number {
  const [hour = "0", minute = "0"] = time.split(":");
  return Number(hour) * 60 + Number(minute);
}

function timeFromMinutes(value: number): string {
  const normalized = ((value % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function shiftDurationHours(startTime: string, endTime: string): number {
  const start = minutes(startTime);
  const end = minutes(endTime);
  return ((end > start ? end : end + 24 * 60) - start) / 60;
}

function selectedDurationHours(startTime: string, endTime: string): number {
  return Math.min(9, Math.max(1, Math.round(shiftDurationHours(startTime, endTime))));
}

export function endTimeForDuration(startTime: string, durationHours: number): string {
  return timeFromMinutes(minutes(startTime) + durationHours * 60);
}

function nearestHalfHour(time: string): string {
  return timeFromMinutes(Math.round(minutes(time) / 30) * 30);
}

function normalizeDraftTime(member: TimedMemberDraft): TimedMemberDraft {
  const startTime = nearestHalfHour(member.startTime);
  return {
    ...member,
    startTime,
    endTime: endTimeForDuration(startTime, selectedDurationHours(member.startTime, member.endTime)),
  };
}

function displayName(assignment: OfficialShiftAssignment): string {
  const person = OFFICIAL_STAFF.find((staff) => staff.name === assignment.name);
  return assignment.role === "主播" ? (person?.alias ?? assignment.name) : assignment.name;
}

function roleBadgeTone(role: OfficialShiftRole): string {
  if (role === "主播") return "bg-blue-50 text-blue-700";
  if (role === "场控") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

function ganttSegments(startTime: string, endTime: string) {
  const start = minutes(startTime);
  const end = minutes(endTime);
  const adjustedEnd = end > start ? end : end + 24 * 60;
  const visibleStart = Math.max(start, GANTT_START);
  const visibleEnd = Math.min(adjustedEnd, 24 * 60);
  if (visibleEnd <= visibleStart) return [];
  return [{ start: visibleStart, duration: visibleEnd - visibleStart }];
}

function WeeklyGantt({
  days,
  shifts,
  selectedDateKey,
  onSelectDay,
  reviews,
  onReview,
}: {
  days: { label: string; date: Date }[];
  shifts: OfficialRotationShift[];
  selectedDateKey: string;
  onSelectDay: (index: number) => void;
  reviews: Record<string, ShiftReview>;
  onReview: (shift: OfficialRotationShift) => void;
}): React.JSX.Element {
  const [hoveredReview, setHoveredReview] = useState<{
    x: number;
    y: number;
    anchorNames: string;
    time: string;
    review: ShiftReview | null;
  } | null>(null);
  const weeklyAnchorHours = useMemo(() => {
    const dateKeys = new Set(days.map((day) => toDateKey(day.date)));
    const totals = new Map<string, number>();
    for (const shift of shifts) {
      if (!dateKeys.has(shift.date)) continue;
      for (const assignment of shift.assignments) {
        if (assignment.role !== "主播") continue;
        const name = displayName(assignment);
        totals.set(
          name,
          (totals.get(name) ?? 0) + shiftDurationHours(assignment.startTime, assignment.endTime),
        );
      }
    }
    return [...totals.entries()].sort(
      ([leftName, leftHours], [rightName, rightHours]) =>
        rightHours - leftHours || leftName.localeCompare(rightName, "zh-CN"),
    );
  }, [days, shifts]);

  const showReviewTooltip = (
    clientX: number,
    clientY: number,
    anchorNames: string,
    time: string,
    review: ShiftReview | null,
  ) => {
    setHoveredReview({
      x: Math.max(12, Math.min(clientX + 12, window.innerWidth - 292)),
      y: Math.max(12, Math.min(clientY + 12, window.innerHeight - 220)),
      anchorNames,
      time,
      review,
    });
  };

  return (
    <>
      <div className="min-w-[560px] overflow-hidden rounded-lg border border-slate-200">
        <div className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-slate-200 bg-white px-3 py-2">
          <span className="shrink-0 text-xs font-semibold text-slate-700">本周主播时长</span>
          {weeklyAnchorHours.length === 0 ? (
            <span className="text-xs text-slate-400">暂无排班</span>
          ) : (
            weeklyAnchorHours.map(([name, hours]) => (
              <span key={name} className="whitespace-nowrap text-xs text-slate-600">
                {name}
                <strong className="ml-1 font-semibold text-blue-700">
                  {Number.isInteger(hours) ? hours : hours.toFixed(1)}h
                </strong>
              </span>
            ))
          )}
        </div>
        <div className="grid grid-cols-[76px_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
          <div className="px-3 py-2 text-xs font-medium text-slate-500">日期</div>
          <div className="grid grid-cols-6 px-2 py-2 text-[10px] text-slate-400">
            {HOURS.map((hour, index) => (
              <span key={hour} className={cn(index === HOURS.length - 1 && "text-right")}>
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
        </div>
        {days.map((day, dayIndex) => {
          const dateKey = toDateKey(day.date);
          const selected = dateKey === selectedDateKey;
          const shiftRows = shifts
            .filter((shift) => shift.date === dateKey)
            .map((shift) => ({
              shift,
              anchors: shift.assignments.filter((assignment) => assignment.role === "主播"),
            }))
            .filter((row) => row.anchors.length > 0);
          return (
            <div
              key={dateKey}
              className="grid grid-cols-[76px_minmax(0,1fr)] border-b border-slate-100 last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onSelectDay(dayIndex)}
                className={cn(
                  "flex flex-col justify-center border-r border-slate-100 px-3 py-2 text-left transition-colors",
                  selected ? "bg-blue-50 text-blue-700" : "bg-slate-50/70 hover:bg-slate-100",
                )}
                aria-pressed={selected}
              >
                <span className="text-xs font-medium text-slate-700">{day.label}</span>
                <span className="mt-0.5 text-[10px] text-slate-400">
                  {formatMonthDay(day.date)}
                </span>
              </button>
              <div className="min-h-10 divide-y divide-slate-100">
                {shiftRows.length === 0 ? (
                  <div className="flex h-10 items-center px-3 text-xs text-slate-300">待排班</div>
                ) : (
                  shiftRows.map(({ shift, anchors }) => {
                    const anchorTime = anchors[0];
                    if (!anchorTime) return null;
                    const anchorNames = anchors.map(displayName).join(" / ");
                    const review = reviews[shift.id];
                    return (
                      <div key={shift.id} className="relative h-8 bg-slate-50/30">
                        {[25, 50, 75].map((left) => (
                          <span
                            key={left}
                            className="absolute inset-y-0 w-px bg-slate-100"
                            style={{ left: `${left}%` }}
                          />
                        ))}
                        {ganttSegments(anchorTime.startTime, anchorTime.endTime).map(
                          (segment, index) => (
                            <button
                              type="button"
                              key={index}
                              onClick={() => onReview(shift)}
                              onMouseEnter={(event) =>
                                showReviewTooltip(
                                  event.clientX,
                                  event.clientY,
                                  anchorNames,
                                  `${anchorTime.startTime}-${anchorTime.endTime}`,
                                  review ?? null,
                                )
                              }
                              onMouseMove={(event) =>
                                showReviewTooltip(
                                  event.clientX,
                                  event.clientY,
                                  anchorNames,
                                  `${anchorTime.startTime}-${anchorTime.endTime}`,
                                  review ?? null,
                                )
                              }
                              onMouseLeave={() => setHoveredReview(null)}
                              onFocus={(event) => {
                                const rect = event.currentTarget.getBoundingClientRect();
                                showReviewTooltip(
                                  rect.left + rect.width / 2,
                                  rect.bottom,
                                  anchorNames,
                                  `${anchorTime.startTime}-${anchorTime.endTime}`,
                                  review ?? null,
                                );
                              }}
                              onBlur={() => setHoveredReview(null)}
                              className="absolute inset-y-1 flex min-w-5 items-center overflow-hidden rounded bg-blue-600 px-1.5 text-left text-[10px] font-medium whitespace-nowrap text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                              style={{
                                left: `${((segment.start - GANTT_START) / GANTT_DURATION) * 100}%`,
                                width: `${(segment.duration / GANTT_DURATION) * 100}%`,
                              }}
                              aria-label={`${anchorNames} ${review ? "查看或编辑场次复盘" : "记录场次复盘"}`}
                            >
                              {anchorNames}
                              {review ? (
                                <span className="ml-1 size-1.5 shrink-0 rounded-full bg-white" />
                              ) : null}
                            </button>
                          ),
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
      {hoveredReview ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-[280px] rounded-md bg-slate-900 px-3 py-2.5 text-left text-xs text-white shadow-xl"
          style={{ left: hoveredReview.x, top: hoveredReview.y }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold">{hoveredReview.anchorNames}</span>
            <span className="shrink-0 font-mono text-[10px] text-slate-300">
              {hoveredReview.time}
            </span>
          </div>
          {hoveredReview.review ? (
            <div className="mt-2 space-y-1.5 text-slate-200">
              <p>
                <span className="text-slate-400">综合表现：</span>
                {hoveredReview.review.rating}
                {hoveredReview.review.performance ? ` · ${hoveredReview.review.performance}` : ""}
              </p>
              {hoveredReview.review.highlights ? (
                <p>
                  <span className="text-slate-400">亮点：</span>
                  {hoveredReview.review.highlights}
                </p>
              ) : null}
              {hoveredReview.review.issues ? (
                <p>
                  <span className="text-slate-400">复盘问题：</span>
                  {hoveredReview.review.issues}
                </p>
              ) : null}
              {hoveredReview.review.followUp ? (
                <p>
                  <span className="text-slate-400">后续动作：</span>
                  {hoveredReview.review.followUp}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-slate-300">暂无复盘记录，点击色块即可填写。</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function TimeFields({
  member,
  onChange,
}: {
  member: TimedMemberDraft;
  onChange: (patch: Partial<TimedMemberDraft>) => void;
}): React.JSX.Element {
  const className =
    "h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="grid gap-1 text-[10px] font-medium text-slate-500">
        开始时间
        <select
          aria-label={`${member.name || "人员"}开始时间`}
          value={member.startTime}
          onChange={(event) => {
            const startTime = event.target.value;
            onChange({
              startTime,
              endTime: endTimeForDuration(
                startTime,
                selectedDurationHours(member.startTime, member.endTime),
              ),
            });
          }}
          className={className}
        >
          {TIME_OPTIONS.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-[10px] font-medium text-slate-500">
        时长
        <select
          aria-label={`${member.name || "人员"}时长`}
          value={selectedDurationHours(member.startTime, member.endTime)}
          onChange={(event) =>
            onChange({
              endTime: endTimeForDuration(member.startTime, Number(event.target.value)),
            })
          }
          className={className}
        >
          {DURATION_OPTIONS.map((hours) => (
            <option key={hours} value={hours}>
              {hours} 小时
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ShiftEditor({
  open,
  date,
  draft,
  error,
  onOpenChange,
  onDraftChange,
  onSave,
  staff,
}: {
  open: boolean;
  date: string;
  draft: ShiftDraft;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onDraftChange: (draft: ShiftDraft) => void;
  onSave: () => void;
  staff: typeof OFFICIAL_STAFF;
}): React.JSX.Element {
  const selectClass =
    "h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  const anchors = staff.filter((person) => person.role === "主播");

  const toggleAnchor = (name: string) => {
    const selected = draft.anchors.some((anchor) => anchor.name === name);
    const sharedTime = draft.anchors[0] ?? { startTime: "09:00", endTime: "12:00" };
    onDraftChange({
      ...draft,
      anchors: selected
        ? draft.anchors.filter((anchor) => anchor.name !== name)
        : [
            ...draft.anchors,
            { name, startTime: sharedTime.startTime, endTime: sharedTime.endTime },
          ],
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft.id ? "编辑班次" : "新增班次"}</DialogTitle>
          <DialogDescription>{date} · 主播、场控、运营分别设置在岗时段</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            班次名称
            <Input
              value={draft.name}
              onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              placeholder="例如：上午班"
            />
          </label>

          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold text-slate-700">主播（可多选）</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {anchors.map((person) => {
                const checked = draft.anchors.some((anchor) => anchor.name === person.name);
                return (
                  <label
                    key={person.name}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs",
                      checked
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAnchor(person.name)}
                      className="size-3.5 accent-blue-600"
                    />
                    <span className="font-medium">{person.alias ?? person.name}</span>
                    <span className="text-slate-400">{person.name}</span>
                    {person.stage === "培训中" ? (
                      <span className="ml-auto text-amber-600">培训中</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
            {draft.anchors.length > 0 ? (
              <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
                <span className="text-xs font-medium text-slate-700">
                  主播时段（{draft.anchors.length} 人共用）
                </span>
                <TimeFields
                  member={{
                    name: "主播",
                    startTime: draft.anchors[0]?.startTime ?? "09:00",
                    endTime: draft.anchors[0]?.endTime ?? "12:00",
                  }}
                  onChange={(patch) =>
                    onDraftChange({
                      ...draft,
                      anchors: draft.anchors.map((anchor) => ({ ...anchor, ...patch })),
                    })
                  }
                />
              </div>
            ) : null}
          </fieldset>

          {(["controller", "operator"] as const).map((key) => {
            const role: OfficialShiftRole = key === "controller" ? "场控" : "运营";
            const member = draft[key];
            return (
              <div
                key={key}
                className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[60px_minmax(140px,1fr)_minmax(190px,1fr)] sm:items-center"
              >
                <span className="text-xs font-semibold text-slate-700">{role}</span>
                <select
                  aria-label={role}
                  value={member.name}
                  onChange={(event) =>
                    onDraftChange({ ...draft, [key]: { ...member, name: event.target.value } })
                  }
                  className={selectClass}
                >
                  <option value="">请选择</option>
                  {staff
                    .filter((person) =>
                      role === "运营" ? person.role.startsWith("运营") : person.role === role,
                    )
                    .map((person) => (
                      <option key={person.name} value={person.name}>
                        {person.name}
                      </option>
                    ))}
                </select>
                <TimeFields
                  member={member}
                  onChange={(patch) => onDraftChange({ ...draft, [key]: { ...member, ...patch } })}
                />
              </div>
            );
          })}

          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            当班重点
            <Input
              value={draft.note}
              onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
              placeholder="可填写脚本、活动或交接事项"
            />
          </label>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={onSave}>
            保存班次
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftReviewDialog({
  shift,
  initialReview,
  onOpenChange,
  onSave,
}: {
  shift: OfficialRotationShift | null;
  initialReview: ShiftReview | null;
  onOpenChange: (open: boolean) => void;
  onSave: (review: ShiftReview) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ShiftReview>({
    rating: "稳定",
    performance: "",
    highlights: "",
    issues: "",
    followUp: "",
    updatedAt: "",
  });

  useEffect(() => {
    if (!shift) return;
    setDraft(
      initialReview ?? {
        rating: "稳定",
        performance: "",
        highlights: "",
        issues: "",
        followUp: "",
        updatedAt: "",
      },
    );
  }, [initialReview, shift]);

  const fields: {
    key: "performance" | "highlights" | "issues" | "followUp";
    label: string;
    placeholder: string;
  }[] = [
    { key: "performance", label: "本场表现", placeholder: "记录状态、配合、内容完成度和观众反馈" },
    { key: "highlights", label: "表现亮点", placeholder: "记录值得保留或放大的动作、话术和互动" },
    { key: "issues", label: "复盘问题", placeholder: "记录游戏理解、节奏、镜头或配合问题" },
    { key: "followUp", label: "后续动作", placeholder: "明确负责人、训练事项和下次检查点" },
  ];

  return (
    <Dialog open={shift !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>场次表现与复盘</DialogTitle>
          <DialogDescription>
            {shift ? `${shift.date} · ${shift.name}` : "记录本场直播表现"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-medium text-slate-600">
            综合表现
            <select
              value={draft.rating}
              onChange={(event) =>
                setDraft((current) => ({ ...current, rating: event.target.value }))
              }
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {["优秀", "稳定", "一般", "需重点跟进"].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {fields.map((field) => (
            <label key={field.key} className="grid gap-1.5 text-xs font-medium text-slate-600">
              {field.label}
              <Textarea
                value={draft[field.key]}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                }
                placeholder={field.placeholder}
                className="min-h-20 resize-y"
              />
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}
          >
            保存复盘
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function blankDraft(name: string): ShiftDraft {
  return {
    id: null,
    name,
    anchors: [],
    controller: { ...EMPTY_MEMBER, startTime: "09:00", endTime: "13:00" },
    operator: { ...EMPTY_MEMBER, startTime: "09:00", endTime: "13:00" },
    note: "",
  };
}

function validMemberTime(member: TimedMemberDraft): boolean {
  return Boolean(member.startTime && member.endTime && member.startTime !== member.endTime);
}

function makeAssignment(
  member: TimedMemberDraft,
  role: OfficialShiftRole,
  staff: typeof OFFICIAL_STAFF,
) {
  const person = staff.find((item) => item.name === member.name);
  if (!person) return null;
  return {
    name: person.name,
    role,
    responsibility: person.responsibility,
    startTime: member.startTime,
    endTime: member.endTime,
  } satisfies OfficialShiftAssignment;
}

export function OfficialRotationSchedule(): React.JSX.Element {
  const today = useMemo(() => new Date(), []);
  const {
    value: shifts,
    update: updateShifts,
    saving: shiftsSaving,
    error: shiftsError,
  } = useProjectSharedState<OfficialRotationShift[]>({
    projectKey: "zhaohua",
    stateKey: "official_shifts",
    initialValue: OFFICIAL_ROTATION_SHIFTS,
    localStorageKey: STORAGE_KEY,
  });
  const { value: staff } = useProjectSharedState<typeof OFFICIAL_STAFF>({
    projectKey: "zhaohua",
    stateKey: "official_staff",
    initialValue: OFFICIAL_STAFF,
    localStorageKey: "zhaohua-official-staff-v1",
  });
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => (today.getDay() || 7) - 1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [shiftToDelete, setShiftToDelete] = useState<OfficialRotationShift | null>(null);
  const [reviewShift, setReviewShift] = useState<OfficialRotationShift | null>(null);
  const {
    value: reviews,
    update: updateReviews,
    saving: reviewsSaving,
    error: reviewsError,
  } = useProjectSharedState<Record<string, ShiftReview>>({
    projectKey: "zhaohua",
    stateKey: "shift_reviews",
    initialValue: {},
    localStorageKey: REVIEW_KEY,
  });
  const [draft, setDraft] = useState<ShiftDraft>(() => blankDraft("班次 1"));

  const weekStart = addDays(startOfWeek(today), weekOffset * 7);
  const days = WEEKDAYS.map((label, index) => ({ label, date: addDays(weekStart, index) }));
  const selectedDate = days[selectedDay]?.date ?? weekStart;
  const selectedDateKey = toDateKey(selectedDate);
  const selectedShifts = shifts.filter((shift) => shift.date === selectedDateKey);

  const openNewShift = () => {
    setDraft(blankDraft(`班次 ${selectedShifts.length + 1}`));
    setEditorError(null);
    setEditorOpen(true);
  };

  const openExistingShift = (shift: OfficialRotationShift) => {
    const storedAnchors = shift.assignments
      .filter((assignment) => assignment.role === "主播")
      .map(({ name, startTime, endTime }) => normalizeDraftTime({ name, startTime, endTime }));
    const sharedAnchorTime = storedAnchors[0];
    const anchors = storedAnchors.map((anchor) => ({
      ...anchor,
      startTime: sharedAnchorTime?.startTime ?? anchor.startTime,
      endTime: sharedAnchorTime?.endTime ?? anchor.endTime,
    }));
    const controller = shift.assignments.find((assignment) => assignment.role === "场控");
    const operator = shift.assignments.find((assignment) => assignment.role === "运营");
    setDraft({
      id: shift.id,
      name: shift.name,
      anchors,
      controller: controller
        ? normalizeDraftTime({
            name: controller.name,
            startTime: controller.startTime,
            endTime: controller.endTime,
          })
        : { ...EMPTY_MEMBER },
      operator: operator
        ? normalizeDraftTime({
            name: operator.name,
            startTime: operator.startTime,
            endTime: operator.endTime,
          })
        : { ...EMPTY_MEMBER },
      note: shift.note ?? "",
    });
    setEditorError(null);
    setEditorOpen(true);
  };

  const saveShift = () => {
    if (!draft.name.trim()) {
      setEditorError("请填写班次名称");
      return;
    }
    if (draft.anchors.length === 0) {
      setEditorError("请至少选择 1 名主播");
      return;
    }
    if (!draft.controller.name || !draft.operator.name) {
      setEditorError("每个班次必须安排场控和运营");
      return;
    }
    const allMembers = [...draft.anchors, draft.controller, draft.operator];
    if (!allMembers.every(validMemberTime)) {
      setEditorError("请为每个人设置有效的开始时间和时长");
      return;
    }
    const assignments = [
      ...draft.anchors.map((anchor) => makeAssignment(anchor, "主播", staff)),
      makeAssignment(draft.controller, "场控", staff),
      makeAssignment(draft.operator, "运营", staff),
    ].filter((assignment): assignment is OfficialShiftAssignment => assignment !== null);
    const nextShift: OfficialRotationShift = {
      id: draft.id ?? `${selectedDateKey}-${Date.now()}`,
      date: selectedDateKey,
      name: draft.name.trim(),
      assignments,
      note: draft.note.trim() || undefined,
      status: "已排班",
    };
    void updateShifts((current) => {
      const withoutExisting = current.filter((shift) => shift.id !== nextShift.id);
      return [...withoutExisting, nextShift].sort((a, b) => a.date.localeCompare(b.date));
    });
    setEditorOpen(false);
  };

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold text-slate-900">
            <CalendarDays className="size-4 text-slate-400" />
            排班
          </h3>
          <span className="text-xs text-slate-400">
            {toDateKey(days[0]?.date ?? weekStart)} 至 {toDateKey(days[6]?.date ?? weekStart)}
          </span>
          <span
            className={cn(
              "text-xs",
              shiftsError || reviewsError ? "text-red-600" : "text-emerald-600",
            )}
          >
            {shiftsError || reviewsError || (shiftsSaving || reviewsSaving ? "同步中" : "已同步")}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Button type="button" size="sm" onClick={openNewShift} className="mr-1">
            <Plus />
            新增班次
          </Button>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="上一周"
            aria-label="上一周"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setWeekOffset(0);
              setSelectedDay((today.getDay() || 7) - 1);
            }}
            className="h-8 rounded-md border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            本周
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
            className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="下一周"
            aria-label="下一周"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div>
          <div className="overflow-x-auto pb-1">
            <WeeklyGantt
              days={days}
              shifts={shifts}
              selectedDateKey={selectedDateKey}
              onSelectDay={setSelectedDay}
              reviews={reviews}
              onReview={setReviewShift}
            />
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">
            {days[selectedDay]?.label} · {formatMonthDay(selectedDate)}
          </h4>
          {selectedShifts.length === 0 ? (
            <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 text-center">
              <p className="text-sm font-medium text-slate-700">当天还没有班次</p>
              <Button type="button" size="sm" onClick={openNewShift} className="mt-3">
                <Plus />
                新增班次
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedShifts.map((shift) => (
                <article key={shift.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h5 className="font-medium text-slate-900">{shift.name}</h5>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {shift.assignments.length} 个人员时段
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
                        {shift.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => openExistingShift(shift)}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="编辑班次"
                        aria-label={`编辑 ${shift.name}`}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShiftToDelete(shift)}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="删除班次"
                        aria-label={`删除 ${shift.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
                    {shift.assignments.map((assignment) => (
                      <div
                        key={`${assignment.role}-${assignment.name}`}
                        className="grid gap-1 py-2 text-sm sm:grid-cols-[64px_100px_110px_minmax(0,1fr)] sm:items-center"
                      >
                        <span
                          className={cn(
                            "w-fit rounded px-1.5 py-0.5 text-xs font-medium",
                            roleBadgeTone(assignment.role),
                          )}
                        >
                          {assignment.role}
                        </span>
                        <span className="font-medium text-slate-800">
                          {displayName(assignment)}
                        </span>
                        <span className="font-mono text-xs text-slate-600">
                          {assignment.startTime}-{assignment.endTime}
                        </span>
                        <span className="text-xs text-slate-500">{assignment.responsibility}</span>
                      </div>
                    ))}
                  </div>
                  {shift.note ? (
                    <p className="mt-2 rounded bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                      当班重点：{shift.note}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <ShiftEditor
        open={editorOpen}
        date={selectedDateKey}
        draft={draft}
        error={editorError}
        onOpenChange={setEditorOpen}
        onDraftChange={(nextDraft) => {
          setDraft(nextDraft);
          setEditorError(null);
        }}
        onSave={saveShift}
        staff={staff}
      />
      <ConfirmDialog
        open={shiftToDelete !== null}
        title="删除这个班次？"
        description={
          shiftToDelete ? `「${shiftToDelete.name}」及其人员安排将从共享排班中移除。` : undefined
        }
        confirmText="确认删除"
        variant="danger"
        onOpenChange={(open) => {
          if (!open) setShiftToDelete(null);
        }}
        onConfirm={() => {
          if (!shiftToDelete) return;
          void updateShifts((current) => current.filter((item) => item.id !== shiftToDelete.id));
          void updateReviews((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([shiftId]) => shiftId !== shiftToDelete.id),
            ),
          );
          setShiftToDelete(null);
        }}
      />
      <ShiftReviewDialog
        shift={reviewShift}
        initialReview={reviewShift ? (reviews[reviewShift.id] ?? null) : null}
        onOpenChange={(open) => {
          if (!open) setReviewShift(null);
        }}
        onSave={(review) => {
          if (!reviewShift) return;
          void updateReviews((current) => ({ ...current, [reviewShift.id]: review }));
          setReviewShift(null);
        }}
      />
    </section>
  );
}
