"use client";

import { useEffect, useState, useTransition } from "react";
import type { CheckinDayResult, CheckinDaySession } from "@/modules/checkin/queries";
import {
  forceEndSessionAction,
  listAnchorsForCorrection,
  updateSessionAnchorAction,
} from "../actions";

interface Props {
  data: CheckinDayResult;
  canForceEnd?: boolean;
  onChanged?: () => void;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function fmtYuan(cents: number | null): string {
  if (cents == null) return "—";
  if (cents === 0) return "0";
  const yuan = cents / 100;
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(2)}万`;
  return yuan.toFixed(2);
}

function fmtMoney(yuan: number | null): string {
  if (yuan == null) return "—";
  if (yuan === 0) return "0";
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(2)}万`;
  return yuan.toFixed(2);
}

function fmtInt(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("zh-CN");
}

function fmtPrice(num: number | null, denom: number | null): string {
  if (num == null || denom == null || denom <= 0) return "—";
  return (num / denom).toFixed(2);
}

function statusBadge(s: CheckinDaySession): { text: string; cls: string } {
  if (s.status === "in_progress") return { text: "进行中", cls: "bg-blue-100 text-blue-800" };
  if (s.status === "ended") return { text: "正常下播", cls: "bg-emerald-100 text-emerald-800" };
  if (s.status === "auto_closed_by_next")
    return { text: "被接班", cls: "bg-orange-100 text-orange-800" };
  if (s.status === "auto_closed_by_offline")
    return { text: "系统检测离线", cls: "bg-red-100 text-red-800" };
  if (s.status === "auto_closed_by_cron")
    return { text: "系统兜底", cls: "bg-slate-200 text-slate-700" };
  return { text: s.status, cls: "bg-slate-100 text-slate-600" };
}

interface FlatRow {
  product: string;
  placement_label: string | null;
  account_name: string;
  platform: string;
  avatar: string | null;
  session: CheckinDaySession;
}

export function CheckinTable({ data, canForceEnd, onChanged }: Props): React.JSX.Element {
  const [dialog, setDialog] = useState<{
    sessionId: string;
    anchorName: string;
    accountName: string;
    reason: string;
    error: string | null;
  } | null>(null);
  const [correctDialog, setCorrectDialog] = useState<{
    sessionId: string;
    anchorName: string;
    accountName: string;
    newAnchorId: string;
    reason: string;
    error: string | null;
  } | null>(null);
  const [anchors, setAnchors] = useState<{ id: string; name: string }[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (correctDialog && anchors.length === 0) {
      listAnchorsForCorrection()
        .then(setAnchors)
        .catch((e) => {
          console.error("load anchors failed", e);
        });
    }
  }, [correctDialog, anchors.length]);

  const flat: FlatRow[] = [];
  for (const acc of data.accounts) {
    for (const s of acc.sessions) {
      flat.push({
        product: acc.product,
        placement_label: acc.placement_label,
        account_name: acc.account_name,
        platform: acc.platform,
        avatar: acc.avatar,
        session: s,
      });
    }
  }
  // 按 start_at 倒序
  flat.sort((a, b) => (a.session.start_at < b.session.start_at ? 1 : -1));

  function submit(): void {
    if (!dialog) return;
    const { sessionId, reason } = dialog;
    startTransition(async () => {
      const r = await forceEndSessionAction({ sessionId, reason });
      if (r.ok) {
        setDialog(null);
        onChanged?.();
      } else {
        setDialog({ ...dialog, error: r.error ?? "下播失败" });
      }
    });
  }

  function submitCorrect(): void {
    if (!correctDialog || !correctDialog.newAnchorId) return;
    const { sessionId, newAnchorId, reason } = correctDialog;
    startTransition(async () => {
      const r = await updateSessionAnchorAction({
        sessionId,
        newAnchorDingtalkUserId: newAnchorId,
        reason,
      });
      if (r.ok) {
        setCorrectDialog(null);
        onChanged?.();
      } else {
        setCorrectDialog({ ...correctDialog, error: r.error ?? "修改失败" });
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-2 text-[12.5px] font-semibold text-slate-700">
        详细记录{" "}
        <span className="text-[11px] font-normal text-slate-400">
          · {flat.length} 条 · 按开始时间倒序
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[1400px]">
          <thead className="bg-slate-50 text-[11.5px] font-semibold text-slate-600 tracking-normal">
            <tr>
              <th className="px-4 py-3 text-left">主播</th>
              <th className="px-4 py-3 text-left">账号</th>
              <th className="px-4 py-3 text-left">产品</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">开始</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">结束</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">时长</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[90px]">礼物(元)</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[88px]">消耗(元)</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[72px]">激活</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[80px]">激活单价</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[88px]">付费(元)</th>
              <th className="px-4 py-3 text-right whitespace-nowrap min-w-[72px]">ARPU</th>
              <th className="px-6 py-3 text-left whitespace-nowrap min-w-[100px]">状态</th>
              {canForceEnd && <th className="px-4 py-3 text-right whitespace-nowrap">操作</th>}
            </tr>
          </thead>
          <tbody>
            {flat.length === 0 ? (
              <tr>
                <td
                  colSpan={canForceEnd ? 14 : 13}
                  className="px-3 py-6 text-center text-slate-400"
                >
                  暂无记录
                </td>
              </tr>
            ) : (
              flat.map((r) => {
                const badge = statusBadge(r.session);
                const isLive = r.session.status === "in_progress";
                return (
                  <tr
                    key={r.session.session_id}
                    className="border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {r.session.anchor_name}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 truncate max-w-[220px]">
                      {r.account_name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.product}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {fmtTime(r.session.start_at)}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {r.session.end_at ? fmtTime(r.session.end_at) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {fmtDuration(r.session.duration_seconds)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-emerald-700 min-w-[90px]">
                      {fmtYuan(r.session.income_cents)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 min-w-[88px]">
                      {fmtMoney(r.session.cost_yuan)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 min-w-[72px]">
                      {fmtInt(r.session.activations)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 min-w-[80px]">
                      {fmtPrice(r.session.cost_yuan, r.session.activations)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 min-w-[88px]">
                      {fmtMoney(r.session.payment_yuan)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono whitespace-nowrap tabular-nums text-slate-700 min-w-[72px]">
                      {fmtPrice(r.session.payment_yuan, r.session.activations)}
                    </td>
                    <td className="px-6 py-3 min-w-[100px]">
                      <span
                        className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
                      >
                        {badge.text}
                      </span>
                    </td>
                    {canForceEnd && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {isLive && (
                            <button
                              type="button"
                              onClick={() =>
                                setDialog({
                                  sessionId: r.session.session_id,
                                  anchorName: r.session.anchor_name,
                                  accountName: r.account_name,
                                  reason: "",
                                  error: null,
                                })
                              }
                              className="rounded border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50"
                            >
                              强制下播
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setCorrectDialog({
                                sessionId: r.session.session_id,
                                anchorName: r.session.anchor_name,
                                accountName: r.account_name,
                                newAnchorId: "",
                                reason: "",
                                error: null,
                              })
                            }
                            className="rounded border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50"
                          >
                            改主播
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {correctDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !isPending && setCorrectDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-semibold text-slate-800">改主播</div>
            <div className="mb-3 rounded bg-slate-50 p-3 text-[12.5px] text-slate-700">
              当前主播：<span className="font-medium">{correctDialog.anchorName}</span>
              <br />
              账号：<span className="font-medium">{correctDialog.accountName}</span>
              <br />
              <span className="text-[11.5px] text-slate-500">
                适用于扫码失误等场景，会写 audit_log。
              </span>
            </div>
            <label className="mb-1 block text-[12px] text-slate-600">新主播</label>
            <select
              value={correctDialog.newAnchorId}
              onChange={(e) => setCorrectDialog({ ...correctDialog, newAnchorId: e.target.value })}
              disabled={isPending}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">{anchors.length === 0 ? "加载中..." : "请选择"}</option>
              {anchors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <label className="mb-1 block text-[12px] text-slate-600">原因（可选）</label>
            <textarea
              value={correctDialog.reason}
              onChange={(e) => setCorrectDialog({ ...correctDialog, reason: e.target.value })}
              disabled={isPending}
              rows={2}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如：主播扫错码 / 误顶上一场"
            />
            {correctDialog.error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700">
                {correctDialog.error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectDialog(null)}
                disabled={isPending}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCorrect}
                disabled={isPending || !correctDialog.newAnchorId}
                className="rounded bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "提交中..." : "确认修改"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !isPending && setDialog(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 text-sm font-semibold text-slate-800">强制下播</div>
            <div className="mb-3 rounded bg-slate-50 p-3 text-[12.5px] text-slate-700">
              主播：<span className="font-medium">{dialog.anchorName}</span>
              <br />
              账号：<span className="font-medium">{dialog.accountName}</span>
              <br />
              <span className="text-[11.5px] text-slate-500">
                操作不可撤销。结束时间记为当前服务器时间，状态置为
                "正常下播"，closed_by=admin_force。
              </span>
            </div>
            <label className="mb-1 block text-[12px] text-slate-600">原因（可选）</label>
            <textarea
              value={dialog.reason}
              onChange={(e) => setDialog({ ...dialog, reason: e.target.value })}
              disabled={isPending}
              rows={2}
              className="mb-3 w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="如：主播忘扫下播 / 设备故障 / 测试场次"
            />
            {dialog.error && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-[12px] text-red-700">
                {dialog.error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={isPending}
                className="rounded border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={isPending}
                className="rounded bg-red-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "提交中..." : "确认下播"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
