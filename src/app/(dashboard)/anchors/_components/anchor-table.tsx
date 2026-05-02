"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import type { AnchorListRow, AnchorListFilters } from "@/modules/anchors";

const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

type ColAlign = "left" | "right";
type ColFmt = "text" | "number" | "duration";

interface Column {
  key: keyof AnchorListRow | "project";
  label: string;
  align: ColAlign;
  fmt: ColFmt;
  sticky?: boolean;
  bold?: boolean;
}

const COLUMNS: Column[] = [
  { key: "nick_name", label: "昵称", align: "left", fmt: "text", sticky: true },
  { key: "project", label: "项目", align: "left", fmt: "text" },
  { key: "broker_name", label: "运营经纪人", align: "left", fmt: "text" },
  { key: "recruit_broker_name", label: "招募经纪人", align: "left", fmt: "text" },
  { key: "anchor_health_score", label: "健康分", align: "right", fmt: "number" },
  { key: "total_fans", label: "粉丝数", align: "right", fmt: "number" },

  { key: "total_fan_ticket", label: "总音浪", align: "right", fmt: "number", bold: true },
  { key: "live_fan_ticket_no_guest", label: "礼物音浪", align: "right", fmt: "number" },
  { key: "property_fan_ticket_no_guest", label: "道具音浪", align: "right", fmt: "number" },
  { key: "guest_fan_ticket", label: "嘉宾音浪", align: "right", fmt: "number" },
  { key: "activity_fan_ticket_no_guest", label: "活动音浪", align: "right", fmt: "number" },
  { key: "special_fan_ticket", label: "其他音浪", align: "right", fmt: "number" },
  { key: "subscribe_fan_ticket", label: "会员订阅音浪", align: "right", fmt: "number" },
  { key: "star_guard_earn_score", label: "星守护音浪", align: "right", fmt: "number" },

  { key: "live_duration", label: "开播时长", align: "right", fmt: "duration" },
  { key: "valid_live_duration", label: "有效时长", align: "right", fmt: "duration" },
  { key: "live_days", label: "开播天", align: "right", fmt: "number" },
  { key: "solo_valid_days", label: "个播有效天", align: "right", fmt: "number" },
  { key: "new_follow_fans", label: "涨粉", align: "right", fmt: "number" },
  { key: "peak_per_minute_ucnt", label: "人气峰值", align: "right", fmt: "number" },
  { key: "feed_watch_duration", label: "feed看播", align: "right", fmt: "duration" },
  { key: "feed_acu", label: "feed_acu", align: "right", fmt: "number" },

  { key: "video_view_count", label: "视频播放", align: "right", fmt: "number" },
  { key: "video_like_count", label: "视频点赞", align: "right", fmt: "number" },
  { key: "video_comment_count", label: "视频评论", align: "right", fmt: "number" },

  { key: "minigame_income", label: "小游戏分账", align: "right", fmt: "number" },
  { key: "game_income", label: "推广游戏分账", align: "right", fmt: "number" },
];

type SortDir = "asc" | "desc";

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export function AnchorTable(): React.JSX.Element {
  const [filters, setFilters] = useState<AnchorListFilters>({
    date_from: yesterday,
    date_to: yesterday,
    project: "all",
  });
  const [rows, setRows] = useState<AnchorListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState<Column["key"]>("total_fan_ticket");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    setLoading(true);
    fetch(`/api/anchors?${sp.toString()}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => {
        setRows(d.rows);
        setPage(1);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const cmp = String(av).localeCompare(String(bv), "zh-CN");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // 排序变化重置到第 1 页
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: Column["key"]): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const isRange = filters.date_from !== filters.date_to;
  const totalRow = rows.reduce(
    (acc, r) => ({
      ticket: acc.ticket + (r.total_fan_ticket ?? 0),
      duration: acc.duration + (r.live_duration ?? 0),
      fans: acc.fans + (r.new_follow_fans ?? 0),
    }),
    { ticket: 0, duration: 0, fans: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Filters filters={filters} onChange={setFilters} />
        <CsvExportButton rows={sortedRows} />
      </div>

      <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums">
        <span>
          范围 <strong className="text-foreground">{filters.date_from}</strong>
          {isRange && (
            <>
              {" "}
              ~ <strong className="text-foreground">{filters.date_to}</strong>
            </>
          )}
        </span>
        <span>
          主播 <strong className="text-foreground">{rows.length}</strong>
        </span>
        <span>
          总音浪{" "}
          <strong className="text-foreground">{totalRow.ticket.toLocaleString("zh-CN")}</strong>
        </span>
        <span>
          总时长 <strong className="text-foreground">{totalRow.duration.toFixed(1)}h</strong>
        </span>
        <span>
          总涨粉{" "}
          <strong className="text-foreground">{totalRow.fans.toLocaleString("zh-CN")}</strong>
        </span>
      </div>

      <div className="bg-card overflow-hidden rounded-lg border shadow-sm">
        <div className="max-h-[calc(100vh-280px)] overflow-auto">
          <Table className="min-w-max">
            <TableHeader className="sticky top-0 z-10 bg-secondary">
              <TableRow className="border-b-2 hover:bg-secondary">
                {COLUMNS.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <TableHead
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "h-10 px-3 cursor-pointer select-none transition-colors",
                        c.align === "right" && "text-right",
                        c.sticky && "sticky left-0 z-20 bg-secondary",
                        active ? "text-primary font-semibold" : "text-foreground hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          c.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {c.label}
                        <SortIcon active={active} dir={sortDir} />
                      </span>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMNS.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={COLUMNS.length}
                    className="text-muted-foreground h-24 text-center text-sm"
                  >
                    无数据
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => (
                  <TableRow key={r.anchor_id} className="hover:bg-accent/30">
                    {COLUMNS.map((c) => {
                      const v = getValue(r, c.key);
                      const display = formatCell(v, c.fmt);
                      const muted = display === "—";
                      return (
                        <TableCell
                          key={c.key}
                          className={cn(
                            "px-3 py-2 text-sm",
                            c.align === "right" && "text-right tabular-nums",
                            c.sticky && "sticky left-0 bg-card",
                            c.bold && "font-semibold",
                            muted && "text-muted-foreground",
                          )}
                        >
                          {display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        total={sortedRows.length}
        onPage={setPage}
        onPageSize={setPageSize}
      />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  totalPages: number;
  pageSize: PageSize;
  total: number;
  onPage: (n: number) => void;
  onPageSize: (s: PageSize) => void;
}): React.JSX.Element {
  const pages = pageNumbers(page, totalPages);
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums">
      <span>
        共 <strong className="text-foreground">{total}</strong> 条 · 当前{" "}
        <strong className="text-foreground">
          {total === 0 ? 0 : start}-{end}
        </strong>
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v) as PageSize)}>
          <SelectTrigger size="sm" className="h-8 min-w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="text-muted-foreground px-2">
                …
              </span>
            ) : (
              <Button
                key={p}
                size="sm"
                variant={p === page ? "default" : "ghost"}
                onClick={() => onPage(p)}
                className="h-8 min-w-[32px] px-2"
              >
                {p}
              </Button>
            ),
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 智能分页号: 显示首页/末页/当前邻近，多余用 ... 折叠 */
function pageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "...")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) out.push("...");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("...");
  out.push(total);
  return out;
}

function getValue(r: AnchorListRow, key: Column["key"]): string | number | null {
  if (key === "project") return r.is_threekingdoms ? "三国" : "斗地主";
  const v = r[key as keyof AnchorListRow];
  if (typeof v === "boolean") return v ? 1 : 0;
  return (v as string | number | null) ?? null;
}

function formatCell(v: string | number | null, fmt: ColFmt): string {
  if (v === null || v === undefined) return "—";
  if (fmt === "duration") {
    if (typeof v !== "number" || v === 0) return "—";
    return `${v.toFixed(1)}h`;
  }
  if (fmt === "number") {
    if (typeof v !== "number" || v === 0) return "—";
    return v.toLocaleString("zh-CN");
  }
  return String(v) || "—";
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}
