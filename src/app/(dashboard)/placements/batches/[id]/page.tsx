import { getBatchDetail, getBatchRows } from "@/modules/placement/server";
import { notFound } from "next/navigation";

function fmt(n: number): string {
  if (Math.abs(n) >= 1e6) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export default async function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await getBatchDetail(id);
  if (!batch) notFound();
  const rows = await getBatchRows(id);
  const totals = rows.reduce(
    (acc, r) => {
      acc.cost += Number(r.cost_yuan) || 0;
      acc.act += r.activations;
      acc.pay += Number(r.payment_yuan) || 0;
      return acc;
    },
    { cost: 0, act: 0, pay: 0 },
  );

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">批次详情：{batch.file_name}</h1>

      <dl className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-white p-4 text-sm">
        <dt className="text-slate-500">来源</dt>
        <dd>{batch.source}</dd>
        <dt className="text-slate-500">产品</dt>
        <dd>{batch.dataset_id}</dd>
        <dt className="text-slate-500">日期范围</dt>
        <dd>
          {batch.date_range_from} ~ {batch.date_range_to}
        </dd>
        <dt className="text-slate-500">行数</dt>
        <dd>
          总 {batch.row_count} / 新增 {batch.rows_inserted} / 更新 {batch.rows_updated} / 跳过{" "}
          {batch.rows_skipped}
        </dd>
        <dt className="text-slate-500">状态</dt>
        <dd>{batch.status}</dd>
        <dt className="text-slate-500">上传时间</dt>
        <dd>{new Date(batch.uploaded_at).toLocaleString("zh-CN")}</dd>
      </dl>

      {/* 行明细 */}
      <div className="rounded border border-slate-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-800">
            行明细{" "}
            <span className="text-[11px] font-normal text-slate-400">
              · {rows.length} 条累计快照
            </span>
          </h2>
          <span className="text-[11.5px] text-slate-500 tabular-nums">
            合计：消耗 {fmt(totals.cost)} / 激活 {totals.act} / 付费 {fmt(totals.pay)}
          </span>
        </div>
        {rows.length === 0 ? (
          <div className="py-6 text-center text-[12.5px] text-slate-400">
            这个批次没有累计快照行（可能是老格式或解析失败）
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] min-w-[700px]">
              <thead className="bg-slate-50 text-[10.5px] font-medium text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">投放标签</th>
                  <th className="px-3 py-2 text-left">账号名</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">日期</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">小时</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">消耗 (元)</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">激活</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">付费 (元)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-1.5">
                      <span className="inline-flex rounded bg-purple-50 px-1.5 text-[11px] text-purple-700">
                        {r.placement_label ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{r.account_name}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-700 tabular-nums">{r.date}</td>
                    <td className="px-3 py-1.5 font-mono text-slate-700 tabular-nums">
                      {String(r.hour).padStart(2, "0")}:00
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmt(Number(r.cost_yuan))}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.activations}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmt(Number(r.payment_yuan))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {batch.error_log && batch.error_log.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-4">
          <h2 className="font-medium text-red-900 mb-2">错误明细 ({batch.error_log.length})</h2>
          <ul className="space-y-1 text-sm">
            {batch.error_log.map((e, i) => (
              <li key={i} className="text-red-700">
                {e.reason}
                {e.row !== undefined && (
                  <span className="ml-2 text-xs text-red-500 font-mono">
                    {JSON.stringify(e.row).slice(0, 200)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
