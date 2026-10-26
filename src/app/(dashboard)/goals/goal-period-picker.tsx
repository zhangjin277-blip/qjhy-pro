"use client";
import styles from "./goals.module.css";

export function GoalPeriodPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (period: string) => void;
  disabled?: boolean;
}) {
  const year = value.slice(0, 4);
  const part = value.slice(5);
  const quarterly = part.startsWith("Q");
  return (
    <fieldset className={styles.periodField} disabled={disabled}>
      <legend>周期</legend>
      <div className={styles.periodPicker}>
        <select
          aria-label="填写周期类型"
          value={quarterly ? "quarter" : "month"}
          onChange={(e) =>
            onChange(
              `${year}-${
                e.target.value === "quarter"
                  ? `Q${Math.ceil(Number(part) / 3)}`
                  : String((Number(part.slice(1)) - 1) * 3 + 1).padStart(2, "0")
              }`,
            )
          }
        >
          <option value="month">月度</option>
          <option value="quarter">季度</option>
        </select>
        <select
          aria-label="填写年份"
          value={year}
          onChange={(e) => onChange(`${e.target.value}-${part}`)}
        >
          {Array.from({ length: 100 }, (_, i) => 2000 + i).map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
        <select
          aria-label={quarterly ? "填写季度" : "填写月份"}
          value={part}
          onChange={(e) => onChange(`${year}-${e.target.value}`)}
        >
          {Array.from({ length: quarterly ? 4 : 12 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={quarterly ? `Q${n}` : String(n).padStart(2, "0")}>
              {quarterly ? `第${n}季度` : `${n}月`}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
