import type { Goal } from "@/modules/goals";
import { goalCompositeProgress } from "@/modules/goals/presentation";
import styles from "./goals.module.css";

export function GoalCompositeProgress({
  items,
  compact = false,
}: {
  items: Goal[];
  compact?: boolean;
}) {
  const progress = goalCompositeProgress(items);
  return (
    <div className={styles.goalMetricProgress}>
      <span
        className={progress.partial ? styles.partialProgress : styles.number}
        title={progress.note}
      >
        {progress.label}
      </span>
      {progress.percent !== null && (
        <div
          className={styles.smallProgress}
          role="progressbar"
          aria-label="综合目标完成进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={progress.label}
        >
          <i
            className={progress.partial ? styles.partialBar : undefined}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
      {!compact && <span className={styles.muted}>{progress.note}</span>}
    </div>
  );
}
