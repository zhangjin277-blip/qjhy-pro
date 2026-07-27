"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { AnchorTable } from "./anchor-table";
import { AnchorEditDrawer } from "./anchor-edit-drawer";
import { AnchorBentoCard, type BindingLite } from "./anchor-bento-card";
import {
  BUSINESS_LINE_TABS,
  blStyle,
  type BusinessLineTabKey,
} from "./anchor-business-line-styles";

const PAGE_SIZES = [25, 50, 100] as const;
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

export function AnchorListClient({ initialAnchors, bindingsByAnchor, deptUsers }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<BusinessLineTabKey>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [editingAnchor, setEditingAnchor] = useState<AnchorWithDingtalk | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const counts = useMemo(() => {
    const c: Record<BusinessLineTabKey, number> = {
      all: initialAnchors.length,
      捕鱼大作战: 0,
      途游休闲捕鱼: 0,
      电玩捕鱼: 0,
      斗地主: 0,
      麻将: 0,
      "三国:冰河时代": 0,
      造化仙府: 0,
    };
    for (const a of initialAnchors) {
      const k = a.business_line as BusinessLineTabKey;
      if (k in c && k !== "all") c[k] += 1;
    }
    return c;
  }, [initialAnchors]);

  const filteredAnchors =
    activeTab === "all"
      ? initialAnchors
      : initialAnchors.filter((a) => a.business_line === activeTab);

  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAnchors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedAnchors = filteredAnchors.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredAnchors.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredAnchors.length);

  // 有绑定的主播置顶
  const sortedAnchors = useMemo(
    () =>
      [...pagedAnchors].sort((a, b) => {
        const ah = (bindingsByAnchor[a.dingtalk_user_id]?.length ?? 0) > 0 ? 0 : 1;
        const bh = (bindingsByAnchor[b.dingtalk_user_id]?.length ?? 0) > 0 ? 0 : 1;
        return ah - bh;
      }),
    [pagedAnchors, bindingsByAnchor],
  );

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
    <div>
      {/* Toolbar — 跟直播账号一个标准：业务线 pill tabs + 视图说明 + 新增 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
          {BUSINESS_LINE_TABS.map((t) => {
            const active = t.key === activeTab;
            const s = t.key === "all" ? null : blStyle(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {s && (
                  <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${s.gradient}`} />
                )}
                {t.label}
                <span
                  className={`rounded px-1.5 text-[10px] ${
                    active ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {counts[t.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex gap-0.5 rounded-md bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                viewMode === "cards"
                  ? "bg-white font-semibold text-blue-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              卡片
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${
                viewMode === "table"
                  ? "bg-white font-semibold text-blue-600 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              表格
            </button>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="rounded-[5px] bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            + 新增主播
          </button>
        </div>
      </div>

      {/* Layout — bento grid 或 表格 */}
      {filteredAnchors.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          {activeTab === "all" ? "暂无主播档案" : `「${activeTab}」 下暂无主播`}
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sortedAnchors.map((a) => (
            <AnchorBentoCard
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
      {filteredAnchors.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] tabular-nums text-slate-500">
          <span>
            共 <strong className="text-slate-800">{filteredAnchors.length}</strong> 位 · 当前{" "}
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
