import { mergeWithOverride } from "@/modules/schedule-override";
import { coversHour } from "@/modules/placement";
import type { DefaultSchedule, OverrideSchedule } from "@/modules/schedule-override";

export interface AttributionInput {
  date: string;
  hour: number;
  defaults: DefaultSchedule[];
  overrides: OverrideSchedule[];
}

export interface AttributionResult {
  user: string | null;
  source: "override" | "default" | "conflict" | "unmatched";
}

function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const w = d.getUTCDay();
  return w === 0 ? 7 : w;
}

export function attributeRow(input: AttributionInput): AttributionResult {
  const wd = isoWeekday(input.date);
  const effective = mergeWithOverride(input.defaults, input.overrides);

  const candidates = effective.filter(
    (s) => !s.rest_days.includes(wd) && s.slots.some((slot) => coversHour(slot, input.hour)),
  );

  if (candidates.length === 0) return { user: null, source: "unmatched" };
  if (candidates.length === 1) {
    const c = candidates[0];
    return { user: c?.user ?? null, source: c?.source ?? "unmatched" };
  }
  return { user: null, source: "conflict" };
}
