"use client";

import { useState, useTransition } from "react";
import { upsertBinding, deleteBinding } from "@/modules/live-anchor";

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
// ISO weekday: 1=周一 ... 7=周日
const DAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface AnchorLite {
  dingtalk_user_id: string;
  name: string;
}

interface AnchorBindingFormProps {
  accountId: string | null;
  bindings: BindingLite[];
  anchors: AnchorLite[];
}

interface SlotDraft {
  start: string;
  end: string;
}

interface BindingDraft {
  id?: string;
  dingtalk_user_id: string;
  slots: SlotDraft[];
  rest_days: number[];
  remark: string;
  saving: boolean;
  error: string | null;
}

function toSlotDrafts(timeSlots: [string, string][]): SlotDraft[] {
  if (timeSlots.length === 0) return [{ start: "09:00", end: "18:00" }];
  return timeSlots.map(([s, e]) => ({ start: s, end: e }));
}

const inputCls =
  "rounded border border-slate-200 bg-white px-2 py-1.5 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";

/** 可搜索主播下拉：输入拼音/汉字过滤 */
function AnchorCombobox({
  anchors,
  value,
  onChange,
}: {
  anchors: AnchorLite[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = anchors.find((a) => a.dingtalk_user_id === value);
  const filtered = query.trim()
    ? anchors.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()))
    : anchors;

  return (
    <div className="relative">
      <button
        type="button"
        className={`${inputCls} flex w-full items-center justify-between text-left`}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? selected.name : "— 选择主播 —"}
        </span>
        <span className="text-[10px] text-slate-400">▾</span>
      </button>
      {open && (
        <>
          {/* 点击外部关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索姓名..."
                className={`${inputCls} w-full`}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                  if (e.key === "Enter" && filtered.length === 1 && filtered[0]) {
                    onChange(filtered[0].dingtalk_user_id);
                    setOpen(false);
                  }
                }}
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-slate-400">无匹配</div>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.dingtalk_user_id}
                    type="button"
                    onClick={() => {
                      onChange(a.dingtalk_user_id);
                      setOpen(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-blue-50 ${
                      a.dingtalk_user_id === value
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-700"
                    }`}
                  >
                    {a.name}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function AnchorBindingForm({ accountId, bindings, anchors }: AnchorBindingFormProps) {
  const [drafts, setDrafts] = useState<BindingDraft[]>(
    bindings.map((b) => ({
      id: b.id,
      dingtalk_user_id: b.dingtalk_user_id,
      slots: toSlotDrafts(b.time_slots),
      rest_days: b.rest_days,
      remark: b.remark ?? "",
      saving: false,
      error: null,
    })),
  );
  const [, startDeleteTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);

  // No account yet
  if (!accountId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
        <div className="text-[32px]">📋</div>
        <div className="text-[13px]">请先在「基本信息」标签保存账号，再添加轮播主播</div>
      </div>
    );
  }

  const updateDraft = (idx: number, patch: Partial<BindingDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const addDraft = () => {
    setDrafts((prev) => [
      ...prev,
      {
        dingtalk_user_id: "",
        slots: [{ start: "09:00", end: "18:00" }],
        rest_days: [],
        remark: "",
        saving: false,
        error: null,
      },
    ]);
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async (idx: number) => {
    const d = drafts[idx];
    if (!d) return;
    if (!d.dingtalk_user_id) {
      updateDraft(idx, { error: "请选择主播" });
      return;
    }
    if (d.slots.length === 0) {
      updateDraft(idx, { error: "至少需要一个时段" });
      return;
    }

    updateDraft(idx, { saving: true, error: null });
    try {
      const r = await upsertBinding({
        id: d.id,
        account_id: accountId,
        dingtalk_user_id: d.dingtalk_user_id,
        time_slots: d.slots.map((s) => [s.start, s.end] as [string, string]),
        rest_days: d.rest_days,
        remark: d.remark || null,
      });
      if (!r.ok) {
        updateDraft(idx, { saving: false, error: r.error });
        return;
      }
      updateDraft(idx, { saving: false });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "保存失败";
      updateDraft(idx, { saving: false, error: msg });
    }
  };

  const handleDelete = (idx: number, bindingId: string | undefined) => {
    if (!bindingId) {
      removeDraft(idx);
      return;
    }
    startDeleteTransition(async () => {
      try {
        const r = await deleteBinding({ id: bindingId });
        if (!r.ok) {
          setGlobalError(r.error);
          return;
        }
        removeDraft(idx);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "删除失败";
        setGlobalError(msg);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {globalError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          {globalError}
        </div>
      )}

      {drafts.length === 0 && (
        <div className="flex items-center justify-center py-8 text-[13px] text-slate-400">
          暂无排班绑定，点击下方添加
        </div>
      )}

      {drafts.map((draft, idx) => (
        <div
          key={draft.id ?? `new-${idx}`}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] font-medium uppercase tracking-wider text-slate-500">
              主播 #{idx + 1}
            </span>
            <button
              className="text-[11px] text-red-400 hover:text-red-600"
              onClick={() => handleDelete(idx, draft.id)}
            >
              删除
            </button>
          </div>

          {/* Anchor select */}
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              主播（钉钉用户）
            </label>
            <AnchorCombobox
              anchors={anchors}
              value={draft.dingtalk_user_id}
              onChange={(id) => updateDraft(idx, { dingtalk_user_id: id })}
            />
          </div>

          {/* Time slots */}
          <div className="mb-3">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                时段
              </label>
              <button
                className="text-[11px] text-blue-500 hover:text-blue-700"
                onClick={() =>
                  updateDraft(idx, {
                    slots: [...draft.slots, { start: "09:00", end: "18:00" }],
                  })
                }
              >
                + 加时段
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {draft.slots.map((slot, si) => (
                <div key={si} className="flex items-center gap-2">
                  <input
                    type="time"
                    className={`${inputCls} flex-1`}
                    value={slot.start}
                    onChange={(e) => {
                      const newSlots = draft.slots.map((s, i) =>
                        i === si ? { ...s, start: e.target.value } : s,
                      );
                      updateDraft(idx, { slots: newSlots });
                    }}
                  />
                  <span className="text-[12px] text-slate-400">—</span>
                  <input
                    type="time"
                    className={`${inputCls} flex-1`}
                    value={slot.end}
                    onChange={(e) => {
                      const newSlots = draft.slots.map((s, i) =>
                        i === si ? { ...s, end: e.target.value } : s,
                      );
                      updateDraft(idx, { slots: newSlots });
                    }}
                  />
                  {draft.slots.length > 1 && (
                    <button
                      className="text-[11px] text-slate-400 hover:text-red-500"
                      onClick={() => {
                        updateDraft(idx, {
                          slots: draft.slots.filter((_, i) => i !== si),
                        });
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Rest days */}
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              休息日
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_VALUES.map((d, i) => {
                const checked = draft.rest_days.includes(d);
                return (
                  <button
                    key={d}
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      checked
                        ? "bg-amber-100 text-amber-700"
                        : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      const newDays = checked
                        ? draft.rest_days.filter((x) => x !== d)
                        : [...draft.rest_days, d];
                      updateDraft(idx, { rest_days: newDays });
                    }}
                  >
                    {DAY_LABELS[i]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remark */}
          <div className="mb-3">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-slate-500">
              备注
            </label>
            <textarea
              className={`${inputCls} w-full resize-none`}
              rows={2}
              placeholder="备注信息（可选）"
              value={draft.remark}
              onChange={(e) => updateDraft(idx, { remark: e.target.value })}
            />
          </div>

          {/* Error */}
          {draft.error && <div className="mb-2 text-[12px] text-red-500">{draft.error}</div>}

          {/* Save button */}
          <div className="flex justify-end">
            <button
              className="rounded-[5px] bg-blue-500 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-blue-600 disabled:opacity-60"
              onClick={() => handleSave(idx)}
              disabled={draft.saving}
            >
              {draft.saving ? "保存中…" : "保存此排班"}
            </button>
          </div>
        </div>
      ))}

      <button
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-3 text-[13px] text-slate-500 hover:border-blue-400 hover:text-blue-500"
        onClick={addDraft}
      >
        + 添加主播
      </button>
    </div>
  );
}
