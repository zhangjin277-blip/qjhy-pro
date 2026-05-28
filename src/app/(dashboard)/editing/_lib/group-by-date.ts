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
  if (urgent.length > 0)
    groups.push({ label: "🔴 紧急任务", cards: urgent, defaultOpen: true, variant: "urgent" });
  if (disqualified.length > 0)
    groups.push({
      label: "❌ 不合格素材",
      cards: disqualified,
      defaultOpen: true,
      variant: "disqualified",
    });

  groups.push(...groupByDate(rest, dateField).map((g) => ({ ...g, variant: "default" as const })));
  return groups;
}

export function groupByDate(
  cards: BoardCard[],
  field: "enteredStatusAt" | "publishedAt" | "materialDate",
): DateGroup[] {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  const buckets = new Map<string, BoardCard[]>();
  for (const c of cards) {
    const fieldValue = c[field];
    const date = typeof fieldValue === "string" ? fieldValue.slice(0, 10) : today;
    let bucket: string;
    if (date === today) bucket = `今天 · ${today.slice(5)}`;
    else if (date === yesterday) bucket = `昨天 · ${yesterday.slice(5)}`;
    else if (date === dayBefore) bucket = `前天 · ${dayBefore.slice(5)}`;
    else bucket = "更早";
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    const existing = buckets.get(bucket);
    if (existing) existing.push(c);
  }

  const order = [
    `今天 · ${today.slice(5)}`,
    `昨天 · ${yesterday.slice(5)}`,
    `前天 · ${dayBefore.slice(5)}`,
    "更早",
  ];
  return order
    .filter((l) => buckets.has(l))
    .map((label) => ({
      label,
      cards: buckets.get(label) ?? [],
      defaultOpen: label.startsWith("今天"),
    }));
}
