import { PlatformBadge } from "../../live-accounts/_components/platform-badge";

interface AccountRow {
  account_id: string;
  account_name: string;
  placement_label: string | null;
  platform: string | null;
  cost: string;
  activations: number;
  payment: string;
}

export function AccountTable({ rows }: { rows: AccountRow[] }) {
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-400">暂无投放数据</div>;
  }
  const totalCost = rows.reduce((s, r) => s + Number(r.cost ?? 0), 0);
  const totalActivations = rows.reduce((s, r) => s + Number(r.activations ?? 0), 0);
  const totalPayment = rows.reduce((s, r) => s + Number(r.payment ?? 0), 0);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="border-b border-slate-200 bg-secondary">
            {["账号", "投放标签", "平台", "消耗", "激活", "单价", "付费", "ROI"].map((c) => (
              <th key={c} className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cost = Number(r.cost ?? 0);
            const acts = Number(r.activations ?? 0);
            const pay = Number(r.payment ?? 0);
            const unitPrice = acts > 0 ? cost / acts : null;
            const roi = cost > 0 ? pay / cost : null;
            const roiColor =
              roi == null
                ? ""
                : roi >= 0.5
                  ? "text-green-600"
                  : roi < 0.3
                    ? "text-red-600"
                    : "text-amber-600";
            return (
              <tr key={r.account_id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.account_name}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.placement_label ?? "—"}</td>
                <td className="px-3 py-2">
                  {r.platform && <PlatformBadge platform={r.platform} size="xs" />}
                </td>
                <td className="px-3 py-2 text-right">
                  ¥{cost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-3 py-2 text-right">{acts}</td>
                <td className="px-3 py-2 text-right">
                  {unitPrice == null ? "—" : `¥${unitPrice.toFixed(2)}`}
                </td>
                <td className="px-3 py-2 text-right">
                  ¥{pay.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-3 py-2 text-right font-medium ${roiColor}`}>
                  {roi == null ? "—" : roi.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 bg-slate-50 font-medium">
            <td className="px-3 py-2" colSpan={3}>
              合计 ({rows.length})
            </td>
            <td className="px-3 py-2 text-right">
              ¥{totalCost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
            </td>
            <td className="px-3 py-2 text-right">{totalActivations}</td>
            <td className="px-3 py-2 text-right">
              {totalActivations > 0 ? `¥${(totalCost / totalActivations).toFixed(2)}` : "—"}
            </td>
            <td className="px-3 py-2 text-right">
              ¥{totalPayment.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
            </td>
            <td className="px-3 py-2 text-right">
              {totalCost > 0 ? (totalPayment / totalCost).toFixed(2) : "—"}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
