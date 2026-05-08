"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { KpiGrid } from "@/components/patterns/kpi-grid";
import { PresetChip, PresetToolbar } from "@/components/patterns/preset-toolbar";
import { DataToolbar } from "@/components/patterns/data-toolbar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

interface Row {
  id: string;
  account_name: string;
  platform_account_id: string | null;
  avatar: string | null;
  product: string;
  agent_dingtalk_user_id: string | null;
  agent_name: string | null;
  fans_count: number | null;
  joined_at: string | null;
  contract_expire_at: string | null;
  renewal_status: string | null;
  broker_name_raw: string | null;
  live_status: string;
}

interface KpiResp {
  total: number;
  withAgent: number;
  contractExpiringIn90Days: number;
  renewalPending: number;
}

const PRODUCT_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "捕鱼大作战", label: "捕鱼大作战" },
  { value: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { value: "电玩捕鱼", label: "电玩捕鱼" },
  { value: "未分类", label: "未分类" },
];

type SortKey =
  | "account_name"
  | "product"
  | "agent_name"
  | "fans_count"
  | "joined_at"
  | "contract_expire_at"
  | "live_status";
type SortDir = "asc" | "desc";

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = (typeof PAGE_SIZES)[number];

interface ColDef {
  key: SortKey;
  label: string;
  align?: "left" | "right";
  sticky?: boolean;
  width?: string;
}

const COLUMNS: ColDef[] = [
  { key: "account_name", label: "主播", sticky: true, width: "260px" },
  { key: "product", label: "项目" },
  { key: "agent_name", label: "经纪人" },
  { key: "fans_count", label: "粉丝数", align: "right" },
  { key: "joined_at", label: "入驻时间" },
  { key: "contract_expire_at", label: "合约到期" },
  { key: "live_status", label: "状态" },
];

export function KuaishouAnchorTable(): React.JSX.Element {
  const [product, setProduct] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [kpi, setKpi] = useState<KpiResp>({
    total: 0,
    withAgent: 0,
    contractExpiringIn90Days: 0,
    renewalPending: 0,
  });
  const [loading, setLoading] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("fans_count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const sp = new URLSearchParams();
    sp.set("product", product);
    if (debouncedSearch) sp.set("search", debouncedSearch);
    (async () => {
      try {
        const r = await fetch(`/api/anchors-kuaishou?${sp.toString()}`);
        if (!r.ok) {
          if (r.status === 401) toast.error("登录已失效");
          else if (r.status === 403) toast.error("无权访问主播明细");
          else toast.error(`加载失败 (${r.status})`);
          if (!cancelled) {
            setRows([]);
            setKpi({ total: 0, withAgent: 0, contractExpiringIn90Days: 0, renewalPending: 0 });
          }
          return;
        }
        const d = (await r.json()) as { rows: Row[]; kpi: KpiResp };
        if (cancelled) return;
        setRows(d.rows);
        setKpi(d.kpi);
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        toast.error("网络错误：" + (e instanceof Error ? e.message : "未知"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [product, debouncedSearch]);

  // 排序变化时回到第一页
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize]);

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = pickSortValue(a, sortKey);
      const bv = pickSortValue(b, sortKey);
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // null 排到最后
      if (bv === null) return -1;
      const cmp =
        typeof av === "number" ? av - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function toggleSort(key: SortKey): void {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(
        key === "account_name" || key === "product" || key === "agent_name" ? "asc" : "desc",
      );
    }
  }

  const kpiItems = useMemo(
    () => [
      { key: "total", label: "账号总数", value: kpi.total.toLocaleString() },
      { key: "withAgent", label: "已分配经纪人", value: kpi.withAgent.toLocaleString() },
      {
        key: "expiring",
        label: "合约 90 天内到期",
        value: kpi.contractExpiringIn90Days.toLocaleString(),
      },
      { key: "pending", label: "待续约", value: kpi.renewalPending.toLocaleString() },
    ],
    [kpi],
  );

  return (
    <div className="space-y-3">
      <DataToolbar
        filters={
          <>
            <PresetToolbar>
              {PRODUCT_OPTIONS.map((o) => (
                <PresetChip
                  key={o.value}
                  active={product === o.value}
                  onClick={() => setProduct(o.value)}
                >
                  {o.label}
                </PresetChip>
              ))}
            </PresetToolbar>
            <input
              type="text"
              placeholder="搜索昵称 / 快手 ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-56 rounded border border-slate-300 px-2 text-sm focus:border-primary focus:outline-none"
            />
          </>
        }
        actions={null}
      />

      <KpiGrid items={kpiItems} />

      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>
          范围{" "}
          <strong className="text-foreground">
            快手 · {PRODUCT_OPTIONS.find((o) => o.value === product)?.label}
          </strong>
        </span>
        <span>
          主播 <strong className="text-foreground tabular-nums">{sortedRows.length}</strong>
        </span>
        <span>
          列数 <strong className="text-foreground">{COLUMNS.length}</strong>
        </span>
      </div>

      <div
        className="min-w-0 max-w-full overflow-hidden rounded-lg shadow-sm"
        style={{
          background: "rgba(255, 255, 255, 0.92)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="max-h-[calc(100vh-360px)] max-w-full overflow-auto">
          <table className="w-max min-w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-20 bg-secondary [&_th]:bg-secondary">
              <TableRow
                className="hover:bg-secondary"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                {COLUMNS.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <TableHead
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "h-10 px-3 cursor-pointer select-none transition-colors whitespace-nowrap",
                        c.align === "right" && "text-right",
                        c.sticky && "sticky left-0 z-20 bg-secondary",
                        active ? "text-primary font-semibold" : "text-foreground hover:bg-muted",
                      )}
                      style={c.width ? { width: c.width, maxWidth: c.width } : undefined}
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
                    无数据（如未同步快手公会账号，先去管理员后台跑一次同步）
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r) => (
                  <TableRow key={r.id} className="group hover:bg-[var(--hover-bg)]">
                    <TableCell
                      className="px-3 py-2 sticky left-0 z-10 bg-white group-hover:bg-[var(--hover-bg)]"
                      style={{ width: "260px", maxWidth: "260px" }}
                    >
                      <div className="flex items-center gap-2">
                        {r.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.avatar}
                            alt={r.account_name}
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-200" />
                        )}
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">
                            {r.account_name}
                          </span>
                          <span className="text-muted-foreground truncate text-xs">
                            快手ID: {r.platform_account_id ?? "--"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2">{r.product}</TableCell>
                    <TableCell className="px-3 py-2">
                      {r.agent_name ?? (
                        <span className="text-muted-foreground">
                          {r.broker_name_raw ?? "未分配"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right tabular-nums">
                      {r.fans_count != null ? r.fans_count.toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 tabular-nums text-muted-foreground">
                      {r.joined_at ?? "—"}
                    </TableCell>
                    <TableCell className="px-3 py-2 tabular-nums">
                      <ContractExpireBadge date={r.contract_expire_at} />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {r.live_status === "living" ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">
                          直播中
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">未开播</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
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

function pickSortValue(r: Row, key: SortKey): string | number | null {
  if (key === "fans_count") return r.fans_count;
  if (key === "live_status") return r.live_status === "living" ? 1 : 0;
  if (key === "agent_name") return r.agent_name ?? r.broker_name_raw ?? null;
  return (r[key] as string | null) ?? null;
}

function ContractExpireBadge({ date }: { date: string | null }): React.JSX.Element {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const exp = new Date(date);
  const now = Date.now();
  const days = Math.floor((exp.getTime() - now) / 86400_000);
  if (days < 0) return <span className="text-rose-500">已过期 {date}</span>;
  if (days <= 90)
    return (
      <span className="text-amber-600">
        {date} <span className="text-xs">({days}天)</span>
      </span>
    );
  return <span className="text-foreground">{date}</span>;
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }): React.JSX.Element {
  if (!active) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
}

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
