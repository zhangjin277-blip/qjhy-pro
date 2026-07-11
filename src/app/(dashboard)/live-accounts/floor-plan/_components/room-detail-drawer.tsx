"use client";

import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { productShortName } from "@/modules/live-room";
import type { RoomAccountDetail, RoomCellView } from "@/modules/live-room";

export interface SelectedRoom {
  roomNo: string;
  view: RoomCellView;
  detail: RoomAccountDetail[];
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
}: {
  selected: SelectedRoom | null;
  onClose: () => void;
  /** 点账号卡打开编辑抽屉；返回 false 表示无编辑权限（保持只读） */
  onSelectAccount?: (accountId: string) => boolean;
}) {
  const state = selected ? STATE_LABEL[selected.view.state] : null;
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
              {selected.detail.length === 0 && (
                <div className="py-8 text-center text-sm text-slate-400">
                  该房间还没有绑定直播账号，去「直播账号」页编辑绑定。
                </div>
              )}
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
