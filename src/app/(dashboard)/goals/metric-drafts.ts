import {
  BUYU_TOTAL_PRODUCT,
  metricOption,
  type GoalBinding,
  type GoalDefinition,
} from "@/modules/goals";

export type MetricDraft = Pick<
  GoalDefinition,
  "metric" | "unit" | "kind" | "target" | "definition" | "parent_id" | "weight"
> & {
  binding: GoalBinding;
};

export function draftFromDefinition(value: GoalDefinition): MetricDraft | null {
  if (!value.binding?.field) return null;
  const { metric, unit, kind, target, definition, parent_id, binding, weight } = value;
  return { metric, unit, kind, target, definition, parent_id, binding, weight: weight ?? null };
}

export function newMetricDraft(binding: GoalBinding, field: string): MetricDraft | null {
  const m = metricOption(binding.source, field);
  if (!m?.selectable) return null;
  const roi = { product_buyu: 12, product_ue4: 13.5, product_urp: 7.5 }[binding.product] ?? 12;
  return {
    metric: m.label,
    unit: m.unit,
    kind: m.kind,
    target: null,
    weight: null,
    definition: m.note,
    parent_id: null,
    binding: {
      ...binding,
      field,
      direction: m.direction,
      qualification:
        field === "qualified_accounts" && binding.product !== BUYU_TOTAL_PRODUCT
          ? { roi, min_cost: 0 }
          : null,
      qualification_by_product:
        field === "qualified_accounts" && binding.product === BUYU_TOTAL_PRODUCT
          ? {
              product_buyu: { roi: 12, min_cost: 0 },
              product_ue4: { roi: 13.5, min_cost: 0 },
              product_urp: { roi: 7.5, min_cost: 0 },
            }
          : undefined,
    },
  };
}

export function mergeMetric(base: GoalDefinition, draft: MetricDraft): GoalDefinition {
  return {
    ...base,
    ...draft,
    binding: base.binding
      ? {
          ...base.binding,
          field: draft.binding.field,
          direction: draft.binding.direction,
          qualification: draft.binding.qualification,
          qualification_by_product: draft.binding.qualification_by_product,
        }
      : null,
  };
}

export function metricDefinitions(base: GoalDefinition, extra: MetricDraft[]): GoalDefinition[] {
  return [base, ...extra.map((draft) => mergeMetric(base, draft))];
}
