"use client";

import {
  BUYU_SOURCE_PRODUCTS,
  BUYU_TOTAL_PRODUCT,
  formatGoalValue,
  type Goal,
  type GoalDefinition,
} from "@/modules/goals";
import styles from "./goals.module.css";

export function StandardMetricSettings({
  value,
  quarters,
  onChange,
}: {
  value: GoalDefinition;
  quarters: Goal[];
  onChange: (value: GoalDefinition) => void;
}) {
  const binding = value.binding;
  if (!binding?.field) return null;
  const qualification = binding.qualification;
  return (
    <fieldset className={`${styles.full} ${styles.metricSettings}`}>
      <legend>{value.metric} · 详细设置</legend>
      <p className={styles.muted}>
        类型：
        {value.kind === "ratio" ? "比率门槛" : value.kind === "count" ? "人数 / 数量" : "累计量"}
        {" · "}单位：{value.unit} · 由标准指标自动确定
      </p>
      <div className={styles.bindingGrid}>
        <label>
          达成条件
          <select
            aria-label={`达成条件·${value.metric}`}
            disabled={!!value.team_parent_id}
            value={binding.direction}
            onChange={(e) =>
              onChange({
                ...value,
                binding: { ...binding, direction: e.target.value as "gte" | "lte" },
                confirmed: false,
              })
            }
          >
            <option value="gte">实际 ≥ 目标值</option>
            <option value="lte">实际 ≤ 目标值</option>
          </select>
        </label>
        {!value.period.includes("Q") && (
          <label>
            关联季度目标
            <select
              aria-label={`关联季度目标·${value.metric}`}
              value={value.parent_id ?? ""}
              onChange={(e) => onChange({ ...value, parent_id: e.target.value || null })}
            >
              <option value="">不关联</option>
              {quarters.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.period} · {g.project} · {g.metric} {formatGoalValue(g.target, g.unit)}
                </option>
              ))}
            </select>
            <span className={styles.muted}>
              {quarters.length
                ? "关联后校验月度目标分配总额，季度实际值按季度独立统计。"
                : "暂无对应季度目标。请先新建本月所在季度、相同项目、部门、负责人和指标的季度目标，再回来关联。"}
            </span>
          </label>
        )}
        {binding.product === BUYU_TOTAL_PRODUCT && binding.field === "qualified_accounts" && (
          <div className={`${styles.full} ${styles.productConditions}`}>
            <div>
              <strong>各产品达标条件</strong>
              <p className={styles.muted}>
                默认门槛可调整；逐账号判断实时净ROI，个人目标自动继承。
              </p>
            </div>
            {BUYU_SOURCE_PRODUCTS.map((product) => {
              const condition = binding.qualification_by_product?.[product.id];
              return (
                <div key={product.id} className={styles.productCondition}>
                  <strong>{product.name}</strong>
                  <label>
                    月汇总实时净ROI ≥（%）
                    <input
                      aria-label={`${product.name}达标ROI`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={!!value.team_parent_id}
                      value={condition?.roi ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          confirmed: false,
                          binding: {
                            ...binding,
                            qualification: null,
                            qualification_by_product: {
                              ...binding.qualification_by_product,
                              [product.id]: {
                                roi: Number(e.target.value),
                                min_cost: condition?.min_cost ?? 0,
                              },
                            },
                          },
                        })
                      }
                    />
                  </label>
                  <label>
                    月消耗 ≥（元）
                    <input
                      aria-label={`${product.name}达标最低消耗`}
                      type="number"
                      min="0"
                      step="any"
                      disabled={!!value.team_parent_id}
                      value={condition?.min_cost ?? ""}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          confirmed: false,
                          binding: {
                            ...binding,
                            qualification: null,
                            qualification_by_product: {
                              ...binding.qualification_by_product,
                              [product.id]: {
                                roi: condition?.roi ?? 0,
                                min_cost: Number(e.target.value),
                              },
                            },
                          },
                        })
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}
        {qualification && (
          <>
            <label>
              达标 · 月汇总实时净ROI ≥（%）
              <input
                aria-label={`达标ROI·${value.metric}`}
                disabled={!!value.team_parent_id}
                type="number"
                min="0"
                step="any"
                value={qualification.roi}
                onChange={(e) =>
                  onChange({
                    ...value,
                    binding: {
                      ...binding,
                      qualification: { ...qualification, roi: Number(e.target.value) },
                    },
                    confirmed: false,
                  })
                }
              />
            </label>
            <label>
              达标 · 月消耗 ≥（元）
              <input
                aria-label={`达标最低消耗·${value.metric}`}
                disabled={!!value.team_parent_id}
                type="number"
                min="0"
                step="any"
                value={qualification.min_cost}
                onChange={(e) =>
                  onChange({
                    ...value,
                    binding: {
                      ...binding,
                      qualification: { ...qualification, min_cost: Number(e.target.value) },
                    },
                    confirmed: false,
                  })
                }
              />
            </label>
          </>
        )}
        <label className={styles.full}>
          统计口径 / 完成节点
          <textarea
            aria-label={`统计口径·${value.metric}`}
            disabled={!!value.team_parent_id}
            value={value.definition}
            onChange={(e) => onChange({ ...value, definition: e.target.value, confirmed: false })}
          />
        </label>
      </div>
    </fieldset>
  );
}
