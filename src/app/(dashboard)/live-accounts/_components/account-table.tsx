"use client";

import type { AccountWithRelations } from "@/modules/live-account";
import { PlatformBadge } from "./platform-badge";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
  remark: string | null;
}

interface AccountTableProps {
  accounts: AccountWithRelations[];
  bindingsByAccount: Record<string, BindingLite[]>;
  onEdit?: (account: AccountWithRelations) => void;
}

function StatusDot({ status }: { status: string }) {
  const isLiving = status === "living";
  return (
    <span className={`inline-flex items-center gap-[5px] text-[11px] text-slate-600`}>
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          isLiving ? "bg-green-600 shadow-[0_0_0_2px_#d1fae5]" : "bg-slate-300"
        }`}
      />
      {isLiving ? "直播中" : status === "banned" ? "封禁" : "未开播"}
    </span>
  );
}

function AnchorStack({ bindings }: { bindings: BindingLite[] }) {
  if (bindings.length === 0) {
    return <span className="text-[11px] text-slate-300">暂无排班</span>;
  }
  return (
    <div className="flex flex-col gap-[3px] leading-[1.4]">
      {bindings.map((b) => {
        const timeLabel = b.time_slots
          .map(([s, e]) => `${s.slice(0, 2)}–${e.slice(0, 2)}`)
          .join(" / ");
        const restLabel = b.rest_days
          .map((d) => DAY_LABELS[d])
          .filter(Boolean)
          .join("、");

        return (
          <div key={b.dingtalk_user_id} className="flex items-baseline gap-1.5 text-[11.5px]">
            <span className="font-medium text-slate-800">{b.anchor_name ?? "—"}</span>
            <span
              className="text-[10.5px] text-slate-400"
              style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
            >
              {timeLabel}
            </span>
            {restLabel && (
              <span className="ml-auto rounded bg-amber-50 px-[5px] py-[1px] text-[9.5px] text-amber-700">
                {restLabel}休
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AccountTable({ accounts, bindingsByAccount, onEdit }: AccountTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        该产品下暂无账号
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table
        className="w-full border-collapse"
        style={{ fontSize: "12.5px", fontVariantNumeric: "tabular-nums" }}
      >
        <thead>
          <tr>
            {[
              { label: "账号", w: "22%" },
              { label: "平台", w: "7%" },
              { label: "产品", w: "10%" },
              { label: "轮播主播 / 排班", w: "24%" },
              { label: "直播间", w: "7%" },
              { label: "运营", w: "8%" },
              { label: "投放标签", w: "9%" },
              { label: "状态", w: "8%" },
              { label: "", w: "5%" },
            ].map((col) => (
              <th
                key={col.label}
                className="sticky top-0 border-b border-slate-200 bg-white px-3 py-[10px] text-left text-[11px] font-medium uppercase tracking-[0.04em] text-slate-500"
                style={{ width: col.w }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const bindings = bindingsByAccount[account.id] ?? [];
            return (
              <tr
                key={account.id}
                className="cursor-pointer border-b border-slate-100 hover:bg-[#fafbfc]"
                onClick={() => onEdit?.(account)}
              >
                {/* 账号 */}
                <td className="px-3 py-[11px] align-top">
                  <div className="font-medium text-slate-900">{account.account_name}</div>
                  {account.platform_uid && (
                    <div
                      className="mt-0.5 text-[11px] text-slate-400"
                      style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                    >
                      {account.platform_uid}
                    </div>
                  )}
                </td>

                {/* 平台 */}
                <td className="px-3 py-[11px] align-top">
                  <PlatformBadge platform={account.platform} />
                </td>

                {/* 产品 */}
                <td className="px-3 py-[11px] align-top text-slate-700">{account.product}</td>

                {/* 主播排班 */}
                <td className="px-3 py-[11px] align-top">
                  <AnchorStack bindings={bindings} />
                </td>

                {/* 直播间 */}
                <td
                  className="px-3 py-[11px] align-top text-[11.5px] text-slate-600"
                  style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                >
                  {account.room_no ?? <span className="text-slate-300">—</span>}
                </td>

                {/* 运营 */}
                <td className="px-3 py-[11px] align-top text-slate-700">
                  {account.agent_name ?? <span className="text-slate-300">—</span>}
                </td>

                {/* 投放标签 */}
                <td className="px-3 py-[11px] align-top">
                  {account.placement_label ? (
                    <span
                      className="text-[11.5px] text-purple-700"
                      style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                    >
                      {account.placement_label}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>

                {/* 状态 */}
                <td className="px-3 py-[11px] align-top">
                  <StatusDot status={account.live_status} />
                </td>

                {/* 操作 */}
                <td className="px-3 py-[11px] align-top">
                  <button
                    className="rounded px-1.5 py-[3px] text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(account);
                    }}
                  >
                    ⋯
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
