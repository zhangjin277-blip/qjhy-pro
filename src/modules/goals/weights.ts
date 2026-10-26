import type { GoalDefinition } from "./types";

/** Normalize weights in the currently displayed scope, retaining unavailable metrics. */
export function goalMetricWeights(items: Pick<GoalDefinition, "weight">[]): number[] {
  if (!items.length) return [];
  const equal = 100 / items.length;
  const values = items.map((item) => item.weight ?? equal);
  const total = values.reduce((sum, value) => sum + value, 0);
  return values.map((value) => (total > 0 ? (value / total) * 100 : 0));
}
