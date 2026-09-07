"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Search,
  Settings2,
  FileSpreadsheet,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { DataToolbar } from "@/components/patterns/data-toolbar";
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
  STAGE_LABEL,
  type PeopleListRow,
  type PerformanceManagerOption,
} from "@/modules/people-performance";

import { BulkProfileDialog } from "./bulk-profile-dialog";
import { PerformanceDrawer } from "./performance-drawer";
import { SpreadsheetImportDialog } from "./spreadsheet-import-dialog";

const STATUS_LABEL = {
  probation: "试用期",
  regular: "正式",
  inactive: "停用",
} as const;

function statusClass(status: PeopleListRow["employmentStatus"]): string {
  if (status === "probation") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "regular") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function PeoplePerformanceClient({
  initialRows,
  initialUserId,
  canManageProfiles,
  managerOptions,
}: {
  initialRows: PeopleListRow[];
  initialUserId: string | null;
  canManageProfiles: boolean;
  managerOptions: PerformanceManagerOption[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const [title, setTitle] = useState("all");
  const [quickFilter, setQuickFilter] = useState<"all" | "probation" | "pending" | "overdue">(
    "all",
  );
  const [openUserId, setOpenUserId] = useState(initialUserId);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const titleOptions = useMemo(
    () =>
      [...new Set(initialRows.map((row) => row.title?.trim()).filter(Boolean) as string[])].sort(
        (a, b) => a.localeCompare(b, "zh-CN"),
      ),
    [initialRows],
  );

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return initialRows.filter((row) => {
      if (
        needle &&
        !`${row.name} ${row.title ?? ""} ${row.department}`.toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (status !== "all" && (row.employmentStatus ?? "unconfigured") !== status) return false;
      if (stage !== "all" && (row.currentStage ?? "unconfigured") !== stage) return false;
      if (title === "__unset__" && row.title) return false;
      if (title !== "all" && title !== "__unset__" && row.title !== title) return false;
      if (quickFilter === "probation" && row.employmentStatus !== "probation") return false;
      if (quickFilter === "pending" && (!row.currentStage || row.currentStage === "completed")) {
        return false;
      }
      if (
        quickFilter === "overdue" &&
        (!row.periodEnd || row.periodEnd >= today || row.currentStage === "completed")
      ) {
        return false;
      }
      return true;
    });
  }, [initialRows, query, quickFilter, stage, status, title, today]);

  const overdueCount = initialRows.filter(
    (row) => row.periodEnd && row.periodEnd < today && row.currentStage !== "completed",
  ).length;
  const selectedRows = initialRows.filter((row) => selectedUserIds.has(row.userId));
  const allVisibleSelected =
    rows.length > 0 && rows.every((row) => selectedUserIds.has(row.userId));

  const toggleSelected = (userId: string) => {
    setSelectedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Summary
          label="非主播人员"
          value={initialRows.length}
          icon={<Users />}
          active={quickFilter === "all" && status === "all" && stage === "all" && title === "all"}
          onClick={() => {
            setQuickFilter("all");
            setStatus("all");
            setStage("all");
            setTitle("all");
            setQuery("");
          }}
        />
        <Summary
          label="试用期"
          value={initialRows.filter((row) => row.employmentStatus === "probation").length}
          active={quickFilter === "probation"}
          onClick={() => {
            setQuickFilter("probation");
            setStatus("all");
            setStage("all");
          }}
        />
        <Summary
          label="待处理周期"
          value={
            initialRows.filter((row) => row.currentStage && row.currentStage !== "completed").length
          }
          active={quickFilter === "pending"}
          onClick={() => {
            setQuickFilter("pending");
            setStatus("all");
            setStage("all");
          }}
        />
        <Summary
          label="已逾期"
          value={overdueCount}
          danger={overdueCount > 0}
          icon={<AlertTriangle />}
          active={quickFilter === "overdue"}
          onClick={() => {
            setQuickFilter("overdue");
            setStatus("all");
            setStage("all");
          }}
        />
      </div>

      <DataToolbar
        filters={
          <>
            <div className="relative w-[220px]">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索姓名、岗位、部门"
                className="pl-8"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value ?? "all");
                setQuickFilter("all");
              }}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="人员状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="unconfigured">未配置</SelectItem>
                <SelectItem value="probation">试用期</SelectItem>
                <SelectItem value="regular">正式</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={stage}
              onValueChange={(value) => {
                setStage(value ?? "all");
                setQuickFilter("all");
              }}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="当前环节" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部环节</SelectItem>
                <SelectItem value="unconfigured">未配置</SelectItem>
                {Object.entries(STAGE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={title}
              onValueChange={(value) => {
                setTitle(value ?? "all");
                setQuickFilter("all");
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="岗位" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部岗位</SelectItem>
                <SelectItem value="__unset__">未设置岗位</SelectItem>
                {titleOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {canManageProfiles && (
              <>
                <Button size="sm" variant="outline" onClick={() => setSpreadsheetOpen(true)}>
                  <FileSpreadsheet />
                  表格导入
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedRows.length === 0}
                  onClick={() => setBulkOpen(true)}
                >
                  <Settings2 />
                  批量配置{selectedRows.length > 0 ? `（${selectedRows.length}）` : ""}
                </Button>
              </>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <SlidersHorizontal className="size-3.5" />共 {rows.length} 人
            </div>
          </div>
        }
      />

      <div className="overflow-hidden rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              {canManageProfiles && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 accent-blue-600"
                    aria-label="选择当前列表全部人员"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setSelectedUserIds((current) => {
                        const next = new Set(current);
                        for (const row of rows) {
                          if (checked) next.add(row.userId);
                          else next.delete(row.userId);
                        }
                        return next;
                      });
                    }}
                  />
                </TableHead>
              )}
              <TableHead>人员</TableHead>
              <TableHead>部门 / 岗位</TableHead>
              <TableHead>直接 / 隔级上级</TableHead>
              <TableHead>人员状态</TableHead>
              <TableHead>当前考核</TableHead>
              <TableHead>当前环节</TableHead>
              <TableHead>截止日期</TableHead>
              <TableHead className="w-[100px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.userId}
                className="cursor-pointer hover:bg-blue-50/50"
                onClick={() => setOpenUserId(row.userId)}
              >
                {canManageProfiles && (
                  <TableCell onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="size-4 accent-blue-600"
                      aria-label={`选择${row.name}`}
                      checked={selectedUserIds.has(row.userId)}
                      onChange={() => toggleSelected(row.userId)}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell>
                  <div>{row.department || "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.title ?? "未设置岗位"}</div>
                </TableCell>
                <TableCell>
                  <div>{row.managerName ?? "-"}</div>
                  <div className="text-xs text-muted-foreground">{row.skipManagerName ?? "-"}</div>
                </TableCell>
                <TableCell>
                  {row.employmentStatus ? (
                    <span
                      className={`inline-flex rounded px-1.5 py-0.5 text-xs ring-1 ring-inset ${statusClass(row.employmentStatus)}`}
                    >
                      {STATUS_LABEL[row.employmentStatus]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">未配置</span>
                  )}
                </TableCell>
                <TableCell>{row.currentCycleLabel ?? "-"}</TableCell>
                <TableCell>{row.currentStage ? STAGE_LABEL[row.currentStage] : "-"}</TableCell>
                <TableCell>{row.periodEnd ?? "-"}</TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant={row.employmentStatus ? "ghost" : "outline"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenUserId(row.userId);
                    }}
                  >
                    {!row.employmentStatus && canManageProfiles ? "配置" : "查看"}
                    <ChevronRight />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canManageProfiles ? 9 : 8}
                  className="h-28 text-center text-muted-foreground"
                >
                  没有符合条件的人员
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={openUserId !== null} onOpenChange={(open) => !open && setOpenUserId(null)}>
        <SheetContent
          side="right"
          className="!w-[1080px] !max-w-[94vw] gap-0 p-0 sm:!max-w-[1080px]"
          showCloseButton={false}
        >
          <SheetTitle className="sr-only">人员考核详情</SheetTitle>
          <SheetDescription className="sr-only">查看和处理试用期与正式绩效</SheetDescription>
          {openUserId && (
            <PerformanceDrawer userId={openUserId} onClose={() => setOpenUserId(null)} />
          )}
        </SheetContent>
      </Sheet>
      {canManageProfiles && (
        <>
          <SpreadsheetImportDialog open={spreadsheetOpen} onOpenChange={setSpreadsheetOpen} />
          <BulkProfileDialog
            selectedRows={selectedRows}
            managers={managerOptions}
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            onCompleted={() => setSelectedUserIds(new Set())}
          />
        </>
      )}
    </>
  );
}

function Summary({
  label,
  value,
  danger,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: number;
  danger?: boolean;
  icon?: React.ReactNode;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-h-20 w-full items-center justify-between rounded-md border bg-white px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/40 ${active ? "border-blue-400 ring-1 ring-blue-100" : ""}`}
    >
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold ${danger ? "text-red-600" : "text-slate-900"}`}
        >
          {value}
        </div>
      </div>
      {icon && (
        <div className={`[&_svg]:size-5 ${danger ? "text-red-500" : "text-slate-400"}`}>{icon}</div>
      )}
    </button>
  );
}
