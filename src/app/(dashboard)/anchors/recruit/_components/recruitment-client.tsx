"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Music2,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";

import { DataToolbar } from "@/components/patterns/data-toolbar";
import { KpiGrid } from "@/components/patterns/kpi-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getRecruitmentBoardAction,
  type RecruitmentBoardData,
  type RecruitmentListRow,
  type RecruitmentStatus,
} from "@/modules/business-recruitment";

import { RecruitmentDrawer } from "./recruitment-drawer";
import { BulkImportDialog } from "./bulk-import-dialog";
import { AnchorDetailDrawer } from "../../_components/anchor-detail-drawer";
import { ALL_COLUMNS, PINNED_COLUMNS, PRESETS } from "../../_components/column-presets";

const DETAIL_KPI_KEYS = new Set([
  "total_fan_ticket",
  "controller_total_amount",
  "g_total_amount",
  "v_total_amount",
  "show_uv",
  "g_watch_ucnt",
]);

function detailColumnsFor(row: RecruitmentListRow) {
  const presetId = row.gameProduct.includes("三国") ? "three" : "ddz";
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
  const selected = ALL_COLUMNS.filter((column) => preset?.keys.includes(column.key));
  return {
    visible: [...PINNED_COLUMNS, ...selected],
    kpi: selected.filter((column) => DETAIL_KPI_KEYS.has(column.key)),
  };
}

function toAnchorDetailIdentity(row: RecruitmentListRow) {
  if (row.platform !== "douyin" || !row.platformUid) return null;
  return {
    anchor_id: row.platformUid,
    nick_name: row.platformNickname ?? row.accountNickname ?? row.anchorName,
    is_threekingdoms: row.gameProduct.includes("三国"),
    avatar: row.platformAvatar,
    aweme_display_id: row.accountId,
    broker_name: null,
    recruit_broker_name: null,
    projectLabel: row.gameProduct,
  };
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万`;
  return Math.round(value).toLocaleString("zh-CN");
}

const STATUS_LABEL: Record<RecruitmentStatus, string> = {
  draft: "草稿",
  business_review: "待商务初评",
  operation_review: "待运营复评",
  signing: "待签约",
  signed: "已签约",
  live: "已开播",
  rejected: "不推荐",
  abnormal: "主播异常",
};

const PLATFORM_LABEL = { douyin: "抖音", kuaishou: "快手", other: "其他" } as const;

function statusClass(status: RecruitmentStatus): string {
  if (status === "live" || status === "signed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }
  if (status === "rejected" || status === "abnormal") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "draft") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function RecruitmentClient({
  initialBoard,
  products,
}: {
  initialBoard: RecruitmentBoardData;
  products: string[];
}) {
  const [board, setBoard] = useState(initialBoard);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [grade, setGrade] = useState("all");
  const [recruiter, setRecruiter] = useState("all");
  const [product, setProduct] = useState("all");
  const [page, setPage] = useState(1);
  const today = new Date().toISOString().slice(0, 10);
  const [joinDateFrom, setJoinDateFrom] = useState("");
  const [joinDateTo, setJoinDateTo] = useState("");
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);
  const [dataRow, setDataRow] = useState<RecruitmentListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, startRefresh] = useTransition();

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return board.rows.filter((row) => {
      if (
        needle &&
        !`${row.anchorName} ${row.accountNickname} ${row.accountId} ${row.gameProduct}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      if (status !== "all" && row.status !== status) return false;
      if (recruiter !== "all" && row.recruiterName !== recruiter) return false;
      if (product !== "all" && row.gameProduct !== product) return false;
      if (joinDateFrom && (!row.joinDate || row.joinDate < joinDateFrom)) return false;
      if (joinDateTo && (!row.joinDate || row.joinDate > joinDateTo)) return false;
      const resolvedGrade = row.finalGrade ?? row.suggestedGrade;
      if (grade !== "all" && resolvedGrade !== grade) return false;
      return true;
    });
  }, [board.rows, grade, joinDateFrom, joinDateTo, product, query, recruiter, status]);

  const recruiters = useMemo(
    () => [...new Set(board.rows.map((row) => row.recruiterName).filter(Boolean))].sort(),
    [board.rows],
  );
  const productOptions = useMemo(
    () =>
      [
        ...new Set([...products, ...board.rows.map((row) => row.gameProduct)].filter(Boolean)),
      ].sort(),
    [board.rows, products],
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => setPage(1), [grade, joinDateFrom, joinDateTo, product, query, recruiter, status]);

  const refreshBoard = (focusId?: string) => {
    startRefresh(async () => {
      try {
        const next = await getRecruitmentBoardAction({});
        setBoard(next);
        if (focusId) {
          setCreating(false);
          setOpenCandidateId(focusId);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "刷新失败");
      }
    });
  };

  const open = creating || openCandidateId !== null;
  const dataAnchor = useMemo(() => (dataRow ? toAnchorDetailIdentity(dataRow) : null), [dataRow]);
  const dataDateRange = useMemo(
    () => ({
      from: new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
    }),
    [],
  );
  return (
    <>
      <div className="mb-3 flex items-center justify-between border-b pb-2">
        <div>
          <h2 className="text-sm font-semibold">线上招募登记与评审</h2>
          <p className="text-xs text-muted-foreground">支持批量导入、新增登记和主播评审流程。</p>
        </div>
      </div>
      <KpiGrid
        items={[
          { key: "all", label: "全部候选人", value: rows.length },
          {
            key: "business",
            label: "待商务初评",
            value: rows.filter((row) => row.status === "business_review").length,
          },
          {
            key: "operation",
            label: "待运营复评",
            value: rows.filter((row) => row.status === "operation_review").length,
          },
          {
            key: "signed",
            label: "已签约 / 开播",
            value: rows.filter((row) => row.status === "signed" || row.status === "live").length,
          },
        ]}
      />

      <DataToolbar
        filters={
          <>
            <div className="relative w-[230px] max-w-full">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索姓名、昵称、账号 ID"
                className="pl-8"
              />
            </div>
            <Select value={status} onValueChange={(value) => setStatus(value ?? "all")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue>
                  {(value: string | null) =>
                    value && value !== "all" ? STATUS_LABEL[value as RecruitmentStatus] : "全部状态"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={grade} onValueChange={(value) => setGrade(value ?? "all")}>
              <SelectTrigger className="w-[120px]">
                <SelectValue>
                  {(value: string | null) =>
                    value && value !== "all" ? `${value} 类` : "全部评级"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部评级</SelectItem>
                <SelectItem value="A">A 类</SelectItem>
                <SelectItem value="B">B 类</SelectItem>
                <SelectItem value="C">C 类</SelectItem>
              </SelectContent>
            </Select>
            <Select value={recruiter} onValueChange={(value) => setRecruiter(value ?? "all")}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="全部商务" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部商务</SelectItem>
                {recruiters.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={product} onValueChange={(value) => setProduct(value ?? "all")}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="全部产品" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部产品</SelectItem>
                {productOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              <span>入会日期</span>
              <Input
                type="date"
                value={joinDateFrom}
                max={joinDateTo}
                onChange={(event) => setJoinDateFrom(event.target.value)}
                className="h-9 w-[130px]"
              />
              <span>至</span>
              <Input
                type="date"
                value={joinDateTo}
                min={joinDateFrom}
                onChange={(event) => setJoinDateTo(event.target.value)}
                className="h-9 w-[130px]"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  setJoinDateFrom(new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10));
                  setJoinDateTo(today);
                }}
              >
                近 7 天
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => {
                  setJoinDateFrom("");
                  setJoinDateTo("");
                }}
              >
                清空
              </Button>
            </div>
          </>
        }
        actions={
          <>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />共 {rows.length} 人
            </div>
            {board.capabilities.canEditCandidate && (
              <>
                <BulkImportDialog onImported={() => refreshBoard()} />
                <Button
                  size="sm"
                  onClick={() => {
                    setOpenCandidateId(null);
                    setCreating(true);
                  }}
                >
                  <Plus />
                  新增登记
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="overflow-x-auto rounded-md border bg-card">
        <Table className="table-fixed min-w-[1400px]">
          <colgroup>
            <col className="w-[19%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[7%]" />
            <col className="w-[5%]" />
            <col className="w-[5%]" />
            <col className="w-[7%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[5%]" />
            <col className="w-[3%]" />
          </colgroup>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead>主播</TableHead>
              <TableHead>登记姓名</TableHead>
              <TableHead>平台 / 产品</TableHead>
              <TableHead>招募商务</TableHead>
              <TableHead>商务初评</TableHead>
              <TableHead>最终评级</TableHead>
              <TableHead>带教运营</TableHead>
              <TableHead>流程状态</TableHead>
              <TableHead>入会 / 首播日期</TableHead>
              <TableHead>近30天数据</TableHead>
              <TableHead>最近更新</TableHead>
              <TableHead className="w-[72px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedRows.map((row) => (
              <RecruitmentTableRow
                key={row.id}
                row={row}
                onOpen={() => setOpenCandidateId(row.id)}
                onOpenData={() => setDataRow(row)}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="h-28 text-center text-muted-foreground">
                  没有符合条件的候选人
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end gap-3 py-3 text-sm text-muted-foreground">
        <span>
          第 {currentPage} / {pageCount} 页，共 {rows.length} 条
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          <ChevronLeft />
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={currentPage >= pageCount}
          onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
        >
          下一页
          <ChevronRight />
        </Button>
      </div>

      <Sheet
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setCreating(false);
            setOpenCandidateId(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="!w-[760px] !max-w-[96vw] gap-0 p-0 sm:!max-w-[760px]"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">线上招募登记</SheetTitle>
          <SheetDescription className="sr-only">查看并维护主播候选人招募流程</SheetDescription>
          {open && (
            <RecruitmentDrawer
              candidateId={creating ? null : openCandidateId}
              products={products}
              staff={board.staff}
              capabilities={board.capabilities}
              refreshing={refreshing}
              onSaved={refreshBoard}
              onClose={() => {
                setCreating(false);
                setOpenCandidateId(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      {dataRow && dataAnchor && (
        <AnchorDetailDrawer
          anchor={dataAnchor}
          dateFrom={dataDateRange.from}
          dateTo={dataDateRange.to}
          accessContext="business_recruitment"
          kpiColumns={detailColumnsFor(dataRow).kpi}
          visibleColumns={detailColumnsFor(dataRow).visible}
          onOpenChange={(open) => {
            if (!open) setDataRow(null);
          }}
        />
      )}
    </>
  );
}

function RecruitmentTableRow({
  row,
  onOpen,
  onOpenData,
}: {
  row: RecruitmentListRow;
  onOpen: () => void;
  onOpenData: () => void;
}) {
  const resolvedGrade = row.finalGrade ?? row.suggestedGrade;
  return (
    <TableRow className="cursor-pointer hover:bg-blue-50/50" onClick={onOpen}>
      <TableCell>
        <div className="flex w-full min-w-0 items-center gap-3">
          {row.platformAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.platformAvatar}
              alt={row.platformNickname ?? row.anchorName}
              className="size-10 shrink-0 rounded-full bg-muted object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="size-10 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium text-primary">
              {row.platformNickname ?? row.accountNickname ?? row.anchorName}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Music2 className="size-3 shrink-0" />
              <span className="truncate">{row.accountId}</span>
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              UID {row.platformUid ?? "-"}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="font-medium">{row.anchorName}</TableCell>
      <TableCell>
        <div>{row.gameProduct}</div>
        <div className="text-xs text-muted-foreground">{PLATFORM_LABEL[row.platform]}</div>
      </TableCell>
      <TableCell>{row.recruiterName}</TableCell>
      <TableCell>{row.businessReviewCount > 0 ? `${row.businessReviewCount} / 5` : "-"}</TableCell>
      <TableCell className="font-medium text-primary">
        {resolvedGrade ? `${resolvedGrade} 类` : "-"}
      </TableCell>
      <TableCell>{row.operatorName ?? "未分配"}</TableCell>
      <TableCell>
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${statusClass(row.status)}`}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </TableCell>
      <TableCell>
        <div className="space-y-1 text-xs leading-tight">
          <div>
            <span className="mr-1 text-muted-foreground">入会</span>
            <span>{row.joinDate ?? "-"}</span>
          </div>
          <div className={row.platformExitStatus ? "font-medium text-red-600" : undefined}>
            <span className="mr-1 text-muted-foreground">首播</span>
            <span>{row.firstLiveDate ?? "-"}</span>
          </div>
        </div>
        {row.platformExitStatus && (
          <div className="mt-1 text-xs font-medium text-red-600">
            {row.platformExitStatus === "cancelled" ? "注销" : "退会"}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-between gap-2">
          {row.performance30d ? (
            <div className="space-y-1 text-xs leading-tight">
              <div className="font-medium text-foreground">
                开播 {row.performance30d.liveDays} 天 ·{" "}
                {row.performance30d.validLiveDuration.toFixed(1)}h
              </div>
              <div className="text-muted-foreground">
                音浪 {formatCompactNumber(row.performance30d.totalFanTicket)} · 涨粉{" "}
                {formatCompactNumber(row.performance30d.newFollowFans)}
              </div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {row.platformUid ? "暂无开播数据" : "未匹配数据"}
            </span>
          )}
          {row.platformUid && row.platform === "douyin" && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              title="查看主播明细"
              aria-label={`查看${row.anchorName}的直播数据`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenData();
              }}
            >
              <BarChart3 className="size-3.5" />
              <span>查看数据</span>
            </Button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatUpdatedAt(row.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`查看${row.anchorName}`}
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
        >
          <ChevronRight />
        </Button>
      </TableCell>
    </TableRow>
  );
}
