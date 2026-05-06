import type { SummaryRow } from "@/modules/placement/server";

interface SummaryTableProps {
  rows: SummaryRow[];
}

export function SummaryTable({ rows }: SummaryTableProps) {
  if (rows.length === 0) {
    return <div className="py-16 text-center text-sm text-slate-400">暂无投放数据</div>;
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalActs = rows.reduce((s, r) => s + r.activations, 0);
  const totalPay = rows.reduce((s, r) => s + r.payment, 0);
  const totalSD = rows.reduce((s, r) => s + r.start_download, 0);
  const totalFD = rows.reduce((s, r) => s + r.finish_download, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr className="border-b border-slate-200 bg-secondary">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">投放标签</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">行数</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-blue-700">消耗</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-emerald-700">激活</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-amber-700">单价</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-purple-700">付费</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">开始下载</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">完成下载</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const unitPrice = r.activations > 0 ? r.cost / r.activations : null;
              return (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium">{r.anchor_label ?? "（无标签）"}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.row_count}</td>
                  <td className="px-3 py-2 text-right text-blue-700">
                    ¥{r.cost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">{r.activations}</td>
                  <td className="px-3 py-2 text-right text-amber-700">
                    {unitPrice == null ? "—" : `¥${unitPrice.toFixed(2)}`}
                  </td>
                  <td className="px-3 py-2 text-right text-purple-700">
                    ¥{r.payment.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.start_download}</td>
                  <td className="px-3 py-2 text-right text-slate-500">{r.finish_download}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
              <td className="px-3 py-2 text-xs text-slate-500">合计 ({rows.length})</td>
              <td />
              <td className="px-3 py-2 text-right text-blue-700">
                ¥{totalCost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              </td>
              <td className="px-3 py-2 text-right text-emerald-700">{totalActs}</td>
              <td className="px-3 py-2 text-right text-amber-700">
                {totalActs > 0 ? `¥${(totalCost / totalActs).toFixed(2)}` : "—"}
              </td>
              <td className="px-3 py-2 text-right text-purple-700">
                ¥{totalPay.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
              </td>
              <td className="px-3 py-2 text-right text-slate-500">{totalSD}</td>
              <td className="px-3 py-2 text-right text-slate-500">{totalFD}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
