import type { Goal } from "@/modules/goals";
import { goalDisplayProgress } from "@/modules/goals/presentation";
import styles from "./goals.module.css";

export function GoalMetricProgress({ goal }: { goal: Goal }) {
  const progress = goalDisplayProgress(goal);
  return (
    <div className={styles.goalMetricProgress}>
      <span className={progress.partial ? styles.partialProgress : styles.number}>
        {progress.label}
      </span>
      {progress.percent !== null && (
        <div
          className={styles.smallProgress}
          role="progressbar"
          aria-label={`${goal.metric}${goal.kind === "ratio" ? "门槛进度" : "完成进度"}${progress.partial ? "（部分数据）" : ""}`}
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
      {progress.partial && <span className={styles.muted}>部分数据，待补齐后判定达成</span>}
    </div>
  );
}
