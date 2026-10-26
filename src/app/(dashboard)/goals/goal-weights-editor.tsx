"use client";
import type { GoalDefinition } from "@/modules/goals";
import { goalMetricWeights } from "@/modules/goals/weights";
import styles from "./goals.module.css";

export function GoalWeightsEditor({
  definitions,
  onChange,
}: {
  definitions: GoalDefinition[];
  onChange: (definitions: GoalDefinition[]) => void;
}) {
  const custom = definitions.some((d) => d.weight != null);
  const weights = goalMetricWeights(definitions);
  const total = definitions.reduce((sum, d) => sum + (d.weight ?? 0), 0);
  return (
    <fieldset className={`${styles.full} ${styles.metricSettings}`}>
      <legend>综合进度 · 指标权重</legend>
      <label>
        分配方式
        <select
          aria-label="指标权重分配方式"
          value={custom ? "custom" : "equal"}
          onChange={(e) => {
            if (e.target.value === "equal")
              onChange(definitions.map((d) => ({ ...d, weight: null })));
            else {
              const each = Math.floor(10000 / definitions.length) / 100;
              onChange(
                definitions.map((d, i) => ({
                  ...d,
                  weight: i === definitions.length - 1 ? Number((100 - each * i).toFixed(2)) : each,
                })),
              );
            }
          }}
        >
          <option value="equal">平均分配（默认）</option>
          <option value="custom">自定义权重</option>
        </select>
      </label>
      <div className={styles.bindingGrid}>
        {definitions.map((item, index) => (
          <label key={index}>
            {item.metric || `指标${index + 1}`} · 权重（%）
            <input
              aria-label={`指标权重·${item.metric}·${index + 1}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              disabled={!custom}
              value={custom ? (item.weight ?? "") : Number((weights[index] ?? 0).toFixed(2))}
              onChange={(e) =>
                onChange(
                  definitions.map((d, i) =>
                    i === index
                      ? { ...d, weight: e.target.value === "" ? null : Number(e.target.value) }
                      : d,
                  ),
                )
              }
            />
          </label>
        ))}
      </div>
      <p className={custom && Math.abs(total - 100) > 0.001 ? styles.warning : styles.muted}>
        {custom
          ? `当前合计 ${Number(total.toFixed(2))}%，须为100%。`
          : "自动平均分配；增减指标后自动重新分配。"}
        单项最多贡献100%，缺少数据时保留权重。仅当前已发布、可见指标参与工作台计算；归档或发布范围变化时按剩余权重折算。
      </p>
    </fieldset>
  );
}
