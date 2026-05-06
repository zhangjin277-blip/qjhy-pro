"use client";
import { useState, useTransition } from "react";
import { createOverride, deleteOverride, mergeWithOverride } from "@/modules/schedule-override";
import type { DefaultSchedule } from "@/modules/schedule-override";

export interface OverrideRowView {
  id: string;
  account_id: string;
  date: string;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  reason: string | null;
}

interface ScheduleOverrideTabProps {
  account_id: string;
  defaultSchedules: DefaultSchedule[];
  candidates: { id: string; name: string }[]; // 可选主播列表（直播一部成员）
  initialOverrides: OverrideRowView[];
}

export function ScheduleOverrideTab({
  account_id,
  defaultSchedules,
  candidates,
  initialOverrides,
}: ScheduleOverrideTabProps) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [overrides, setOverrides] = useState(initialOverrides);
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  const todayOverrides = overrides.filter((o) => o.date === date);
  const merged = mergeWithOverride(
    defaultSchedules,
    todayOverrides.map((o) => ({ user: o.dingtalk_user_id, slots: o.time_slots })),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">日期：</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-700">当天有效排班</h3>
        {merged.length === 0 ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-400">
            暂无排班（该账号未配置默认主播）
          </div>
        ) : (
          <ul className="rounded border border-slate-200 bg-slate-50 p-2 text-xs space-y-1">
            {merged.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-slate-700">
                  {s.slots.length === 0 ? "请假" : s.slots.map(([a, b]) => `${a}-${b}`).join(", ")}
                </span>
                <span className="text-slate-600">
                  {candidates.find((c) => c.id === s.user)?.name ?? s.user}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    s.source === "override"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {s.source === "override" ? "调整" : "默认"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-700">
            该日临时调整（{todayOverrides.length}）
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600"
          >
            + 添加
          </button>
        </div>
        {todayOverrides.length === 0 ? (
          <div className="rounded border border-dashed border-slate-200 px-3 py-4 text-center text-[12px] text-slate-400">
            当日无临时调整
          </div>
        ) : (
          <ul className="space-y-1">
            {todayOverrides.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between rounded border border-slate-200 bg-white p-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-800">
                    {o.anchor_name ?? o.dingtalk_user_id}
                  </span>
                  <span className="font-mono text-xs text-slate-600">
                    {o.time_slots.length === 0
                      ? "请假"
                      : o.time_slots.map(([a, b]) => `${a}-${b}`).join(", ")}
                  </span>
                  {o.reason && <span className="text-xs text-slate-400">{o.reason}</span>}
                </div>
                <button
                  onClick={() => {
                    if (!confirm("确认删除该临时调整？")) return;
                    startTransition(async () => {
                      await deleteOverride(o.id);
                      setOverrides((prev) => prev.filter((x) => x.id !== o.id));
                    });
                  }}
                  className="ml-2 shrink-0 text-slate-400 hover:text-red-600"
                  title="删除"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddOverrideDialog
          account_id={account_id}
          date={date}
          candidates={candidates}
          onClose={() => setShowAdd(false)}
          onAdded={(newOv) => {
            setOverrides((prev) => [...prev, newOv]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddOverrideDialog({
  account_id,
  date,
  candidates,
  onClose,
  onAdded,
}: {
  account_id: string;
  date: string;
  candidates: { id: string; name: string }[];
  onClose: () => void;
  onAdded: (o: OverrideRowView) => void;
}) {
  const [userId, setUserId] = useState("");
  const [isLeave, setIsLeave] = useState(false);
  const [slotStart, setSlotStart] = useState("14:00");
  const [slotEnd, setSlotEnd] = useState("18:00");
  const [reason, setReason] = useState("请假调班");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handleSave = () => {
    if (!userId) {
      setError("请选择主播");
      return;
    }
    setError(null);
    setSaving(true);
    startTransition(async () => {
      try {
        await createOverride({
          account_id,
          date,
          dingtalk_user_id: userId,
          time_slots: isLeave ? [] : [[slotStart, slotEnd]],
          reason: reason || null,
        });
        onAdded({
          id: crypto.randomUUID(),
          account_id,
          date,
          dingtalk_user_id: userId,
          anchor_name: candidates.find((c) => c.id === userId)?.name ?? null,
          time_slots: isLeave ? [] : [[slotStart, slotEnd]],
          reason: reason || null,
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "保存失败，请重试");
        setSaving(false);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-5 shadow-xl space-y-3">
        <h2 className="text-base font-semibold text-slate-800">添加临时调整</h2>

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
            主播
          </label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">— 选择主播 —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is-leave"
            checked={isLeave}
            onChange={(e) => setIsLeave(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="is-leave" className="text-sm text-slate-700">
            请假（不播）
          </label>
        </div>

        {!isLeave && (
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              调整后时段
            </label>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="time"
                value={slotStart}
                onChange={(e) => setSlotStart(e.target.value)}
                className="flex-1 rounded border border-slate-200 px-2 py-1 focus:border-blue-400 focus:outline-none"
              />
              <span className="text-slate-400">—</span>
              <input
                type="time"
                value={slotEnd}
                onChange={(e) => setSlotEnd(e.target.value)}
                className="flex-1 rounded border border-slate-200 px-2 py-1 focus:border-blue-400 focus:outline-none"
              />
            </div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
            原因
          </label>
          <input
            type="text"
            placeholder="如：请假调班 / 加班 / 临时换班"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            disabled={!userId || saving}
            onClick={handleSave}
            className="rounded bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
