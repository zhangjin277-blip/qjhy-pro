"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GanttRow, MonthlyProductShare } from "@/modules/editing-task";

interface Props {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  weekOffset: number;
  rows: GanttRow[];
  monthlyShare: MonthlyProductShare[];
}

const DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function enumDates(start: string, end: string): string[] {
  const result: string[] = [];
  const d = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  while (d <= e) {
    result.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return result;
}

export function GanttView({
  weekStart,
  weekEnd,
  weekLabel,
  weekOffset,
  rows,
  monthlyShare,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dates = enumDates(weekStart, weekEnd);

  function toggle(userId: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(userId)) n.delete(userId);
      else n.add(userId);
      return n;
    });
  }

  return (
    <div className="p-4">
      {/* Top toolbar */}
      <div className="mb-4 flex items-center justify-between">
        {/* 视图切换 */}
        <div className="inline-flex rounded-md bg-slate-100 p-0.5">
          <button
            onClick={() => router.push("/editing")}
            className="rounded px-3.5 py-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            看板
          </button>
          <button
            onClick={() => router.push("/editing/table")}
            className="rounded px-3.5 py-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            表格
          </button>
          <button className="rounded bg-white px-3.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm">
            甘特
          </button>
          <button
            onClick={() => router.push("/editing/stats")}
            className="rounded px-3.5 py-1.5 text-sm text-slate-500 hover:text-slate-700"
          >
            统计
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => router.push(`?week=${weekOffset - 1}`)}
            className="rounded p-1 hover:bg-slate-100"
            aria-label="上一周"
          >
            ‹
          </button>
          <span className="font-medium">{weekLabel}</span>
          <button
            onClick={() => router.push(`?week=${weekOffset + 1}`)}
            className="rounded p-1 hover:bg-slate-100"
            aria-label="下一周"
          >
            ›
          </button>
          {weekOffset !== 0 && (
            <button
              onClick={() => router.push("?week=0")}
              className="ml-2 text-blue-600 hover:underline"
            >
              本周
            </button>
          )}
        </div>
      </div>

      {/* 周甘特表格 */}
      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-500">剪辑师</th>
              {dates.map((d, i) => (
                <th key={d} className="px-3 py-3 text-center font-semibold text-slate-500">
                  <div>{d.slice(5).replace("-", "/")}</div>
                  <div className="text-[10px] font-normal">{DAY_LABELS[i]}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-semibold text-slate-500">合计</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={dates.length + 2} className="py-12 text-center text-slate-400">
                  本周暂无完成
                </td>
              </tr>
            ) : (
              rows.flatMap((r) => {
                const isOpen = expanded.has(r.editorUserId);
                const editorRow = (
                  <tr key={r.editorUserId} className="border-t border-border hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggle(r.editorUserId)}
                        className="inline-flex items-center gap-1 font-medium hover:text-blue-600"
                      >
                        <span
                          className={`text-[10px] transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
                        >
                          ▼
                        </span>
                        <span>{r.editorName}</span>
                      </button>
                    </td>
                    {dates.map((d) => {
                      const cell = r.daily.find((x) => x.date === d);
                      return (
                        <td key={d} className="px-3 py-3 text-center">
                          {cell && cell.count > 0 ? (
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-green-100 text-xs font-semibold text-green-700">
                              {cell.count}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{r.total}</td>
                  </tr>
                );

                if (!isOpen) return [editorRow];

                const productRows = r.products.map((p) => (
                  <tr
                    key={`${r.editorUserId}-${p.product}`}
                    className="border-t border-border/50 bg-slate-50/40 text-xs"
                  >
                    <td className="py-2 pl-12 pr-4 text-slate-500">
                      <span className="mr-1 text-slate-400">└</span>
                      {p.product}
                    </td>
                    {dates.map((d) => {
                      const cell = p.daily.find((x) => x.date === d);
                      return (
                        <td key={d} className="px-3 py-2 text-center">
                          {cell && cell.count > 0 ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-[11px] text-blue-600">
                              {cell.count}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right text-slate-500">{p.total}</td>
                  </tr>
                ));

                return [editorRow, ...productRows];
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 月度产品占比 */}
      <div className="mt-8">
        <h2 className="mb-3 text-base font-semibold">本月产品占比</h2>
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">剪辑师</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">本月总数</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-500">产品分布</th>
              </tr>
            </thead>
            <tbody>
              {monthlyShare.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-slate-400">
                    本月暂无数据
                  </td>
                </tr>
              ) : (
                monthlyShare.map((s) => (
                  <tr key={s.editorUserId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{s.editorName}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{s.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {s.byProduct.map((p) => (
                          <span
                            key={p.product}
                            className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                            title={`${p.count} 条`}
                          >
                            {p.product} {(p.share * 100).toFixed(0)}%
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
