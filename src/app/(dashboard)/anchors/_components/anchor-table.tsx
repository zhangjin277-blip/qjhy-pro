"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Filters } from "./filters";
import { CsvExportButton } from "./csv-export";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  useEffect(() => {
    const sp = new URLSearchParams();
    sp.set("date_from", filters.date_from);
    sp.set("date_to", filters.date_to);
    if (filters.project) sp.set("project", filters.project);
    if (filters.search) sp.set("search", filters.search);
    setLoading(true);
    fetch(`/api/anchors?${sp.toString()}`)
      .then((r) => r.json() as Promise<{ rows: AnchorListRow[] }>)
      .then((d) => setRows(d.rows))
      .finally(() => setLoading(false));
  }, [filters]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getValue(a, sortKey);
      const bv = getValue(b, sortKey);
      // null/undefined 都排最后
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      const cmp = as.localeCompare(bs, "zh-CN");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: Column["key"]): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc"); // 数字列默认倒序更直观（大的在上）
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

      <div className="text-muted-foreground flex gap-6 text-sm">
        <span>
          范围 <strong>{filters.date_from}</strong>
          {isRange && (
            <>
              {" "}
              ~ <strong>{filters.date_to}</strong>
            </>
          )}
        </span>
        <span>主播 {rows.length}</span>
        <span>总音浪 {totalRow.ticket.toLocaleString("zh-CN")}</span>
        <span>总时长 {totalRow.duration.toFixed(1)}h</span>
        <span>总涨粉 {totalRow.fans.toLocaleString("zh-CN")}</span>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table className="min-w-max">
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) => (
                <TableHead
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`select-none cursor-pointer hover:bg-muted/40 ${c.align === "right" ? "text-right" : ""} ${c.sticky ? "sticky left-0 bg-card" : ""}`}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <SortIcon active={sortKey === c.key} dir={sortDir} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="text-center text-sm text-muted-foreground"
                >
                  加载中...
                </TableCell>
              </TableRow>
            ) : sortedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={COLUMNS.length}
                  className="text-center text-sm text-muted-foreground"
                >
                  无数据
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((r) => (
                <TableRow key={r.anchor_id}>
                  {COLUMNS.map((c) => {
                    const v = getValue(r, c.key);
                    const display = formatCell(v, c.fmt);
                    return (
                      <TableCell
                        key={c.key}
                        className={`${c.align === "right" ? "text-right" : ""} ${c.sticky ? "sticky left-0 bg-card" : ""} ${c.bold ? "font-medium" : ""}`}
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
  );
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
  // text
  return String(v) || "—";
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}
