/**
 * Dashboard 数字格式化工具
 *
 * 复用 anchors/_components/format.ts 的核心函数（formatChineseNumber / formatCompare），
 * 并增加 dashboard 专用的拆分版本：把数字拆成 「主体 + 单位」 用于大数字渲染。
 */

import { formatChineseNumber, formatCompare } from "@/app/(dashboard)/anchors/_components/format";

export { formatChineseNumber, formatCompare };

/**
 * 把数字拆成「主体 + 单位」两段，用于大字号 KPI 渲染。
 *
 * 例：
 *   16650 → { body: "1.67", unit: "万" }
 *   98    → { body: "98",   unit: ""   }
 *   1.5e8 → { body: "1.5",  unit: "亿" }
 */
export function splitChineseNumber(n: number): { body: string; unit: string } {
  const formatted = formatChineseNumber(n);
  const m = /^(-?[\d,]+(?:\.\d+)?)(亿|万)?$/.exec(formatted);
  if (!m) return { body: formatted, unit: "" };
  return { body: m[1] ?? formatted, unit: m[2] ?? "" };
}

/** 同比百分比简短显示（↑5.2% / ↓24% / —） */
export function formatVsPrevShort(
  cur: number,
  prev: number | null,
): { text: string; kind: "up" | "down" | "flat" | "none" } {
  if (prev === null) return { text: "—", kind: "none" };
  if (prev === 0) {
    if (cur === 0) return { text: "持平", kind: "flat" };
    return { text: "—", kind: "none" };
  }
  if (cur === prev) return { text: "持平", kind: "flat" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.01) return { text: "持平", kind: "flat" };
  const arrow = pct > 0 ? "↑" : "↓";
  // 整数 % 用整数，非整数保留 1 位小数
  const abs = Math.abs(pct);
  const display = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return {
    text: `${arrow}${display}%`,
    kind: pct > 0 ? "up" : "down",
  };
}

/**
 * 用 vs_prev (number | null) 直接生成短同比文本（用于 Section 2）。
 * vs_prev 已经是 (cur - prev) / prev 的比值（小数形式，如 0.052 表示 +5.2%）。
 *
 * NOTE: 我们不假设 API 返回的 vs_prev 单位 —— 如果 |x| ≤ 1 当作小数处理；
 * 否则当作百分点处理，再除 100。这样兼容两种约定，避免误差炸出 ↑520%。
 */
export function formatVsPrevRatio(vs: number | null): {
  text: string;
  kind: "up" | "down" | "flat" | "none";
} {
  if (vs === null || vs === undefined) return { text: "—", kind: "none" };
  const ratio = Math.abs(vs) <= 1 ? vs : vs / 100;
  if (Math.abs(ratio) < 0.0001) return { text: "持平", kind: "flat" };
  const pct = ratio * 100;
  const arrow = pct > 0 ? "↑" : "↓";
  const abs = Math.abs(pct);
  const display = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return {
    text: `${arrow}${display}%`,
    kind: pct > 0 ? "up" : "down",
  };
}

/** 「合计 X · N 主播」展示用 */
export function formatTotalLine(total: number, anchorCount: number): string {
  return `合计 ${formatChineseNumber(total)} · ${anchorCount} 主播`;
}

/** 「N 主播 · X/人」 单段标签 */
export function formatSegmentSubLine(value: number, anchorCount: number): string {
  if (anchorCount <= 0) return `${anchorCount} 主播`;
  const perPerson = value / anchorCount;
  return `${anchorCount} 主播 · ${formatChineseNumber(perPerson)}/人`;
}
