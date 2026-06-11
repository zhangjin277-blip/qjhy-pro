import type { BoardCard } from "@/modules/editing-task";

export interface DateGroup {
  label: string;
  cards: BoardCard[];
  defaultOpen: boolean;
  variant?: "urgent" | "disqualified" | "default";
}

export function groupBoardCards(
  cards: BoardCard[],
  dateField: "enteredStatusAt" | "publishedAt" | "materialDate",
): DateGroup[] {
  const urgent: BoardCard[] = [];
  const disqualified: BoardCard[] = [];
  const rest: BoardCard[] = [];

  for (const c of cards) {
    if (c.priority === "urgent") urgent.push(c);
    else if (c.isDisqualified) disqualified.push(c);
    else rest.push(c);
  }

  const groups: DateGroup[] = [];
  // 顺序：紧急置顶 → 日期组 → 不合格素材垫底（废弃料优先级最低）
  if (urgent.length > 0)
    groups.push({ label: "🔴 紧急任务", cards: urgent, defaultOpen: false, variant: "urgent" });

  groups.push(...groupByDate(rest, dateField).map((g) => ({ ...g, variant: "default" as const })));

  if (disqualified.length > 0)
    groups.push({
      label: "❌ 不合格素材",
      cards: disqualified,
      defaultOpen: false,
      variant: "disqualified",
    });
  return groups;
}

const WEEKDAY = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/**
 * Date → Asia/Shanghai 日历日期串（YYYY-MM-DD）。
 * 看板按北京时间分天，不能用 toISOString（UTC）—— 北京凌晨 0-8 点会错位到前一天，
 * 「今天」组标错日期、当天卡片掉进「更早」。
 */
export function shanghaiDateStr(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

/** 最近 7 天逐日单独成组，第 7 天之前才并入「更早」。 */
export function groupByDate(
  cards: BoardCard[],
  field: "enteredStatusAt" | "publishedAt" | "materialDate",
): DateGroup[] {
  // 生成最近 7 天（含今天）的 {date, label}，今天/昨天/前天用中文，其余用「周X · MM-DD」
  const days = Array.from({ length: 7 }, (_, n) => {
    const date = shanghaiDateStr(new Date(Date.now() - n * 86400000));
    const md = date.slice(5);
    // 日期串 + T00:00:00Z 解析成 UTC 零点，getUTCDay 即该日历日期的星期（与本机时区无关）
    const weekday = WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const label =
      n === 0
        ? `今天 · ${md}`
        : n === 1
          ? `昨天 · ${md}`
          : n === 2
            ? `前天 · ${md}`
            : `${weekday} · ${md}`;
    return { date, label };
  });
  const today = shanghaiDateStr(new Date());
  const dayByDate = new Map(days.map((d) => [d.date, d.label]));
  const EARLIER = "更早";

  const buckets = new Map<string, BoardCard[]>();
  for (const c of cards) {
    const fieldValue = c[field];
    // materialDate 是纯日期串（UTC 零点解析 = 北京同日），时间戳字段按北京时间切日
    const date = typeof fieldValue === "string" ? shanghaiDateStr(new Date(fieldValue)) : today;
    const bucket = dayByDate.get(date) ?? EARLIER;
    const existing = buckets.get(bucket);
    if (existing) existing.push(c);
    else buckets.set(bucket, [c]);
  }

  const order = [...days.map((d) => d.label), EARLIER];
  return order
    .filter((l) => buckets.has(l))
    .map((label) => ({
      label,
      cards: buckets.get(label) ?? [],
      defaultOpen: false, // 默认全部折叠（标题显示数量，点开才看卡片）
    }));
}
