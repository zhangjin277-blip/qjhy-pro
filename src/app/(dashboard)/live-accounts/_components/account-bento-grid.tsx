"use client";

import type { AccountWithRelations } from "@/modules/live-account";
import { AccountBentoCard } from "./account-bento-card";

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface AccountBentoGridProps {
  accounts: AccountWithRelations[];
  bindingsByAccount: Record<string, BindingLite[]>;
  avatarByPlatformId: Record<string, string | null>;
  onEdit?: (account: AccountWithRelations) => void;
}

export function AccountBentoGrid({
  accounts,
  bindingsByAccount,
  avatarByPlatformId,
  onEdit,
}: AccountBentoGridProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        该产品下暂无账号
      </div>
    );
  }

  // 有排班的账号置顶，无排班的置底；同组内保留原顺序（product/account_name）
  const sorted = [...accounts].sort((a, b) => {
    const aHas = (bindingsByAccount[a.id]?.length ?? 0) > 0 ? 0 : 1;
    const bHas = (bindingsByAccount[b.id]?.length ?? 0) > 0 ? 0 : 1;
    return aHas - bHas;
  });

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((a) => (
        <AccountBentoCard
          key={a.id}
          account={a}
          bindings={bindingsByAccount[a.id] ?? []}
          avatarUrl={
            (a.platform_account_id ? avatarByPlatformId[a.platform_account_id] : null) ?? a.avatar
          }
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
