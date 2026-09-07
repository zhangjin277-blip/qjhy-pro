import Link from "next/link";
import type { PlacementTimeRangeResult } from "@/modules/placement/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hourRange(hour: number): string {
  const start = `${String(hour).padStart(2, "0")}:00`;
  const endHour = hour + 1;
  const end = endHour === 24 ? "24:00" : `${String(endHour).padStart(2, "0")}:00`;
  return `${start}–${end}`;
}

interface TimeRangeResultsProps {
  result: PlacementTimeRangeResult;
  previousHref?: string;
  nextHref?: string;
}

export function TimeRangeResults({ result, previousHref, nextHref }: TimeRangeResultsProps) {
  const { rows, summary: totals } = result;
  const cpa = totals.activations > 0 ? totals.cost / totals.activations : 0;
  const roi = totals.cost > 0 ? totals.payment / totals.cost : 0;
  const metrics = [
    { label: "消耗", value: `¥${money(totals.cost)}` },
    { label: "激活数", value: totals.activations.toLocaleString("zh-CN") },
    { label: "CPA", value: `¥${money(cpa)}` },
    { label: "付费 / ROI", value: `¥${money(totals.payment)} / ${roi.toFixed(3)}` },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card px-4 py-2.5 shadow-sm">
        <div className="grid grid-cols-2 divide-y divide-border/60 md:grid-cols-4 md:divide-x md:divide-y-0">
          {metrics.map((metric, index) => (
            <div key={metric.label} className={index === 0 ? "py-1 pr-4" : "px-4 py-1"}>
              <div className="text-xs text-muted-foreground">{metric.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            该账号在所选日期和时段内暂无投放数据
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead>归属日期</TableHead>
                <TableHead>实际日期</TableHead>
                <TableHead>时段</TableHead>
                <TableHead>主播</TableHead>
                <TableHead>直播账号</TableHead>
                <TableHead className="text-right">消耗</TableHead>
                <TableHead className="text-right">激活</TableHead>
                <TableHead className="text-right">CPA</TableHead>
                <TableHead className="text-right">付费</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const rowCpa = row.activations > 0 ? row.cost / row.activations : 0;
                const rowRoi = row.cost > 0 ? row.payment / row.cost : 0;
                return (
                  <TableRow
                    key={`${row.date}-${row.hour}-${row.anchor_user_id}-${row.account_name}`}
                  >
                    <TableCell>{row.window_date}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="tabular-nums">{hourRange(row.hour)}</TableCell>
                    <TableCell>{row.anchor_name}</TableCell>
                    <TableCell>
                      <div>{row.account_name}</div>
                      {row.placement_label && (
                        <div className="text-xs text-muted-foreground">{row.placement_label}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">¥{money(row.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.activations.toLocaleString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">¥{money(rowCpa)}</TableCell>
                    <TableCell className="text-right tabular-nums">¥{money(row.payment)}</TableCell>
                    <TableCell className="text-right tabular-nums">{rowRoi.toFixed(3)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          第 {result.page} / {Math.max(1, Math.ceil(result.total / result.page_size))} 页 · 共
          {result.total.toLocaleString("zh-CN")} 条 · 每页 {result.page_size} 条
        </span>
        <div className="flex items-center gap-2">
          {previousHref ? (
            <Link
              href={previousHref}
              scroll={false}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              上一页
            </Link>
          ) : (
            <span
              className={buttonVariants({
                size: "sm",
                variant: "outline",
                className: "pointer-events-none opacity-50",
              })}
            >
              上一页
            </span>
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              scroll={false}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              下一页
            </Link>
          ) : (
            <span
              className={buttonVariants({
                size: "sm",
                variant: "outline",
                className: "pointer-events-none opacity-50",
              })}
            >
              下一页
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
