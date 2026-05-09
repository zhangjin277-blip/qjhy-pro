"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { upsertAnchor } from "@/modules/live-anchor";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { PlatformBadge } from "../../live-accounts/_components/platform-badge";

// 简易可搜索 select（避免引入 cmdk 依赖）
function SearchableUserSelect({
  value,
  onChange,
  options,
  placeholder = "搜索主播姓名…",
  emptyHint = "无匹配",
}: {
  value: string;
  onChange: (v: string) => void;
  options: { user_id: string; name: string; title: string | null; active: boolean }[];
  placeholder?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.user_id === value);
  const display = selected ? selected.name : "";

  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.toLowerCase();
        return o.name.toLowerCase().includes(q) || (o.title?.toLowerCase().includes(q) ?? false);
      })
    : options;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-3 py-2 text-left text-[13px] text-slate-800 hover:border-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <span className={display ? "" : "text-slate-300"}>{display || "— 请选择钉钉用户 —"}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-t-md border-b border-slate-200 px-3 py-2 text-[13px] outline-none"
          />
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[12px] text-slate-400">{emptyHint}</div>
            ) : (
              filtered.map((u) => (
                <button
                  type="button"
                  key={u.user_id}
                  onClick={() => {
                    onChange(u.user_id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-slate-50 ${
                    u.user_id === value ? "bg-blue-50 text-blue-700" : "text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{u.name}</span>
                    {!u.active && (
                      <span className="rounded bg-red-50 px-1 text-[10px] text-red-500">离职</span>
                    )}
                  </div>
                  {u.title && <span className="text-[11px] text-slate-400">{u.title}</span>}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const BUSINESS_LINES = [
  "捕鱼大作战",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "斗地主",
  "麻将",
  "三国:冰河时代",
] as const;
type BusinessLineValue = (typeof BUSINESS_LINES)[number];
const EMPLOYMENT_TYPES = ["正式", "合作", "试播"] as const;
const WORK_STATUSES = [
  { value: "active", label: "在播" },
  { value: "rest", label: "休息" },
  { value: "leave", label: "离职" },
] as const;

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
const selectCls =
  "w-full rounded border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  account_name: string | null;
  platform: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

interface DeptUserLite {
  user_id: string;
  name: string;
  title: string | null;
  active: boolean;
}

interface AnchorEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: AnchorWithDingtalk | null;
  deptUsers: DeptUserLite[];
  bindingsByAnchor: Record<string, BindingLite[]>;
}

export function AnchorEditDrawer({
  open,
  onOpenChange,
  anchor,
  deptUsers,
  bindingsByAnchor,
}: AnchorEditDrawerProps) {
  const isEdit = anchor !== null;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedUserId, setSelectedUserId] = useState("");
  const [businessLine, setBusinessLine] = useState<BusinessLineValue>("捕鱼大作战");
  const [employmentType, setEmploymentType] = useState<"正式" | "合作" | "试播">("正式");
  const [workStatus, setWorkStatus] = useState<"active" | "rest" | "leave">("active");
  const [trialStartDate, setTrialStartDate] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [externalName, setExternalName] = useState("");

  // Current anchor's bindings for display
  const currentBindings = anchor ? (bindingsByAnchor[anchor.dingtalk_user_id] ?? []) : [];

  useEffect(() => {
    if (!open) return;
    if (anchor) {
      setSelectedUserId(anchor.dingtalk_user_id);
      setBusinessLine(anchor.business_line as BusinessLineValue);
      setEmploymentType(anchor.employment_type as "正式" | "合作" | "试播");
      setWorkStatus(anchor.work_status as "active" | "rest" | "leave");
      setTrialStartDate(anchor.trial_start_date ?? "");
      setContractDate(anchor.contract_date ?? "");
      setLeaveDate(anchor.leave_date ?? "");
      setExternalName(anchor.external_name ?? "");
    } else {
      setSelectedUserId("");
      setBusinessLine("捕鱼大作战");
      setEmploymentType("正式");
      setWorkStatus("active");
      setTrialStartDate("");
      setContractDate("");
      setLeaveDate("");
      setExternalName("");
    }
    setError(null);
  }, [open, anchor]);

  const handleSave = () => {
    if (!selectedUserId) {
      setError("请选择钉钉用户");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await upsertAnchor({
          dingtalk_user_id: selectedUserId,
          business_line: businessLine,
          employment_type: employmentType,
          work_status: workStatus,
          trial_start_date: trialStartDate || null,
          contract_date: contractDate || null,
          leave_date: leaveDate || null,
          external_name: externalName || null,
        });
        onOpenChange(false);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "保存失败，请重试";
        setError(msg);
      }
    });
  };

  // 编辑模式下展示钉钉只读信息
  const selectedUser = deptUsers.find((u) => u.user_id === selectedUserId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] !max-w-[90vw] gap-0 p-0 sm:max-w-none">
        <SheetTitle className="sr-only">
          {isEdit ? `编辑主播 · ${anchor?.name}` : "新增主播档案"}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {isEdit ? "编辑主播业务字段" : "新增主播档案 — 选择钉钉用户并填写业务字段"}
        </SheetDescription>

        <div className="flex h-full flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="text-xs text-slate-500">
              {isEdit ? `编辑主播 · ${anchor?.name}` : "新增主播档案"}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-col gap-4">
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
                  {error}
                </div>
              )}

              {/* 钉钉用户 */}
              {isEdit ? (
                <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    钉钉资料（只读）
                  </div>
                  <div className="text-[13px] font-medium text-slate-800">{anchor?.name}</div>
                  {anchor?.title && (
                    <div className="text-[12px] text-slate-500">{anchor.title}</div>
                  )}
                  {anchor?.mobile && (
                    <div className="font-mono text-[11px] text-slate-400">{anchor.mobile}</div>
                  )}
                </div>
              ) : (
                <FormField label="钉钉用户 *">
                  <SearchableUserSelect
                    value={selectedUserId}
                    onChange={setSelectedUserId}
                    options={deptUsers}
                    placeholder="搜索直播一部成员…"
                    emptyHint="无匹配成员"
                  />
                  {selectedUser && (
                    <div className="mt-1 text-[11px] text-slate-400">
                      {selectedUser.title && <span>{selectedUser.title} · </span>}
                      {!selectedUser.active && <span className="text-red-400">已离职 · </span>}
                      ID: {selectedUser.user_id}
                    </div>
                  )}
                </FormField>
              )}

              <div className="grid grid-cols-2 gap-4">
                <FormField label="业务线 *">
                  <select
                    className={selectCls}
                    value={businessLine}
                    onChange={(e) => setBusinessLine(e.target.value as typeof businessLine)}
                  >
                    {BUSINESS_LINES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="雇佣类型 *">
                  <select
                    className={selectCls}
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as typeof employmentType)}
                  >
                    {EMPLOYMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <FormField label="工作状态">
                <select
                  className={selectCls}
                  value={workStatus}
                  onChange={(e) => setWorkStatus(e.target.value as typeof workStatus)}
                >
                  {WORK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="艺名（对外名称）">
                <input
                  className={inputCls}
                  placeholder="艺名 / 直播间昵称"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                />
              </FormField>

              <div className="grid grid-cols-3 gap-3">
                <FormField label="试播日">
                  <input
                    type="date"
                    className={inputCls}
                    value={trialStartDate}
                    onChange={(e) => setTrialStartDate(e.target.value)}
                  />
                </FormField>
                <FormField label="签约日">
                  <input
                    type="date"
                    className={inputCls}
                    value={contractDate}
                    onChange={(e) => setContractDate(e.target.value)}
                  />
                </FormField>
                <FormField label="离职日">
                  <input
                    type="date"
                    className={inputCls}
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                  />
                </FormField>
              </div>

              {/* 绑定账号 section（只读） */}
              {isEdit && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">
                    绑定账号（{currentBindings.length}）
                  </div>
                  {currentBindings.length === 0 ? (
                    <div className="text-[12px] text-slate-400">暂无绑定账号</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {currentBindings.map((b) => (
                        <div
                          key={b.id}
                          className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1 text-[12px]"
                        >
                          {b.platform && <PlatformBadge platform={b.platform} size="xs" />}
                          <span className="font-medium text-slate-800">
                            {b.account_name ?? "—"}
                          </span>
                          {b.time_slots.length > 0 && (
                            <span className="font-mono text-[10.5px] text-slate-400">
                              {b.time_slots
                                .map(([s, e]) => `${s.slice(0, 2)}–${e.slice(0, 2)}`)
                                .join(" / ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[10.5px] text-slate-400">
                    如需修改排班，请到「直播账号」页面操作
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
            <button
              className="rounded-[5px] border border-slate-200 px-4 py-2 text-[13px] text-slate-600 hover:bg-slate-50"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              取消
            </button>
            <button
              className="rounded-[5px] bg-blue-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600 disabled:opacity-60"
              onClick={handleSave}
              disabled={isPending || !selectedUserId}
            >
              {isPending ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
