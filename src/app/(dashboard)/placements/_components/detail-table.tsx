import type { DetailRow } from "@/modules/placement/server";

const DS_LABEL: Record<string, string> = {
  product_buyu: "捕鱼",
  product_ue4: "UE4",
  product_urp: "URP",
};

const SOURCE_LABEL: Record<string, string> = {
  override: "手动",
  default: "排班",
  conflict: "冲突",
  unmatched: "未匹配",
};

interface DetailTableProps {
  rows: DetailRow[];
}

export function DetailTable({ rows }: DetailTableProps) {
  if (rows.length === 0) {
    return <div className="py-16 text-center text-sm text-slate-400">暂无投放数据</div>;
  }

  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalActs = rows.reduce((s, r) => s + r.activations, 0);
  const totalPay = rows.reduce((s, r) => s + r.payment, 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        共 {rows.length} 条（限 500 条）
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr className="border-b border-slate-200 bg-secondary">
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">日期</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">时段</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">产品</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">账号</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">投放标签</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-blue-700">消耗</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-emerald-700">激活</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-amber-700">单价</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-purple-700">付费</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">归因</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const unitPrice = r.activations > 0 ? r.cost / r.activations : null;
              return (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-xs">{r.date}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.hour}:00</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {DS_LABEL[r.dataset_id] ?? r.dataset_id}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-medium">{r.account_name}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.anchor_label ?? "—"}</td>
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
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {r.attribution_source
                      ? (SOURCE_LABEL[r.attribution_source] ?? r.attribution_source)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
              <td className="px-3 py-2 text-xs text-slate-500" colSpan={5}>
                合计
              </td>
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
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
