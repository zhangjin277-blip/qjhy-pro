"use client";

import { useState } from "react";
import type { MigrationReport } from "@/modules/live-account";

interface Props {
  report: MigrationReport;
  pro3DbPath: string;
}

type TabKey = "summary" | "pending" | "unmatched";

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-2xl font-bold ${accent ?? "text-slate-800"}`}>{value}</div>
    </div>
  );
}

export function MigrationClient({ report, pro3DbPath }: Props) {
  const [tab, setTab] = useState<TabKey>("summary");

  return (
    <div className="space-y-4">
      {/* 总览 KPI */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="待迁移行数" value={report.totalRows} />
        <Stat label="完全匹配" value={report.anchors.matched.length} accent="text-green-600" />
        <Stat label="待人工确认" value={report.anchors.pending.length} accent="text-amber-600" />
        <Stat
          label="未匹配（钉钉无）"
          value={report.anchors.unmatched.length}
          accent="text-red-600"
        />
      </div>

      {/* 平台分布 */}
      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          平台 / 产品分布
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(report.platformCounts).map(([p, n]) => (
            <span key={p} className="rounded bg-slate-50 px-2 py-1">
              {p} <b className="text-slate-800">{n}</b>
            </span>
          ))}
          <span className="text-slate-300">|</span>
          {Object.entries(report.productCounts).map(([p, n]) => (
            <span key={p} className="rounded bg-slate-50 px-2 py-1 text-xs">
              {p} <b>{n}</b>
            </span>
          ))}
        </div>
      </div>

      {/* tab 切换 */}
      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            { key: "summary", label: "迁移摘要" },
            { key: "pending", label: `待确认 (${report.anchors.pending.length})` },
            { key: "unmatched", label: `未匹配 (${report.anchors.unmatched.length})` },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-3 pb-2 text-[13px] font-medium ${
              tab === t.key ? "border-blue-500 text-blue-600" : "border-transparent text-slate-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {tab === "summary" && (
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 text-sm">
          <div>本次会创建：</div>
          <div className="ml-4 space-y-1 text-slate-600">
            <div>• {report.rooms.created} 个直播间（live_room）</div>
            <div>• {report.accounts.created} 个直播账号（live_account）</div>
            <div>• {report.anchors.matched.length} 个主播自动绑定</div>
            <div>• {report.bindings.created} 个默认排班 binding</div>
          </div>
          <div className="mt-4 rounded-md bg-amber-50 p-3 text-[13px] text-amber-800">
            实际写库请运行 CLI（不在 UI 上执行，避免误操作）：
            <pre className="mt-1 overflow-x-auto rounded bg-amber-100 p-2 text-[11px]">
              {`NODE_OPTIONS="--conditions=react-server" pnpm tsx --env-file=.env.local src/scripts/migrate-pro3-accounts.ts \\
  --pro3-db ${pro3DbPath}`}
            </pre>
          </div>
          {report.errors.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-[13px] text-red-700">
              <div className="mb-1 font-bold">解析错误 ({report.errors.length})</div>
              {report.errors.slice(0, 5).map((e, i) => (
                <div key={i} className="text-[12px]">
                  {e.reason}
                </div>
              ))}
              {report.errors.length > 5 && (
                <div className="text-[12px] text-red-500">…还有 {report.errors.length - 5} 条</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "pending" && (
        <div className="space-y-2">
          {report.anchors.pending.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">无待确认主播</div>
          ) : (
            report.anchors.pending.map((p) => (
              <div
                key={p.pro3_name}
                className="rounded-md border border-amber-200 bg-amber-50/40 p-3"
              >
                <div className="mb-2 text-sm">
                  PRO3 姓名：<b className="text-slate-800">{p.pro3_name}</b>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {p.candidates.map((c) => (
                    <div key={c.user_id} className="rounded bg-white p-2 text-[12px]">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-slate-400">{c.mobile ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "unmatched" && (
        <div className="space-y-1.5">
          {report.anchors.unmatched.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">无未匹配主播</div>
          ) : (
            report.anchors.unmatched.map((name) => (
              <div
                key={name}
                className="flex items-center justify-between rounded border border-red-200 bg-red-50/40 px-3 py-2 text-sm"
              >
                <span>{name}</span>
                <span className="text-xs text-slate-400">钉钉里没有 — 视为离职，跳过</span>
              </div>
            ))
          )}
          <p className="mt-3 text-xs text-slate-400">
            未匹配的主播在迁移时会被跳过（不创建 binding）。这是正常的——已确认是离职主播。
          </p>
        </div>
      )}
    </div>
  );
}
