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
  onEdit?: (account: AccountWithRelations) => void;
}

export function AccountBentoGrid({ accounts, bindingsByAccount, onEdit }: AccountBentoGridProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        该产品下暂无账号
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {accounts.map((a) => (
        <AccountBentoCard
          key={a.id}
          account={a}
          bindings={bindingsByAccount[a.id] ?? []}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}
