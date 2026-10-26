"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { AccountWithRelations } from "@/modules/live-account";
import { AccountTable } from "./account-table";
import { AccountBentoGrid } from "./account-bento-grid";
import { AccountEditDrawer } from "./account-edit-drawer";
import type { OverrideRowView } from "./schedule-override-tab";

const PAGE_SIZES = [25, 50, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

const ROTATION_PRODUCTS = ["捕鱼大作战", "途游休闲捕鱼", "电玩捕鱼"];
const ALL_PRODUCTS = [
  "捕鱼大作战",
  "三国冰河时代",
  "途游斗地主",
  "富豪麻将",
  "途游休闲捕鱼",
  "电玩捕鱼",
  "造化仙府",
  "试播",
  "招募",
];

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface RoomLite {
  id: string;
  room_no: string;
}

interface DingtalkUserLite {
  user_id: string;
  name: string;
  title: string | null;
  active: boolean;
}

interface AnchorLite {
  dingtalk_user_id: string;
  name: string;
}

interface Props {
  initialAccounts: AccountWithRelations[];
  bindingsByAccount: Record<string, BindingLite[]>;
  productCounts: Record<string, number>;
  selectedProduct: string;
  rooms: RoomLite[];
  dingtalkUsers: DingtalkUserLite[];
  anchors: AnchorLite[];
  avatarByPlatformId: Record<string, string | null>;
  overridesByAccount: Record<string, OverrideRowView[]>;
  placementLabelOptions: string[];
}

export function AccountListClient({
  initialAccounts,
  bindingsByAccount,
  productCounts,
  selectedProduct,
  rooms,
  dingtalkUsers,
  anchors,
  avatarByPlatformId,
  overridesByAccount,
  placementLabelOptions,
}: Props) {
  const router = useRouter();
  const isRotation = ROTATION_PRODUCTS.includes(selectedProduct);

  const [editingAccount, setEditingAccount] = useState<AccountWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [showDeprecated, setShowDeprecated] = useState(false);

  // 已废弃账号折叠归档到列表底部，不参与分页
  const activeAccounts = initialAccounts.filter((a) => !a.deprecated_at);
  const deprecatedAccounts = initialAccounts.filter((a) => !!a.deprecated_at);

  // 切换 product / pageSize 时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [selectedProduct, pageSize]);

  const totalPages = Math.max(1, Math.ceil(activeAccounts.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedAccounts = activeAccounts.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = activeAccounts.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, activeAccounts.length);

  const onProductChange = (p: string) => {
    router.push(`/live-accounts?product=${encodeURIComponent(p)}`);
  };

  const openEdit = (account: AccountWithRelations) => {
    setEditingAccount(account);
    setDrawerOpen(true);
  };

  const openNew = () => {
    setEditingAccount(null);
    setDrawerOpen(true);
  };

  const onDrawerClose = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      // refresh RSC data
      router.refresh();
    }
  };

  return (
    <div>
      {/* Toolbar row */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
          {ALL_PRODUCTS.map((p) => {
            const count = productCounts[p] ?? 0;
            const active = p === selectedProduct;
            return (
              <button
                key={p}
                onClick={() => onProductChange(p)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {p}
                <span
                  className={`rounded px-1.5 text-[10px] ${
                    active ? "bg-blue-50 text-blue-600" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {isRotation ? "轮播视图（卡片网格）" : "个播视图（紧凑表格）"}
          </span>
          <button
            onClick={openNew}
            className="rounded-[5px] bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600"
          >
            + 新增账号
          </button>
        </div>
      </div>

      {/* Layout */}
      {isRotation ? (
        <AccountBentoGrid
          accounts={pagedAccounts}
          bindingsByAccount={bindingsByAccount}
          avatarByPlatformId={avatarByPlatformId}
          onEdit={openEdit}
        />
      ) : (
        <AccountTable
          accounts={pagedAccounts}
          bindingsByAccount={bindingsByAccount}
          avatarByPlatformId={avatarByPlatformId}
          onEdit={openEdit}
        />
      )}

      {/* Pagination */}
      {activeAccounts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-[12.5px] text-slate-500 tabular-nums">
          <span>
            共 <strong className="text-slate-800">{activeAccounts.length}</strong> 个 · 当前{" "}
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

      {/* 已废弃账号：折叠归档 */}
      {deprecatedAccounts.length > 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-slate-200">
          <button
            type="button"
            onClick={() => setShowDeprecated((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-slate-500 hover:bg-slate-50"
            aria-expanded={showDeprecated}
          >
            <Archive className="h-4 w-4" />
            <span>
              已废弃 <span className="tabular-nums">{deprecatedAccounts.length}</span> 个
            </span>
            <span className="text-xs text-slate-400">历史数据保留，点开账号可恢复</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 transition-transform ${showDeprecated ? "rotate-180" : ""}`}
            />
          </button>
          {showDeprecated && (
            <div className="border-t border-dashed border-slate-200 p-2 opacity-70">
              <AccountTable
                accounts={deprecatedAccounts}
                bindingsByAccount={bindingsByAccount}
                avatarByPlatformId={avatarByPlatformId}
                onEdit={openEdit}
              />
            </div>
          )}
        </div>
      )}

      {/* Edit drawer */}
      <AccountEditDrawer
        open={drawerOpen}
        onOpenChange={onDrawerClose}
        account={editingAccount}
        rooms={rooms}
        dingtalkUsers={dingtalkUsers}
        anchors={anchors}
        defaultProduct={selectedProduct}
        bindingsByAccount={bindingsByAccount}
        overridesByAccount={overridesByAccount}
        placementLabelOptions={placementLabelOptions}
      />
    </div>
  );
}
