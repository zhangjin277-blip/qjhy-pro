"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { toast } from "sonner";
import type { CheckinDayResult } from "@/modules/checkin/queries";
import { fetchCheckinDay, insertManualSessionAction, listAnchorsForCorrection } from "../actions";
import { CheckinGantt } from "./checkin-gantt";
import { CheckinTable } from "./checkin-table";

interface Props {
  initialData: CheckinDayResult;
  initialDate: string;
  initialProduct: string;
  canForceEnd: boolean;
}

const PRODUCTS = [
  { value: "", label: "全部" },
  { value: "捕鱼大作战", label: "捕鱼大作战" },
  { value: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { value: "电玩捕鱼", label: "电玩捕鱼" },
];

type ExportPreset = "lastMonth" | "thisMonth" | "last7Days";

function toLocalIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExportPreset(preset: ExportPreset): { dateFrom: string; dateTo: string } {
  const today = new Date();
  if (preset === "lastMonth") {
    return {
      dateFrom: toLocalIsoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      dateTo: toLocalIsoDate(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (preset === "thisMonth") {
    return {
      dateFrom: toLocalIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      dateTo: toLocalIsoDate(today),
    };
  }
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  return { dateFrom: toLocalIsoDate(sevenDaysAgo), dateTo: toLocalIsoDate(today) };
}

export function CheckinHistoryClient({
  initialData,
  initialDate,
  initialProduct,
  canForceEnd,
}: Props): React.JSX.Element {
  const [date, setDate] = useState(initialDate);
  const [product, setProduct] = useState(initialProduct);
  const [accountQuery, setAccountQuery] = useState("");
  const [data, setData] = useState<CheckinDayResult>(initialData);
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [exportDialog, setExportDialog] = useState<{
    dateFrom: string;
    dateTo: string;
    error: string | null;
  } | null>(null);

  // 补时长 dialog
  const [insertDialog, setInsertDialog] = useState<{
    liveAccountId: string;
    anchorDingtalkUserId: string;
    startAtLocal: string;
    endAtLocal: string;
    reason: string;
    error: string | null;
  } | null>(null);
  const [anchorOptions, setAnchorOptions] = useState<
    { id: string; realName: string; externalName: string | null }[]
  >([]);
  const [anchorOptionQuery, setAnchorOptionQuery] = useState("");

  useEffect(() => {
    if (insertDialog && anchorOptions.length === 0) {
      listAnchorsForCorrection()
        .then(setAnchorOptions)
        .catch((e) => console.error("load anchors failed", e));
    }
  }, [insertDialog, anchorOptions.length]);

  const filteredData = useMemo<CheckinDayResult>(() => {
    const q = accountQuery.trim().toLowerCase();
    if (!q) return data;
    return {
      ...data,
      accounts: data.accounts.filter((a) => {
        if (a.account_name.toLowerCase().includes(q)) return true;
        if (a.placement_label && a.placement_label.toLowerCase().includes(q)) return true;
        return false;
      }),
    };
  }, [data, accountQuery]);

  function refresh(d: string, p: string): void {
    startTransition(async () => {
      const r = await fetchCheckinDay(d, p);
      if (r) setData(r);
    });
  }

  function onDateChange(d: string): void {
    setDate(d);
    refresh(d, product);
  }
  function onProductChange(p: string): void {
    setProduct(p);
    refresh(date, p);
  }

  const stats = useMemo(() => {
    let totalSessions = 0;
    let totalSeconds = 0;
    let inProgress = 0;
    const anchorSet = new Set<string>();
    for (const acc of filteredData.accounts) {
      for (const s of acc.sessions) {
        totalSessions++;
        if (s.status === "in_progress") inProgress++;
        else if (s.duration_seconds) totalSeconds += s.duration_seconds;
        anchorSet.add(s.anchor_dingtalk_user_id);
      }
    }
    return {
      totalSessions,
      totalHours: (totalSeconds / 3600).toFixed(1),
      inProgress,
      anchorCount: anchorSet.size,
      accountCount: filteredData.accounts.length,
    };
  }, [filteredData]);

  async function downloadCsv(): Promise<void> {
    if (!exportDialog || isExporting) return;
    if (!exportDialog.dateFrom || !exportDialog.dateTo) {
      setExportDialog({ ...exportDialog, error: "请选择开始和结束日期" });
      return;
    }

    const rangeDays =
      Math.floor(
        (new Date(`${exportDialog.dateTo}T12:00:00`).getTime() -
          new Date(`${exportDialog.dateFrom}T12:00:00`).getTime()) /
          86_400_000,
      ) + 1;
    if (rangeDays < 1) {
      setExportDialog({ ...exportDialog, error: "结束日期不能早于开始日期" });
      return;
    }
    if (rangeDays > 93) {
      setExportDialog({ ...exportDialog, error: "单次最多导出 93 天" });
      return;
    }

    setIsExporting(true);
    setExportDialog({ ...exportDialog, error: null });
    try {
      const params = new URLSearchParams({
        date_from: exportDialog.dateFrom,
        date_to: exportDialog.dateTo,
      });
      if (product) params.set("product", product);
      if (accountQuery.trim()) params.set("account_query", accountQuery.trim());
      const response = await fetch(`/api/checkin-history/export?${params.toString()}`);
      if (!response.ok) throw new Error((await response.text()) || "导出失败");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `checkin-history-${exportDialog.dateFrom}_${exportDialog.dateTo}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setExportDialog(null);
      toast.success("CSV 已导出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "导出失败";
      setExportDialog((current) => (current ? { ...current, error: message } : current));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          产品
          <select
            value={product}
            onChange={(e) => onProductChange(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {PRODUCTS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
          账号
          <input
            type="search"
            value={accountQuery}
            onChange={(e) => setAccountQuery(e.target.value)}
            placeholder="搜索账号名 / 投放标签"
            className="w-44 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {accountQuery && (
            <button
              type="button"
              onClick={() => setAccountQuery("")}
              className="text-[11px] text-slate-400 hover:text-slate-600"
            >
              清除
            </button>
          )}
        </label>
        <span className="text-[11.5px] text-slate-400">
          {isPending
            ? "加载中..."
            : `${stats.accountCount} 账号 / ${stats.totalSessions} 场次 / ${stats.anchorCount} 主播 / 累计 ${stats.totalHours} 小时${stats.inProgress > 0 ? ` / 进行中 ${stats.inProgress}` : ""}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {canForceEnd && (
            <button
              type="button"
              onClick={() => {
                // 默认开始 = 当天 12:00 本地，结束 = 15:00 本地，供 admin 微调
                const base = date + "T12:00";
                const endBase = date + "T15:00";
                setInsertDialog({
                  liveAccountId: filteredData.accounts[0]?.live_account_id ?? "",
                  anchorDingtalkUserId: "",
                  startAtLocal: base,
                  endAtLocal: endBase,
                  reason: "",
                  error: null,
                });
                setAnchorOptionQuery("");
              }}
              className="rounded border border-amber-300 bg-white px-3 py-1 text-[12px] font-medium text-amber-700 hover:bg-amber-50"
            >
              + 补时长
            </button>
          )}
          <button
            type="button"
            onClick={() => setExportDialog({ ...getExportPreset("lastMonth"), error: null })}
            className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="size-3.5" aria-hidden="true" />
            导出 CSV
          </button>
        </div>
      </div>

      {/* Gantt */}
      {filteredData.accounts.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-[13px] text-slate-400">
          {accountQuery ? `没有匹配「${accountQuery}」的账号` : "当日暂无开播记录"}
        </div>
      ) : (
        <>
          <CheckinGantt data={filteredData} />
          <CheckinTable
            data={filteredData}
            canForceEnd={canForceEnd}
            onChanged={() => refresh(date, product)}
          />
        </>
      )}

      {exportDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !isExporting && setExportDialog(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="export-dialog-title" className="text-sm font-semibold text-slate-800">
                  导出开播记录
                </h2>
                <p className="mt-1 text-[11.5px] text-slate-500">选择需要导出的业务日期范围</p>
              </div>
              <button
                type="button"
                title="关闭"
                aria-label="关闭"
                disabled={isExporting}
                onClick={() => setExportDialog(null)}
                className="grid size-8 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-4 flex gap-2" aria-label="快捷日期范围">
              {(
                [
                  ["lastMonth", "上个月"],
                  ["thisMonth", "本月"],
                  ["last7Days", "近 7 日"],
                ] as const
              ).map(([preset, label]) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isExporting}
                  onClick={() => setExportDialog({ ...getExportPreset(preset), error: null })}
                  className="rounded border border-slate-300 px-3 py-1.5 text-[12px] text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[12px] text-slate-600">
                <span className="mb-1 block">开始日期</span>
                <input
                  type="date"
                  value={exportDialog.dateFrom}
                  disabled={isExporting}
                  onChange={(event) =>
                    setExportDialog({
                      ...exportDialog,
                      dateFrom: event.target.value,
                      error: null,
                    })
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
              <label className="text-[12px] text-slate-600">
                <span className="mb-1 block">结束日期</span>
                <input
                  type="date"
                  value={exportDialog.dateTo}
                  disabled={isExporting}
                  onChange={(event) =>
                    setExportDialog({
                      ...exportDialog,
                      dateTo: event.target.value,
                      error: null,
                    })
                  }
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>

            <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
              产品：{PRODUCTS.find((item) => item.value === product)?.label ?? "全部"}
              {accountQuery.trim() ? ` · 账号搜索：${accountQuery.trim()}` : ""}
            </div>
            {exportDialog.error && (
              <p className="mt-3 text-[12px] text-red-600" role="alert">
                {exportDialog.error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setExportDialog(null)}
                className="rounded border border-slate-300 px-3 py-1.5 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={() => void downloadCsv()}
                className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {isExporting ? (
                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Download className="size-3.5" aria-hidden="true" />
                )}
                {isExporting ? "导出中..." : "开始导出"}
              </button>
            </div>
          </div>
        </div>
      )}

      {insertDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !isPending && setInsertDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-semibold text-slate-800">补时长（手动新增）</div>
            <div className="mb-3 rounded bg-slate-50 p-3 text-[11.5px] text-slate-500">
              主播当时忘扫码，admin 直接补一条已结束的开播记录。会写 audit_log；status =
              ended，closed_by = admin_insert。
            </div>

            <label className="mb-1 block text-[12px] text-slate-600">账号</label>
            <select
              value={insertDialog.liveAccountId}
              onChange={(e) =>
                setInsertDialog({ ...insertDialog, liveAccountId: e.target.value, error: null })
              }
              disabled={isPending}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {data.accounts.length === 0 && (
                <option value="">当日无账号，请先切到有数据的日期</option>
              )}
              {data.accounts.map((a) => (
                <option key={a.live_account_id} value={a.live_account_id}>
                  {a.placement_label ?? a.account_name} · {a.platform} · {a.product}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-[12px] text-slate-600">主播</label>
            <input
              type="text"
              value={anchorOptionQuery}
              onChange={(e) => {
                setAnchorOptionQuery(e.target.value);
                setInsertDialog({ ...insertDialog, anchorDingtalkUserId: "", error: null });
              }}
              placeholder={anchorOptions.length === 0 ? "加载中..." : "搜索主播 / 艺名"}
              disabled={isPending}
              className="mb-1 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mb-3 max-h-40 overflow-y-auto rounded border border-slate-200 bg-white">
              {anchorOptions
                .filter((a) => {
                  if (!anchorOptionQuery) return true;
                  const q = anchorOptionQuery.toLowerCase();
                  return (
                    a.realName.toLowerCase().includes(q) ||
                    (a.externalName?.toLowerCase().includes(q) ?? false)
                  );
                })
                .slice(0, 50)
                .map((a) => {
                  const selected = insertDialog.anchorDingtalkUserId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setInsertDialog({
                          ...insertDialog,
                          anchorDingtalkUserId: a.id,
                          error: null,
                        });
                        setAnchorOptionQuery(
                          a.externalName ? `${a.realName}（${a.externalName}）` : a.realName,
                        );
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-[12px] hover:bg-slate-50 ${
                        selected ? "bg-blue-50 text-blue-700" : "text-slate-700"
                      }`}
                    >
                      <span>
                        <b>{a.realName}</b>
                        {a.externalName && (
                          <span className="ml-1 text-slate-400">（{a.externalName}）</span>
                        )}
                      </span>
                    </button>
                  );
                })}
            </div>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] text-slate-600">开始时间</label>
                <input
                  type="datetime-local"
                  value={insertDialog.startAtLocal}
                  onChange={(e) =>
                    setInsertDialog({
                      ...insertDialog,
                      startAtLocal: e.target.value,
                      error: null,
                    })
                  }
                  disabled={isPending}
                  step={60}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] text-slate-600">结束时间</label>
                <input
                  type="datetime-local"
                  value={insertDialog.endAtLocal}
                  onChange={(e) =>
                    setInsertDialog({ ...insertDialog, endAtLocal: e.target.value, error: null })
                  }
                  disabled={isPending}
                  step={60}
                  className="w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <label className="mb-1 block text-[12px] text-slate-600">原因（可选）</label>
            <textarea
              value={insertDialog.reason}
              onChange={(e) => setInsertDialog({ ...insertDialog, reason: e.target.value })}
              disabled={isPending}
              rows={2}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如：主播忘扫码补 / 接班漏点"
            />

            {insertDialog.error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700">
                {insertDialog.error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInsertDialog(null)}
                disabled={isPending}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = insertDialog;
                  if (!d.liveAccountId) {
                    setInsertDialog({ ...d, error: "请选账号" });
                    return;
                  }
                  if (!d.anchorDingtalkUserId) {
                    setInsertDialog({ ...d, error: "请选主播" });
                    return;
                  }
                  if (!d.startAtLocal || !d.endAtLocal) {
                    setInsertDialog({ ...d, error: "请填开始和结束时间" });
                    return;
                  }
                  startTransition(async () => {
                    const r = await insertManualSessionAction({
                      liveAccountId: d.liveAccountId,
                      anchorDingtalkUserId: d.anchorDingtalkUserId,
                      startAt: new Date(d.startAtLocal).toISOString(),
                      endAt: new Date(d.endAtLocal).toISOString(),
                      reason: d.reason,
                    });
                    if (r.ok) {
                      setInsertDialog(null);
                      setAnchorOptionQuery("");
                      refresh(date, product);
                    } else {
                      setInsertDialog({ ...d, error: r.error ?? "保存失败" });
                    }
                  });
                }}
                disabled={isPending}
                className="rounded bg-amber-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isPending ? "保存中..." : "确认补时长"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
