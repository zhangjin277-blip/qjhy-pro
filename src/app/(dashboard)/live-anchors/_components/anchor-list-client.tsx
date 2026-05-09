"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { AnchorTable } from "./anchor-table";
import { AnchorEditDrawer } from "./anchor-edit-drawer";

const BUSINESS_LINE_TABS = [
  { key: "all", label: "全部" },
  { key: "捕鱼大作战", label: "捕鱼大作战" },
  { key: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { key: "电玩捕鱼", label: "电玩捕鱼" },
  { key: "斗地主", label: "斗地主" },
  { key: "麻将", label: "麻将" },
  { key: "三国:冰河时代", label: "三国:冰河时代" },
] as const;

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

type TabKey = (typeof BUSINESS_LINE_TABS)[number]["key"];

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  account_name: string | null;
  platform: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

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
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [editingAnchor, setEditingAnchor] = useState<AnchorWithDingtalk | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);

  const filteredAnchors =
    activeTab === "all"
      ? initialAnchors
      : initialAnchors.filter((a) => a.business_line === activeTab);

  // 切换 tab / pageSize 时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredAnchors.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedAnchors = filteredAnchors.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = filteredAnchors.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredAnchors.length);

  const counts: Record<TabKey, number> = {
    all: initialAnchors.length,
    捕鱼大作战: initialAnchors.filter((a) => a.business_line === "捕鱼大作战").length,
    途游休闲捕鱼: initialAnchors.filter((a) => a.business_line === "途游休闲捕鱼").length,
    电玩捕鱼: initialAnchors.filter((a) => a.business_line === "电玩捕鱼").length,
    斗地主: initialAnchors.filter((a) => a.business_line === "斗地主").length,
    麻将: initialAnchors.filter((a) => a.business_line === "麻将").length,
    "三国:冰河时代": initialAnchors.filter((a) => a.business_line === "三国:冰河时代").length,
  };

  const openEdit = (anchor: AnchorWithDingtalk) => {
    setEditingAnchor(anchor);
    setDrawerOpen(true);
  };

  const openNew = () => {
    setEditingAnchor(null);
    setDrawerOpen(true);
  };

  const onDrawerClose = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      router.refresh();
    }
  };

  const onToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {BUSINESS_LINE_TABS.map((t) => {
            const isActive = t.key === activeTab;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
                <span
                  className={`rounded px-1.5 text-[10px] ${
                    isActive ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {counts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto">
          <button
            onClick={openNew}
            className="rounded-[5px] bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            + 新增主播
          </button>
        </div>
      </div>

      {/* Table */}
      <AnchorTable
        anchors={pagedAnchors}
        bindingsByAnchor={bindingsByAnchor}
        expandedId={expandedId}
        onToggleExpand={onToggleExpand}
        onEdit={openEdit}
      />

      {/* Pagination */}
      {filteredAnchors.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-slate-500 tabular-nums">
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
              className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit drawer */}
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
