interface AnchorRow {
  user_id: string | null;
  anchor_name: string | null;
  business_line: string | null;
  source: string | null;
  cost: string;
  activations: number;
  payment: string;
  account_count: number;
}

export function AnchorTable({ rows }: { rows: AnchorRow[] }) {
  // 按 user_id 聚合（一个主播可能跨多 source）
  const byUser = new Map<
    string,
    AnchorRow & { totalCost: number; totalActs: number; totalPay: number }
  >();
  const conflictRow = { totalCost: 0, totalActs: 0, totalPay: 0, accountCount: 0 };
  const unmatchedRow = { totalCost: 0, totalActs: 0, totalPay: 0, accountCount: 0 };

  for (const r of rows) {
    const cost = Number(r.cost ?? 0);
    const acts = Number(r.activations ?? 0);
    const pay = Number(r.payment ?? 0);
    if (r.source === "conflict") {
      conflictRow.totalCost += cost;
      conflictRow.totalActs += acts;
      conflictRow.totalPay += pay;
      continue;
    }
    if (r.source === "unmatched" || !r.user_id) {
      unmatchedRow.totalCost += cost;
      unmatchedRow.totalActs += acts;
      unmatchedRow.totalPay += pay;
      continue;
    }
    if (!byUser.has(r.user_id)) {
      byUser.set(r.user_id, { ...r, totalCost: 0, totalActs: 0, totalPay: 0 });
    }
    const agg = byUser.get(r.user_id);
    if (agg) {
      agg.totalCost += cost;
      agg.totalActs += acts;
      agg.totalPay += pay;
    }
  }

  const sorted = [...byUser.values()].sort((a, b) => b.totalCost - a.totalCost);

  if (sorted.length === 0 && conflictRow.totalCost === 0 && unmatchedRow.totalCost === 0) {
    return <div className="py-12 text-center text-sm text-slate-400">暂无投放数据</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="border-b border-slate-200 bg-secondary">
            {["主播", "业务线", "归因消耗", "激活", "付费", "ROI", "覆盖账号"].map((c) => (
              <th key={c} className="px-3 py-2 text-left text-xs font-medium text-slate-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const roi = r.totalCost > 0 ? r.totalPay / r.totalCost : null;
            return (
              <tr key={r.user_id ?? ""} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{r.anchor_name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{r.business_line ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  ¥{r.totalCost.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-3 py-2 text-right">{r.totalActs}</td>
                <td className="px-3 py-2 text-right">
                  ¥{r.totalPay.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}
                </td>
                <td className="px-3 py-2 text-right">{roi == null ? "—" : roi.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">{r.account_count}</td>
              </tr>
            );
          })}
          {conflictRow.totalCost > 0 && (
            <tr className="border-t-2 border-amber-300 bg-amber-50">
              <td className="px-3 py-2 font-medium text-amber-900" colSpan={2}>
                ⚠ 冲突未归因（轮播排班重叠）
              </td>
              <td className="px-3 py-2 text-right">
                ¥{conflictRow.totalCost.toLocaleString("zh-CN")}
              </td>
              <td className="px-3 py-2 text-right">{conflictRow.totalActs}</td>
              <td className="px-3 py-2 text-right">
                ¥{conflictRow.totalPay.toLocaleString("zh-CN")}
              </td>
              <td colSpan={2}></td>
            </tr>
          )}
          {unmatchedRow.totalCost > 0 && (
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-3 py-2 font-medium text-slate-700" colSpan={2}>
                未匹配（无人排班）
              </td>
              <td className="px-3 py-2 text-right">
                ¥{unmatchedRow.totalCost.toLocaleString("zh-CN")}
              </td>
              <td className="px-3 py-2 text-right">{unmatchedRow.totalActs}</td>
              <td className="px-3 py-2 text-right">
                ¥{unmatchedRow.totalPay.toLocaleString("zh-CN")}
              </td>
              <td colSpan={2}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
