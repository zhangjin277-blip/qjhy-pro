/**
 * 业务线 → Tailwind class 集合。各业务线使用独立配色。
 * - gradient: 头像 / 顶部色条 / 频谱条
 * - chipBg / chipFg / chipBd: chip 内底色/文字/边
 * - dotGradient: pill tab + chip 上的小圆点（用 gradient class，配合 bg-gradient-to-br）
 */
export interface BusinessLineStyle {
  gradient: string; // bg-gradient-to-br from-* to-*
  chipBg: string;
  chipFg: string;
  chipBd: string;
  // pill tab active 状态颜色 (active 时把 chipFg 当文字 + chipBg 当底)
  ringTint: string; // shadow ring 时用
}

export const BUSINESS_LINE_STYLES: Record<string, BusinessLineStyle> = {
  捕鱼大作战: {
    gradient: "from-blue-400 to-blue-600",
    chipBg: "bg-blue-100",
    chipFg: "text-blue-700",
    chipBd: "border-blue-200",
    ringTint: "shadow-blue-100",
  },
  途游休闲捕鱼: {
    gradient: "from-sky-400 to-sky-600",
    chipBg: "bg-sky-100",
    chipFg: "text-sky-700",
    chipBd: "border-sky-200",
    ringTint: "shadow-sky-100",
  },
  电玩捕鱼: {
    gradient: "from-cyan-400 to-cyan-600",
    chipBg: "bg-cyan-100",
    chipFg: "text-cyan-800",
    chipBd: "border-cyan-200",
    ringTint: "shadow-cyan-100",
  },
  斗地主: {
    gradient: "from-amber-400 to-amber-600",
    chipBg: "bg-amber-100",
    chipFg: "text-amber-800",
    chipBd: "border-amber-200",
    ringTint: "shadow-amber-100",
  },
  麻将: {
    gradient: "from-purple-400 to-purple-600",
    chipBg: "bg-purple-100",
    chipFg: "text-purple-700",
    chipBd: "border-purple-200",
    ringTint: "shadow-purple-100",
  },
  "三国:冰河时代": {
    gradient: "from-emerald-400 to-emerald-600",
    chipBg: "bg-emerald-100",
    chipFg: "text-emerald-700",
    chipBd: "border-emerald-200",
    ringTint: "shadow-emerald-100",
  },
  造化仙府: {
    gradient: "from-rose-400 to-rose-600",
    chipBg: "bg-rose-100",
    chipFg: "text-rose-700",
    chipBd: "border-rose-200",
    ringTint: "shadow-rose-100",
  },
  // 历史值兜底
  捕鱼: {
    gradient: "from-blue-400 to-blue-600",
    chipBg: "bg-blue-100",
    chipFg: "text-blue-700",
    chipBd: "border-blue-200",
    ringTint: "shadow-blue-100",
  },
};

export const BUSINESS_LINE_FALLBACK: BusinessLineStyle = {
  gradient: "from-slate-400 to-slate-600",
  chipBg: "bg-slate-100",
  chipFg: "text-slate-600",
  chipBd: "border-slate-200",
  ringTint: "shadow-slate-100",
};

export function blStyle(value: string | null | undefined): BusinessLineStyle {
  if (!value) return BUSINESS_LINE_FALLBACK;
  return BUSINESS_LINE_STYLES[value] ?? BUSINESS_LINE_FALLBACK;
}

export const BUSINESS_LINE_TABS = [
  { key: "all", label: "全部" },
  { key: "捕鱼大作战", label: "捕鱼大作战" },
  { key: "途游休闲捕鱼", label: "途游休闲捕鱼" },
  { key: "电玩捕鱼", label: "电玩捕鱼" },
  { key: "斗地主", label: "斗地主" },
  { key: "麻将", label: "麻将" },
  { key: "三国:冰河时代", label: "三国:冰河时代" },
  { key: "造化仙府", label: "造化仙府" },
] as const;

export type BusinessLineTabKey = (typeof BUSINESS_LINE_TABS)[number]["key"];
