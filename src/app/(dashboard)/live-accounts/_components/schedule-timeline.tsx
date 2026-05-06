"use client";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f97316",
  "#a855f7",
  "#ec4899",
  "#06b6d4",
  "#6366f1",
  "#f59e0b",
];

const AVATAR_GRADIENTS = [
  ["#3b82f6", "#0958d9"],
  ["#10b981", "#059669"],
  ["#f97316", "#ea580c"],
  ["#a855f7", "#9333ea"],
  ["#ec4899", "#db2777"],
  ["#06b6d4", "#0891b2"],
  ["#6366f1", "#4f46e5"],
  ["#f59e0b", "#d97706"],
];

export interface ScheduleBinding {
  dingtalk_user_id: string;
  anchor_name: string | null;
  time_slots: [string, string][];
}

function parseHour(t: string): number {
  return parseInt(t.split(":")[0] ?? "0", 10);
}

export function ScheduleTimeline({ bindings }: { bindings: ScheduleBinding[] }) {
  const colorMap = new Map<string, string>();
  bindings.forEach((b, i) => {
    colorMap.set(b.dingtalk_user_id, COLORS[i % COLORS.length] ?? "#94a3b8");
  });

  const blocks: {
    start: number;
    width: number;
    color: string;
    name: string;
  }[] = [];

  for (const b of bindings) {
    const color = colorMap.get(b.dingtalk_user_id) ?? "#94a3b8";
    const name = b.anchor_name ?? "";
    for (const [s, e] of b.time_slots) {
      const sh = parseHour(s);
      const eh = parseHour(e);
      if (eh > sh) {
        blocks.push({ start: sh, width: eh - sh, color, name });
      } else if (eh < sh) {
        blocks.push({ start: sh, width: 24 - sh, color, name });
        blocks.push({ start: 0, width: eh, color, name });
      }
    }
  }

  const label =
    bindings.length === 0
      ? "暂无排班"
      : bindings.length === 1
        ? "个播"
        : `${bindings.length} 主播轮播`;

  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[9.5px] uppercase tracking-wider text-slate-400">
        <span>24h 排班</span>
        <span>{label}</span>
      </div>
      <div className="relative h-7 overflow-hidden rounded bg-slate-100">
        {[6, 12, 18].map((h) => (
          <div
            key={h}
            className="absolute top-0 bottom-0 w-px bg-white/70"
            style={{ left: `${(h / 24) * 100}%` }}
          />
        ))}
        {blocks.map((b, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex items-center justify-center whitespace-nowrap rounded-sm px-1 text-[10px] font-medium text-white"
            style={{
              left: `${(b.start / 24) * 100}%`,
              width: `${(b.width / 24) * 100}%`,
              backgroundColor: b.color,
              textShadow: "0 1px 0 rgba(0,0,0,0.15)",
            }}
            title={`${b.name} ${b.start}:00-${b.start + b.width}:00`}
          >
            {b.width >= 2 ? b.name.slice(0, 2) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export function getAvatarGradient(index: number): [string, string] {
  return (
    (AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] as [string, string]) ?? [
      "#94a3b8",
      "#64748b",
    ]
  );
}
