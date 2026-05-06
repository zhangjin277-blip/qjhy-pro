import type { BoardFilter } from "./queries";

const PRESET_DAYS: Record<string, number> = {
  today: 0,
  yesterday: 1,
  last7: 7,
  last30: 30,
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveFilter(
  searchParams: Record<string, string | string[] | undefined>,
): BoardFilter {
  const preset = (searchParams.preset as string) ?? "last7";
  const days = PRESET_DAYS[preset] ?? 7;
  const today = new Date();
  const to = new Date(today);
  const from = new Date(today);
  if (preset === "today") {
    // both = today
  } else if (preset === "yesterday") {
    from.setDate(from.getDate() - 1);
    to.setDate(to.getDate() - 1);
  } else {
    from.setDate(from.getDate() - days);
  }

  const dsParam = searchParams.ds as string | undefined;
  const dataset_ids = dsParam ? dsParam.split(",").filter(Boolean) : undefined;
  const search = (searchParams.q as string) || undefined;
  const anchor_label = (searchParams.anchor as string) || undefined;
  const rawView = searchParams.view as string | undefined;
  const view =
    rawView === "summary" || rawView === "schedule" || rawView === "detail" ? rawView : "detail";

  return {
    date_from: isoDate(from),
    date_to: isoDate(to),
    dataset_ids,
    search,
    anchor_label,
    view,
  };
}
