"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, LayoutGrid, Plus, Rows3 } from "lucide-react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { Button } from "@/components/ui/button";
import { AnchorTable } from "./anchor-table";
import { AnchorEditDrawer } from "./anchor-edit-drawer";
import { AnchorCard, type BindingLite } from "./anchor-card";
import { AnchorStatCards } from "./anchor-stat-cards";
import { AnchorPillTabs } from "./anchor-pill-tabs";
import {
  AnchorFilterBar,
  type EmpFilter,
  type StatusFilter,
  type SortKey,
} from "./anchor-filter-bar";
import { BUSINESS_LINE_TABS, type BusinessLineTabKey } from "./anchor-business-line-styles";

const PAGE_SIZES = [12, 24, 48] as const;
type PageSize = (typeof PAGE_SIZES)[number];
type ViewMode = "cards" | "table";

interface DeptUserLite {
  user_id: string;
  name: string;
  title: string | null;
  active: boolean;
}

interface Props {
  initialAnchors: AnchorWithDingtalk[];
  bindingsByAnchor: Record<string, BindingLite[]>;
  deptUsers: DeptUserLite[];
}

function getDateKey(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.toISOString();
}

export function AnchorListClient({ initialAnchors, bindingsByAnchor, deptUsers }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BusinessLineTabKey>("all");
  const [empFilter, setEmpFilter] = useState<EmpFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("updated_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");

  const [editingAnchor, setEditingAnchor] = useState<AnchorWithDingtalk | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(12);

  const counts = useMemo(() => {
    const c: Record<BusinessLineTabKey, number> = {
      all: initialAnchors.length,
      捕鱼大作战: 0,
      途游休闲捕鱼: 0,
      电玩捕鱼: 0,
      斗地主: 0,
      麻将: 0,
      "三国:冰河时代": 0,
    };
    for (const a of initialAnchors) {
      const k = a.business_line as BusinessLineTabKey;
      if (k in c && k !== "all") c[k] += 1;
    }
    return c;
  }, [initialAnchors]);

  const byLine = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of BUSINESS_LINE_TABS) {
      if (t.key === "all") continue;
      m[t.key] = counts[t.key];
    }
    return m;
  }, [counts]);

  const stats = useMemo(() => {
    let active = 0,
      rest = 0,
      leave = 0,
      trial = 0,
      unbound = 0;
    for (const a of initialAnchors) {
      if (a.work_status === "active") active += 1;
      else if (a.work_status === "rest") rest += 1;
      else if (a.work_status === "leave") leave += 1;
      if (a.employment_type === "试播") trial += 1;
      const bindings = bindingsByAnchor[a.dingtalk_user_id] ?? [];
      if (bindings.length === 0 && a.work_status !== "leave") unbound += 1;
    }
    return { total: initialAnchors.length, active, rest, leave, trial, unbound };
  }, [initialAnchors, bindingsByAnchor]);

  // 过滤
  const filteredAnchors = useMemo(() => {
    let list = initialAnchors;
    if (activeTab !== "all") list = list.filter((a) => a.business_line === activeTab);
    if (empFilter !== "all") list = list.filter((a) => a.employment_type === empFilter);
    if (statusFilter !== "all") list = list.filter((a) => a.work_status === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) || (a.external_name ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [initialAnchors, activeTab, empFilter, statusFilter, query]);

  // 排序
  const sortedAnchors = useMemo(() => {
    const arr = [...filteredAnchors];
    if (sort === "updated_desc") {
      arr.sort((a, b) => getDateKey(b.updated_at).localeCompare(getDateKey(a.updated_at)));
    } else if (sort === "updated_asc") {
      arr.sort((a, b) => getDateKey(a.updated_at).localeCompare(getDateKey(b.updated_at)));
    } else if (sort === "name") {
      arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    } else if (sort === "trial_desc") {
      arr.sort((a, b) =>
        getDateKey(b.trial_start_date).localeCompare(getDateKey(a.trial_start_date)),
      );
    } else if (sort === "bindings_desc") {
      arr.sort(
        (a, b) =>
          (bindingsByAnchor[b.dingtalk_user_id]?.length ?? 0) -
          (bindingsByAnchor[a.dingtalk_user_id]?.length ?? 0),
      );
    }
    return arr;
  }, [filteredAnchors, sort, bindingsByAnchor]);

  // 任何筛选变化回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [activeTab, empFilter, statusFilter, query, sort, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedAnchors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedAnchors = sortedAnchors.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = sortedAnchors.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, sortedAnchors.length);

  const activeFilterCount =
    (activeTab !== "all" ? 1 : 0) +
    (empFilter !== "all" ? 1 : 0) +
    (statusFilter !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0);

  function clearAllFilters() {
    setActiveTab("all");
    setEmpFilter("all");
    setStatusFilter("all");
    setQuery("");
  }

  function openEdit(anchor: AnchorWithDingtalk) {
    setEditingAnchor(anchor);
    setDrawerOpen(true);
  }
  function openNew() {
    setEditingAnchor(null);
    setDrawerOpen(true);
  }
  function onDrawerClose(open: boolean) {
    setDrawerOpen(open);
    if (!open) router.refresh();
  }
  function onToggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">主播档案</h1>
        <span className="text-[13px] text-slate-400">管理全部主播 · 业务线 · 账号绑定</span>
        <div className="flex-1" />
        <Button variant="outline" size="sm">
          导出 CSV
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1 h-4 w-4" />
          新增主播
        </Button>
      </div>

      {/* KPI strip */}
      <AnchorStatCards stats={stats} byLine={byLine} />

      {/* Business line pill tabs */}
      <AnchorPillTabs active={activeTab} onChange={setActiveTab} counts={counts} />

      {/* Filter row */}
      <AnchorFilterBar
        empFilter={empFilter}
        onEmpChange={setEmpFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
      />

      {/* Result bar */}
      <div className="flex items-center justify-between gap-2 text-xs tabular-nums text-slate-500">
        <div>
          匹配 <strong className="font-semibold text-slate-900">{sortedAnchors.length}</strong>
          {sortedAnchors.length !== initialAnchors.length && (
            <span> / {initialAnchors.length}</span>
          )}
          <span> 位主播</span>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 hover:bg-blue-100"
            >
              清除 {activeFilterCount} 项筛选 ×
            </button>
          )}
        </div>
        <div className="inline-flex gap-0.5 rounded-md bg-slate-100 p-0.5">
          <button
            type="button"
            title="卡片"
            onClick={() => setViewMode("cards")}
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors ${
              viewMode === "cards"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-400 hover:text-slate-600"
            }`}
            aria-label="卡片视图"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="表格"
            onClick={() => setViewMode("table")}
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors ${
              viewMode === "table"
                ? "bg-white text-blue-600 shadow-xs"
                : "text-slate-400 hover:text-slate-600"
            }`}
            aria-label="表格视图"
          >
            <Rows3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Grid / Table */}
      {pagedAnchors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-20 text-center text-[13px] text-slate-400">
          {activeFilterCount > 0 ? "无匹配主播" : "暂无主播档案"}
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pagedAnchors.map((a) => (
            <AnchorCard
              key={a.dingtalk_user_id}
              anchor={a}
              bindings={bindingsByAnchor[a.dingtalk_user_id] ?? []}
              onEdit={openEdit}
            />
          ))}
        </div>
      ) : (
        <AnchorTable
          anchors={pagedAnchors}
          bindingsByAnchor={bindingsByAnchor}
          expandedId={expandedId}
          onToggleExpand={onToggleExpand}
          onEdit={openEdit}
        />
      )}

      {/* Pagination */}
      {sortedAnchors.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] tabular-nums text-slate-500">
          <span>
            共 <strong className="text-slate-800">{sortedAnchors.length}</strong> 位 · 当前{" "}
            <strong className="text-slate-800">
              {rangeStart}-{rangeEnd}
            </strong>
          </span>
          <div className="flex items-center gap-2">
            <select
              className="h-7 rounded border border-slate-200 bg-white px-2 text-[12px]"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as PageSize)}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} 条/页
                </option>
              ))}
            </select>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium text-slate-700">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit drawer (保持原状) */}
      <AnchorEditDrawer
        open={drawerOpen}
        onOpenChange={onDrawerClose}
        anchor={editingAnchor}
        deptUsers={deptUsers}
        bindingsByAnchor={bindingsByAnchor}
      />
    </div>
  );
}
