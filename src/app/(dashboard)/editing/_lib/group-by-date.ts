import type { BoardCard } from "@/modules/editing-task";

export interface DateGroup {
  label: string;
  cards: BoardCard[];
  defaultOpen: boolean;
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
    .map((label, i) => ({
      label,
      cards: buckets.get(label) ?? [],
      defaultOpen: i < 2,
    }));
}
