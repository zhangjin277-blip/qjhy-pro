"use client";

import { useEffect, useState } from "react";
import type { CheckinState } from "@/modules/checkin/server";

interface Props {
  initialState: CheckinState;
  liveAccountId: string;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CheckinClient({ initialState, liveAccountId }: Props): React.JSX.Element {
  const [state, setState] = useState<CheckinState>(initialState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // 每秒更新累计时长
  useEffect(() => {
    if (!state.current) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
    // 只依赖 state.current 是否存在；state.current 的内层属性不影响 interval 行为
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current]);

  // 每 5 秒拉一次最新状态（接班时 A 的页面尽快感知到被关）
  useEffect(() => {
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
    // refresh 不会变（同一组件实例），不放 deps 避免重复 interval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveAccountId]);

  async function refresh(): Promise<void> {
    try {
      const res = await fetch(`/api/checkin/${liveAccountId}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as CheckinState;
        setState(data);
      }
    } catch {
      // ignore
    }
  }

  async function handleStart(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/${liveAccountId}/start`, { method: "POST" });
      const body = (await res.json()) as {
        error?: string;
        closed_previous?: { previous_anchor_name: string };
      };
      if (!res.ok) {
        const msg = body.error ?? "开播失败";
        if (msg === "NOT_AN_ANCHOR") setError("你不在主播部门，无权打卡");
        else if (msg === "ALREADY_LIVE") setError("你已经在播这个账号");
        else if (msg === "EMERGENCY_NOT_ALLOWED") setError("应急账号不能打卡");
        else setError(msg);
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd(): Promise<void> {
    if (!state.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/${liveAccountId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: state.current.session_id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "下播失败");
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "网络错误");
    } finally {
      setBusy(false);
    }
  }

  const isKuaishou = state.account.platform.includes("快手");
  const platformBg = isKuaishou
    ? "bg-gradient-to-br from-[#ffedd5] to-[#ff7d00]"
    : "bg-gradient-to-br from-[#d1e9ff] to-[#1677ff]";
  const liveDur = state.current
    ? Math.floor((now - new Date(state.current.start_at).getTime()) / 1000)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 max-w-md mx-auto">
      {/* 账号卡 */}
      <div className="rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          {state.account.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.account.avatar}
              alt={state.account.account_name}
              className="h-14 w-14 rounded-full object-cover ring-1 ring-slate-200"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full text-white text-[15px] font-semibold ${platformBg}`}
            >
              {(state.account.placement_label ?? state.account.account_name).slice(0, 2)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-semibold text-slate-900 truncate">
              {state.account.placement_label ?? state.account.account_name}
            </div>
            <div className="mt-1 flex items-center gap-2 text-[12px] text-slate-500">
              <span
                className={`rounded px-1.5 py-px text-[10.5px] font-medium ${
                  isKuaishou ? "bg-[#fffbe6] text-[#d48806]" : "bg-[#e6f4ff] text-[#1677ff]"
                }`}
              >
                {state.account.platform}
              </span>
              {state.account.platform_account_id && (
                <span className="tabular-nums">{state.account.platform_account_id}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 状态 + 按钮 */}
      <div className="mt-4 rounded-xl bg-white p-5 shadow-sm border border-slate-100">
        {state.current ? (
          <CurrentBlock
            current={state.current}
            liveDur={liveDur}
            onEnd={handleEnd}
            onTakeover={handleStart}
            busy={busy}
          />
        ) : (
          <IdleBlock onStart={handleStart} busy={busy} />
        )}
        {error && (
          <div className="mt-3 rounded-md border border-[#ffd6d6] bg-[#fff2f2] px-3 py-2 text-[13px] text-[#f53f3f]">
            {error}
          </div>
        )}
      </div>

      {/* 最近打卡 */}
      <div className="mt-4 rounded-xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-[14px] font-semibold text-slate-900">最近打卡</h3>
          <span className="text-[11px] text-slate-400">{state.recent.length} 条</span>
        </div>
        {state.recent.length === 0 ? (
          <div className="py-4 text-center text-[12px] text-slate-400">暂无记录</div>
        ) : (
          <ul className="space-y-2">
            {state.recent.map((r) => (
              <li key={r.session_id} className="flex items-center gap-3 text-[12.5px]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10.5px] font-medium text-slate-600">
                  {r.anchor_name.slice(0, 1)}
                </span>
                <span className="flex-1 min-w-0 truncate text-slate-900">{r.anchor_name}</span>
                <span className="text-slate-500 tabular-nums">
                  {fmtTime(r.start_at)} → {r.end_at ? fmtTime(r.end_at) : "—"}
                </span>
                <span className="text-slate-400 text-[11px] tabular-nums w-16 text-right">
                  {r.duration_seconds != null ? fmtDuration(r.duration_seconds) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 text-center text-[11px] text-slate-400">QJHY-Pro · 主播打卡 v1</div>
    </div>
  );
}

function IdleBlock({ onStart, busy }: { onStart: () => void; busy: boolean }): React.JSX.Element {
  return (
    <div>
      <div className="text-center">
        <div className="text-[13px] text-slate-500 mb-1">当前状态</div>
        <div className="text-[18px] font-semibold text-slate-900">未开播</div>
      </div>
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="mt-4 w-full rounded-lg bg-[#1677ff] py-3 text-[15px] font-semibold text-white active:bg-[#1252c9] disabled:opacity-50"
      >
        {busy ? "处理中…" : "我要开播"}
      </button>
    </div>
  );
}

function CurrentBlock({
  current,
  liveDur,
  onEnd,
  onTakeover,
  busy,
}: {
  current: NonNullable<CheckinState["current"]>;
  liveDur: number;
  onEnd: () => void;
  onTakeover: () => void;
  busy: boolean;
}): React.JSX.Element {
  // 是不是当前用户自己 — 客户端不知道 dingtalk_user_id，统一交给后端判断；
  // 这里两个按钮都显示，后端 NOT_YOUR_SESSION 错误时再提示
  return (
    <div>
      <div className="text-center">
        <div className="text-[13px] text-slate-500 mb-1">当前在播</div>
        <div className="text-[18px] font-semibold text-slate-900">{current.anchor_name}</div>
        <div className="mt-2 text-[28px] font-mono font-semibold tabular-nums text-[#1677ff]">
          {fmtDuration(liveDur)}
        </div>
        <div className="mt-1 text-[11.5px] text-slate-400">开播 {fmtDate(current.start_at)}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onEnd}
          disabled={busy}
          className="rounded-lg bg-[#f53f3f] py-3 text-[14px] font-semibold text-white active:bg-[#c52a2a] disabled:opacity-50"
        >
          {busy ? "处理中…" : "下播"}
        </button>
        <button
          type="button"
          onClick={onTakeover}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white py-3 text-[14px] font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {busy ? "处理中…" : "我来接班"}
        </button>
      </div>
      <div className="mt-3 text-center text-[11px] text-slate-400">
        下播：当前主播自己点；接班：换我开播
      </div>
    </div>
  );
}
