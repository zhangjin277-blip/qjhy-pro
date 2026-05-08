"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pinyin } from "pinyin";
import { cn } from "@/lib/utils/cn";
import {
  appendTodayOverrideSlot,
  replaceTodaySegment,
  saveTodayOverride,
  clearOneOverride,
  copyYesterdayOverrides,
  clearAllTodayOverrides,
  replaceAccountDateOverrides,
} from "../actions";

interface Segment {
  user_id: string;
  user_name: string | null;
  start: number;
  end: number;
  source: "default" | "override";
  is_rest: boolean;
  override_id?: string;
  reason?: string | null;
}

interface AccountSchedule {
  account_id: string;
  account_name: string;
  platform: string;
  product: string;
  placement_label: string | null;
  segments: Segment[];
}

interface Candidate {
  user_id: string;
  name: string | null;
  title: string | null;
}

interface Props {
  date: string;
  accounts: AccountSchedule[];
  candidates: Candidate[];
}

interface ClipboardItem {
  user_id: string;
  user_name: string | null;
  duration: number; // end - start (hours)
  reason: string | null;
}

interface HoverTarget {
  account_id: string;
  segIdx: number | null;
  segment: Segment | null;
  defaultSlot: { start: number; end: number };
  canPaste: boolean;
}

// 撤销/恢复用的 snapshot：某 (account, date) 的 override 状态
interface OverrideSnapshot {
  account_id: string;
  date: string;
  // 该账号当前的 override（每条记录的 user/slots/reason）
  overrides: { dingtalk_user_id: string; time_slots: [string, string][]; reason: string | null }[];
}

function colorFor(name: string | null): string {
  if (!name) return "rgba(148, 163, 184, 0.3)";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsla(${hue}, 50%, 80%, 0.7)`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function shiftDay(date: string, delta: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDate(d);
}

const HOURS_FULL = 28; // 0..27（跨夜到凌晨 03:00）

function hourSlot(start: number, end: number): [string, string] {
  return [`${start.toString().padStart(2, "0")}:00`, `${end.toString().padStart(2, "0")}:00`];
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

function slotOverlapsSegments(segments: Segment[], start: number, end: number) {
  return segments.some((seg) => rangesOverlap(start, end, seg.start, seg.end));
}

function compactSearchText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, "");
}

function candidateSearchText(candidate: Candidate) {
  const name = candidate.name ?? "";
  const fullPinyin = pinyin(name, { style: pinyin.STYLE_NORMAL, heteronym: false })
    .map((arr) => arr[0] ?? "")
    .join("");
  const initials = pinyin(name, { style: pinyin.STYLE_FIRST_LETTER, heteronym: false })
    .map((arr) => arr[0] ?? "")
    .join("");
  return [
    compactSearchText(name),
    compactSearchText(candidate.title),
    compactSearchText(fullPinyin),
    compactSearchText(initials),
  ].join(" ");
}

// 把 segments 转换为 OverrideSnapshot（仅 override 部分，default 不存）
function snapshotOf(account: AccountSchedule): OverrideSnapshot {
  const byUser = new Map<string, { time_slots: [string, string][]; reason: string | null }>();
  for (const seg of account.segments) {
    if (seg.source !== "override") continue;
    const key = seg.user_id;
    const existing = byUser.get(key);
    const slot: [string, string] = [
      `${seg.start.toString().padStart(2, "0")}:00`,
      `${seg.end.toString().padStart(2, "0")}:00`,
    ];
    if (seg.is_rest) {
      // 休息：slots=[]（仅一次）
      byUser.set(key, { time_slots: [], reason: seg.reason ?? null });
    } else if (!existing) {
      byUser.set(key, { time_slots: [slot], reason: seg.reason ?? null });
    } else if (existing.time_slots.length > 0) {
      existing.time_slots.push(slot);
    }
  }
  return {
    account_id: account.account_id,
    date: "",
    overrides: [...byUser.entries()].map(([user_id, v]) => ({
      dingtalk_user_id: user_id,
      time_slots: v.time_slots,
      reason: v.reason,
    })),
  };
}

export function TodayGantt({ date, accounts, candidates }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [popover, setPopover] = useState<{
    account_id: string;
    seg: Segment | null; // null = create 模式
    defaultSlot: { start: number; end: number };
    anchor: HTMLElement;
  } | null>(null);

  const [selected, setSelected] = useState<{ account_id: string; segIdx: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(null);

  // 撤销/恢复 stacks
  const historyRef = useRef<OverrideSnapshot[]>([]);
  const redoRef = useRef<OverrideSnapshot[]>([]);
  const [, forceRerender] = useState(0);
  const bumpHistory = () => forceRerender((n) => n + 1);

  // 拖拽状态（拉边缘改时长）
  const [resize, setResize] = useState<{
    account_id: string;
    segIdx: number;
    edge: "left" | "right";
    seg: Segment;
    pxPerHour: number;
    rowLeft: number;
    currentStart: number;
    currentEnd: number;
  } | null>(null);
  const [optimisticResize, setOptimisticResize] = useState<{
    account_id: string;
    segIdx: number;
    currentStart: number;
    currentEnd: number;
  } | null>(null);

  // 刚刚 resize 过：用于拦截 mouseup 后的 click 事件，避免误开 popover
  const justResizedRef = useRef(false);

  // 持续同步 resize state 到 ref，避免 useEffect 闭包陷阱
  const resizeStateRef = useRef(resize);
  resizeStateRef.current = resize;

  useEffect(() => {
    setOptimisticResize(null);
  }, [accounts]);

  /** 在保存某 account 之前压栈 snapshot（对当前页面状态） */
  function pushHistory(account_id: string) {
    const acc = accounts.find((a) => a.account_id === account_id);
    if (!acc) return;
    historyRef.current.push({ ...snapshotOf(acc), date });
    if (historyRef.current.length > 50) historyRef.current.shift();
    redoRef.current = []; // 新操作清空 redo
    bumpHistory();
  }

  async function applySnapshot(snap: OverrideSnapshot) {
    await replaceAccountDateOverrides({
      account_id: snap.account_id,
      date: snap.date || date,
      overrides: snap.overrides,
    });
    router.refresh();
  }

  async function handleUndo() {
    const snap = historyRef.current.pop();
    if (!snap) return;
    bumpHistory();
    // 把当前状态压入 redo
    const acc = accounts.find((a) => a.account_id === snap.account_id);
    if (acc) redoRef.current.push({ ...snapshotOf(acc), date });
    await applySnapshot(snap);
  }

  async function handleRedo() {
    const snap = redoRef.current.pop();
    if (!snap) return;
    bumpHistory();
    const acc = accounts.find((a) => a.account_id === snap.account_id);
    if (acc) historyRef.current.push({ ...snapshotOf(acc), date });
    await applySnapshot(snap);
  }

  async function handlePaste() {
    // 从 ref 拿最新值，避免 closure 陷阱
    const clip = clipboardRef.current;
    const target = hoverTargetRef.current;
    if (!clip || !target || target.segment !== null || !target.canPaste) return;

    const pasteTarget = {
      account_id: target.account_id,
      slot: hourSlot(target.defaultSlot.start, target.defaultSlot.end),
    };
    const acc = accountsRef.current.find((a) => a.account_id === pasteTarget.account_id);
    if (!acc) {
      console.warn("[paste] account not found", pasteTarget.account_id);
      return;
    }
    pushHistory(acc.account_id);
    start(async () => {
      try {
        await appendTodayOverrideSlot({
          account_id: acc.account_id,
          date,
          dingtalk_user_id: clip.user_id,
          time_slots: [pasteTarget.slot],
          reason: clip.reason,
        });
        router.refresh();
        setPopover(null);
      } catch (err) {
        console.error("[paste] save failed", err);
        alert("粘贴失败：" + String(err));
      }
    });
  }

  // 全局快捷键：Ctrl+Z / Ctrl+Y / Ctrl+C / Ctrl+V
  // 用 ref 持续同步最新 closure，避免 useEffect 反复挂载丢事件
  const selectedRef = useRef(selected);
  const clipboardRef = useRef(clipboard);
  const accountsRef = useRef(accounts);
  const hoverTargetRef = useRef(hoverTarget);
  const popoverRef = useRef(popover);
  selectedRef.current = selected;
  clipboardRef.current = clipboard;
  accountsRef.current = accounts;
  hoverTargetRef.current = hoverTarget;
  popoverRef.current = popover;

  const handleUndoRef = useRef(handleUndo);
  const handleRedoRef = useRef(handleRedo);
  const handlePasteRef = useRef(handlePaste);
  handleUndoRef.current = handleUndo;
  handleRedoRef.current = handleRedo;
  handlePasteRef.current = handlePaste;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.matches("input, textarea, [contenteditable]")) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const sel = selectedRef.current;
      const clip = clipboardRef.current;
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) handleRedoRef.current();
        else handleUndoRef.current();
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRedoRef.current();
      } else if (e.key === "c" || e.key === "C") {
        const hovered = hoverTargetRef.current;
        const copySource = hovered?.segment
          ? { segment: hovered.segment }
          : sel
            ? {
                segment: accountsRef.current.find((a) => a.account_id === sel.account_id)?.segments[
                  sel.segIdx
                ],
              }
            : null;
        const seg = copySource?.segment;
        if (!seg) return;
        e.preventDefault();
        setClipboard({
          user_id: seg.user_id,
          user_name: seg.user_name,
          duration: seg.end - seg.start,
          reason: seg.reason ?? null,
        });
      } else if (e.key === "v" || e.key === "V") {
        const target = hoverTargetRef.current;
        if (!clip || !target || target.segment !== null || !target.canPaste) return;
        e.preventDefault();
        handlePasteRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // 关闭 popover
  useEffect(() => {
    if (!popover) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-popover-content]")) return;
      if (target.closest("[data-segment]")) return;
      if (target.closest("[data-empty-cell]")) return;
      setPopover(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [popover]);

  // resize 拖动监听 — 用 ref 拿最新 state 避免闭包陷阱
  useEffect(() => {
    if (!resize) return;
    function onMove(e: MouseEvent) {
      setResize((r) => {
        if (!r) return r;
        const x = e.clientX - r.rowLeft;
        const hour = Math.max(0, Math.min(HOURS_FULL, Math.round(x / r.pxPerHour)));
        if (r.edge === "left") {
          return { ...r, currentStart: Math.min(hour, r.currentEnd - 1) };
        }
        return { ...r, currentEnd: Math.max(hour, r.currentStart + 1) };
      });
    }
    function onUp() {
      // 拿最新 resize state（含最终 currentStart/End）
      const r = resizeStateRef.current;
      setResize(null);
      if (!r) return;
      // 标记刚拖完（拦截后续 click 250ms）
      justResizedRef.current = true;
      setTimeout(() => {
        justResizedRef.current = false;
      }, 250);
      // 仅当时段实际改变时保存
      if (r.currentStart === r.seg.start && r.currentEnd === r.seg.end) return;
      setOptimisticResize({
        account_id: r.account_id,
        segIdx: r.segIdx,
        currentStart: r.currentStart,
        currentEnd: r.currentEnd,
      });
      pushHistory(r.account_id);
      start(async () => {
        try {
          await saveTodayOverride({
            account_id: r.account_id,
            date,
            dingtalk_user_id: r.seg.user_id,
            time_slots: [
              [
                `${r.currentStart.toString().padStart(2, "0")}:00`,
                `${r.currentEnd.toString().padStart(2, "0")}:00`,
              ],
            ],
            reason: r.seg.reason ?? null,
          });
          router.refresh();
        } catch (err) {
          setOptimisticResize(null);
          console.error("[resize] save failed", err);
          alert("保存时段失败：" + String(err));
        }
      });
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resize?.segIdx, resize?.account_id, resize?.edge]);

  function changeDate(d: string) {
    const usp = new URLSearchParams();
    usp.set("date", d);
    router.push(`/live-accounts/schedule-today?${usp.toString()}`);
  }

  async function handleCopyYesterday() {
    if (!confirm("复制昨日所有调班到今天？已有的同账号同主播 override 会被覆盖。")) return;
    start(async () => {
      const res = await copyYesterdayOverrides(date);
      router.refresh();
      alert(`已复制 ${res.copied} 条`);
    });
  }

  async function handleClearAll() {
    if (!confirm(`清空 ${date} 所有调班记录？所有账号恢复成默认排班。`)) return;
    start(async () => {
      const res = await clearAllTodayOverrides(date);
      router.refresh();
      alert(`已清空 ${res.cleared} 条`);
    });
  }

  // 行容器空白点击 → 新增
  function onRowEmptyClick(
    e: React.MouseEvent<HTMLDivElement>,
    account_id: string,
    rowEl: HTMLDivElement,
  ) {
    if (resize || justResizedRef.current) return; // 拖完抑制 click
    if ((e.target as HTMLElement).closest("[data-segment]")) return;
    const rect = rowEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pxPerHour = rect.width / HOURS_FULL;
    const hour = Math.max(0, Math.min(HOURS_FULL - 1, Math.floor(x / pxPerHour)));
    const start = hour;
    const duration = Math.max(1, Math.min(HOURS_FULL, clipboard?.duration ?? 3));
    const end = Math.min(start + duration, HOURS_FULL);
    setSelected(null);
    setPopover({
      account_id,
      seg: null,
      defaultSlot: { start, end },
      anchor: e.currentTarget,
    });
  }

  function setHoverTargetIfChanged(next: HoverTarget | null) {
    setHoverTarget((current) => {
      if (
        current?.account_id === next?.account_id &&
        current?.segIdx === next?.segIdx &&
        current?.defaultSlot.start === next?.defaultSlot.start &&
        current?.defaultSlot.end === next?.defaultSlot.end &&
        current?.canPaste === next?.canPaste
      ) {
        return current;
      }
      return next;
    });
  }

  function onRowEmptyHover(
    e: React.MouseEvent<HTMLDivElement>,
    account_id: string,
    rowEl: HTMLDivElement,
  ) {
    if (resize || justResizedRef.current) return;
    if ((e.target as HTMLElement).closest("[data-segment]")) return;
    const acc = accounts.find((a) => a.account_id === account_id);
    if (!acc) return;
    const rect = rowEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pxPerHour = rect.width / HOURS_FULL;
    const duration = Math.max(1, Math.min(HOURS_FULL, clipboard?.duration ?? 3));
    const start = Math.max(0, Math.min(HOURS_FULL - 1, Math.floor(x / pxPerHour)));
    const desiredEnd = start + duration;
    const end = Math.min(desiredEnd, HOURS_FULL);
    const canPaste = desiredEnd <= HOURS_FULL && !slotOverlapsSegments(acc.segments, start, end);
    setHoverTargetIfChanged({
      account_id,
      segIdx: null,
      segment: null,
      defaultSlot: { start, end },
      canPaste,
    });
  }

  return (
    <div className="space-y-3">
      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && changeDate(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm shrink-0"
        />
        <button
          type="button"
          onClick={() => changeDate(shiftDay(date, -1))}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted shrink-0"
        >
          ← 前一日
        </button>
        <button
          type="button"
          onClick={() => changeDate(isoDate(new Date()))}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted shrink-0"
        >
          今日
        </button>
        <button
          type="button"
          onClick={() => changeDate(shiftDay(date, 1))}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted shrink-0"
        >
          后一日 →
        </button>
        <span className="ml-2 text-xs text-muted-foreground shrink-0">
          {accounts.length} 账号 ·{" "}
          {accounts.reduce(
            (s, a) => s + a.segments.filter((g) => g.source === "override").length,
            0,
          )}{" "}
          调班 · {accounts.reduce((s, a) => s + a.segments.filter((g) => g.is_rest).length, 0)} 休息
        </span>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={pending || historyRef.current.length === 0}
            title="撤销 (Ctrl+Z)"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-30"
          >
            ↶ 撤销
          </button>
          <button
            type="button"
            onClick={() => void handleRedo()}
            disabled={pending || redoRef.current.length === 0}
            title="恢复 (Ctrl+Y)"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-30"
          >
            ↷ 恢复
          </button>
          <span className="mx-1 text-border">|</span>
          <button
            type="button"
            onClick={handleCopyYesterday}
            disabled={pending}
            className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
          >
            复制昨日
          </button>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={pending}
            className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted hover:text-change-up disabled:opacity-50"
          >
            清空今日
          </button>
        </div>
      </div>

      {/* 图例 + 剪贴板状态 */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-4 rounded"
            style={{ background: "hsla(220, 50%, 80%, 0.7)" }}
          />
          排班
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded border-2 border-change-up bg-change-up/10" />
          休息
        </span>
        <span className="text-muted-foreground/70">
          悬浮色块 ⌘/Ctrl+C 复制 · 悬浮空白位置 ⌘/Ctrl+V 粘贴为新时段 · 不覆盖已有排班 ·
          点击色块编辑 · ⌘/Ctrl+Z 撤销
        </span>
        {clipboard && (
          <span className="ml-auto rounded bg-amber-50 px-2 py-0.5 text-amber-700">
            📋 已复制：{clipboard.user_name} · {clipboard.duration}h · 悬浮空白位置按 ⌘/Ctrl+V 粘贴
          </span>
        )}
      </div>

      {/* 甘特图 */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <div className="min-w-[1100px]">
          {/* 时间轴 header */}
          <div className="sticky top-0 z-10 flex border-b border-border bg-muted/40">
            <div className="w-[200px] shrink-0 border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
              账号
            </div>
            <div
              className="flex-1 grid"
              style={{ gridTemplateColumns: `repeat(${HOURS_FULL}, minmax(32px, 1fr))` }}
            >
              {Array.from({ length: HOURS_FULL }).map((_, h) => {
                const display = h >= 24 ? h - 24 : h;
                const cross = h >= 24;
                return (
                  <div
                    key={h}
                    className={cn(
                      "border-r border-border/50 py-2 text-center text-[10px] font-mono",
                      cross ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {display.toString().padStart(2, "0")}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 行 */}
          {accounts.map((acc) => (
            <Row
              key={acc.account_id}
              account={acc}
              date={date}
              resize={resize ?? optimisticResize}
              selected={selected}
              hoverTarget={hoverTarget}
              onSegHover={(seg, segIdx) =>
                setHoverTargetIfChanged({
                  account_id: acc.account_id,
                  segIdx,
                  segment: seg,
                  defaultSlot: { start: seg.start, end: seg.end },
                  canPaste: false,
                })
              }
              onSegClick={(seg, segIdx, anchor) => {
                if (justResizedRef.current) return; // 拖完抑制 click
                setSelected({ account_id: acc.account_id, segIdx });
                setPopover({
                  account_id: acc.account_id,
                  seg,
                  defaultSlot: { start: seg.start, end: seg.end },
                  anchor,
                });
              }}
              onResizeStart={(seg, segIdx, edge, rowEl) => {
                const rect = rowEl.getBoundingClientRect();
                const pxPerHour = rect.width / HOURS_FULL;
                setResize({
                  account_id: acc.account_id,
                  segIdx,
                  edge,
                  seg,
                  pxPerHour,
                  rowLeft: rect.left,
                  currentStart: seg.start,
                  currentEnd: seg.end,
                });
              }}
              onEmptyClick={onRowEmptyClick}
              onEmptyHover={onRowEmptyHover}
              onRowLeave={() => setHoverTargetIfChanged(null)}
            />
          ))}

          {accounts.length === 0 && (
            <div className="px-3 py-12 text-center text-sm text-muted-foreground">暂无直播账号</div>
          )}
        </div>
      </div>

      {/* Popover */}
      {popover && (
        <SegmentPopover
          date={date}
          account_id={popover.account_id}
          segment={popover.seg}
          defaultSlot={popover.defaultSlot}
          candidates={candidates}
          anchor={popover.anchor}
          clipboard={clipboard}
          onCopy={(item) => setClipboard(item)}
          onClose={() => setPopover(null)}
          onBeforeMutate={() => pushHistory(popover.account_id)}
          canPasteSlot={(start, end) => {
            const acc = accounts.find((item) => item.account_id === popover.account_id);
            return !!acc && !slotOverlapsSegments(acc.segments, start, end);
          }}
        />
      )}
    </div>
  );
}

/** 单行渲染（账号 + segments + handles） */
function Row({
  account,
  date: _date,
  resize,
  selected,
  hoverTarget,
  onSegHover,
  onSegClick,
  onResizeStart,
  onEmptyClick,
  onEmptyHover,
  onRowLeave,
}: {
  account: AccountSchedule;
  date: string;
  resize: {
    account_id: string;
    segIdx: number;
    currentStart: number;
    currentEnd: number;
  } | null;
  selected: { account_id: string; segIdx: number } | null;
  hoverTarget: HoverTarget | null;
  onSegHover: (seg: Segment, segIdx: number) => void;
  onSegClick: (seg: Segment, segIdx: number, anchor: HTMLElement) => void;
  onResizeStart: (
    seg: Segment,
    segIdx: number,
    edge: "left" | "right",
    rowEl: HTMLDivElement,
  ) => void;
  onEmptyClick: (
    e: React.MouseEvent<HTMLDivElement>,
    account_id: string,
    rowEl: HTMLDivElement,
  ) => void;
  onEmptyHover: (
    e: React.MouseEvent<HTMLDivElement>,
    account_id: string,
    rowEl: HTMLDivElement,
  ) => void;
  onRowLeave: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const hoverEmpty =
    hoverTarget?.account_id === account.account_id && hoverTarget.segment === null
      ? hoverTarget.defaultSlot
      : null;

  return (
    <div className="flex border-b border-border/50 hover:bg-muted/20" onMouseLeave={onRowLeave}>
      <div className="w-[200px] shrink-0 border-r border-border px-3 py-2 text-xs">
        <div className="truncate font-medium text-foreground">{account.account_name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span
            className={cn(
              "rounded px-1 py-px text-[9px] font-medium",
              account.platform === "抖音"
                ? "bg-[#fff1f0] text-[#cf1322]"
                : "bg-[#fffbe6] text-[#d48806]",
            )}
          >
            {account.platform}
          </span>
          <span>{account.product}</span>
        </div>
      </div>
      <div
        ref={rowRef}
        data-empty-cell
        onClick={(e) => rowRef.current && onEmptyClick(e, account.account_id, rowRef.current)}
        onMouseMove={(e) => rowRef.current && onEmptyHover(e, account.account_id, rowRef.current)}
        className="relative flex-1 grid h-[44px] cursor-pointer"
        style={{ gridTemplateColumns: `repeat(${HOURS_FULL}, minmax(32px, 1fr))` }}
      >
        {/* 网格线 */}
        {Array.from({ length: HOURS_FULL }).map((_, h) => (
          <div key={h} className="border-r border-border/30" />
        ))}
        {hoverEmpty && (
          <div
            className={cn(
              "pointer-events-none absolute top-1 bottom-1 z-[1] rounded border border-dashed",
              hoverTarget?.canPaste
                ? "border-primary/70 bg-primary/5"
                : "border-change-up/70 bg-change-up/5",
            )}
            style={{
              left: `${(hoverEmpty.start / HOURS_FULL) * 100}%`,
              width: `${((hoverEmpty.end - hoverEmpty.start) / HOURS_FULL) * 100}%`,
            }}
          />
        )}
        {/* segments */}
        {account.segments.map((seg, i) => {
          // resize 进行中：用 currentStart/End 显示临时位置
          let renderStart = seg.start;
          let renderEnd = seg.end;
          if (resize && resize.account_id === account.account_id && resize.segIdx === i) {
            renderStart = resize.currentStart;
            renderEnd = resize.currentEnd;
          }
          const startC = Math.max(0, Math.min(HOURS_FULL, renderStart));
          const endC = Math.max(0, Math.min(HOURS_FULL, renderEnd));
          if (endC <= startC) return null;
          const left = `${(startC / HOURS_FULL) * 100}%`;
          const width = `${((endC - startC) / HOURS_FULL) * 100}%`;
          const bg = seg.is_rest ? "var(--change-up)" : colorFor(seg.user_name);
          const isSelected = selected?.account_id === account.account_id && selected?.segIdx === i;
          return (
            <div
              key={i}
              data-segment
              onClick={(e) => {
                e.stopPropagation();
                onSegClick(seg, i, e.currentTarget);
              }}
              onMouseEnter={() => onSegHover(seg, i)}
              className={cn(
                "group absolute top-1 bottom-1 z-[1] flex items-center justify-center overflow-hidden rounded text-[11px] font-medium transition-shadow hover:shadow-md hover:z-[2]",
                seg.is_rest
                  ? "border-2 border-change-up bg-change-up/10 text-change-up"
                  : "text-foreground/80",
                isSelected && "ring-2 ring-primary z-[3]",
              )}
              style={{
                left,
                width,
                background: seg.is_rest ? undefined : bg,
                cursor: "pointer",
              }}
              title={`${seg.user_name ?? "未知"} · ${renderStart}:00 — ${renderEnd > 24 ? renderEnd - 24 : renderEnd}:00${seg.is_rest ? " · 休息" : ""}${seg.reason ? ` · ${seg.reason}` : ""}`}
            >
              <span className="px-2 truncate">
                {seg.is_rest ? "⚠ " : ""}
                {seg.user_name ?? "—"}
              </span>
              {/* 左拖把手 */}
              {!seg.is_rest && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-foreground/0 hover:bg-foreground/30"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (rowRef.current) onResizeStart(seg, i, "left", rowRef.current);
                  }}
                />
              )}
              {/* 右拖把手 */}
              {!seg.is_rest && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-foreground/0 hover:bg-foreground/30"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (rowRef.current) onResizeStart(seg, i, "right", rowRef.current);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SegmentPopover({
  date,
  account_id,
  segment,
  defaultSlot,
  candidates,
  anchor,
  clipboard,
  onCopy,
  onClose,
  onBeforeMutate,
  canPasteSlot,
}: {
  date: string;
  account_id: string;
  segment: Segment | null;
  defaultSlot: { start: number; end: number };
  candidates: Candidate[];
  anchor: HTMLElement;
  clipboard: ClipboardItem | null;
  onCopy: (item: ClipboardItem) => void;
  onClose: () => void;
  onBeforeMutate: () => void;
  canPasteSlot: (start: number, end: number) => boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isCreate = segment === null;
  const [pickedUserId, setPickedUserId] = useState(segment?.user_id ?? "");
  const [reason, setReason] = useState(segment?.reason ?? "");
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [slotStart, setSlotStart] = useState(segment?.start ?? defaultSlot.start);
  const [slotEnd, setSlotEnd] = useState(segment?.end ?? defaultSlot.end);

  useEffect(() => {
    const rect = anchor.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6 + window.scrollY,
      left: Math.max(8, rect.left + window.scrollX),
    });
  }, [anchor]);

  const searchTerm = compactSearchText(search);
  const filtered = searchTerm
    ? candidates.filter((candidate) => candidateSearchText(candidate).includes(searchTerm))
    : candidates;

  function handleSave(asRest = false) {
    if (isCreate && !asRest && !canPasteSlot(slotStart, slotEnd)) {
      alert("目标时段已有排班，不能覆盖。请换到空白位置保存。");
      return;
    }
    onBeforeMutate();
    start(async () => {
      const slot: [string, string] = [
        `${slotStart.toString().padStart(2, "0")}:00`,
        `${slotEnd.toString().padStart(2, "0")}:00`,
      ];
      const payload = {
        account_id,
        date,
        dingtalk_user_id: pickedUserId,
        time_slots: asRest ? [] : [slot],
        reason: reason.trim() || null,
      };
      if (segment && !asRest) {
        await replaceTodaySegment({
          ...payload,
          from_dingtalk_user_id: segment.user_id,
          from_time_slot: [
            `${segment.start.toString().padStart(2, "0")}:00`,
            `${segment.end.toString().padStart(2, "0")}:00`,
          ],
        });
      } else {
        await saveTodayOverride(payload);
      }
      router.refresh();
      onClose();
    });
  }

  function handleClearOverride() {
    const overrideId = segment?.override_id;
    if (!overrideId) return;
    if (!confirm("恢复成默认排班？")) return;
    onBeforeMutate();
    start(async () => {
      await clearOneOverride(overrideId);
      router.refresh();
      onClose();
    });
  }

  function handleCopy() {
    if (!segment) return;
    onCopy({
      user_id: segment.user_id,
      user_name: segment.user_name,
      duration: segment.end - segment.start,
      reason: segment.reason ?? null,
    });
  }

  function handlePasteHere() {
    if (!clipboard) return;
    if (!canPasteSlot(slotStart, slotEnd)) {
      alert("目标时段已有排班，不能覆盖。请换到空白位置粘贴。");
      return;
    }
    onBeforeMutate();
    start(async () => {
      await appendTodayOverrideSlot({
        account_id,
        date,
        dingtalk_user_id: clipboard.user_id,
        time_slots: [
          [
            `${slotStart.toString().padStart(2, "0")}:00`,
            `${slotEnd.toString().padStart(2, "0")}:00`,
          ],
        ],
        reason: clipboard.reason,
      });
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      data-popover-content
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 100 }}
      className="w-[340px] rounded-lg border border-border bg-card shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={slotStart}
            onChange={(e) =>
              setSlotStart(Math.max(0, Math.min(27, parseInt(e.target.value || "0"))))
            }
            min={0}
            max={27}
            className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center font-mono text-[11px]"
          />
          <span className="text-muted-foreground">:00 —</span>
          <input
            type="number"
            value={slotEnd}
            onChange={(e) =>
              setSlotEnd(Math.max(slotStart + 1, Math.min(28, parseInt(e.target.value || "0"))))
            }
            min={slotStart + 1}
            max={28}
            className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center font-mono text-[11px]"
          />
          <span className="text-muted-foreground">:00</span>
          {slotEnd > 24 && <span className="text-primary text-[10px]">跨夜</span>}
        </div>
        <span className="text-muted-foreground">
          {isCreate ? "新增" : segment?.source === "override" ? "已调班" : "默认"}
        </span>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">主播</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索姓名 / 拼音 / 职位"
            className="mb-1.5 w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
          <div className="max-h-[160px] overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">无匹配</div>
            )}
            {filtered.map((c) => (
              <button
                key={c.user_id}
                type="button"
                onClick={() => setPickedUserId(c.user_id)}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted",
                  pickedUserId === c.user_id && "bg-primary/10 text-primary",
                )}
              >
                <span>{c.name ?? "（无名）"}</span>
                {c.title && <span className="text-[10px] text-muted-foreground">{c.title}</span>}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] text-muted-foreground">原因（可选）</div>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="临时调班 / 请假 / ..."
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isCreate && segment?.override_id && (
            <button
              type="button"
              onClick={handleClearOverride}
              disabled={pending}
              className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted hover:text-change-up disabled:opacity-50"
            >
              恢复默认
            </button>
          )}
          {!isCreate && (
            <>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                title="Ctrl+C"
              >
                复制
              </button>
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={pending || !pickedUserId}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50"
              >
                标记休息
              </button>
            </>
          )}
          {clipboard && (
            <button
              type="button"
              onClick={handlePasteHere}
              disabled={pending}
              className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              title="Ctrl+V"
            >
              📋 粘贴 {clipboard.user_name}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md border border-border bg-background px-3 py-1 text-xs hover:bg-muted disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={pending || !pickedUserId}
              className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pending ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
