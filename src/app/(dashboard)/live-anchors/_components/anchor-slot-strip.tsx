"use client";

/**
 * 24 小时直播档期 strip：横线上把 slots 涂蓝，跨日 slot 自动拆成 [start,24] + [0,end]。
 * 设计稿: 112x8 圆角胶囊，6/12/18 三条小白竖线做时刻标记。
 */
interface SlotStripProps {
  slots: [string, string][];
  className?: string;
}

function toHour(t: string): number {
  const parts = t.split(":");
  const hh = Number(parts[0] ?? "0");
  const mm = Number(parts[1] ?? "0");
  return hh + mm / 60;
}

export function AnchorSlotStrip({ slots, className }: SlotStripProps) {
  const blocks: [number, number][] = [];
  for (const [a, b] of slots) {
    const s = toHour(a);
    const e = toHour(b);
    if (e > s) blocks.push([s, e]);
    else {
      blocks.push([s, 24]);
      blocks.push([0, e]);
    }
  }

  return (
    <div
      className={`relative h-2 w-28 shrink-0 overflow-hidden rounded-full bg-slate-100 ${className ?? ""}`}
    >
      {[6, 12, 18].map((h) => (
        <span
          key={h}
          className="absolute inset-y-0 w-px bg-white/70"
          style={{ left: `${(h / 24) * 100}%` }}
        />
      ))}
      {blocks.map(([s, e], i) => (
        <span
          key={i}
          className="absolute inset-y-0 rounded-full bg-blue-500"
          style={{ left: `${(s / 24) * 100}%`, width: `${((e - s) / 24) * 100}%` }}
        />
      ))}
    </div>
  );
}
