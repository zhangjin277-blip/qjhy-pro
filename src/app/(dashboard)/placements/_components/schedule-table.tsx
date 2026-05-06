import type { ScheduleRow } from "@/modules/placement/server";

interface ScheduleTableProps {
  rows: ScheduleRow[];
}

function fmt(n: number) {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return `¥${n.toFixed(2)}`;
}

export function ScheduleTable({ rows }: ScheduleTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
        <div className="text-sm text-slate-400">暂无主播-投放排班数据</div>
        <div className="mt-1 text-xs text-slate-300">需先在「主播管理」配置账号-主播默认排班</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            {/* Row 1: grouped headers */}
            <tr className="border-b border-slate-100 bg-secondary">
              <th
                rowSpan={2}
                className="border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500"
              >
                日期
              </th>
              <th
                rowSpan={2}
                className="border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500"
              >
                时间段
              </th>
              <th
                rowSpan={2}
                className="border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500"
              >
                账号
              </th>
              <th
                rowSpan={2}
                className="border-r border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-500"
              >
                当班主播
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-slate-200 bg-blue-50/40 px-3 py-1.5 text-center text-xs font-medium text-blue-700"
              >
                消耗
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-slate-200 bg-emerald-50/40 px-3 py-1.5 text-center text-xs font-medium text-emerald-700"
              >
                激活数
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-slate-200 bg-amber-50/40 px-3 py-1.5 text-center text-xs font-medium text-amber-700"
              >
                单价
              </th>
              <th
                colSpan={2}
                className="border-b border-slate-200 bg-purple-50/40 px-3 py-1.5 text-center text-xs font-medium text-purple-700"
              >
                付费
              </th>
            </tr>
            {/* Row 2: 总/个人 sub-headers */}
            <tr className="border-b border-slate-200 bg-secondary">
              <th className="bg-blue-50/30 px-3 py-1.5 text-center text-xs font-medium text-blue-600">
                总
              </th>
              <th className="border-r border-slate-200 bg-blue-50/30 px-3 py-1.5 text-center text-xs font-medium text-blue-400">
                个人
              </th>
              <th className="bg-emerald-50/30 px-3 py-1.5 text-center text-xs font-medium text-emerald-600">
                总
              </th>
              <th className="border-r border-slate-200 bg-emerald-50/30 px-3 py-1.5 text-center text-xs font-medium text-emerald-400">
                个人
              </th>
              <th className="bg-amber-50/30 px-3 py-1.5 text-center text-xs font-medium text-amber-600">
                总
              </th>
              <th className="border-r border-slate-200 bg-amber-50/30 px-3 py-1.5 text-center text-xs font-medium text-amber-400">
                个人
              </th>
              <th className="bg-purple-50/30 px-3 py-1.5 text-center text-xs font-medium text-purple-600">
                总
              </th>
              <th className="bg-purple-50/30 px-3 py-1.5 text-center text-xs font-medium text-purple-400">
                个人
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="border-r border-slate-100 px-3 py-2 text-xs text-slate-600">
                  {r.date}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-xs font-mono text-slate-600">
                  {r.time_slot[0]}–{r.time_slot[1]}
                </td>
                <td className="border-r border-slate-100 px-3 py-2">
                  <div className="text-xs font-medium">{r.account_name}</div>
                  {r.placement_label && (
                    <div className="text-[11px] text-slate-400">{r.placement_label}</div>
                  )}
                </td>
                <td className="border-r border-slate-100 px-3 py-2 text-xs font-medium">
                  {r.anchor_name ?? r.anchor_user_id}
                </td>
                {/* 消耗 */}
                <td className="bg-blue-50/20 px-3 py-2 text-right text-blue-700">
                  ¥{fmt(r.total_cost)}
                </td>
                <td className="border-r border-slate-100 bg-blue-50/10 px-3 py-2 text-right text-sm text-blue-400">
                  ¥{fmt(r.personal_cost)}
                </td>
                {/* 激活 */}
                <td className="bg-emerald-50/20 px-3 py-2 text-right text-emerald-700">
                  {fmt(r.total_acts)}
                </td>
                <td className="border-r border-slate-100 bg-emerald-50/10 px-3 py-2 text-right text-sm text-emerald-400">
                  {fmt(r.personal_acts)}
                </td>
                {/* 单价 */}
                <td className="bg-amber-50/20 px-3 py-2 text-right text-amber-700">
                  {fmtPrice(r.total_unit_price)}
                </td>
                <td className="border-r border-slate-100 bg-amber-50/10 px-3 py-2 text-right text-sm text-amber-400">
                  {fmtPrice(r.personal_unit_price)}
                </td>
                {/* 付费 */}
                <td className="bg-purple-50/20 px-3 py-2 text-right text-purple-700">
                  ¥{fmt(r.total_payment)}
                </td>
                <td className="bg-purple-50/10 px-3 py-2 text-right text-sm text-purple-400">
                  ¥{fmt(r.personal_payment)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400">
        共 {rows.length} 条排班-投放记录 · TODO: 累计模式 / schedule_override 合并
      </div>
    </div>
  );
}
