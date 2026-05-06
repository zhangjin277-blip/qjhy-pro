"use client";

import type { AccountWithRelations } from "@/modules/live-account";
import { PlatformBadge } from "./platform-badge";

const DAY_LABELS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// 优先用真实头像 URL（抖音 anchor_profile.avatar），否则用 emoji/首字 fallback
function AccountAvatar({
  name,
  platform,
  avatarUrl,
}: {
  name: string;
  platform: string;
  avatarUrl?: string | null;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
        referrerPolicy="no-referrer"
      />
    );
  }
  // emoji 提取：用 Array.from 处理多字节 unicode
  const chars = Array.from(name);
  const emoji = chars.find((c) => /\p{Extended_Pictographic}/u.test(c));
  // 否则用首字（去掉常见前缀的"产品名-"以提取真名）
  const trimmed = name.replace(/^.+?[-－]/, "").trim() || name;
  const initial = Array.from(trimmed)[0] ?? "?";
  const display = emoji ?? initial;

  const gradient =
    platform === "抖音"
      ? "from-pink-400 to-pink-600"
      : platform === "快手"
        ? "from-orange-400 to-orange-600"
        : platform === "B站"
          ? "from-cyan-400 to-cyan-600"
          : "from-slate-400 to-slate-600";

  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-base font-semibold text-white shadow-sm`}
      style={{ textShadow: "0 1px 0 rgba(0,0,0,0.15)" }}
    >
      {display}
    </div>
  );
}

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
  avatarByPlatformId: Record<string, string | null>;
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

export function AccountTable({
  accounts,
  bindingsByAccount,
  avatarByPlatformId,
  onEdit,
}: AccountTableProps) {
  if (accounts.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        该产品下暂无账号
      </div>
    );
  }

  return (
    <div
      className="min-w-0 max-w-full overflow-hidden rounded-lg shadow-sm"
      style={{
        background: "rgba(255, 255, 255, 0.92)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="max-w-full overflow-auto">
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
                    <div className="flex items-center gap-2.5">
                      <AccountAvatar
                        name={account.account_name}
                        platform={account.platform}
                        avatarUrl={
                          account.platform_account_id
                            ? avatarByPlatformId[account.platform_account_id]
                            : null
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-slate-900">
                          {account.account_name}
                        </div>
                        {account.platform_account_id && (
                          <div
                            className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"
                            style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                          >
                            <span className="text-slate-400">♪</span>
                            {account.platform_account_id}
                          </div>
                        )}
                        {account.platform_uid && (
                          <div
                            className="mt-px text-[10.5px] text-slate-400"
                            style={{ fontFamily: 'ui-monospace, "SF Mono", monospace' }}
                          >
                            UID {account.platform_uid}
                          </div>
                        )}
                      </div>
                    </div>
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
    </div>
  );
}
