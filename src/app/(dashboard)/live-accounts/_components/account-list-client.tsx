"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountWithRelations } from "@/modules/live-account";
import { AccountTable } from "./account-table";
import { AccountBentoGrid } from "./account-bento-grid";
import { AccountEditDrawer } from "./account-edit-drawer";

const ROTATION_PRODUCTS = ["捕鱼大作战", "途游休闲捕鱼", "电玩捕鱼"];
const ALL_PRODUCTS = [
  "捕鱼大作战",
  "三国冰河时代",
  "途游斗地主",
  "富豪麻将",
  "途游休闲捕鱼",
  "电玩捕鱼",
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
}

export function AccountListClient({
  initialAccounts,
  bindingsByAccount,
  productCounts,
  selectedProduct,
  rooms,
  dingtalkUsers,
  anchors,
}: Props) {
  const router = useRouter();
  const isRotation = ROTATION_PRODUCTS.includes(selectedProduct);

  const [editingAccount, setEditingAccount] = useState<AccountWithRelations | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
          accounts={initialAccounts}
          bindingsByAccount={bindingsByAccount}
          onEdit={openEdit}
        />
      ) : (
        <AccountTable
          accounts={initialAccounts}
          bindingsByAccount={bindingsByAccount}
          onEdit={openEdit}
        />
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
      />
    </div>
  );
}
