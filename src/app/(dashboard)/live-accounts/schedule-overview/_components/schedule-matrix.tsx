"use client";

import { useRouter } from "next/navigation";
import { hourMatchesTimeSlots } from "@/modules/live-account";
import type { AccountWithRelations } from "@/modules/live-account";
import { PlatformBadge } from "../../_components/platform-badge";

interface Binding {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

interface Props {
  accounts: AccountWithRelations[];
  bindings: Binding[];
}

// 0..32 表示当天 0-23 + 次日 0-8（覆盖跨夜班）
const HOURS = Array.from({ length: 33 }, (_, i) => i);

const COLOR_PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-orange-100 text-orange-800",
  "bg-purple-100 text-purple-800",
  "bg-pink-100 text-pink-800",
  "bg-cyan-100 text-cyan-800",
  "bg-amber-100 text-amber-800",
  "bg-indigo-100 text-indigo-800",
];

export function ScheduleMatrix({ accounts, bindings }: Props) {
  const router = useRouter();

  // anchor 名字 → 颜色（稳定 index，基于 Set 遍历顺序）
  const anchorColorMap = new Map<string, string>();
  for (const b of bindings) {
    const key = b.anchor_name ?? b.dingtalk_user_id;
    if (!anchorColorMap.has(key)) {
      anchorColorMap.set(
        key,
        COLOR_PALETTE[anchorColorMap.size % COLOR_PALETTE.length] ?? "bg-slate-100 text-slate-700",
      );
    }
  }

  // 按 product 分组 accounts
  const byProduct = accounts.reduce<Record<string, AccountWithRelations[]>>((m, a) => {
    if (!m[a.product]) m[a.product] = [];
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    m[a.product]!.push(a);
    return m;
  }, {});

  if (accounts.length === 0) {
    return <div className="py-20 text-center text-sm text-slate-400">该筛选下暂无账号</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-auto text-xs">
        <thead className="sticky top-0 bg-slate-50">
          <tr>
            <th className="w-[220px] border-r border-slate-200 px-3 py-2 text-left font-medium text-slate-600">
              账号
            </th>
            {HOURS.map((h) => (
              <th
                key={h}
                className={`w-9 border-r border-slate-200 py-2 font-mono text-[10px] ${h >= 24 ? "text-slate-400 bg-slate-50/60" : "text-slate-500"}`}
              >
                {h < 24 ? h : `${h - 24}+1`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(byProduct).map(([product, accs]) => (
            <>
              <tr key={`g-${product}`}>
                <td
                  colSpan={HOURS.length + 1}
                  className="border-y border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500"
                >
                  {product} · {accs.length}
                </td>
              </tr>
              {accs.map((a) => {
                const accBindings = bindings.filter((b) => b.account_id === a.id);
                return (
                  <tr
                    key={a.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50/50"
                    onClick={() =>
                      router.push(`/live-accounts?product=${encodeURIComponent(a.product)}`)
                    }
                    title={`跳转到 ${a.product}`}
                  >
                    <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <PlatformBadge platform={a.platform} size="xs" />
                        <span className="font-medium text-slate-800">{a.account_name}</span>
                        {a.room_no && (
                          <span className="font-mono text-[10px] text-slate-400">{a.room_no}</span>
                        )}
                      </div>
                    </td>
                    {HOURS.map((h) => {
                      // h ≥ 24 表示次日，命中判定取 h%24
                      const onDuty = accBindings.find((b) =>
                        hourMatchesTimeSlots(b.time_slots, h % 24),
                      );
                      const name = onDuty?.anchor_name ?? null;
                      const colorCls = name ? (anchorColorMap.get(name) ?? "bg-slate-100") : "";
                      return (
                        <td
                          key={h}
                          className={`border-r border-slate-100 text-center text-[10px] ${colorCls} ${h >= 24 ? "bg-opacity-50" : ""}`}
                          title={name ?? ""}
                          style={{ height: 28 }}
                        >
                          {name ? Array.from(name)[0] : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
        点击行跳转到「直播账号」详情页编辑排班 · 颜色不持久化（每次刷新可能不同）
      </div>
    </div>
  );
}
