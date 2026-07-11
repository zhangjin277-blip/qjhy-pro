"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { FloorCellZone, RoomCellView } from "@/modules/live-room";

export type CellVM =
  | FloorCellZone
  | {
      kind: "room";
      roomNo: string;
      col: number;
      row: number;
      w: number;
      h: number;
      view: RoomCellView;
    };

export interface SectionVM {
  key: string;
  title?: string;
  columns: number;
  cells: CellVM[];
}

interface Props {
  sections: SectionVM[];
  stats: {
    livingCheckin: number;
    livingCrawler: number;
    rest: number;
    idle: number;
    vacant: number;
  };
  unmapped: string[];
  generatedAtHHmm: string;
}

/** 产品短名 → tag 配色（老系统 tag 心智，饱和度收敛到 token 体系） */
const TAG_STYLES: Record<string, string> = {
  大作战: "text-[#2B5CFF] bg-[#EBF1FF]",
  斗地主: "text-[#0E9CA8] bg-[#E6F8FA]",
  休闲捕鱼: "text-[#0DA06F] bg-[#E7F8F1]",
  电玩捕鱼: "text-[#00B42A] bg-[#E8FFEA]",
  三冰: "text-[#F53F3F] bg-[#FFECE8]",
  线上招募: "text-[#6B7785] bg-[#F2F3F5]",
};

const REFRESH_INTERVAL_MS = 60_000;

function ProductTags({ products }: { products: string[] }) {
  if (products.length === 0) return null;
  const shown = products.slice(0, 2);
  const more = products.length - shown.length;
  return (
    <span className="flex flex-wrap items-center justify-center gap-1">
      {shown.map((p) => (
        <span
          key={p}
          className={`rounded-full px-2 py-px text-[11px] font-medium ${TAG_STYLES[p] ?? "bg-slate-100 text-slate-500"}`}
        >
          {p}
        </span>
      ))}
      {more > 0 && <span className="text-[10px] text-slate-400">+{more}</span>}
    </span>
  );
}

/** 呼吸红点（与直播录制页录制态同语言） */
function LiveDot() {
  return (
    <span className="absolute right-1.5 top-1.5 flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-red-500" />
    </span>
  );
}

function RoomCell({ roomNo, view }: { roomNo: string; view: RoomCellView }) {
  const base =
    "relative flex h-full min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center";

  const first = view.checkins[0];
  if (view.state === "living_checkin" && first) {
    const more = view.checkins.length - 1;
    return (
      <div
        className={`${base} border-[1.5px] border-[#2B5CFF] bg-[#EBF1FF] shadow-[0_2px_4px_rgba(43,92,255,0.08)]`}
      >
        <LiveDot />
        <span className="text-[13px] font-semibold text-slate-800">{roomNo}</span>
        <ProductTags products={view.products} />
        <span className="max-w-full truncate text-[11px] text-slate-600">
          {first.anchorName}
          {more > 0 && ` +${more}`}
        </span>
        <span className="text-[11px] font-medium tabular-nums text-[#2B5CFF]">
          {first.startAtLabel} 开播
        </span>
      </div>
    );
  }

  if (view.state === "living_crawler") {
    return (
      <div className={`${base} border-[1.5px] border-[#85ADFF] bg-white`}>
        <LiveDot />
        <span className="text-[13px] font-semibold text-slate-800">{roomNo}</span>
        <ProductTags products={view.products} />
        <span className="text-[10px] text-slate-400">在播 · 未打卡</span>
      </div>
    );
  }

  if (view.state === "rest") {
    return (
      <div className={`${base} border border-dashed border-[#FF7D00] bg-[#FFF7E8]`}>
        <span className="text-[13px] font-semibold text-slate-800">{roomNo}</span>
        <ProductTags products={view.products} />
        <span className="text-[11px] text-[#FF7D00]">今日休</span>
      </div>
    );
  }

  if (view.state === "idle") {
    return (
      <div className={`${base} border border-slate-200 bg-white`}>
        <span className="text-[13px] font-semibold text-slate-800">{roomNo}</span>
        <ProductTags products={view.products} />
      </div>
    );
  }

  // vacant
  return (
    <div className={`${base} border border-slate-200 bg-white`}>
      <span className="text-[13px] font-medium text-slate-400">{roomNo}</span>
    </div>
  );
}

function ZoneCell({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-slate-200 bg-[#F7F8FA] px-1 text-center">
      <span className="text-xs text-slate-400">{label}</span>
      {sub && <span className="text-[10px] text-slate-300">{sub}</span>}
    </div>
  );
}

function LegendChip({ className }: { className: string }) {
  return <span className={`inline-block size-3.5 rounded ${className}`} />;
}

export function FloorPlanBoard({ sections, stats, unmapped, generatedAtHHmm }: Props) {
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);

  const living = stats.livingCheckin + stats.livingCrawler;

  return (
    <div className="min-w-0 max-w-full space-y-3 px-1 py-1 md:px-1.5 md:py-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 pb-1">
        <span className="px-3 py-1.5 text-sm font-semibold text-slate-700">直播间平面图</span>
        <span className="text-xs tabular-nums text-slate-500">
          在播 <b className="text-[#2B5CFF]">{living}</b>
          {stats.livingCrawler > 0 && (
            <span className="text-slate-400">（未打卡 {stats.livingCrawler}）</span>
          )}
          <span className="mx-1.5 text-slate-300">·</span>空闲 {stats.idle}
          <span className="mx-1.5 text-slate-300">·</span>今日休 {stats.rest}
          <span className="mx-1.5 text-slate-300">·</span>空房 {stats.vacant}
        </span>
        <span className="ml-auto px-3 text-xs text-slate-400">
          更新于 {generatedAtHHmm} · 每分钟自动刷新
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-[1280px] space-y-5">
          {sections.map((sec) => (
            <div key={sec.key}>
              {sec.title && (
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                  <span className="h-3.5 w-[3px] rounded-full bg-[#2B5CFF]" />
                  {sec.title}
                </div>
              )}
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${sec.columns}, minmax(0, 1fr))`,
                  gridAutoRows: "minmax(92px, auto)",
                }}
              >
                {sec.cells.map((cell, i) => (
                  <div
                    key={cell.kind === "room" ? cell.roomNo : `${cell.label}-${i}`}
                    style={{
                      gridColumn: `${cell.col} / span ${cell.w}`,
                      gridRow: `${cell.row} / span ${cell.h}`,
                    }}
                  >
                    {cell.kind === "room" ? (
                      <RoomCell roomNo={cell.roomNo} view={cell.view} />
                    ) : (
                      <ZoneCell label={cell.label} sub={cell.sub} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <LegendChip className="border border-[#2B5CFF] bg-[#EBF1FF]" />
              在播（打卡）
            </span>
            <span className="flex items-center gap-1.5">
              <LegendChip className="border-[1.5px] border-[#85ADFF] bg-white" />
              在播（仅爬虫，未打卡）
            </span>
            <span className="flex items-center gap-1.5">
              <LegendChip className="border border-slate-200 bg-white" />
              空闲 / 空房
            </span>
            <span className="flex items-center gap-1.5">
              <LegendChip className="border border-dashed border-[#FF7D00] bg-[#FFF7E8]" />
              今日休
            </span>
            <span className="flex items-center gap-1.5">
              <LegendChip className="border border-dashed border-slate-200 bg-[#F7F8FA]" />
              功能区
            </span>
          </div>
        </div>
      </div>

      {unmapped.length > 0 && (
        <div className="rounded-lg border border-[#FF7D00]/30 bg-[#FFF7E8] px-4 py-2 text-xs text-slate-600">
          <b className="text-[#FF7D00]">未上图房间（{unmapped.length}）：</b>
          {unmapped.join("、")}
          <span className="ml-2 text-slate-400">
            —— 库里存在但平面图配置里没有对应格子，改 floorplan.ts 后自动上图
          </span>
        </div>
      )}
    </div>
  );
}
