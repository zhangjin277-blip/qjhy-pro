/** 中文数字缩写：≥1 亿 → 「N 亿」，≥1 万 → 「N 万」，否则原数字 */
export function formatChineseNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}亿`;
  if (abs >= 10_000) return `${(n / 10_000).toFixed(2).replace(/\.?0+$/, "")}万`;
  return n.toLocaleString("zh-CN");
}

/** 单元格 / KPI 数值 → 显示字符串，根据列定义的 fmt 格式化 */
export type CellFmt = "number" | "duration" | "percent" | "timestamp" | "text" | string;

export function formatCellValue(v: string | number | null | undefined, fmt: CellFmt): string {
  if (fmt === "duration") {
    if (typeof v !== "number") return "0h";
    return `${v.toFixed(1)}h`;
  }
  if (fmt === "number") {
    if (typeof v !== "number") return "0";
    return formatChineseNumber(v);
  }
  if (fmt === "percent") {
    if (typeof v !== "number") return "0%";
    return `${(v * 100).toFixed(2)}%`;
  }
  if (fmt === "timestamp") {
    if (typeof v !== "number" || v === 0) return "—";
    const ms = v > 1e10 ? v : v * 1000;
    return new Date(ms).toLocaleDateString("zh-CN");
  }
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

/** 同比对比：当前值 vs 前一周期同长度的值，返回带箭头的小字 */
export function formatCompare(
  cur: number,
  prev: number | null,
  periodDays: number,
): { text: string; kind: "up" | "down" | "flat" | "none" } | null {
  const label = `较前${periodDays}日`;
  if (prev === null || prev === 0) {
    if (cur === 0) return { text: `${label} 持平`, kind: "flat" };
    return { text: `${label} —`, kind: "none" };
  }
  if (cur === prev) return { text: `${label} 持平`, kind: "flat" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.01) return { text: `${label} 持平`, kind: "flat" };
  const arrow = pct > 0 ? "↑" : "↓";
  return {
    text: `${label} ${arrow}${Math.abs(pct).toFixed(2)}%`,
    kind: pct > 0 ? "up" : "down",
  };
}
