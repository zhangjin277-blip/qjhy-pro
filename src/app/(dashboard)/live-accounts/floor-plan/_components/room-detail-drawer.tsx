"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { productShortName } from "@/modules/live-room";
import type { RoomAccountDetail, RoomCellView } from "@/modules/live-room";

export interface SelectedRoom {
  roomNo: string;
  /** live_room 主键；字典还没这条房号时为 null */
  roomId: string | null;
  view: RoomCellView;
  detail: RoomAccountDetail[];
}

export interface UnboundAccountLite {
  id: string;
  account_name: string;
  platform: string;
  product: string;
}

const STATE_LABEL: Record<RoomCellView["state"], { text: string; cls: string }> = {
  living_checkin: { text: "在播 · 已打卡", cls: "bg-[#EBF1FF] text-[#2B5CFF]" },
  living_crawler: { text: "在播 · 未打卡", cls: "bg-[#EBF1FF] text-[#2B5CFF]" },
  rest: { text: "今日休", cls: "bg-[#FFF7E8] text-[#FF7D00]" },
  idle: { text: "空闲", cls: "bg-slate-100 text-slate-500" },
  vacant: { text: "未绑账号", cls: "bg-slate-100 text-slate-400" },
};

const PLATFORM_CLS: Record<string, string> = {
  抖音: "bg-[#FFECE8] text-[#F53F3F]",
  快手: "bg-[#FFF7E8] text-[#FF7D00]",
};

export function RoomDetailDrawer({
  selected,
  onClose,
  onSelectAccount,
  unboundAccounts,
  onBindAccount,
  onCreateAccount,
}: {
  selected: SelectedRoom | null;
  onClose: () => void;
  /** 点账号卡打开编辑抽屉；返回 false 表示无编辑权限（保持只读） */
  onSelectAccount?: (accountId: string) => boolean;
  /** 未绑房间的账号（空房绑定候选）；不传 = 无编辑权限 */
  unboundAccounts?: UnboundAccountLite[];
  onBindAccount?: (accountId: string, room: SelectedRoom) => Promise<boolean>;
  onCreateAccount?: (room: SelectedRoom) => Promise<void>;
}) {
  const state = selected ? STATE_LABEL[selected.view.state] : null;
  const [query, setQuery] = useState("");
  const filteredUnbound = (unboundAccounts ?? []).filter(
    (a) =>
      !query.trim() ||
      a.account_name.toLowerCase().includes(query.trim().toLowerCase()) ||
      a.product.includes(query.trim()),
  );
  return (
    <Sheet open={selected !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[420px] gap-0 overflow-y-auto p-0 sm:max-w-[92vw]">
        {selected && state && (
          <>
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
              <SheetTitle className="text-base font-semibold text-slate-800">
                {selected.roomNo}
              </SheetTitle>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${state.cls}`}>
                {state.text}
              </span>
              <SheetDescription className="sr-only">直播间账号与排班详情</SheetDescription>
            </div>

            <div className="space-y-3 px-5 py-4">
              {selected.detail.length === 0 &&
                (onBindAccount && unboundAccounts ? (
                  <div className="space-y-2.5">
                    <div className="text-xs text-slate-500">
                      该房间还没有绑定账号，从下面选一个未绑房间的账号绑进来：
                    </div>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={`搜索账号名 / 产品…（共 ${unboundAccounts.length} 个未绑房）`}
                      className="w-full rounded border border-slate-200 px-3 py-2 text-[13px] placeholder:text-slate-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                      {filteredUnbound.length === 0 && (
                        <div className="py-4 text-center text-xs text-slate-400">无匹配账号</div>
                      )}
                      {filteredUnbound.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => void onBindAccount(a.id, selected)}
                          className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-[#2B5CFF]"
                        >
                          <span className="min-w-0 truncate text-[13px] font-medium text-slate-800">
                            {a.account_name}
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium ${PLATFORM_CLS[a.platform] ?? "bg-slate-100 text-slate-500"}`}
                          >
                            {a.platform}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">
                            {productShortName(a.product)}
                          </span>
                          <span className="ml-auto shrink-0 text-[11px] text-[#2B5CFF]">
                            绑定 ›
                          </span>
                        </button>
                      ))}
                    </div>
                    {onCreateAccount && (
                      <button
                        type="button"
                        onClick={() => void onCreateAccount(selected)}
                        className="w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-center text-[13px] text-slate-500 transition-colors hover:border-[#2B5CFF] hover:text-[#2B5CFF]"
                      >
                        ＋ 新建账号并绑定到 {selected.roomNo}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-slate-400">
                    该房间还没有绑定直播账号，去「直播账号」页编辑绑定。
                  </div>
                ))}
              {selected.detail.map((acc) => (
                <div
                  key={acc.accountId}
                  {...(onSelectAccount
                    ? {
                        onClick: () => onSelectAccount(acc.accountId),
                        className:
                          "cursor-pointer rounded-lg border border-slate-200 p-3 transition-colors hover:border-[#2B5CFF]",
                      }
                    : { className: "rounded-lg border border-slate-200 p-3" })}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-medium text-slate-800">
                      {acc.accountName}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-px text-[10px] font-medium ${PLATFORM_CLS[acc.platform] ?? "bg-slate-100 text-slate-500"}`}
                    >
                      {acc.platform}
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-px text-[10px] text-slate-500">
                      {productShortName(acc.product)}
                    </span>
                    {onSelectAccount && (
                      <span className="ml-auto text-[11px] text-slate-400">编辑 ›</span>
                    )}
                  </div>

                  {acc.checkin && (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="text-slate-400">打卡在播：</span>
                      {acc.checkin.anchorName}
                      <span className="ml-1.5 tabular-nums text-[#2B5CFF]">
                        {acc.checkin.startAtLabel} 开播
                      </span>
                    </div>
                  )}
                  {!acc.checkin && acc.crawlerLiving && (
                    <div className="mt-2 text-xs text-slate-600">
                      <span className="text-slate-400">平台在播：</span>
                      {acc.crawlerStartLabel ? (
                        <span className="tabular-nums text-[#2B5CFF]">
                          {acc.crawlerStartLabel} 开播
                        </span>
                      ) : (
                        "在播中（未打卡）"
                      )}
                    </div>
                  )}

                  {acc.schedule.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="text-[11px] text-slate-400">今日排班</div>
                      {acc.schedule.map((s) => (
                        <div
                          key={s.anchorName}
                          className="flex items-center gap-2 text-xs text-slate-600"
                        >
                          <span className="min-w-0 truncate">{s.anchorName}</span>
                          {s.restToday ? (
                            <span className="rounded-full bg-[#FFF7E8] px-1.5 text-[10px] text-[#FF7D00]">
                              休
                            </span>
                          ) : (
                            <span className="tabular-nums text-slate-400">
                              {s.slots.map((slot) => `${slot[0]}–${slot[1]}`).join(" / ")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
