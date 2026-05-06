"use client";

import type { AnchorWithDingtalk } from "@/modules/live-anchor";
import { PlatformBadge } from "../../live-accounts/_components/platform-badge";

// 头像：名字首字 + 固定渐变色（按业务线）
function AnchorAvatar({ name, business_line }: { name: string; business_line: string }) {
  const initial = Array.from(name.trim())[0] ?? "?";
  const gradient =
    business_line === "捕鱼"
      ? "from-blue-400 to-blue-600"
      : business_line === "斗地主"
        ? "from-amber-400 to-amber-600"
        : business_line === "麻将"
          ? "from-purple-400 to-purple-600"
          : "from-slate-400 to-slate-600";

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} text-sm font-semibold text-white shadow-sm`}
      style={{ textShadow: "0 1px 0 rgba(0,0,0,0.15)" }}
    >
      {initial}
    </div>
  );
}

// 业务线 chip
function BusinessLineChip({ value }: { value: string }) {
  const cls =
    value === "捕鱼"
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : value === "斗地主"
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : value === "麻将"
          ? "bg-purple-100 text-purple-800 border-purple-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-[7px] py-[1px] text-[11px] font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

// 雇佣类型 chip
function EmploymentChip({ value }: { value: string }) {
  const cls =
    value === "正式"
      ? "bg-green-100 text-green-800 border-green-200 border-solid"
      : value === "合作"
        ? "bg-slate-50 text-slate-700 border-slate-300 border-solid"
        : "bg-white text-orange-700 border-orange-300 border-dashed"; // 试播
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-[7px] py-[1px] text-[11px] font-medium ${cls}`}
    >
      {value}
    </span>
  );
}

// 工作状态色点
function WorkStatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "bg-green-500" : status === "rest" ? "bg-amber-400" : "bg-slate-300";
  const label = status === "active" ? "在播" : status === "rest" ? "休息" : "离职";
  return (
    <span className="inline-flex items-center gap-[5px] text-[11px] text-slate-600">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${color}`} />
      {label}
    </span>
  );
}

interface BindingLite {
  id: string;
  account_id: string | null;
  dingtalk_user_id: string;
  account_name: string | null;
  platform: string | null;
  time_slots: [string, string][];
  rest_days: number[];
}

interface AnchorTableProps {
  anchors: AnchorWithDingtalk[];
  bindingsByAnchor: Record<string, BindingLite[]>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (anchor: AnchorWithDingtalk) => void;
}

export function AnchorTable({
  anchors,
  bindingsByAnchor,
  expandedId,
  onToggleExpand,
  onEdit,
}: AnchorTableProps) {
  if (anchors.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-slate-400">
        暂无主播档案
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
                { label: "姓名", w: "18%" },
                { label: "业务线", w: "8%" },
                { label: "雇佣类型", w: "8%" },
                { label: "试播日", w: "9%" },
                { label: "签约日", w: "9%" },
                { label: "状态", w: "7%" },
                { label: "绑定账号", w: "12%" },
                { label: "修改时间", w: "11%" },
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
            {anchors.map((anchor) => {
              const bindings = bindingsByAnchor[anchor.dingtalk_user_id] ?? [];
              const isExpanded = expandedId === anchor.dingtalk_user_id;

              return (
                <>
                  <tr
                    key={anchor.dingtalk_user_id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-[#fafbfc]"
                    onClick={() => onEdit(anchor)}
                  >
                    {/* 姓名 */}
                    <td className="px-3 py-[11px] align-top">
                      <div className="flex items-center gap-2.5">
                        <AnchorAvatar name={anchor.name} business_line={anchor.business_line} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-slate-900">{anchor.name}</div>
                          {anchor.title && (
                            <div className="mt-0.5 text-[11px] text-slate-400">{anchor.title}</div>
                          )}
                          {anchor.external_name && (
                            <div className="mt-0.5 text-[10.5px] text-slate-400">
                              艺名：{anchor.external_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 业务线 */}
                    <td className="px-3 py-[11px] align-top">
                      <BusinessLineChip value={anchor.business_line} />
                    </td>

                    {/* 雇佣类型 */}
                    <td className="px-3 py-[11px] align-top">
                      <EmploymentChip value={anchor.employment_type} />
                    </td>

                    {/* 试播日 */}
                    <td className="px-3 py-[11px] align-top text-slate-600">
                      {anchor.trial_start_date ?? <span className="text-slate-300">—</span>}
                    </td>

                    {/* 签约日 */}
                    <td className="px-3 py-[11px] align-top text-slate-600">
                      {anchor.contract_date ?? <span className="text-slate-300">—</span>}
                    </td>

                    {/* 状态 */}
                    <td className="px-3 py-[11px] align-top">
                      <WorkStatusDot status={anchor.work_status} />
                    </td>

                    {/* 绑定账号 */}
                    <td className="px-3 py-[11px] align-top">
                      {bindings.length === 0 ? (
                        <span className="text-[11px] text-slate-300">无绑定</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(anchor.dingtalk_user_id);
                          }}
                          className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-[2px] text-[11px] font-medium text-blue-600 hover:bg-blue-100"
                        >
                          {bindings.length} 个账号
                          <span className="text-[10px]">{isExpanded ? "▲" : "▼"}</span>
                        </button>
                      )}
                    </td>

                    {/* 修改时间 */}
                    <td className="px-3 py-[11px] align-top text-[11px] text-slate-400">
                      {anchor.updated_at
                        ? new Date(anchor.updated_at).toLocaleDateString("zh-CN")
                        : "—"}
                    </td>

                    {/* 操作 */}
                    <td className="px-3 py-[11px] align-top">
                      <button
                        className="rounded px-1.5 py-[3px] text-[11px] text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(anchor);
                        }}
                      >
                        ⋯
                      </button>
                    </td>
                  </tr>

                  {/* 展开行：绑定账号列表 */}
                  {isExpanded && (
                    <tr key={`${anchor.dingtalk_user_id}-bindings`} className="bg-blue-50/30">
                      <td colSpan={9} className="px-12 py-3">
                        <div className="flex flex-wrap gap-2">
                          {bindings.map((b) => (
                            <div
                              key={b.id}
                              className="flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-[12px]"
                            >
                              {b.platform && <PlatformBadge platform={b.platform} size="xs" />}
                              <span className="font-medium text-slate-800">
                                {b.account_name ?? "—"}
                              </span>
                              {b.time_slots.length > 0 && (
                                <span className="font-mono text-[10.5px] text-slate-400">
                                  {b.time_slots
                                    .map(([s, e]) => `${s.slice(0, 2)}–${e.slice(0, 2)}`)
                                    .join(" / ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
