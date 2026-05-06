interface HourCell {
  account_id: string;
  account_name: string;
  hour: number;
  cost: string;
  activations: number;
  payment: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function colorFor(value: number, max: number): string {
  if (value <= 0) return "bg-slate-50 text-slate-300";
  const r = value / max;
  if (r > 0.66) return "bg-blue-700 text-white";
  if (r > 0.33) return "bg-blue-400 text-white";
  if (r > 0.1) return "bg-blue-200 text-blue-900";
  return "bg-blue-50 text-blue-700";
}

export function HourMatrix({ cells }: { cells: HourCell[] }) {
  // 聚合 by (account_id, hour)
  const byAccount = new Map<string, { name: string; cells: Map<number, HourCell> }>();
  for (const c of cells) {
    if (!byAccount.has(c.account_id)) {
      byAccount.set(c.account_id, { name: c.account_name, cells: new Map() });
    }
    byAccount.get(c.account_id)?.cells.set(c.hour, c);
  }

  // 找最大值（用于颜色梯度）
  const maxCost = Math.max(0, ...cells.map((c) => Number(c.cost ?? 0)));

  const accounts = [...byAccount.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name));

  if (accounts.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-400">暂无投放数据</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="border-b border-slate-200 bg-secondary">
            <th className="sticky left-0 z-10 bg-secondary px-3 py-2 text-left text-slate-500">
              账号
            </th>
            {HOURS.map((h) => (
              <th key={h} className="w-12 px-1 py-2 text-center text-[11px] text-slate-500">
                {h.toString().padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map(([accId, info]) => (
            <tr key={accId} className="border-b border-slate-100">
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 font-medium">
                {info.name}
              </td>
              {HOURS.map((h) => {
                const cell = info.cells.get(h);
                const cost = Number(cell?.cost ?? 0);
                const cls = colorFor(cost, maxCost);
                const display =
                  cost <= 0
                    ? "—"
                    : cost >= 1000
                      ? `¥${(cost / 1000).toFixed(0)}k`
                      : `¥${cost.toFixed(0)}`;
                const tip = cell
                  ? `${info.name} | ${h}:00 | 消耗 ¥${cost.toFixed(2)} | 激活 ${cell.activations}`
                  : "";
                return (
                  <td
                    key={h}
                    className={`w-12 px-1 py-1.5 text-center text-[10.5px] ${cls}`}
                    title={tip}
                  >
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
