import { Fragment } from "react";
import type { ScheduleRow } from "@/modules/placement/server";

interface ScheduleTableProps {
  rows: ScheduleRow[];
}

function fmtChinese(n: number): string {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2).replace(/\.?0+$/, "") + "亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtMoney(n: number): string {
  if (Math.abs(n) >= 1e4) return "¥" + (n / 1e4).toFixed(2).replace(/\.?0+$/, "") + "万";
  return "¥" + n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  return "¥" + n.toFixed(0);
}

function avatarChar(s: string): string {
  return s.length <= 2 ? s : s.slice(0, 2);
}

function parseHour(t: string): number {
  return parseInt(t.split(":")[0] ?? "0", 10);
}

function isOvernight(slot: [string, string]): boolean {
  const [s, e] = slot;
  const sh = parseHour(s);
  const eh = parseHour(e);
  return eh > 24 || eh < sh;
}

function fmtSlot(slot: [string, string]): string {
  // 把 21:00 — 27:00 显示成 21 — 03（凌晨）
  const [s, e] = slot;
  const sh = parseHour(s);
  const eh = parseHour(e);
  const displayE = eh > 24 ? eh - 24 : eh;
  const sm = s.split(":")[1] ?? "00";
  const em = e.split(":")[1] ?? "00";
  const sStr = sm === "00" ? `${sh.toString().padStart(2, "0")}` : s;
  const eStr =
    em === "00"
      ? `${displayE.toString().padStart(2, "0")}`
      : `${displayE.toString().padStart(2, "0")}:${em}`;
  return `${sStr} — ${eStr}`;
}

function sharePct(personal: number, total: number): string | null {
  if (total === 0) return null;
  const p = (personal / total) * 100;
  return p.toFixed(0);
}

function shareClass(pct: number): string {
  if (pct >= 50) return "text-[var(--change-down)]";
  if (pct >= 30) return "text-[#ff7d00]";
  return "text-muted-foreground/70";
}

interface Group {
  date: string;
  accountId: string;
  accountName: string;
  placementLabel: string | null;
  rows: ScheduleRow[];
  totalCost: number;
  totalActs: number;
  totalPayment: number;
  totalUnitPrice: number | null;
}

function groupRows(rows: ScheduleRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.date}::${r.account_id}`;
    let g = map.get(key);
    if (!g) {
      g = {
        date: r.date,
        accountId: r.account_id,
        accountName: r.account_name,
        placementLabel: r.placement_label,
        rows: [],
        totalCost: 0,
        totalActs: 0,
        totalPayment: 0,
        totalUnitPrice: null,
      };
      map.set(key, g);
    }
    g.rows.push(r);
  }
  // 计算每个 group 的当日累计（取该 account_id 在该 date 任一行的 total_*，因为 total_* 已经是该账号的整体）
  // 但注意：querySchedule 里 total 是该 slot 内的总，而不是当日总。需用各 slot total 求和? 实际上每个 slot 的 total_cost 是该时段内所有归属 cost 的和，多个 slot 可能时段重叠—— 默认排班一般不重叠
  for (const g of map.values()) {
    g.totalCost = g.rows.reduce((s, r) => s + r.total_cost, 0);
    g.totalActs = g.rows.reduce((s, r) => s + r.total_acts, 0);
    g.totalPayment = g.rows.reduce((s, r) => s + r.total_payment, 0);
    g.totalUnitPrice = g.totalActs > 0 ? g.totalCost / g.totalActs : null;
    g.rows.sort((a, b) => a.time_slot[0].localeCompare(b.time_slot[0]));
  }
  return [...map.values()].sort((a, b) => {
    if (a.date > b.date) return -1;
    if (a.date < b.date) return 1;
    return b.totalCost - a.totalCost;
  });
}

export function ScheduleTable({ rows }: ScheduleTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-white p-12 text-center">
        <div className="text-sm text-muted-foreground/70">暂无主播-投放排班数据</div>
        <div className="mt-1 text-xs text-muted-foreground/40">
          需先在「主播管理」配置账号-主播默认排班
        </div>
      </div>
    );
  }

  const groups = groupRows(rows);

  // footer 合计
  const grandTotalCost = groups.reduce((s, g) => s + g.totalCost, 0);
  const grandTotalActs = groups.reduce((s, g) => s + g.totalActs, 0);
  const grandTotalPay = groups.reduce((s, g) => s + g.totalPayment, 0);
  const allRowsCount = rows.length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-muted/40/60 px-4 py-3 text-xs text-muted-foreground">
        <div>
          <span className="font-medium text-foreground/90">{allRowsCount} 班次</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          <span>{groups.length} (账号 × 日期) 组合</span>
          <span className="mx-2 text-muted-foreground/40">·</span>
          <span className="text-muted-foreground/70">同主播多包按账号汇总</span>
        </div>
        <div className="flex gap-4 text-[11px] text-muted-foreground/70">
          <span>
            <b className="font-medium text-primary">个人</b> = 该时段当班主播实际增量
          </span>
          <span>
            <b className="font-medium text-muted-foreground">累计</b> = 该投放账号当日总数
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr className="bg-muted/40">
              <th
                rowSpan={2}
                className="border-b border-r border-border px-3 py-2 text-left text-[11.5px] font-medium text-muted-foreground"
                style={{ minWidth: 110 }}
              >
                排班时段
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border px-3 py-2 text-left text-[11.5px] font-medium text-muted-foreground"
                style={{ minWidth: 130 }}
              >
                当班主播
              </th>
              <th
                rowSpan={2}
                className="border-b border-r border-border px-3 py-2 text-left text-[11.5px] font-medium text-muted-foreground"
              >
                投放账号
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-border px-3 py-1.5 text-center text-[11.5px] font-medium text-muted-foreground"
              >
                消耗
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-border px-3 py-1.5 text-center text-[11.5px] font-medium text-muted-foreground"
              >
                激活
              </th>
              <th
                colSpan={2}
                className="border-b border-r border-border px-3 py-1.5 text-center text-[11.5px] font-medium text-muted-foreground"
              >
                CPA
              </th>
              <th
                colSpan={2}
                className="border-b border-border px-3 py-1.5 text-center text-[11.5px] font-medium text-muted-foreground"
              >
                付费
              </th>
            </tr>
            <tr className="bg-muted/40">
              <th className="border-b border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-primary">
                个人
              </th>
              <th className="border-b border-r border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground">
                累计
              </th>
              <th className="border-b border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-primary">
                个人
              </th>
              <th className="border-b border-r border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground">
                累计
              </th>
              <th className="border-b border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-primary">
                个人
              </th>
              <th className="border-b border-r border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground">
                累计
              </th>
              <th className="border-b border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-primary">
                个人
              </th>
              <th className="border-b border-border px-3 py-1.5 text-left text-[10.5px] font-medium text-muted-foreground">
                累计
              </th>
            </tr>
          </thead>

          <tbody>
            {groups.map((g) => {
              const summaryUnit = g.totalUnitPrice;
              return (
                <Fragment key={`${g.date}::${g.accountId}`}>
                  {/* 主播-账号 summary 行 */}
                  <tr className="bg-primary/[0.06]">
                    <td
                      colSpan={3}
                      className="border-b border-primary/20 px-3 py-2 text-[13px] font-semibold text-primary"
                    >
                      ▼ {g.placementLabel ?? "（无标签）"}
                      <span className="ml-2 text-[11.5px] font-normal text-muted-foreground">
                        {g.accountName}
                      </span>
                      <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {g.rows.length} 班次 · {g.date}
                      </span>
                    </td>
                    <td className="border-b border-primary/20 px-3 py-2 text-[13px] font-semibold text-primary">
                      {fmtMoney(g.totalCost)}
                    </td>
                    <td className="border-b border-r border-primary/20 px-3 py-2 text-[13px] text-muted-foreground">
                      {fmtMoney(g.totalCost)}
                    </td>
                    <td className="border-b border-primary/20 px-3 py-2 text-[13px] font-semibold text-primary">
                      {fmtChinese(g.totalActs)}
                    </td>
                    <td className="border-b border-r border-primary/20 px-3 py-2 text-[13px] text-muted-foreground">
                      {fmtChinese(g.totalActs)}
                    </td>
                    <td className="border-b border-primary/20 px-3 py-2 text-[13px] font-semibold text-primary">
                      {fmtPrice(summaryUnit)}
                    </td>
                    <td className="border-b border-r border-primary/20 px-3 py-2 text-[13px] text-muted-foreground">
                      {fmtPrice(summaryUnit)}
                    </td>
                    <td className="border-b border-primary/20 px-3 py-2 text-[13px] font-semibold text-primary">
                      {fmtMoney(g.totalPayment)}
                    </td>
                    <td className="border-b border-primary/20 px-3 py-2 text-[13px] text-muted-foreground">
                      {fmtMoney(g.totalPayment)}
                    </td>
                  </tr>

                  {/* 班次行 */}
                  {g.rows.map((r, i) => {
                    const overnight = isOvernight(r.time_slot);
                    const costShare = sharePct(r.personal_cost, r.total_cost);
                    const actsShare = sharePct(r.personal_acts, r.total_acts);
                    const paymentShare = sharePct(r.personal_payment, r.total_payment);
                    return (
                      <tr
                        key={`${g.date}-${g.accountId}-${i}`}
                        className="border-b border-border/50 transition-colors hover:bg-[var(--hover-bg)]"
                      >
                        <td className="border-r border-border/50 px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[12.5px] font-semibold ${
                              overnight ? "bg-accent text-primary" : "bg-muted text-foreground/90"
                            }`}
                          >
                            {fmtSlot(r.time_slot)}
                            {overnight && (
                              <span className="rounded bg-primary px-1 py-px text-[9px] font-medium text-white">
                                跨夜
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="border-r border-border/50 px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#d1e9ff] to-[#1677ff] text-[10px] font-semibold text-white">
                              {avatarChar(r.anchor_name ?? r.anchor_user_id)}
                            </div>
                            <div className="leading-tight">
                              <div className="text-[12.5px] font-semibold text-foreground">
                                {r.anchor_name ?? r.anchor_user_id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="border-r border-border/50 px-3 py-2.5 text-[12.5px] text-muted-foreground">
                          <span className="font-mono">{r.account_name}</span>
                        </td>
                        {/* 消耗 */}
                        <td className="px-3 py-2.5 text-[13px] font-semibold text-primary">
                          {fmtMoney(r.personal_cost)}
                          {costShare && (
                            <span className={`ml-1 text-[10px] ${shareClass(parseInt(costShare))}`}>
                              {costShare}%
                            </span>
                          )}
                        </td>
                        <td className="border-r border-border/50 px-3 py-2.5 text-[13px] text-muted-foreground">
                          {fmtMoney(r.total_cost)}
                        </td>
                        {/* 激活 */}
                        <td className="px-3 py-2.5 text-[13px] font-semibold text-primary">
                          {fmtChinese(r.personal_acts)}
                          {actsShare && (
                            <span className={`ml-1 text-[10px] ${shareClass(parseInt(actsShare))}`}>
                              {actsShare}%
                            </span>
                          )}
                        </td>
                        <td className="border-r border-border/50 px-3 py-2.5 text-[13px] text-muted-foreground">
                          {fmtChinese(r.total_acts)}
                        </td>
                        {/* CPA */}
                        <td className="px-3 py-2.5 text-[13px] font-semibold text-primary">
                          {fmtPrice(r.personal_unit_price)}
                        </td>
                        <td className="border-r border-border/50 px-3 py-2.5 text-[13px] text-muted-foreground">
                          {fmtPrice(r.total_unit_price)}
                        </td>
                        {/* 付费 */}
                        <td className="px-3 py-2.5 text-[13px] font-semibold text-primary">
                          {fmtMoney(r.personal_payment)}
                          {paymentShare && (
                            <span
                              className={`ml-1 text-[10px] ${shareClass(parseInt(paymentShare))}`}
                            >
                              {paymentShare}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-muted-foreground">
                          {fmtMoney(r.total_payment)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>

          <tfoot>
            <tr className="bg-muted">
              <td colSpan={3} className="px-3 py-2.5 text-[12px] font-medium text-muted-foreground">
                合计 · {allRowsCount} 班次 · {groups.length} 组合
              </td>
              <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtMoney(grandTotalCost)}
              </td>
              <td className="border-r border-border px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtMoney(grandTotalCost)}
              </td>
              <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtChinese(grandTotalActs)}
              </td>
              <td className="border-r border-border px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtChinese(grandTotalActs)}
              </td>
              <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtPrice(grandTotalActs > 0 ? grandTotalCost / grandTotalActs : null)}
              </td>
              <td className="border-r border-border px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtPrice(grandTotalActs > 0 ? grandTotalCost / grandTotalActs : null)}
              </td>
              <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtMoney(grandTotalPay)}
              </td>
              <td className="px-3 py-2.5 text-[13px] font-semibold text-foreground/90">
                {fmtMoney(grandTotalPay)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
