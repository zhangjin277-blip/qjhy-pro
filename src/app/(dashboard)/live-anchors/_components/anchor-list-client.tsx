"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { AnchorTable } from "./anchor-table";
import { AnchorEditDrawer } from "./anchor-edit-drawer";

const BUSINESS_LINE_TABS = [
  { key: "all", label: "全部" },
  { key: "捕鱼", label: "捕鱼" },
  { key: "斗地主", label: "斗地主" },
  { key: "麻将", label: "麻将" },
] as const;

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

  const filteredAnchors =
    activeTab === "all"
      ? initialAnchors
      : initialAnchors.filter((a) => a.business_line === activeTab);

  const counts: Record<TabKey, number> = {
    all: initialAnchors.length,
    捕鱼: initialAnchors.filter((a) => a.business_line === "捕鱼").length,
    斗地主: initialAnchors.filter((a) => a.business_line === "斗地主").length,
    麻将: initialAnchors.filter((a) => a.business_line === "麻将").length,
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
        anchors={filteredAnchors}
        bindingsByAnchor={bindingsByAnchor}
        expandedId={expandedId}
        onToggleExpand={onToggleExpand}
        onEdit={openEdit}
      />

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
