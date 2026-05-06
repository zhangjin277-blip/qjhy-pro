"use client";

import type { AccountWithRelations } from "@/modules/live-account";
import { PlatformBadge } from "./platform-badge";
import { ScheduleTimeline, type ScheduleBinding } from "./schedule-timeline";
import { AnchorMiniList } from "./anchor-mini-list";

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface AccountBentoCardProps {
  account: AccountWithRelations;
  bindings: BindingLite[];
  onEdit?: (account: AccountWithRelations) => void;
}

export function AccountBentoCard({ account, bindings, onEdit }: AccountBentoCardProps) {
  const isLiving = account.live_status === "living";

  const scheduleBindings: ScheduleBinding[] = bindings.map((b) => ({
    dingtalk_user_id: b.dingtalk_user_id,
    anchor_name: b.anchor_name,
    time_slots: b.time_slots,
  }));

  return (
    <div
      className="grid cursor-pointer rounded-[14px] border border-slate-100 bg-white p-[18px] pb-4 shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md"
      style={{ gridTemplateColumns: "1.4fr 1fr", gap: "18px" }}
      onClick={() => onEdit?.(account)}
    >
      {/* Left */}
      <div className="flex flex-col gap-3">
        {/* Card head */}
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-semibold text-slate-900 leading-tight">
            {account.account_name}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium ${
              isLiving ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isLiving ? "animate-pulse bg-green-500" : "bg-slate-400"
              }`}
            />
            {isLiving ? "直播中" : account.live_status === "banned" ? "封禁" : "未开播"}
          </span>
        </div>

        {/* Meta grid: 2 columns */}
        <div
          className="grid gap-x-3 gap-y-1.5 text-[11px] text-slate-500"
          style={{ gridTemplateColumns: "repeat(2, 1fr)" }}
        >
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">
            平台 / 产品
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">运营</div>
          <div className="flex items-center gap-1 text-slate-700">
            <PlatformBadge platform={account.platform} size="xs" />
            <span className="text-[11px]">{account.product}</span>
          </div>
          <div className="text-slate-700">
            {account.agent_name ?? <span className="text-slate-300">—</span>}
          </div>

          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">直播间</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">手机编号</div>
          <div
            className="text-slate-700"
            style={{ fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: "11px" }}
          >
            {account.room_no ?? <span className="text-slate-300">未绑定</span>}
          </div>
          <div
            className="text-slate-700"
            style={{ fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: "11px" }}
          >
            {account.phone_index ?? <span className="text-slate-300">未绑定</span>}
          </div>

          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">UID</div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] text-slate-400">投放标签</div>
          <div
            className="text-slate-700"
            style={{ fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: "11px" }}
          >
            {account.platform_uid ?? <span className="text-slate-300">未绑定</span>}
          </div>
          <div>
            {account.placement_label ? (
              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-[2px] text-[11px] font-medium text-purple-700">
                <span className="text-[9px] opacity-60">投放</span>
                {account.placement_label}
              </span>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </div>
        </div>

        {/* Schedule timeline */}
        <ScheduleTimeline bindings={scheduleBindings} />
      </div>

      {/* Right: Anchor mini list */}
      <div>
        <AnchorMiniList bindings={scheduleBindings} />
      </div>
    </div>
  );
}
